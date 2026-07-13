#!/usr/bin/env bash
# Start the auth service. All config comes from scripts/env.sh (APP_ENV profile).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/env.sh"
cd "$ROOT/services/auth"
source .venv/bin/activate
export DATABASE_URL="${META_DB_BASE_URL}/${DB_PREFIX}auth"
export BOOTSTRAP_ADMIN_USERNAME="$ADMIN_USER"
export BOOTSTRAP_ADMIN_PASSWORD="$ADMIN_PASS"
exec uvicorn app.main:app --host 127.0.0.1 --port "$AUTH_PORT" "$@"
