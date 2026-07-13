#!/usr/bin/env bash
# Start the analysis service. All config comes from scripts/env.sh (APP_ENV profile).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/env.sh"
cd "$ROOT/services/analysis"
source .venv/bin/activate
exec uvicorn app.main:app --host 127.0.0.1 --port "$ANALYSIS_PORT" "$@"
