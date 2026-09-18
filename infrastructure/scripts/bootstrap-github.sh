#!/usr/bin/env bash
# One-time setup so GitHub Actions can deploy to this AWS account (run with admin credentials).
#
#   AWS_PROFILE=tommy-aws infrastructure/scripts/bootstrap-github.sh [owner/repo] [--yes]
#
# Deploys infrastructure/templates/github-oidc.yml as the stack "<project>-github":
#   - the GitHub OIDC identity provider (only if the account does not have one yet)
#   - <project>-github-deploy: the role workflows assume (only from GitHub environments of
#     this repository), with just the permissions deploy.sh needs
#   - <project>-cloudformation-execution: the role CloudFormation uses to create resources
# Then prints what to configure in GitHub. Safe to re-run (e.g. after the template changes).
{
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT="${PROJECT_NAME:-questionnaire}"
STACK="$PROJECT-github"
REPO="" ASSUME_YES=""
for arg in "$@"; do
  case "$arg" in
    --yes) ASSUME_YES=1 ;;
    */*) REPO="$arg" ;;
    *) echo "usage: $0 [owner/repo] [--yes]" >&2; exit 1 ;;
  esac
done

# Repository: argument, or the "origin" remote (git@github.com:o/r.git or https://github.com/o/r).
if [[ -z "$REPO" ]]; then
  url="$(git -C "$ROOT_DIR" remote get-url origin 2>/dev/null || true)"
  REPO="$(sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##' <<<"$url")"
  [[ "$REPO" == */* && "$url" == *github.com* ]] || { echo "Pass the repository as owner/repo." >&2; exit 1; }
fi
OWNER="${REPO%%/*}" NAME="${REPO#*/}"

# IAM is global; keep the stack in the region the environments deploy to.
REGION="$(jq -r '.region' "$ROOT_DIR/infrastructure/environments/dev.json")"
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

# Create the OIDC provider only if nothing manages one yet.
existing_param="$(aws cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Parameters[?ParameterKey=='CreateOidcProvider'].ParameterValue" --output text 2>/dev/null || true)"
if [[ -n "$existing_param" && "$existing_param" != "None" ]]; then
  CREATE_OIDC="$existing_param"
elif aws iam list-open-id-connect-providers --query 'OpenIDConnectProviderList[].Arn' --output text \
     | tr '\t' '\n' | grep -q 'token.actions.githubusercontent.com$'; then
  CREATE_OIDC=false
else
  CREATE_OIDC=true
fi

cat <<MSG
About to deploy stack $STACK in account $ACCOUNT_ID ($REGION):
  GitHub repository:   $OWNER/$NAME (only its GitHub environments can assume the deploy role)
  Create OIDC provider: $CREATE_OIDC
  IAM roles:           $PROJECT-github-deploy, $PROJECT-cloudformation-execution (AdministratorAccess,
                       usable by CloudFormation only)
MSG
if [[ -z "$ASSUME_YES" ]]; then
  read -r -p "Continue? [y/N] " answer
  [[ "$answer" == [yY]* ]] || { echo "Cancelled."; exit 1; }
fi

aws cloudformation deploy \
  --stack-name "$STACK" \
  --template-file "$ROOT_DIR/infrastructure/templates/github-oidc.yml" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset \
  --tags "Project=$PROJECT" \
  --parameter-overrides "ProjectName=$PROJECT" "GitHubOwner=$OWNER" "GitHubRepository=$NAME" "CreateOidcProvider=$CREATE_OIDC"

ROLE_ARN="$(aws cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='GitHubDeployRoleArn'].OutputValue" --output text)"

cat <<MSG

Done. Now configure GitHub (https://github.com/$OWNER/$NAME/settings/environments):
  1. Create the environments "dev" and "prod" (add required reviewers to "prod" if you like).
  2. In each environment, add the variable:
       AWS_DEPLOY_ROLE_ARN = $ROLE_ARN
  3. Push to main: the Deploy workflow deploys "dev". Deploy "prod" from
     Actions -> Deploy -> Run workflow.
MSG

exit
}
