"""Generic DAG that runs a generated dbt project.

The pipeline service triggers this DAG with conf={"project_dir": "<abs path>"};
the project directory is shared with the container via a same-path bind mount,
so dbt reads/writes the same Parquet the pipeline service later catalogs.
"""

from datetime import datetime

from airflow import DAG
from airflow.operators.bash import BashOperator

with DAG(
    dag_id="run_dbt_pipeline",
    schedule=None,
    start_date=datetime(2024, 1, 1),
    catchup=False,
    tags=["herosonecore", "dbt"],
) as dag:
    BashOperator(
        task_id="dbt_run",
        bash_command=(
            "dbt run "
            "--project-dir {{ dag_run.conf['project_dir'] }} "
            "--profiles-dir {{ dag_run.conf['project_dir'] }} "
            "--no-use-colors"
        ),
    )
