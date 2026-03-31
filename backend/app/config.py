"""Application settings loaded from environment variables."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # PostgreSQL
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/redis_manager"

    # Prometheus
    prometheus_url: str = "http://localhost:9090"
    prometheus_default_job: str = "redis_cluster"

    # Health poller
    health_poll_interval: float = 30.0

    # App
    debug: bool = False
    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]


settings = Settings()
