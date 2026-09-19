# Travel preference poll

People pick up to 5 countries they would like to travel to, and a dashboard shows the live
results. Votes go through a queue, so traffic spikes are absorbed before they reach the database.

```
browser ──► questionnaire-api ──► queue (SQS / ElasticMQ) ──► vote-worker ──► MySQL ◄── dashboard-api ◄── browser
            validate, 202           absorbs spikes             batch writes     counters    cached reads
```

## Project layout

```
backend/
  questionnaire-api/   NestJS: country list, accepts votes and queues them    (/api/questionnaire/*)
  vote-worker/         NestJS: reads the queue, writes ballots and counters to MySQL
  dashboard-api/       NestJS: totals, top 3 and last-24-hour data            (/api/dashboard/*)
frontend/
  questionnaire-web/   React + Vite: country checkboxes (max 5)
  dashboard-web/       React + Vite: live results dashboard
packages/
  shared/              Types, country list and limits shared by every app
  database/            MySQL schema: TypeORM entities, migrations, migration runner
docker/                Local queue configuration (ElasticMQ)
scripts/               install.sh (one-command Docker setup), smoke-test.sh
infrastructure/        CloudFormation templates, per-environment parameters, deploy script
.github/workflows/     ci.yml (pull requests) and deploy.yml (main branch / manual)
```

Stack: npm workspaces, Node 22, TypeScript 6, NestJS 12 (ES modules), React 19, Vite 8, Vitest,
TypeORM with mysql2, MySQL 8.4, Amazon SQS (ElasticMQ locally).

## Getting started locally

### Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 22 (see `.nvmrc`) | `node -v` |
| npm | 10 or newer | `npm -v` |
| Docker Desktop (or Docker Engine + Compose v2) | recent | `docker compose version` |

With nvm, run `nvm install && nvm use` in the repository root to get the right Node version.

There are two ways to run the project:

- **Option A: development mode.** Only MySQL and the queue run in Docker. The apps run with
  hot reload. Use this while writing code.
- **Option B: everything in Docker.** One command builds and starts the whole stack. Use this
  to try the system or to check that the containers work.

### Option A: development mode

```bash
npm install
npm run dev
```

`npm run dev` prepares whatever is missing, then starts everything in one terminal:

1. It creates `backend/*/.env` from `.env.example` if absent. The `.env` files are git-ignored.
2. It builds `packages/shared` and `packages/database`.
3. It starts MySQL and the queue in Docker and applies the migrations.
4. It runs all five apps with hot reload, plus watchers that rebuild the shared packages on change.

Each output line is prefixed with the app it came from, such as `[q-api]` or `[worker]`.
Press Ctrl+C to stop the apps. MySQL and the queue keep running for the next start. Stop them
with `npm run dev:stop`.

| URL | What |
|---|---|
| http://localhost:5173 | Questionnaire (Vite) |
| http://localhost:5174 | Dashboard (Vite) |
| http://localhost:4001/api/questionnaire/health | Questionnaire API |
| http://localhost:4002/api/dashboard/health | Dashboard API |
| http://localhost:4003/health | Vote worker, with processing counters |
| http://localhost:9325 | Queue UI (ElasticMQ) |

If port 5173 or 5174 is taken, Vite uses the next free port. The `[q-web]` and `[d-web]` lines
show the actual URL. The Vite dev servers forward `/api/...` requests to the local APIs, so no
CORS setup is needed.

To run only some apps, name them. MySQL and the queue always start:

```bash
npm run dev -- questionnaire-api vote-worker
```

Each app can also be started on its own with `npm run dev:questionnaire-api`,
`dev:vote-worker`, `dev:dashboard-api`, `dev:questionnaire-web` or `dev:dashboard-web`.

**Check that it works.** Vote at http://localhost:5173 and watch the dashboard, which refreshes
every 5 seconds. You can also use curl:

```bash
curl localhost:4001/api/questionnaire/countries
curl -X POST localhost:4001/api/questionnaire/votes \
  -H 'content-type: application/json' -d '{"countries":["JP","KR","SG"]}'   # 202 Accepted
curl localhost:4002/api/dashboard/summary
curl localhost:4002/api/dashboard/timeline
```

A vote shows up on the dashboard only while the vote worker is running. Without the worker,
votes wait in the queue, which you can see in the queue UI.

### Option B: everything in Docker

```bash
./scripts/install.sh          # build, start, wait until healthy, run the smoke test
./scripts/install.sh down     # stop and keep the data
./scripts/install.sh purge    # stop and delete the database volume
```

| URL | What |
|---|---|
| http://localhost:8080 | Questionnaire |
| http://localhost:8081 | Dashboard |
| http://localhost:9325 | Queue UI |

Useful commands:

```bash
docker compose logs -f vote-worker            # follow the worker
docker compose up -d --scale vote-worker=4    # run more workers
./scripts/smoke-test.sh                       # re-run the end-to-end check
```

### Everyday commands

| Command | What it does |
|---|---|
| `npm test` | Unit tests in every workspace (Vitest) |
| `npm run lint` | ESLint for the whole repository |
| `npm run typecheck` | Type-check every workspace |
| `npm run build` | Build packages, APIs and web apps, in dependency order |
| `npm test -w @questionnaire/vote-worker` | Tests for one workspace |

### Resetting local data

```bash
docker compose down -v    # then run npm run dev again
```

### Troubleshooting

- **A port is already in use.** Change `PORT` in the app's `.env`. For the Docker containers,
  set `MYSQL_PORT`, `SQS_PORT`, `QUESTIONNAIRE_PORT` or `DASHBOARD_PORT` before running
  `docker compose` or `install.sh`. If you move MySQL or the queue, update `DB_PORT` or
  `SQS_ENDPOINT` and `SQS_QUEUE_URL` in the `.env` files to match.
- **`Cannot find module '@questionnaire/shared'` or stale types.** Run `npm run build:packages`.
  `npm run dev` does this for you.
- **A Nest app does not pick up a change in a shared package.** The package watcher rebuilds it,
  but Nest only restarts when its own source changes. Save a file in the app or restart `npm run dev`.
- **The dashboard does not change after voting.** Check that the vote worker is running. The
  dashboard caches results for 2 seconds.

### Database migrations

Schema changes live in `packages/database/src/migrations` and must be registered in
`migrations/index.ts`. The APIs never change the schema themselves (`synchronize: false`).
In AWS, migrations run as a one-off ECS task, using the vote-worker image, before the new version is rolled out.

## AWS architecture

```
                 ┌─ CloudFront (questionnaire) ─┬─ /*                    → S3 bucket (private, OAC)
 browser ────────┤                              └─ /api/questionnaire/*  ─┐
                 └─ CloudFront (dashboard) ─────┬─ /*                    → S3 bucket (private, OAC)
                                                └─ /api/dashboard/*  (cached 2 s) ─┤
                                                                                   ▼
                              Application Load Balancer (reachable from CloudFront only)
                                   │ /api/questionnaire/*               │ /api/dashboard/*
                                   ▼                                    ▼
                      ECS: questionnaire-api                ECS: dashboard-api
                      (scales on requests/min)              (scales on CPU)
                                   │ SendMessage                        │ reads counters
                                   ▼                                    │ (reader endpoint)
                      SQS: votes ──(5 failures)──► votes-dlq            │
                                   │ long-poll, batches of 10           │
                                   ▼                                    ▼
                      ECS: vote-worker ──────────────────► Aurora MySQL Serverless v2
                      (scales on queue backlog per task)   (8.4-compatible, private subnets, TLS only,
                                                            password rotated monthly)
```

**Why it copes with traffic spikes**
- **Writes are decoupled.** The questionnaire API only validates the ballot and puts it on SQS,
  then returns `202 Accepted`. SQS absorbs any burst, and nothing on the request path touches the database.
- **Workers write in batches, at their own pace.** Each batch of up to 10 ballots becomes one
  transaction that stores the raw ballots and adds to pre-aggregated counters. ECS adds workers
  when the queue backlog per task grows. Aurora Serverless v2 adds capacity when load grows.
- **Reads are cheap and cached.** The dashboard reads only the counter tables: about one row per
  country and one per hour. Results are cached for 2 seconds in each API process and at CloudFront,
  so the number of viewers barely affects database load.
- **Nothing gets lost or double-counted.** Messages are deleted only after their transaction
  commits. Redelivered ballots are skipped by ballot id. Messages that fail repeatedly move to a
  dead-letter queue, which raises an alarm.

### Stacks

| Stack | Template | Contents |
|---|---|---|
| `questionnaire-github` | `github-oidc.yml` | One-time bootstrap: GitHub OIDC deploy role, CloudFormation execution role |
| `questionnaire-<env>-network` | `network.yml` | VPC, public and private subnets, one security group per component |
| `questionnaire-<env>-ecr` | `ecr.yml` | Image repositories for the three services (immutable tags, scan on push) |
| `questionnaire-<env>-messaging` | `messaging.yml` | SQS vote queue, dead-letter queue, alarms, optional email alerts |
| `questionnaire-<env>-database` | `database.yml` | Aurora MySQL Serverless v2, its Secrets Manager secret, monthly password rotation |
| `questionnaire-<env>-backend` | `backend.yml` | ECS cluster, load balancer, three services, autoscaling, migration task |
| `questionnaire-<env>-frontend` | `frontend.yml` | S3 buckets, CloudFront distributions, optional custom domains |

### Security

| Component | Can receive traffic from | Can send traffic to | AWS permissions |
|---|---|---|---|
| Load balancer | CloudFront origin-facing IPs, port 80 | Both APIs, port 3000 | none |
| questionnaire-api | Load balancer | AWS APIs over 443 | `sqs:SendMessage` on the vote queue |
| dashboard-api | Load balancer | AWS APIs over 443, Aurora 3306 | none |
| vote-worker and migration task | nothing | AWS APIs over 443, Aurora 3306 | receive and delete on the vote queue |
| Password rotation function | nothing | Secrets Manager endpoint 443, Aurora 3306 | managed by the AWS rotation template |
| Secrets Manager endpoint | anything in the VPC, 443 | nothing | none |
| Aurora | vote-worker, dashboard-api, rotation function | nothing | none |

- **The database** runs in private subnets with no internet route. Every connection must use
  TLS, and storage is encrypted.
- **Credentials** are generated into Secrets Manager (`questionnaire/<env>/database`). ECS injects
  them when a task starts, so they never appear in code, templates or parameters.
- **The password rotates monthly**, at 03:00 Hong Kong time on the 2nd of each month (set
  `RotationScheduleExpression` in `database.yml` to change it). AWS's hosted MySQL rotation function
  runs in the private subnets and reaches Secrets Manager through a VPC endpoint. After a rotation,
  open connections keep working. The first new connection a task makes gets "access denied", and
  the task shuts down gracefully. ECS then starts a replacement with the new password, usually
  within a minute. Votes are not lost, because unacknowledged queue messages are redelivered.
  Dashboard requests in that window get a 503.
- **To rotate immediately**, for example after a suspected leak, run
  `aws secretsmanager rotate-secret --secret-id questionnaire/<env>/database`.
- **SQS queues and S3 buckets** reject requests that don't use TLS. The buckets are private and
  only CloudFront can read them.
- **Tasks run in public subnets** with public IPs, so they reach AWS APIs without a NAT gateway.
  Their security groups still allow no inbound traffic except from the load balancer.

## Deploying

The first deploy takes about 25 to 35 minutes, mostly for Aurora and CloudFront. Settings per
environment live in `infrastructure/environments/<env>.json`.

### Option 1: from your machine

You need AWS credentials with administrator access, Docker, Node 22 and `jq`.

```bash
npm install
CFN_EXECUTION_ROLE_ARN= infrastructure/scripts/deploy.sh dev all
```

The target region is set by `"region"` in `infrastructure/environments/<env>.json`: currently
`ap-east-1` (Hong Kong) for both environments. It overrides your AWS profile's default region.
Hong Kong is an opt-in region, so it must be enabled for the account; it is enabled on this one.

`all` runs these steps in order:

1. Deploy the network, container registry, SQS and Aurora stacks.
2. Build and push the three images, tagged with the git commit.
3. Update the migration task and run migrations, then roll out all three services.
4. Build the web apps, deploy the frontend stack, upload the apps and invalidate CloudFront.

The questionnaire and dashboard URLs are printed at the end. Setting `CFN_EXECUTION_ROLE_ARN` to
empty makes CloudFormation use your own credentials. Without it, the script expects the execution
role from the bootstrap stack below.

Each step can also run alone:

```bash
infrastructure/scripts/deploy.sh dev infra
infrastructure/scripts/deploy.sh dev images <tag>
infrastructure/scripts/deploy.sh dev backend <tag>
infrastructure/scripts/deploy.sh dev frontend        # after npm run build
infrastructure/scripts/deploy.sh dev output frontend DashboardUrl
```

### Option 2: from GitHub Actions

**1. Bootstrap the AWS account (once).** Run this with admin credentials:

```bash
AWS_PROFILE=tommy-aws infrastructure/scripts/bootstrap-github.sh
```

The script reads the GitHub repository from the `origin` remote. You can also pass it as
`owner/repo`. It deploys the `questionnaire-github` stack, which creates:

- **The GitHub OIDC identity provider,** only if the account doesn't have one yet.
- **`questionnaire-github-deploy`:** the role workflows assume, with only the permissions the
  deploy script needs. Only jobs running in a GitHub environment of this repository can assume it.
- **`questionnaire-cloudformation-execution`:** the role CloudFormation uses to create resources.

At the end it prints the role ARN. Rerun the script whenever `github-oidc.yml` changes.

**2. Configure GitHub.** Under Settings → Environments, create `dev` and `prod`. Add required
reviewers to `prod` if you want approvals before production deploys. In each environment, add the
variable `AWS_DEPLOY_ROLE_ARN` with the ARN the script printed. No AWS keys or secrets are stored
in GitHub. The region comes from `infrastructure/environments/<env>.json`.

**3. Push to `main`.** The Deploy workflow runs these jobs:

| Job | What it does |
|---|---|
| CI | lint, build, test, validate templates and scripts, build the web apps |
| Infrastructure | network, ECR, SQS and Aurora stacks |
| Push image (×3) | build and push the three backend images, tagged with the commit SHA |
| Migrate and deploy services | run migrations, then roll out the ECS services |
| Deploy web apps | upload to S3, invalidate CloudFront, print the URLs in the run summary |

The first run takes about 30 to 40 minutes. Later runs take a few minutes each. A push to `main`
always deploys `dev`. To deploy `prod`, go to Actions → Deploy → Run workflow and choose `prod`.
Pull requests run only CI, which also checks that the Docker images build.

### Environment settings

| Setting | dev | prod |
|---|---|---|
| Aurora capacity | 0 to 2 ACU; pauses after 15 minutes idle | 0.5 to 16 ACU, plus a reader in a second AZ |
| Deletion protection | off | on |
| Backups kept | 1 day | 14 days |
| Tasks: questionnaire-api / dashboard-api / vote-worker | 1–2 / 1 / 1–2 | 2–10 / 2–4 / 2–8 |
| Queue backlog alarm | older than 5 minutes | older than 2 minutes |

- **Alarm emails:** set `messaging.AlarmEmail` to receive queue alarms by email. Confirm the
  subscription email that AWS sends.
- **Custom domains:** set `QuestionnaireDomainName`, `DashboardDomainName`.
  The certificate must be an ACM certificate in `us-east-1`. Then point DNS at the CloudFront domains.
- **Idle pausing:** with a minimum capacity of 0, the first request after an idle period waits about
  15 seconds while Aurora resumes. Set `MinCapacity` to `0.5` to avoid that.

### Configuration and environment variables

Nothing needs to be set by hand in AWS or in GitHub, apart from the `AWS_DEPLOY_ROLE_ARN`
variable described above. Every setting lives in one of these places:

| Setting | Where it lives |
|---|---|
| App environment variables in AWS (`DB_HOST`, `SQS_QUEUE_URL`, …) | ECS task definitions in `infrastructure/templates/backend.yml` |
| Database username and password | Secrets Manager (`questionnaire/<env>/database`), injected by ECS when a task starts |
| Sizes, capacity and region per environment | `infrastructure/environments/<env>.json` |
| GitHub's access to AWS | GitHub environment variable `AWS_DEPLOY_ROLE_ARN` |
| Local development | `backend/*/.env`, copied from `.env.example` and git-ignored |

**How the environment name flows.** The first argument of `deploy.sh`, such as `dev` or `prod`,
picks everything else:

- **The settings file:** `infrastructure/environments/<env>.json`.
- **The stack names:** `questionnaire-<env>-<stack>`.
- **The `Environment` parameter** passed to every template. Resource names are built from it,
  such as the cluster `questionnaire-<env>`.
- **The cross-stack exports and imports,** such as `questionnaire-<env>-VoteQueueUrl`. That is
  why a dev backend can only use dev resources.

In GitHub Actions, the Deploy workflow sets it once:
`ENVIRONMENT: ${{ inputs.environment || 'dev' }}`.

**Variables each service receives in AWS.** CloudFormation fills these from the other stacks'
outputs, so they always match what was created:

| Service | Environment variables | From Secrets Manager |
|---|---|---|
| questionnaire-api | `AWS_REGION`, `SQS_QUEUE_URL`, `PORT`, `NODE_ENV`, `CORS_ORIGINS` | none, it has no database access |
| vote-worker | `AWS_REGION`, `SQS_QUEUE_URL`, `WORKER_CONCURRENCY`, `DB_HOST` (writer), `DB_PORT`, `DB_NAME`, `DB_SSL`, `DB_POOL_SIZE` | `DB_USER`, `DB_PASSWORD` |
| dashboard-api | `DB_HOST` (reader), `DB_PORT`, `DB_NAME`, `DB_SSL`, `DB_POOL_SIZE`, `STATS_CACHE_SECONDS` | `DB_USER`, `DB_PASSWORD` |
| migration task | `DB_HOST` (writer), `DB_PORT`, `DB_NAME`, `DB_SSL` | `DB_USER`, `DB_PASSWORD` |

#### Add or change an environment variable

The example below adds `DASHBOARD_TOP_COUNT` to dashboard-api, with 5 in dev and 3 in prod.

1. **Declare a parameter** in `infrastructure/templates/backend.yml`:

   ```yaml
   Parameters:
     DashboardTopCount:
       Type: Number
       Default: 3
   ```

2. **Pass it to the container.** Add it to dashboard-api's `Environment` list in the same file:

   ```yaml
               - { Name: DASHBOARD_TOP_COUNT, Value: !Ref DashboardTopCount }
   ```

   If the value is the same in every environment, skip step 1 and write it directly, for
   example `Value: '3'`.

3. **Set the value per environment** under `backend` in `infrastructure/environments/dev.json`
   and `prod.json`:

   ```json
   "backend": {
     "DashboardTopCount": "5"
   }
   ```

   `deploy.sh` passes every key in a section to that stack. A key with no matching template
   parameter is silently ignored, so check the spelling against step 1.

4. **Read it in the code, with a default,** so the app still starts without it:

   ```ts
   const topCount = Number(config.get('DASHBOARD_TOP_COUNT') ?? 3);
   ```

5. **Add it for local development.** Put it in `backend/dashboard-api/.env.example`, which is
   committed, and in your own `.env`. If Docker Compose runs that service, also add it to the
   service's `environment` in `docker-compose.yml`.

6. **Deploy.** Commit and push, or run `deploy.sh <env> backend <tag>`. ECS starts a new task
   definition revision and replaces the tasks without downtime.

To change an existing value, edit step 3 or the value in step 2, then deploy. Changing a value
has no effect until the next deploy.

#### Add a secret, such as an API key

Keep secret values out of the template, the JSON files and GitHub. Values in `Environment` are
visible in plain text in the ECS console.

1. Create the secret in Secrets Manager, in the environment's region, named
   `questionnaire/<env>/<name>`. For example:

   ```bash
   aws secretsmanager create-secret --region ap-east-1 \
     --name questionnaire/dev/payment-api-key --secret-string '<value>'
   ```

2. Reference it under the container's `Secrets` in `backend.yml`:

   ```yaml
             Secrets:
               - Name: PAYMENT_API_KEY
                 ValueFrom: !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:${ProjectName}/${Environment}/payment-api-key'
   ```

3. Let the task execution role read it. In `backend.yml`, widen the `read-database-secret`
   policy's `Resource` to every secret of the environment:

   ```yaml
                   Resource: !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:${ProjectName}/${Environment}/*'
   ```

4. Deploy. ECS reads the secret when each task starts, so after changing the secret's value,
   redeploy or restart the service for tasks to pick it up.

#### Variables for the web apps

Vite bakes `VITE_*` variables into the JavaScript at build time. CI builds the web apps once and
deploys that build to every environment. Values that are the same everywhere can go in
`frontend/<app>/.env`, which is committed. A value that differs per environment needs a separate
build per environment in the Deploy workflow. The apps currently need no variables, because they
call the API on their own CloudFront address.

#### Add a new environment, such as `staging`

1. Copy `infrastructure/environments/dev.json` to `staging.json` and adjust the values. Give it
   its own `VpcCidr`, for example `10.40.0.0/16`.
2. Make sure the name is in the `Environment` parameter's `AllowedValues` in every template.
   `staging` is already there. Other names must be added.
3. Add the name to the `environment` options in `.github/workflows/deploy.yml`.
4. In GitHub, create an environment with the same name and set `AWS_DEPLOY_ROLE_ARN` in it.
5. Deploy with Actions → Deploy → Run workflow, or with `deploy.sh staging all`.

### Removing an environment

```bash
AWS_PROFILE=tommy-aws CFN_EXECUTION_ROLE_ARN= infrastructure/scripts/deploy.sh dev destroy
```

The script asks you to type the environment name, then:

1. Empties the two S3 buckets and deletes the frontend stack.
2. Deletes the backend stack.
3. Deletes the database stack. Aurora takes a final snapshot. The database secret is deleted
   permanently, so the same environment can be redeployed straight away.
4. Deletes the messaging stack, empties the ECR repositories and deletes the ecr stack.
5. Deletes the network stack. This can take a while: AWS releases the rotation Lambda's network
   interfaces up to about 20 minutes late, so the script retries.

It takes 15 to 40 minutes, and it can be run again safely if interrupted.

- **Options:** `--yes` skips the prompt, for scripts. `--disable-deletion-protection` is required
  when Aurora has deletion protection on, as prod does. Without it, the script stops before
  deleting anything.
- **What stays behind on purpose:** the final Aurora snapshot, the Aurora and Lambda log groups,
  and the shared `questionnaire-github` bootstrap stack. The script prints how to find them.
  Snapshots cost storage until you delete them.
