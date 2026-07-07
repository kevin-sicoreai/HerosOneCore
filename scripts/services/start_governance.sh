#!/usr/bin/env bash
# Start the governance service (creates its SQLite roles DB on first start). Port 8004.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../services/governance" && pwd)"
source .venv/bin/activate
export DATABASE_URL="${DATABASE_URL:-sqlite:///./governance.db}"
export DATA_API_URL="${DATA_API_URL:-http://127.0.0.1:8000}"
export PIPELINE_API_URL="${PIPELINE_API_URL:-http://127.0.0.1:8001}"
export ONTOLOGY_API_URL="${ONTOLOGY_API_URL:-http://127.0.0.1:8003}"
export AUTH_API_URL="${AUTH_API_URL:-http://127.0.0.1:8005}"
exec uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-8004}" "$@"
