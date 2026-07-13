#!/usr/bin/env bash
# Start the pipeline service. All config comes from scripts/env.sh (APP_ENV profile).
# Requires the venv built with Python 3.12 (dbt does not support 3.14).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/env.sh"
cd "$ROOT/services/pipeline"
source .venv/bin/activate
export DATABASE_URL="${META_DB_BASE_URL}/${DB_PREFIX}pipeline"
export DBT_EXECUTABLE="$PWD/.venv/bin/dbt"
export WORK_DIR="./_pipelines"               # local dbt compile scratch dir
export MART_DIR="${LOCAL_STORAGE_DIR}/mart"  # used only when STORAGE_BACKEND=local
# dbt project files contain Chinese SQL literals; without UTF-8 mode Windows
# writes them in the ANSI codepage and dbt fails to parse.
export PYTHONUTF8=1
exec uvicorn app.main:app --host 127.0.0.1 --port "$PIPELINE_PORT" "$@"
