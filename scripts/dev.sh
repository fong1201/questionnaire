#!/usr/bin/env bash
# Starts the whole project in development mode with one command.
#
#   npm run dev                                  everything
#   npm run dev -- questionnaire-api vote-worker only the named apps (plus MySQL and the queue)
#
# Prepares what is missing (dependencies, .env files, shared packages, MySQL + queue, migrations),
# then runs the apps and the package watchers together. Ctrl+C stops them all; the Docker
# containers keep running (stop them with: npm run dev:stop).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

ALL_APPS="questionnaire-api vote-worker dashboard-api questionnaire-web dashboard-web"
APPS="${*:-$ALL_APPS}"

for app in $APPS; do
  case " $ALL_APPS " in
    *" $app "*) ;;
    *) echo "Unknown app '$app'. Choose from: $ALL_APPS" >&2; exit 1 ;;
  esac
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

if ! command -v docker >/dev/null || ! docker info >/dev/null 2>&1; then
  echo "Docker must be installed and running (MySQL and the queue run in containers)." >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  step "Installing dependencies"
  npm install
fi

for service in questionnaire-api vote-worker dashboard-api; do
  if [[ ! -f "backend/$service/.env" ]]; then
    cp "backend/$service/.env.example" "backend/$service/.env"
    echo "Created backend/$service/.env from .env.example"
  fi
done

step "Building shared packages"
npm run build:packages --silent

step "Starting MySQL and the queue"
npm run db:up --silent

step "Applying database migrations"
for attempt in 1 2 3 4 5; do
  npm run db:migrate --silent && break
  [[ $attempt == 5 ]] && exit 1
  echo "MySQL is not ready yet, retrying in 3 s"
  sleep 3
done

# name|color|command
commands=(
  "shared|gray|npm run build -w @questionnaire/shared -- --watch --preserveWatchOutput"
  "database|gray|npm run build -w @questionnaire/database -- --watch --preserveWatchOutput"
)
for app in $APPS; do
  case "$app" in
    questionnaire-api) commands+=("q-api|blue|npm run start:dev -w @questionnaire/questionnaire-api") ;;
    vote-worker)       commands+=("worker|magenta|npm run start:dev -w @questionnaire/vote-worker") ;;
    dashboard-api)     commands+=("d-api|green|npm run start:dev -w @questionnaire/dashboard-api") ;;
    questionnaire-web) commands+=("q-web|cyan|npm run dev -w @questionnaire/questionnaire-web") ;;
    dashboard-web)     commands+=("d-web|yellow|npm run dev -w @questionnaire/dashboard-web") ;;
  esac
done

names=(); colors=(); scripts=()
for entry in "${commands[@]}"; do
  IFS='|' read -r name color script <<<"$entry"
  names+=("$name"); colors+=("$color"); scripts+=("$script")
done
join() { local IFS=,; echo "$*"; }

step "Starting: $APPS"
cat <<MSG
  Questionnaire      http://localhost:5173
  Dashboard          http://localhost:5174
  Questionnaire API  http://localhost:4001/api/questionnaire/health
  Dashboard API      http://localhost:4002/api/dashboard/health
  Vote worker        http://localhost:4003/health
  Queue UI           http://localhost:9325
  (Vite picks the next free port if 5173/5174 are taken; see the q-web/d-web lines.)

MSG

exec npx concurrently \
  --names "$(join "${names[@]}")" \
  --prefix-colors "$(join "${colors[@]}")" \
  --prefix "[{name}]" \
  --pad-prefix \
  "${scripts[@]}"
