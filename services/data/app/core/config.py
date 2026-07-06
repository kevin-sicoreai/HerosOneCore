"""Service configuration, loaded from environment variables (or a local .env)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Metadata store (control plane). Defaults to a local SQLite file so the
    # service runs with zero external infrastructure; override with a Postgres
    # URL in real deployments, e.g. postgresql+psycopg://user:pass@host/db
    database_url: str = "sqlite:///./data_service.db"

    # Data plane: where ingested raw data (Parquet) is written. P0 uses a local
    # directory; this is the seam that later points at MinIO/S3.
    data_plane_dir: str = "./_dataplane"

    # Number of rows returned by the dataset preview endpoint by default.
    preview_default_limit: int = 100
    preview_max_limit: int = 1000

    log_level: str = "INFO"


settings = Settings()
