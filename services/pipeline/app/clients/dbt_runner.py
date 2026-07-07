"""Run a generated dbt project via the dbt CLI and parse its run artifacts.

P0 invokes dbt as a subprocess. When Airflow is introduced, the same generated
project is executed by an Airflow DAG instead, and this becomes the local
fallback / dev path.
"""

import json
import os
import subprocess
from typing import Any

from app.core.config import settings


def run(project_dir: str) -> dict[str, Any]:
    """Execute ``dbt run`` for the project and return status + per-model results."""
    cmd = [
        settings.dbt_executable,
        "run",
        "--project-dir", project_dir,
        "--profiles-dir", project_dir,
        "--no-use-colors",
    ]
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        env={**os.environ, "DBT_PROFILES_DIR": project_dir},
    )
    output = (proc.stdout or "") + (proc.stderr or "")
    return {
        "ok": proc.returncode == 0,
        "returncode": proc.returncode,
        "output": output,
        "results": parse_run_results(project_dir),
    }


def parse_run_results(project_dir: str) -> list[dict[str, Any]]:
    """Read per-model results from dbt's target/run_results.json (if present).

    Shared by the subprocess path and the Airflow path (dbt writes this artifact
    regardless of who invokes it).
    """
    results: list[dict[str, Any]] = []
    run_results_path = os.path.join(project_dir, "target", "run_results.json")
    if os.path.exists(run_results_path):
        with open(run_results_path) as fh:
            data = json.load(fh)
        for r in data.get("results", []):
            unique_id = r.get("unique_id", "")
            results.append(
                {
                    "model": unique_id.split(".")[-1],
                    "status": r.get("status"),
                    "execution_time": r.get("execution_time"),
                    "message": r.get("message"),
                }
            )
    return results
