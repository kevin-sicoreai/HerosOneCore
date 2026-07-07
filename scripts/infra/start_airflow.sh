#!/usr/bin/env bash
# Build + start Airflow (with dbt-duckdb) for pipeline orchestration, and create
# the REST user the pipeline service uses. Standalone dev mode, port 8080.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLATFORM="${PLATFORM:-linux/arm64}"

docker build --platform "$PLATFORM" -t askdelphi-airflow:latest "$REPO/services/pipeline/airflow"

docker rm -f airflow-dbt >/dev/null 2>&1 || true
docker run -d --name airflow-dbt --platform "$PLATFORM" \
  --user "$(id -u):0" \
  -e AIRFLOW__CORE__LOAD_EXAMPLES=False \
  -e AIRFLOW__CORE__DAGS_ARE_PAUSED_AT_CREATION=False \
  -e AIRFLOW__API__AUTH_BACKENDS=airflow.api.auth.backend.basic_auth,airflow.api.auth.backend.session \
  -e HOME=/tmp \
  -v "$REPO":"$REPO" \
  -v "$REPO/services/pipeline/airflow/dags":/opt/airflow/dags \
  -p 8080:8080 \
  askdelphi-airflow:latest standalone

echo "waiting for airflow..."
for _ in $(seq 1 90); do
  curl -sf http://127.0.0.1:8080/health >/dev/null 2>&1 && break
  sleep 2
done
docker exec airflow-dbt airflow users create \
  --role Admin --username sic --password sic \
  --firstname a --lastname b --email a@b.c || true
echo "airflow ready on :8080 (UI admin password in 'docker logs airflow-dbt'; REST user sic/sic)"
