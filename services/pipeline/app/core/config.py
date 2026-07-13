"""Service configuration, loaded from environment variables (or a local .env)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Metadata store (pipeline definitions + run records). No default: config
    # comes exclusively from the unified profile (scripts/env.sh).
    database_url: str

    # The data service — used to resolve source dataset paths.
    data_api_url: str

    # Where generated dbt projects are written (one directory per pipeline).
    work_dir: str = "./_pipelines"

    # Where output (mart) Parquet files are materialized.
    #   s3    -> s3://{s3_bucket}/mart/... on MinIO/S3
    #   local -> mart_dir (emergency fallback)
    storage_backend: str = "local"
    mart_dir: str = "./_dataplane/mart"
    s3_endpoint: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = ""
    s3_region: str = "us-east-1"

    # dbt CLI executable (must have dbt-duckdb installed).
    dbt_executable: str = "dbt"

    # Orchestration: when true, runs go through Airflow (triggering a DAG that
    # runs dbt) instead of invoking the dbt CLI directly in-process.
    use_airflow: bool = False
    airflow_url: str
    airflow_user: str = "admin"
    airflow_password: str = ""
    airflow_dag_id: str = "run_dbt_pipeline"

    preview_default_limit: int = 100
    preview_max_limit: int = 1000

    log_level: str = "INFO"


settings = Settings()
