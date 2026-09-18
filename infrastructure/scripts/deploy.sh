#!/usr/bin/env bash
# Deploys the questionnaire stacks. Used by GitHub Actions and runnable locally.
#
#   deploy.sh <env> all [image-tag]       everything below, in order (tag defaults to the git commit)
#   deploy.sh <env> infra                 network, ECR, SQS and Aurora stacks
#   deploy.sh <env> images <image-tag>    build and push the three backend images to ECR
#   deploy.sh <env> backend <image-tag>   migrate the database, then roll all three services to <image-tag>
#   deploy.sh <env> frontend              frontend stack, upload built apps, invalidate CloudFront
#   deploy.sh <env> output <stack> <key>  print one stack output (network|ecr|messaging|database|backend|frontend)
#   deploy.sh <env> destroy [--yes] [--disable-deletion-protection]
#                                         delete every stack of <env> (asks for confirmation; see below)
#
# Environment: AWS credentials as usual. The region is read from environments/<env>.json.
# PROJECT_NAME defaults to "questionnaire".
# CloudFormation acts through the execution role from github-oidc.yml. To deploy with your own
# credentials instead (e.g. before that stack exists), set CFN_EXECUTION_ROLE_ARN to empty:
#   CFN_EXECUTION_ROLE_ARN= infrastructure/scripts/deploy.sh dev all
{
set -euo pipefail

ENVIRONMENT="${1:?usage: deploy.sh <env> <all|infra|images|backend|frontend|output|destroy> ...}"
COMMAND="${2:?usage: deploy.sh <env> <all|infra|images|backend|frontend|output|destroy> ...}"
shift 2

PROJECT="${PROJECT_NAME:-questionnaire}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA_DIR="$ROOT_DIR/infrastructure"
ENV_FILE="$INFRA_DIR/environments/$ENVIRONMENT.json"
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }

# The target region comes from environments/<env>.json, never from the caller's profile, so a
# deploy cannot land in the wrong region by accident.
REGION="$(jq -r '.region // empty' "$ENV_FILE")"
[[ -n "$REGION" ]] || { echo "Set \"region\" in $ENV_FILE" >&2; exit 1; }
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
# Unset: use the bootstrap execution role. Set but empty: act with the caller's own credentials.
EXECUTION_ROLE_ARN="${CFN_EXECUTION_ROLE_ARN-arn:aws:iam::$ACCOUNT_ID:role/$PROJECT-cloudformation-execution}"
ROLE_ARGS=()
[[ -n "$EXECUTION_ROLE_ARN" ]] && ROLE_ARGS=(--role-arn "$EXECUTION_ROLE_ARN")

log() { echo "==> $*" >&2; }
stack_name() { echo "$PROJECT-$ENVIRONMENT-$1"; }

stack_status() {
  aws cloudformation describe-stacks --stack-name "$(stack_name "$1")" \
    --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo NONE
}

stack_output() {
  aws cloudformation describe-stacks --stack-name "$(stack_name "$1")" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text
}

stack_parameter() {
  aws cloudformation describe-stacks --stack-name "$(stack_name "$1")" \
    --query "Stacks[0].Parameters[?ParameterKey=='$2'].ParameterValue" --output text
}

# deploy_stack <stack> [Key=Value ...]  - merges environments/<env>.json[<stack>] with extra overrides.
deploy_stack() {
  local stack="$1"; shift
  local params=("ProjectName=$PROJECT" "Environment=$ENVIRONMENT")
  while IFS= read -r line; do
    [[ -n "$line" ]] && params+=("$line")
  done < <(jq -r --arg s "$stack" '.[$s] // {} | to_entries[] | select(.value != "") | "\(.key)=\(.value)"' "$ENV_FILE")
  params+=("$@")

  # A stack whose first creation failed cannot be updated; it holds no resources, so replace it.
  if [[ "$(stack_status "$stack")" == "ROLLBACK_COMPLETE" ]]; then
    log "Deleting $(stack_name "$stack") left in ROLLBACK_COMPLETE"
    aws cloudformation delete-stack --stack-name "$(stack_name "$stack")"
    aws cloudformation wait stack-delete-complete --stack-name "$(stack_name "$stack")"
  fi

  log "Deploying $(stack_name "$stack") to $REGION"
  aws cloudformation deploy \
    --stack-name "$(stack_name "$stack")" \
    --template-file "$INFRA_DIR/templates/$stack.yml" \
    ${ROLE_ARGS[@]+"${ROLE_ARGS[@]}"} \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
    --no-fail-on-empty-changeset \
    --tags "Project=$PROJECT" "Environment=$ENVIRONMENT" \
    --parameter-overrides "${params[@]}"
}

run_migrations() {
  local cluster task_definition subnets security_group task_arn exit_code
  cluster="$(stack_output backend ClusterName)"
  task_definition="$(stack_output backend MigrationTaskDefinitionArn)"
  subnets="$(stack_output network PublicSubnetIds)"
  security_group="$(stack_output network VoteWorkerSecurityGroupId)"

  log "Running database migrations ($task_definition)"
  task_arn="$(aws ecs run-task \
    --cluster "$cluster" \
    --task-definition "$task_definition" \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$subnets],securityGroups=[$security_group],assignPublicIp=ENABLED}" \
    --query 'tasks[0].taskArn' --output text)"
  [[ "$task_arn" != "None" && -n "$task_arn" ]] || { echo "Failed to start migration task" >&2; exit 1; }

  aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$task_arn"
  exit_code="$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task_arn" \
    --query 'tasks[0].containers[0].exitCode' --output text)"

  aws logs filter-log-events \
    --log-group-name "/ecs/$PROJECT-$ENVIRONMENT/migrate" \
    --log-stream-names "migrate/migrate/${task_arn##*/}" \
    --query 'events[].message' --output text 2>/dev/null || true

  if [[ "$exit_code" != "0" ]]; then
    aws ecs describe-tasks --cluster "$cluster" --tasks "$task_arn" \
      --query 'tasks[0].{stoppedReason:stoppedReason,container:containers[0].reason}' >&2
    echo "Migration task failed (exit code: $exit_code)" >&2
    exit 1
  fi
  log "Migrations finished"
}

deploy_infra() {
  local prefix_list
  prefix_list="$(aws ec2 describe-managed-prefix-lists \
    --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
    --query 'PrefixLists[0].PrefixListId' --output text)"
  deploy_stack network "CloudFrontPrefixListId=$prefix_list"
  deploy_stack ecr
  deploy_stack messaging
  deploy_stack database \
    "RotationSubnetIds=$(stack_output network PrivateSubnetIds)" \
    "RotationSecurityGroupId=$(stack_output network RotationLambdaSecurityGroupId)"
}

push_images() {
  local tag="$1" service output repo logged_in=""
  for service in questionnaire-api dashboard-api vote-worker; do
    case "$service" in
      questionnaire-api) output=QuestionnaireApiRepositoryUri ;;
      dashboard-api) output=DashboardApiRepositoryUri ;;
      vote-worker) output=VoteWorkerRepositoryUri ;;
    esac
    repo="$(stack_output ecr "$output")"
    if [[ -z "$logged_in" ]]; then
      aws ecr get-login-password | docker login --username AWS --password-stdin "${repo%%/*}" >/dev/null
      logged_in=1
    fi
    # Tags are immutable in ECR: an existing tag means this commit was already pushed.
    if aws ecr describe-images --repository-name "${repo#*/}" --image-ids "imageTag=$tag" >/dev/null 2>&1; then
      log "$service:$tag already in ECR"
      continue
    fi
    log "Building and pushing $service:$tag"
    docker build --platform linux/amd64 -t "$repo:$tag" -f "$ROOT_DIR/backend/$service/Dockerfile" "$ROOT_DIR"
    docker push "$repo:$tag"
  done
}

# ------------------------------------------------------------------ destroy helpers
delete_stack() {
  local stack="$1" name status attempt
  name="$(stack_name "$stack")"
  for attempt in 1 2 3 4; do
    status="$(stack_status "$stack")"
    [[ "$status" == "NONE" ]] && { log "$name: not found, skipping"; return 0; }
    log "Deleting $name ($status)"
    aws cloudformation delete-stack --stack-name "$name" ${ROLE_ARGS[@]+"${ROLE_ARGS[@]}"}
    if aws cloudformation wait stack-delete-complete --stack-name "$name" 2>/dev/null; then
      log "$name deleted"
      return 0
    fi
    # Usually the rotation Lambda's network interfaces, which AWS releases up to ~20 min late.
    log "$name not deleted yet (attempt $attempt): $(aws cloudformation describe-stack-events --stack-name "$name" \
      --query "StackEvents[?ResourceStatus=='DELETE_FAILED'].[LogicalResourceId,ResourceStatusReason]|[0]" --output text 2>/dev/null)"
    [[ $attempt -lt 4 ]] && { log "Retrying in 5 minutes"; sleep 300; }
  done
  echo "Could not delete $name. Check its events in the CloudFormation console, then run destroy again." >&2
  exit 1
}

empty_bucket() {
  local bucket="$1"
  [[ -z "$bucket" || "$bucket" == "None" ]] && return 0
  if aws s3api head-bucket --bucket "$bucket" 2>/dev/null; then
    log "Emptying s3://$bucket"
    aws s3 rm "s3://$bucket" --recursive --only-show-errors
  fi
}

empty_repository() {
  local repo="$1" ids
  [[ -z "$repo" || "$repo" == "None" ]] && return 0
  repo="${repo#*/}"
  while :; do
    ids="$(aws ecr list-images --repository-name "$repo" --max-items 100 \
      --query 'imageIds[].{imageDigest:imageDigest}' --output json 2>/dev/null || echo '[]')"
    [[ "$ids" == "[]" || "$ids" == "null" || -z "$ids" ]] && return 0
    log "Deleting images in $repo"
    aws ecr batch-delete-image --repository-name "$repo" --image-ids "$ids" >/dev/null
  done
}

# Returns quietly when the stack or output does not exist.
optional_output() {
  [[ "$(stack_status "$1")" == "NONE" ]] && return 0
  stack_output "$1" "$2" 2>/dev/null || true
}

destroy_environment() {
  local assume_yes="" disable_protection="" arg cluster protected secret answer
  for arg in "$@"; do
    case "$arg" in
      --yes) assume_yes=1 ;;
      --disable-deletion-protection) disable_protection=1 ;;
      *) echo "Unknown option: $arg" >&2; exit 1 ;;
    esac
  done

  cat >&2 <<MSG
This permanently deletes the "$ENVIRONMENT" environment in $REGION (account $ACCOUNT_ID):
  frontend, backend, database, messaging, ecr and network stacks,
  the web files in S3, the container images in ECR, the queued votes in SQS,
  and the database secret. Aurora keeps a final snapshot of the data.
MSG
  if [[ -z "$assume_yes" ]]; then
    [[ -t 0 ]] || { echo "Not a terminal: pass --yes to confirm." >&2; exit 1; }
    read -r -p "Type the environment name ($ENVIRONMENT) to continue: " answer
    [[ "$answer" == "$ENVIRONMENT" ]] || { echo "Cancelled." >&2; exit 1; }
  fi

  # Stop early if Aurora is protected, before anything else is deleted.
  cluster="$PROJECT-$ENVIRONMENT"
  protected="$(aws rds describe-db-clusters --db-cluster-identifier "$cluster" \
    --query 'DBClusters[0].DeletionProtection' --output text 2>/dev/null || echo "None")"
  if [[ "$protected" == "True" ]]; then
    if [[ -z "$disable_protection" ]]; then
      echo "Aurora cluster $cluster has deletion protection on. Nothing was deleted." >&2
      echo "Run again with --disable-deletion-protection to turn it off and continue." >&2
      exit 1
    fi
    log "Turning off deletion protection on $cluster"
    aws rds modify-db-cluster --db-cluster-identifier "$cluster" --no-deletion-protection --apply-immediately >/dev/null
  fi

  empty_bucket "$(optional_output frontend QuestionnaireBucketName)"
  empty_bucket "$(optional_output frontend DashboardBucketName)"
  delete_stack frontend
  delete_stack backend

  secret="$(optional_output database DatabaseSecretArn)"
  delete_stack database
  # CloudFormation schedules secret deletion with a 30-day recovery window, which would block
  # redeploying an environment with the same name. Delete it for good instead.
  if [[ -n "$secret" ]]; then
    aws secretsmanager delete-secret --secret-id "$secret" --force-delete-without-recovery >/dev/null 2>&1 \
      && log "Database secret deleted permanently"
  fi

  delete_stack messaging
  empty_repository "$(optional_output ecr QuestionnaireApiRepositoryUri)"
  empty_repository "$(optional_output ecr DashboardApiRepositoryUri)"
  empty_repository "$(optional_output ecr VoteWorkerRepositoryUri)"
  delete_stack ecr
  delete_stack network

  cat >&2 <<MSG

Environment "$ENVIRONMENT" deleted. Kept on purpose (delete them yourself when no longer needed):
  - Aurora final snapshot:  aws rds describe-db-cluster-snapshots --snapshot-type manual --query "DBClusterSnapshots[?starts_with(DBClusterSnapshotIdentifier, '$cluster')].DBClusterSnapshotIdentifier"
  - Aurora and Lambda logs: CloudWatch log groups /aws/rds/cluster/$cluster/* and /aws/lambda/$PROJECT-$ENVIRONMENT-*
  - GitHub bootstrap stack: $PROJECT-github (shared by all environments)
MSG
}

case "$COMMAND" in
  all)
    tag="${1:-$(git -C "$ROOT_DIR" rev-parse --short=12 HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
    deploy_infra
    push_images "$tag"
    "$0" "$ENVIRONMENT" backend "$tag"
    log "Building the web apps"
    (cd "$ROOT_DIR" && npm run build -w @questionnaire/shared \
      && npm run build -w @questionnaire/questionnaire-web -w @questionnaire/dashboard-web)
    "$0" "$ENVIRONMENT" frontend
    ;;

  images)
    push_images "${1:?usage: deploy.sh <env> images <image-tag>}"
    ;;

  infra)
    deploy_infra
    ;;

  backend)
    tag="${1:?usage: deploy.sh <env> backend <image-tag>}"
    all_new=("QuestionnaireApiImageTag=$tag" "DashboardApiImageTag=$tag" "VoteWorkerImageTag=$tag" "MigrationImageTag=$tag")
    status="$(stack_status backend)"
    if [[ "$status" == "NONE" || "$status" == "ROLLBACK_COMPLETE" ]]; then
      # First deployment: nothing serves traffic yet, so start the services and migrate after.
      deploy_stack backend "${all_new[@]}"
      run_migrations
    else
      # 1) point only the migration task at the new image, 2) migrate, 3) roll the services.
      deploy_stack backend \
        "QuestionnaireApiImageTag=$(stack_parameter backend QuestionnaireApiImageTag)" \
        "DashboardApiImageTag=$(stack_parameter backend DashboardApiImageTag)" \
        "VoteWorkerImageTag=$(stack_parameter backend VoteWorkerImageTag)" \
        "MigrationImageTag=$tag"
      run_migrations
      deploy_stack backend "${all_new[@]}"
    fi
    ;;

  frontend)
    deploy_stack frontend
    for app in questionnaire dashboard; do
      case "$app" in questionnaire) prefix=Questionnaire ;; dashboard) prefix=Dashboard ;; esac
      dist="$ROOT_DIR/frontend/$app-web/dist"
      [[ -f "$dist/index.html" ]] || { echo "Build the web apps first (missing $dist)" >&2; exit 1; }
      bucket="$(stack_output frontend "${prefix}BucketName")"
      distribution="$(stack_output frontend "${prefix}DistributionId")"

      log "Uploading $app-web to s3://$bucket"
      # Hashed assets are immutable and old ones are kept so open sessions keep working.
      # Everything else (index.html) must be revalidated on each visit.
      aws s3 sync "$dist/assets" "s3://$bucket/assets" \
        --cache-control "public, max-age=31536000, immutable"
      aws s3 sync "$dist" "s3://$bucket" --delete --exclude "assets/*" \
        --cache-control "no-cache"
      aws cloudfront create-invalidation --distribution-id "$distribution" --paths "/*" \
        --query 'Invalidation.Id' --output text >/dev/null
      log "$app-web: $(stack_output frontend "${prefix}Url")"
    done
    ;;

  output)
    stack_output "${1:?stack}" "${2:?output key}"
    ;;

  destroy)
    destroy_environment "$@"
    ;;

  *)
    echo "Unknown command: $COMMAND" >&2
    exit 1
    ;;
esac

exit
}
