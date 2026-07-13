"""Service configuration, loaded from environment variables (or a local .env)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Conversation store. No default: config comes exclusively from the
    # unified profile (scripts/env.sh) — a missing key must fail startup.
    database_url: str

    # OpenAI-compatible LLM endpoint that powers the agent.
    llm_base_url: str = "https://api.deepseek.com"
    llm_api_key: str = ""
    llm_model: str = "deepseek-v4-flash"
    # Shown as the model badge in the frontend trace card.
    llm_display_name: str = "DeepSeek V4 Flash"
    llm_timeout_seconds: float = 120.0

    # Ontology service — the agent's tools query built object types, not raw
    # datasets. 127.0.0.1 (not localhost) avoids Windows' ~2s IPv6 resolution.
    ontology_service_url: str

    # Governance service — type-level data lineage (upstream datasets /
    # connectors → object type → downstream). 127.0.0.1 (not localhost)
    # avoids Windows' ~2s IPv6 resolution.
    governance_service_url: str

    # Analysis service — the metric semantic layer (cube): named business
    # metrics and their queryable dimensions. 127.0.0.1 (not localhost)
    # avoids Windows' ~2s IPv6 resolution.
    analysis_service_url: str

    log_level: str = "INFO"


settings = Settings()
