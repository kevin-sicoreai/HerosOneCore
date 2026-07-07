"""Service configuration, loaded from environment variables (or a local .env)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./auth.db"

    # HS256 signing secret for JWTs. Override in real deployments.
    jwt_secret: str = "dev-secret-change-me"
    jwt_expire_minutes: int = 720

    # Seeded bootstrap admin (dev convenience).
    bootstrap_admin_username: str = "admin"
    bootstrap_admin_password: str = "admin"

    log_level: str = "INFO"


settings = Settings()
