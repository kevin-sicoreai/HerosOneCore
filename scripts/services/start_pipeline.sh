#!/usr/bin/env bash
# Start the pipeline service (creates its SQLite metadata DB on first start). Port 8001.
# Requires the venv built with Python 3.12 (dbt does not support 3.14).
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../services/pipeline" && pwd)"
source .venv/bin/activate
export DATABASE_URL="${DATABASE_URL:-sqlite:///./pipeline.db}"
export DATA_API_URL="${DATA_API_URL:-http://127.0.0.1:8000}"
export DBT_EXECUTABLE="${DBT_EXECUTABLE:-$PWD/.venv/bin/dbt}"
export WORK_DIR="${WORK_DIR:-./_pipelines}"
export MART_DIR="${MART_DIR:-./_dataplane/mart}"
# Set USE_AIRFLOW=true (+ AIRFLOW_URL/USER/PASSWORD) to route runs through Airflow.
exec uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-8001}" "$@"
