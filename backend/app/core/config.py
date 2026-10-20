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
    API_CORS_ORIGINS: str = (
        "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001,"
        "https://hydro-vista-silk.vercel.app"
    )
    CORS_ORIGINS: str | None = None

    @property
    def API_CORS_ORIGINS_LIST(self) -> List[str]:
        raw = self.CORS_ORIGINS or self.API_CORS_ORIGINS
        if raw.strip() == "*":
            return ["*"]
        origins = [o.strip() for o in raw.split(",") if o.strip()]
        defaults = [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
            "https://hydro-vista-silk.vercel.app",
        ]
        for d in defaults:
            if d not in origins and "*" not in origins:
                origins.append(d)
        return origins

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
    GEMINI_MODEL: str = "gemini-2.5-flash"
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


HYDROVISTA_SYSTEM_PROMPT = """You are the HydroVista Assistant, an elite disaster-intelligence copilot for the Chalakudy and Periyar river basins.

CORE DIRECTIVES:
1. STRICT GROUNDING: Answer EXCLUSIVELY using the JSON context payload provided. Do not use external knowledge.
2. ZERO EXTRAPOLATION: If data (like CWC Arangaly gauge readings) is missing or "Unavailable", state: "Live telemetry is offline. Relying on GloFAS model guidance."
3. EFFICIENCY: Deliver concise, high-scannability briefings. Use bullet points and bold text for critical assets and metrics. No conversational filler.
4. INTENT MAPPING: Silently correct user typos or slang (e.g., "tmr rian") and map them to the relevant precipitation or risk metrics.
5. SAFETY BOUNDARIES: You provide analytical guidance only. Explicitly state you cannot issue official government warnings or evacuation orders.
"""
