"""Chargement de la configuration via pydantic-settings (.env).

🆕 v5.0 — refresh_interval_minutes par défaut à 5 (temps réel)
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Oracle
    oracle_user: str
    oracle_password: str
    oracle_host: str
    oracle_port: int = 1521
    oracle_service_name: str
    oracle_schema: str = "CRM_SNDE"

    # Pool
    oracle_pool_min: int = 2
    oracle_pool_max: int = 10
    oracle_pool_increment: int = 1

    # App
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    cors_origins: str = "http://localhost:5173"
    log_level: str = "INFO"

    # DuckDB cache
    duckdb_path: str = "data/snde.duckdb"
    refresh_interval_minutes: int = 5      # 🆕 v5.0 — temps réel (était 10)
    egf_months_rolling: int = 2
    zone_id: int = 2
    centres_inclus: str = ""  # "97,98" pour limiter, vide = tous

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def centres_inclus_list(self) -> list[int]:
        return [int(c.strip()) for c in self.centres_inclus.split(",") if c.strip()]

    @property
    def oracle_dsn(self) -> str:
        return f"{self.oracle_host}:{self.oracle_port}/{self.oracle_service_name}"


settings = Settings()