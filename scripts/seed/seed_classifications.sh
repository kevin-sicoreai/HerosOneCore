#!/usr/bin/env bash
# Seed sensitive-column classifications into the governance service (HR demo).
#
# Registers the salary columns as PII so non-admin users see them masked while
# admins see the real values (and reads are audited). Idempotent: re-running
# upserts the same rows.
#
#   ./scripts/seed/seed_classifications.sh
# Override endpoints / admin credentials via env:
#   AUTH_URL=http://127.0.0.1:8005 GOV_URL=http://127.0.0.1:8004 \
#     ADMIN_USER=admin ADMIN_PASS=admin ./scripts/seed/seed_classifications.sh
set -euo pipefail

AUTH_URL="${AUTH_URL:-http://127.0.0.1:8005}"
GOV_URL="${GOV_URL:-http://127.0.0.1:8004}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-admin}"

# (dataset_name, column_name, level) triples to register.
CLASSIFICATIONS=(
  "employees|monthly_salary|PII-薪酬"
  "payroll|base_salary|PII-薪酬"
  "payroll|bonus|PII-薪酬"
  "payroll|total|PII-薪酬"
  "performance_reviews|score|敏感-绩效"
  "performance_reviews|rating|敏感-绩效"
)

echo "-- logging in as $ADMIN_USER at $AUTH_URL"
TOKEN="$(
  curl -fsS -X POST "$AUTH_URL/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" \
  | sed -n 's/.*"access_token" *: *"\([^"]*\)".*/\1/p'
)"
if [[ -z "$TOKEN" ]]; then
  echo "!! failed to obtain admin token" >&2
  exit 1
fi

for entry in "${CLASSIFICATIONS[@]}"; do
  IFS='|' read -r dataset column level <<<"$entry"
  echo "-- classifying $dataset.$column -> $level"
  # Body goes through a temp file: on Windows Git Bash, non-ASCII in `curl -d`
  # arguments arrives mis-encoded and the API rejects it with 400.
  body_file="$(mktemp)"
  printf '{"dataset_name":"%s","column_name":"%s","level":"%s"}' \
    "$dataset" "$column" "$level" >"$body_file"
  curl -fsS -X POST "$GOV_URL/classifications" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    --data-binary "@$body_file" \
    >/dev/null
  rm -f "$body_file"
done

echo "Classification seed complete."
