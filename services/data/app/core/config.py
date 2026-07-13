"""Service configuration, loaded from environment variables (or a local .env)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Metadata store (control plane). No default: config comes exclusively from
    # the unified profile (scripts/env.sh) — a missing key must fail startup.
    database_url: str

    # Data plane: where ingested raw data (Parquet) is written.
    #   s3    -> MinIO/S3 (s3_* settings below)
    #   local -> data_plane_dir (emergency fallback)
    storage_backend: str = "local"
    data_plane_dir: str = "./_dataplane"
    s3_endpoint: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = ""
    s3_region: str = "us-east-1"

    # Number of rows returned by the dataset preview endpoint by default.
    preview_default_limit: int = 100
    preview_max_limit: int = 1000

    log_level: str = "INFO"


settings = Settings()
