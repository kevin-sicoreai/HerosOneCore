"""Service configuration, loaded from environment variables (or a local .env)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Conversation store. Local SQLite so the service runs with zero external
    # infrastructure; swap the URL when the database story is settled.
    database_url: str = "sqlite:///./assist_service.db"

    # OpenAI-compatible LLM endpoint that powers the agent.
    llm_base_url: str = "https://api.deepseek.com"
    llm_api_key: str = ""
    llm_model: str = "deepseek-v4-flash"
    # Shown as the model badge in the frontend trace card.
    llm_display_name: str = "DeepSeek V4 Flash"
    llm_timeout_seconds: float = 120.0

    # Ontology service — the agent's tools query built object types, not raw
    # datasets. 127.0.0.1 (not localhost) avoids Windows' ~2s IPv6 resolution.
    ontology_service_url: str = "http://127.0.0.1:8003"

    # Governance service — type-level data lineage (upstream datasets /
    # connectors → object type → downstream). 127.0.0.1 (not localhost)
    # avoids Windows' ~2s IPv6 resolution.
    governance_service_url: str = "http://127.0.0.1:8004"

    log_level: str = "INFO"


settings = Settings()
