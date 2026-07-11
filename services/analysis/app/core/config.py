"""Service configuration, loaded from environment variables (or a local .env)."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Analysis reads the built ontology (object types), not raw datasets.
    # 127.0.0.1, not localhost: on Windows, resolving "localhost" tries IPv6
    # first and adds ~2s per request before falling back to IPv4.
    ontology_service_url: str = "http://127.0.0.1:8003"

    # Data plane service — used to resolve an object type's dataset (name /
    # storage path) when deciding which columns are sensitive and where the
    # Parquet files live for the Cube schema generator. Env: DATA_API_URL.
    data_service_url: str = Field(
        default="http://127.0.0.1:8000", validation_alias="DATA_API_URL"
    )

    # --- Metric engine (Cube) ------------------------------------------------
    # /metrics/query can delegate to a Cube deployment (schema generated from
    # the ontology) instead of the in-process native aggregation engine. On any
    # Cube error the query transparently falls back to native.
    cube_api_url: str = Field(
        default="http://127.0.0.1:4000", validation_alias="CUBE_API_URL"
    )
    # "cube" delegates to Cube (native as fallback); "native" forces the
    # in-process engine. Env: METRICS_ENGINE.
    metrics_engine: str = Field(default="cube", validation_alias="METRICS_ENGINE")
    # Path to the generator's metric_map.json; if relative it is resolved
    # against the service root (services/analysis), so it works regardless of
    # the process cwd. Points at the repo-level cube/model by default.
    cube_metric_map: str = "../../cube/model/metric_map.json"

    # --- Saved analyses store ------------------------------------------------
    # Contour-style analysis "recipes" (transparent JSON definitions) persist
    # here. Filename matches the .gitignore entry so the local dev DB is never
    # committed; kept separate from the orphaned analysis.db so the two never
    # share a schema. Env: DATABASE_URL.
    database_url: str = Field(
        default="sqlite:///./analysis_service.db", validation_alias="DATABASE_URL"
    )

    log_level: str = "INFO"


settings = Settings()
