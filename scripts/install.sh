#!/usr/bin/env bash
# One-command local installation with Docker Compose.
#   ./scripts/install.sh           build and start everything, wait until healthy, run a smoke test
#   ./scripts/install.sh down      stop everything (keeps data)
#   ./scripts/install.sh purge     stop everything and delete the database volume
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

QUESTIONNAIRE_PORT="${QUESTIONNAIRE_PORT:-8080}"
DASHBOARD_PORT="${DASHBOARD_PORT:-8081}"
export QUESTIONNAIRE_PORT DASHBOARD_PORT

case "${1:-up}" in
  down) docker compose down; exit 0 ;;
  purge) docker compose down -v; exit 0 ;;
  up) ;;
  *) echo "usage: $0 [up|down|purge]" >&2; exit 1 ;;
esac

command -v docker >/dev/null || { echo "Docker is required: https://docs.docker.com/get-docker/" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "The Docker daemon is not running" >&2; exit 1; }

echo "==> Building images and starting the stack"
docker compose up -d --build --wait --wait-timeout 300 \
  mysql elasticmq elasticmq-ui questionnaire-api vote-worker dashboard-api web

echo "==> Waiting for the APIs"
for url in "http://localhost:$QUESTIONNAIRE_PORT/api/questionnaire/health" \
           "http://localhost:$DASHBOARD_PORT/api/dashboard/health"; do
  for _ in $(seq 1 60); do
    curl -fsS "$url" >/dev/null 2>&1 && break
    sleep 2
  done
  curl -fsS "$url" >/dev/null || { echo "Not healthy: $url" >&2; docker compose ps; exit 1; }
done

./scripts/smoke-test.sh "http://localhost:$QUESTIONNAIRE_PORT" "http://localhost:$DASHBOARD_PORT"

cat <<MSG

Ready:
  Questionnaire  http://localhost:$QUESTIONNAIRE_PORT
  Dashboard      http://localhost:$DASHBOARD_PORT
  Queue UI       http://localhost:${SQS_UI_PORT:-9325}

Logs:  docker compose logs -f vote-worker
Scale: docker compose up -d --scale vote-worker=4
Load:  ./scripts/load-test.sh
Stop:  ./scripts/install.sh down
MSG
