"""Service configuration, loaded from environment variables (or a local .env)."""

import json

from pydantic import BaseModel, ConfigDict
from pydantic_settings import BaseSettings, SettingsConfigDict


class ModelProfile(BaseModel):
    """One selectable LLM the assist service can drive.

    Every model must be OpenAI-compatible (chat/completions + tool-calling —
    the deep agent depends on the latter). The primary model comes from the
    flat ``LLM_*`` keys; extra models are supplied as a JSON array in
    ``LLM_MODELS``.
    """

    # `model` falls inside pydantic's protected `model_` namespace; opt out so
    # the field can keep the plain, user-facing name.
    model_config = ConfigDict(protected_namespaces=())

    id: str
    display_name: str
    base_url: str
    model: str
    # Local OpenAI-compatible servers (vLLM, etc.) ignore the key, but the
    # client still needs a non-empty string — hence the "EMPTY" sentinel.
    api_key: str = "EMPTY"
    timeout_seconds: float = 120.0


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Conversation store. No default: config comes exclusively from the
    # unified profile (scripts/env.sh) — a missing key must fail startup.
    database_url: str

    # Primary (default) OpenAI-compatible LLM — the flat keys the platform has
    # always used. Also the fallback whenever LLM_MODELS is unset/malformed.
    llm_base_url: str = "https://api.deepseek.com"
    llm_api_key: str = ""
    llm_model: str = "deepseek-v4-flash"
    # Shown as the model badge in the frontend trace card.
    llm_display_name: str = "DeepSeek V4 Flash"
    llm_timeout_seconds: float = 120.0

    # Extra selectable models, as a JSON array of ModelProfile objects:
    #   [{"id","display_name","base_url","model","api_key"?,"timeout_seconds"?}]
    # Empty → only the primary model is offered. In env files wrap the value in
    # SINGLE quotes so both scripts/env.sh (bash) and the ops launcher preserve
    # the JSON verbatim.
    llm_models: str = ""
    # id of the model chosen by default; empty → the primary model.
    llm_default_model: str = ""

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

    def _primary_profile(self) -> ModelProfile:
        return ModelProfile(
            id="default",
            display_name=self.llm_display_name,
            base_url=self.llm_base_url,
            model=self.llm_model,
            api_key=self.llm_api_key or "EMPTY",
            timeout_seconds=self.llm_timeout_seconds,
        )

    def list_llm_profiles(self) -> list[ModelProfile]:
        """All selectable models: the primary first, then any from LLM_MODELS.

        A malformed LLM_MODELS (or a bad entry within it) is skipped rather than
        raised, so a typo in the extra-models config can never take the service
        down — the primary model always remains available. Duplicate ids after
        the first occurrence are dropped.
        """
        profiles = [self._primary_profile()]
        raw = self.llm_models.strip()
        if raw:
            try:
                items = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                items = []
            if isinstance(items, list):
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    try:
                        profiles.append(ModelProfile(**item))
                    except Exception:  # noqa: BLE001 — skip a malformed entry
                        continue
        seen: set[str] = set()
        unique: list[ModelProfile] = []
        for p in profiles:
            if p.id in seen:
                continue
            seen.add(p.id)
            unique.append(p)
        return unique

    def resolve_llm_profile(self, model_id: str | None = None) -> ModelProfile:
        """Pick a model by id, falling back to the configured default, then primary.

        An unknown id resolves to the default rather than erroring, so a stale
        client selection can never break a request.
        """
        profiles = self.list_llm_profiles()
        by_id = {p.id: p for p in profiles}
        if model_id and model_id in by_id:
            return by_id[model_id]
        if self.llm_default_model and self.llm_default_model in by_id:
            return by_id[self.llm_default_model]
        return profiles[0]


settings = Settings()
