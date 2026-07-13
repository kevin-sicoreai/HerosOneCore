"""Service configuration, loaded from environment variables (or a local .env)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Analysis reads the built ontology (object types), not raw datasets.
    # 127.0.0.1, not localhost: on Windows, resolving "localhost" tries IPv6
    # first and adds ~2s per request before falling back to IPv4.
    ontology_service_url: str

    log_level: str = "INFO"


settings = Settings()
