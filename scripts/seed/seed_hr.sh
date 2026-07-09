#!/usr/bin/env bash
# Seed the HR / personnel demo dataset (scenario 2) into its own `hr` database
# on the source Postgres container.
#
# Default target: the local source Postgres container (askdelphi-src). The `hr`
# database is created on first run (idempotent), then seed_hr.sql is applied.
#   ./scripts/seed/seed_hr.sh
# Direct psql (no Docker): set USE_PSQL=1 and point PG* at a server where you can
# create/own the `hr` database.
#   USE_PSQL=1 PGHOST=localhost PGPORT=5432 PGUSER=shop PGPASSWORD=shop \
#     ./scripts/seed/seed_hr.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER="${CONTAINER:-askdelphi-src}"
DB_USER="${DB_USER:-shop}"
ADMIN_DB="${ADMIN_DB:-shop}"   # existing DB used to run the CREATE DATABASE
HR_DB="${HR_DB:-hr}"

create_db() {
  echo "-- ensuring database '$HR_DB' exists"
  if [[ "${USE_PSQL:-0}" == "1" ]]; then
    psql -d "$ADMIN_DB" -tAc "SELECT 1 FROM pg_database WHERE datname='$HR_DB'" | grep -q 1 \
      || psql -d "$ADMIN_DB" -c "CREATE DATABASE $HR_DB OWNER $DB_USER"
  else
    docker exec "$CONTAINER" psql -U "$DB_USER" -d "$ADMIN_DB" -tAc \
      "SELECT 1 FROM pg_database WHERE datname='$HR_DB'" | grep -q 1 \
      || docker exec "$CONTAINER" psql -U "$DB_USER" -d "$ADMIN_DB" -c \
        "CREATE DATABASE $HR_DB OWNER $DB_USER"
  fi
}

run_sql() {
  local file="$1"
  echo "-- applying $(basename "$file") into '$HR_DB'"
  if [[ "${USE_PSQL:-0}" == "1" ]]; then
    psql -v ON_ERROR_STOP=1 -d "$HR_DB" -f "$file"
  else
    docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$HR_DB" < "$file"
  fi
}

create_db
run_sql "$DIR/seed_hr.sql"
echo "HR seed complete."
