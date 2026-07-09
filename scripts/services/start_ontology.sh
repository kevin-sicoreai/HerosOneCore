#!/usr/bin/env bash
# Start the ontology service (creates its SQLite metadata DB on first start). Port 8003.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../services/ontology" && pwd)"
source .venv/bin/activate
export DATABASE_URL="${DATABASE_URL:-sqlite:///./ontology.db}"
export DATA_API_URL="${DATA_API_URL:-http://127.0.0.1:8000}"
# HR employee set is ~20k rows; the default 1000 cap would silently truncate analysis/metrics.
export PREVIEW_MAX_LIMIT="${PREVIEW_MAX_LIMIT:-50000}"
exec uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-8003}" "$@"
