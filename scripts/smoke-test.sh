#!/usr/bin/env bash
# End-to-end check: submit a vote through the questionnaire API and wait for it on the dashboard.
#   ./scripts/smoke-test.sh [questionnaire base url] [dashboard base url]
set -euo pipefail

Q="${1:-http://localhost:8080}"
D="${2:-http://localhost:8081}"

participants() {
  curl -fsS "$D/api/dashboard/summary" | sed -E 's/.*"participants":([0-9]+).*/\1/'
}

echo "==> Smoke test"
before="$(participants)"

curl -fsS "$Q/api/questionnaire/countries" | grep -q '"maxSelections":5' \
  || { echo "countries endpoint failed" >&2; exit 1; }

status="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$Q/api/questionnaire/votes" \
  -H 'content-type: application/json' -d '{"countries":["JP","KR","SG"]}')"
[[ "$status" == "202" ]] || { echo "vote rejected: HTTP $status" >&2; exit 1; }

status="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$Q/api/questionnaire/votes" \
  -H 'content-type: application/json' -d '{"countries":["JP","KR","SG","TH","TW","VN"]}')"
[[ "$status" == "400" ]] || { echo "six countries should be rejected, got HTTP $status" >&2; exit 1; }

# The worker writes asynchronously and the dashboard caches for a couple of seconds.
for _ in $(seq 1 30); do
  after="$(participants)"
  if (( after > before )); then
    echo "    vote accepted (202), invalid vote rejected (400), participants $before -> $after"
    exit 0
  fi
  sleep 1
done
echo "vote did not reach the dashboard within 30 s" >&2
exit 1
