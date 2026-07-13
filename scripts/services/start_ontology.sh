#!/usr/bin/env bash
# Start the ontology service. All config comes from scripts/env.sh (APP_ENV profile).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/env.sh"
cd "$ROOT/services/ontology"
source .venv/bin/activate
export DATABASE_URL="${META_DB_BASE_URL}/${DB_PREFIX}ontology"
# HR employee set is ~20k rows; the default 1000 cap would silently truncate analysis/metrics.
export PREVIEW_MAX_LIMIT=50000
exec uvicorn app.main:app --host 127.0.0.1 --port "$ONTOLOGY_PORT" "$@"
