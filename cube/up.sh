#!/usr/bin/env bash
# Bring up the AskDelphi Cube (metric engine) over the platform data plane.
# DuckDB reads Parquet straight from MinIO/S3 via httpfs — no local data mounts;
# the generated cubes read_parquet from s3:// URIs. Serves the generated schema
# in cube/model and answers /metrics/query for the analysis service. Idempotent:
# safe to re-run.
#
# Generate the schema first, then launch:
#   cd services/analysis && python -m app.tools.generate_cube_schema
#   bash cube/up.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"
MODEL_DIR="$DIR/model"
SECRET="${CUBEJS_API_SECRET:-askdelphi-cube-dev-secret}"

# S3/MinIO config for the DuckDB driver. Env vars win over config/dev.env; the
# env file has plain unquoted KEY=value lines and may hold unrelated keys.
DEV_ENV="$REPO/config/dev.env"
_dev_env() {
  [ -f "$DEV_ENV" ] || return 0
  sed -n "s/^$1=//p" "$DEV_ENV" | head -1
}
S3_ENDPOINT="${S3_ENDPOINT:-$(_dev_env S3_ENDPOINT)}"
S3_ACCESS_KEY="${S3_ACCESS_KEY:-$(_dev_env S3_ACCESS_KEY)}"
S3_SECRET_KEY="${S3_SECRET_KEY:-$(_dev_env S3_SECRET_KEY)}"
S3_REGION="${S3_REGION:-$(_dev_env S3_REGION)}"

if [ -z "$S3_ENDPOINT" ] || [ -z "$S3_ACCESS_KEY" ] || [ -z "$S3_SECRET_KEY" ]; then
  echo "error: S3_ENDPOINT, S3_ACCESS_KEY and S3_SECRET_KEY must be set (in env or $DEV_ENV)" >&2
  exit 1
fi

# DuckDB's s3_endpoint is host:port only — strip the scheme and derive SSL from it.
case "$S3_ENDPOINT" in
  https://*) S3_HOST="${S3_ENDPOINT#https://}"; S3_USE_SSL=true ;;
  http://*)  S3_HOST="${S3_ENDPOINT#http://}";  S3_USE_SSL=false ;;
  *)         S3_HOST="$S3_ENDPOINT";            S3_USE_SSL=false ;;
esac

# Git Bash: MSYS_NO_PATHCONV protects the container-side paths, so host-side
# paths must be converted to Windows form (D:/...) explicitly for Docker.
if command -v cygpath >/dev/null 2>&1; then
  MODEL_DIR="$(cygpath -m "$MODEL_DIR")"
fi

# Replace the old PoC container and any previous run of this one.
docker rm -f poc-cube >/dev/null 2>&1 || true
docker rm -f askdelphi-cube >/dev/null 2>&1 || true

MSYS_NO_PATHCONV=1 docker run -d --name askdelphi-cube -p 4000:4000 \
  -e CUBEJS_DEV_MODE=true \
  -e CUBEJS_DB_TYPE=duckdb \
  -e CUBEJS_API_SECRET="$SECRET" \
  -e CUBEJS_DB_DUCKDB_S3_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
  -e CUBEJS_DB_DUCKDB_S3_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
  -e CUBEJS_DB_DUCKDB_S3_ENDPOINT="$S3_HOST" \
  -e CUBEJS_DB_DUCKDB_S3_REGION="${S3_REGION:-us-east-1}" \
  -e CUBEJS_DB_DUCKDB_S3_USE_SSL="$S3_USE_SSL" \
  -e CUBEJS_DB_DUCKDB_S3_URL_STYLE="path" \
  -v "$MODEL_DIR:/cube/conf/model" \
  cubejs/cube:latest

echo "-- waiting for cube..."
until curl -s -o /dev/null http://127.0.0.1:4000/cubejs-api/v1/meta; do sleep 3; done
echo "Cube ready at http://localhost:4000 (dev playground); /metrics/query will delegate to it."
