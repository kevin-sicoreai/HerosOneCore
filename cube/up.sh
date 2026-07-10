#!/usr/bin/env bash
# Bring up the AskDelphi Cube (metric engine) over the platform data plane
# (Parquet via DuckDB). Serves the generated schema in cube/model and answers
# /metrics/query for the analysis service. Idempotent: safe to re-run.
#
# Generate the schema first, then launch:
#   cd services/analysis && python -m app.tools.generate_cube_schema
#   bash cube/up.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"
MODEL_DIR="$DIR/model"

# Pick data-plane dirs by content, not glob order — stale connector/pipeline
# dirs may linger next to the live ones. The generated cubes read_parquet from
# /data/raw and /data/mart, so both are mounted.
RAW_DIR="${RAW_DIR:-$(dirname "$(ls "$REPO"/services/data/_dataplane/raw/*/employees.parquet | head -1)")}"
MART_DIR="${MART_DIR:-$(dirname "$(ls "$REPO"/services/pipeline/_dataplane/mart/*/dept_hr_summary.parquet | head -1)")}"
SECRET="${CUBEJS_API_SECRET:-askdelphi-cube-dev-secret}"

# Git Bash: MSYS_NO_PATHCONV protects the container-side paths, so host-side
# paths must be converted to Windows form (D:/...) explicitly for Docker.
if command -v cygpath >/dev/null 2>&1; then
  MODEL_DIR="$(cygpath -m "$MODEL_DIR")"
  RAW_DIR="$(cygpath -m "$RAW_DIR")"
  MART_DIR="$(cygpath -m "$MART_DIR")"
fi

# Replace the old PoC container and any previous run of this one.
docker rm -f poc-cube >/dev/null 2>&1 || true
docker rm -f askdelphi-cube >/dev/null 2>&1 || true

MSYS_NO_PATHCONV=1 docker run -d --name askdelphi-cube -p 4000:4000 \
  -e CUBEJS_DEV_MODE=true \
  -e CUBEJS_DB_TYPE=duckdb \
  -e CUBEJS_API_SECRET="$SECRET" \
  -v "$MODEL_DIR:/cube/conf/model" \
  -v "$RAW_DIR:/data/raw:ro" \
  -v "$MART_DIR:/data/mart:ro" \
  cubejs/cube:latest

echo "-- waiting for cube..."
until curl -s -o /dev/null http://127.0.0.1:4000/cubejs-api/v1/meta; do sleep 3; done
echo "Cube ready at http://localhost:4000 (dev playground); /metrics/query will delegate to it."
