"""Service configuration, loaded from environment variables (or a local .env)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Metadata store (object types, properties, links). No default: config
    # comes exclusively from the unified profile (scripts/env.sh).
    database_url: str

    # The data service — used to resolve backing dataset schema + storage paths.
    data_api_url: str

    # S3/MinIO credentials for reading dataset Parquet when storage_uri is s3://.
    s3_endpoint: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_region: str = "us-east-1"

    preview_default_limit: int = 100
    preview_max_limit: int = 1000

    log_level: str = "INFO"


settings = Settings()
