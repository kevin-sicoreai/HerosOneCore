"""Service configuration, loaded from environment variables (or a local .env)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Future seam: when the data service is ready, a DataServiceProvider reads
    # datasets from here instead of the built-in mock tables.
    # 127.0.0.1, not localhost: on Windows, resolving "localhost" tries IPv6
    # first and adds ~2s per request before falling back to IPv4.
    data_service_url: str = "http://127.0.0.1:8000"

    log_level: str = "INFO"


settings = Settings()
