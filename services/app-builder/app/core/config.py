"""Service configuration, loaded from environment variables (or a local .env)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Versioned application definitions (Puck JSON) live here. Filename matches
    # the .gitignore entry so the local dev DB never gets committed.
    database_url: str = "sqlite:///./app_builder_service.db"

    log_level: str = "INFO"


settings = Settings()
