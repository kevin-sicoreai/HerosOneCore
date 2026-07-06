"""Trigger and poll the dbt DAG in Airflow via its REST API.

Used when ``settings.use_airflow`` is true: the pipeline service triggers a DAG
run passing the generated dbt project directory as ``conf``, and polls until it
finishes. dbt still writes its artifacts into the (shared) project dir, so
per-model results are read back with dbt_runner.parse_run_results.
"""

import time
from typing import Any

import httpx

from app.core.config import settings


def _client() -> httpx.Client:
    return httpx.Client(
        base_url=settings.airflow_url,
        auth=(settings.airflow_user, settings.airflow_password),
        timeout=30,
    )


def trigger(project_dir: str) -> str:
    """Trigger the dbt DAG with the project dir; return the dag_run id."""
    with _client() as c:
        resp = c.post(
            f"/api/v1/dags/{settings.airflow_dag_id}/dagRuns",
            json={"conf": {"project_dir": project_dir}},
        )
        resp.raise_for_status()
        return resp.json()["dag_run_id"]


def get_state(dag_run_id: str) -> str:
    with _client() as c:
        resp = c.get(f"/api/v1/dags/{settings.airflow_dag_id}/dagRuns/{dag_run_id}")
        resp.raise_for_status()
        return resp.json()["state"]


def run_and_wait(project_dir: str, timeout_s: int = 300) -> dict[str, Any]:
    """Trigger the DAG and block until it reaches a terminal state."""
    dag_run_id = trigger(project_dir)
    deadline = time.monotonic() + timeout_s
    state = "queued"
    while time.monotonic() < deadline:
        state = get_state(dag_run_id)
        if state in ("success", "failed"):
            break
        time.sleep(2)
    return {"ok": state == "success", "state": state, "dag_run_id": dag_run_id}
