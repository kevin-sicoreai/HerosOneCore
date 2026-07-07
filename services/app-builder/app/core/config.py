"""Service configuration, loaded from environment variables (or a local .env)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Draft store. Local SQLite so the service runs with zero external
    # infrastructure; swap the URL when the database story is settled.
    database_url: str = "sqlite:///./app_builder_service.db"

    # Publishing pushes a definition snapshot to the marketplace service.
    marketplace_url: str = "http://localhost:8002"

    log_level: str = "INFO"


settings = Settings()
