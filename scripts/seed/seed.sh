#!/usr/bin/env bash
# Seed the source database with the demo datasets (base sales + supply chain).
#
# Default target: the local source Postgres container (askdelphi-src).
#   ./scripts/seed/seed.sh
# Direct psql (no Docker):
#   USE_PSQL=1 PGHOST=localhost PGPORT=5432 PGUSER=shop PGPASSWORD=shop PGDATABASE=shop \
#     ./scripts/seed/seed.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER="${CONTAINER:-askdelphi-src}"
DB_USER="${DB_USER:-shop}"
DB_NAME="${DB_NAME:-shop}"

run_sql() {
  local file="$1"
  echo "-- applying $(basename "$file")"
  if [[ "${USE_PSQL:-0}" == "1" ]]; then
    psql -v ON_ERROR_STOP=1 -f "$file"
  else
    docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" < "$file"
  fi
}

run_sql "$DIR/seed_base.sql"
run_sql "$DIR/seed_supply_chain.sql"
echo "Seed complete."
