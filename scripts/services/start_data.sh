#!/usr/bin/env bash
# Start the data service. All config comes from scripts/env.sh (APP_ENV profile).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/env.sh"
cd "$ROOT/services/data"
source .venv/bin/activate
export DATABASE_URL="${META_DB_BASE_URL}/${DB_PREFIX}data"
export DATA_PLANE_DIR="$LOCAL_STORAGE_DIR"   # used only when STORAGE_BACKEND=local
exec uvicorn app.main:app --host 127.0.0.1 --port "$DATA_PORT" "$@"
