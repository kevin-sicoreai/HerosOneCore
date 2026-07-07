"""Service configuration, loaded from environment variables (or a local .env)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Governance's own store (roles / access matrix).
    database_url: str = "sqlite:///./governance.db"

    # Upstream services aggregated for lineage + audit.
    data_api_url: str = "http://localhost:8000"
    pipeline_api_url: str = "http://localhost:8001"
    ontology_api_url: str = "http://localhost:8003"
    auth_api_url: str = "http://localhost:8005"

    http_timeout: float = 8.0
    log_level: str = "INFO"


settings = Settings()
