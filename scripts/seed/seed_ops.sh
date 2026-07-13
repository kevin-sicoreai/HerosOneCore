#!/usr/bin/env bash
# Seed the enterprise-operations demo dataset into the active profile's source DB.
#
#   APP_ENV=dev  ./scripts/seed/seed_ops.sh     # -> SOURCE_DB herosonecore_ops_dev
#   APP_ENV=prod SEED_ALLOW_PROD=true ./scripts/seed/seed_ops.sh
#
# Zero hardcoded targets: the connection comes exclusively from the unified
# profile (SOURCE_DB_URL, built by scripts/env.sh). Runs the pure-SQL seed
# through psycopg, so no local psql / docker dependency.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
source "$ROOT/scripts/env.sh"

# Guard: refuse to overwrite the prod source DB unless explicitly allowed.
if [[ "$APP_ENV" == "prod" && "${SEED_ALLOW_PROD:-false}" != "true" ]]; then
  echo "refusing to seed the PROD source database ($SOURCE_DB_NAME)." >&2
  echo "set SEED_ALLOW_PROD=true explicitly to proceed." >&2
  exit 1
fi

echo "-- seeding operations dataset into ${SOURCE_DB_HOST}:${SOURCE_DB_PORT}/${SOURCE_DB_NAME} (profile: $APP_ENV)"
exec uv run --with "psycopg[binary]" python - "$DIR/seed_ops.sql" <<'PY'
import os
import sys
import time

import psycopg

sql = open(sys.argv[1], encoding="utf-8").read()
t0 = time.time()
with psycopg.connect(os.environ["SOURCE_DB_URL"], autocommit=True) as conn:
    conn.execute(sql)
    tables = conn.execute(
        "select table_name from information_schema.tables "
        "where table_schema='public' order by 1"
    ).fetchall()
print(f"-- seeded {len(tables)} tables in {time.time()-t0:.1f}s")
print("operations seed complete.")
PY
