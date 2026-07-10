#!/usr/bin/env bash
# Bring up the PoC Superset with persistent metadata, the DuckDB driver, and
# an embed-friendly config. Idempotent: safe to re-run (recreates container,
# keeps the named volume so admin/database connections survive).
#
#   ./poc/superset/up.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/../.." && pwd)"
# Pick data-plane dirs by content, not glob order — stale connector/pipeline
# dirs may linger next to the live ones.
RAW_DIR="${RAW_DIR:-$(dirname "$(ls "$REPO"/services/data/_dataplane/raw/*/employees.parquet | head -1)")}"
MART_DIR="${MART_DIR:-$(dirname "$(ls "$REPO"/services/pipeline/_dataplane/mart/*/dept_hr_summary.parquet | head -1)")}"
SECRET="${SUPERSET_SECRET_KEY:-poc-not-for-prod-0123456789}"

# Git Bash: MSYS_NO_PATHCONV protects the container-side paths, so host-side
# paths must be converted to Windows form (D:/...) explicitly for Docker.
if command -v cygpath >/dev/null 2>&1; then
  DIR="$(cygpath -m "$DIR")"
  RAW_DIR="$(cygpath -m "$RAW_DIR")"
  MART_DIR="$(cygpath -m "$MART_DIR")"
fi

docker rm -f poc-superset >/dev/null 2>&1 || true
docker volume create poc-superset-home >/dev/null

MSYS_NO_PATHCONV=1 docker run -d --name poc-superset -p 8088:8088 \
  -e SUPERSET_SECRET_KEY="$SECRET" \
  -e SUPERSET_CONFIG_PATH=/app/superset_config.py \
  -v "$DIR/superset_config.py:/app/superset_config.py:ro" \
  -v poc-superset-home:/app/superset_home \
  -v "$RAW_DIR:/data/raw:ro" \
  -v "$MART_DIR:/data/mart:ro" \
  apache/superset:latest

echo "-- waiting for superset..."
until curl -s -o /dev/null http://127.0.0.1:8088/health; do sleep 3; done

# DuckDB driver must go into the image's uv-managed venv, as root.
docker exec -u root poc-superset sh -c \
  "uv pip install --python /app/.venv/bin/python3 --quiet duckdb duckdb-engine"

docker exec poc-superset superset db upgrade >/dev/null
docker exec poc-superset superset fab create-admin --username admin --password admin \
  --firstname A --lastname D --email admin@poc.local >/dev/null 2>&1 || true
docker exec poc-superset superset init >/dev/null
docker restart poc-superset >/dev/null

until curl -s -o /dev/null http://127.0.0.1:8088/health; do sleep 3; done
echo "Superset ready at http://localhost:8088 (admin/admin), embeddable in the shell."
