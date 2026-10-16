"""Application configuration using pydantic-settings."""
from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ─── App ──────────────────────────────────────────────────────────────────
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    SECRET_KEY: str = "change-me"

    # ─── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://floodlens:floodlens@localhost:5432/floodlens"
    SYNC_DATABASE_URL: str = "postgresql://floodlens:floodlens@localhost:5432/floodlens"

    # ─── CORS ─────────────────────────────────────────────────────────────────
    API_CORS_ORIGINS: str = "http://localhost:3000"

    @property
    def API_CORS_ORIGINS_LIST(self) -> List[str]:
        return [o.strip() for o in self.API_CORS_ORIGINS.split(",")]

    # ─── External services ────────────────────────────────────────────────────
    OPEN_METEO_BASE_URL: str = "https://api.open-meteo.com/v1"

    # ─── Optional – object storage ────────────────────────────────────────────
    R2_ACCOUNT_ID: str | None = None
    R2_ACCESS_KEY_ID: str | None = None
    R2_SECRET_ACCESS_KEY: str | None = None
    R2_BUCKET_NAME: str | None = None
    R2_PUBLIC_URL: str | None = None

    # ─── Optional – LLM assistant ─────────────────────────────────────────────
    LLM_PROVIDER: str | None = None
    GEMINI_API_KEY: str | None = None
    OPENAI_API_KEY: str | None = None
    ANTHROPIC_API_KEY: str | None = None

    # ─── Optional – Copernicus / ESA ──────────────────────────────────────────
    CDSE_CLIENT_ID: str | None = None      # backend-only OAuth client (never exposed to the browser)
    CDSE_CLIENT_SECRET: str | None = None
    COPERNICUS_USER: str | None = None
    COPERNICUS_PASSWORD: str | None = None

    # ─── Pilot geography ──────────────────────────────────────────────────────
    BASIN_NAME: str = "Chalakudy River Basin"
    BASIN_LAT: float = 10.3  # approx basin centroid
    BASIN_LON: float = 76.65
    # Bounding box: [min_lon, min_lat, max_lon, max_lat]
    BASIN_BBOX: str = "76.3,10.0,76.9,10.6"

    @property
    def basin_bbox_list(self) -> list[float]:
        return [float(x) for x in self.BASIN_BBOX.split(",")]

    # ─── Rate limiting ────────────────────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE: int = 60


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
