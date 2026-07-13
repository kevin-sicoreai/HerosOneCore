#!/usr/bin/env bash
# Start the assist service. All config comes from scripts/env.sh (APP_ENV profile).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/env.sh"
cd "$ROOT/services/assist"
source .venv/bin/activate
export DATABASE_URL="${META_DB_BASE_URL}/${DB_PREFIX}assist"
exec uvicorn app.main:app --host 127.0.0.1 --port "$ASSIST_PORT" "$@"
