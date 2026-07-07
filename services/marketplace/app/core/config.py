"""Service configuration, loaded from environment variables (or a local .env)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Catalog store. Local SQLite so the service runs with zero external
    # infrastructure; swap the URL when the database story is settled.
    database_url: str = "sqlite:///./marketplace_service.db"

    log_level: str = "INFO"


settings = Settings()
