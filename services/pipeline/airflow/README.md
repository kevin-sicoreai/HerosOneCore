# Airflow orchestration

Runs the pipeline service's generated dbt projects. The image adds `dbt-duckdb`
to the official Airflow image; the repo is bind-mounted at the **same absolute
path** so dbt inside the container reads/writes the same data plane the pipeline
service catalogs.

## Build

```bash
docker build --platform linux/arm64 -t askdelphi-airflow:latest services/pipeline/airflow
```

## Run (standalone, dev)

```bash
REPO=/Users/yeskk/project/sicore/demo/AskDelphi
docker run -d --name airflow-dbt \
  --platform linux/arm64 \
  --user "$(id -u):0" \
  -e AIRFLOW__CORE__LOAD_EXAMPLES=False \
  -e AIRFLOW__CORE__DAGS_ARE_PAUSED_AT_CREATION=False \
  -e AIRFLOW__API__AUTH_BACKENDS=airflow.api.auth.backend.basic_auth,airflow.api.auth.backend.session \
  -e HOME=/tmp \
  -v "$REPO":"$REPO" \
  -v "$REPO/services/pipeline/airflow/dags":/opt/airflow/dags \
  -p 8080:8080 \
  askdelphi-airflow:latest standalone

# create a known REST user (used by the pipeline service)
docker exec airflow-dbt airflow users create \
  --role Admin --username sic --password sic \
  --firstname a --lastname b --email a@b.c
```

- UI: http://localhost:8080  (admin password printed in `docker logs airflow-dbt`)
- REST user for the pipeline service: `sic` / `sic`

## Point the pipeline service at Airflow

```bash
export USE_AIRFLOW=true
export AIRFLOW_URL=http://127.0.0.1:8080
export AIRFLOW_USER=sic
export AIRFLOW_PASSWORD=sic
uvicorn app.main:app --port 8001
```

Notes:
- `--user "$(id -u):0"` makes dbt's output files owned by the host user, so the
  pipeline service can read the resulting Parquet (and Airflow can write into the
  bind-mounted dirs). Group `0` keeps `/opt/airflow` writable.
- Same-path bind mount avoids path rewriting between host and container.
- Dev standalone only (SQLite + SequentialExecutor). Not for production.
