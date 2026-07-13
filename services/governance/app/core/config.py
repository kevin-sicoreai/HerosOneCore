"""Service configuration, loaded from environment variables (or a local .env)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Governance's own store (roles / access matrix). No default: config
    # comes exclusively from the unified profile (scripts/env.sh).
    database_url: str

    # Upstream services aggregated for lineage + audit.
    data_api_url: str
    pipeline_api_url: str
    ontology_api_url: str
    auth_api_url: str

    http_timeout: float = 8.0

    # Catalog publisher: pushes platform assets + lineage into an external
    # metadata catalog. "none" disables publishing entirely (decoupled).
    app_env: str = "dev"
    catalog_publisher: str = "none"      # none | openmetadata
    om_api_url: str = ""                 # e.g. http://host:8585/api
    om_token: str = ""                   # OM bot JWT

    log_level: str = "INFO"


settings = Settings()
