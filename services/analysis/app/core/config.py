"""Service configuration, loaded from environment variables (or a local .env)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Future seam: when the data service is ready, a DataServiceProvider reads
    # datasets from here instead of the built-in mock tables.
    data_service_url: str = "http://localhost:8000"

    log_level: str = "INFO"


settings = Settings()
