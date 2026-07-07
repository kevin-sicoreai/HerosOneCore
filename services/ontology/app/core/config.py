"""Service configuration, loaded from environment variables (or a local .env)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Metadata store (object types, properties, links).
    database_url: str = "sqlite:///./ontology.db"

    # The data service — used to resolve backing dataset schema + storage paths.
    data_api_url: str = "http://localhost:8000"

    preview_default_limit: int = 100
    preview_max_limit: int = 1000

    log_level: str = "INFO"


settings = Settings()
