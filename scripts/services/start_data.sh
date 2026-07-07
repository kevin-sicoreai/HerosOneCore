#!/usr/bin/env bash
# Start the data service (creates its SQLite metadata DB on first start). Port 8000.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../services/data" && pwd)"
source .venv/bin/activate
export DATABASE_URL="${DATABASE_URL:-sqlite:///./dev.db}"
export DATA_PLANE_DIR="${DATA_PLANE_DIR:-./_dataplane}"
exec uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-8000}" "$@"
