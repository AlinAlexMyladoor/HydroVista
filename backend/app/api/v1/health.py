"""Health and status endpoints."""
from __future__ import annotations

from datetime import datetime, timezone

import structlog
from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.schemas.schemas import HealthResponse, StatusResponse, DataSourceStatus

log = structlog.get_logger(__name__)
router = APIRouter()

def _build_registry() -> list[DataSourceStatus]:
    """Availability reflects real state (cache / last calls), never hard-coded optimism."""
    from app.api.v1.forecast import forecast_source_status
    from app.analysis import gee
    from app.services.elevation import source_status as elevation_source_status
    from app.services.river_stage import stage_source_status

    forecast_status = forecast_source_status()
    elevation_status = elevation_source_status()
    stage_status = stage_source_status()

    gee_checked_at = datetime.now(timezone.utc)
    gee_ok = False
    gee_error: str | None = None
    try:
        gee.init_ee()
        gee_ok = True
    except Exception as exc:  # noqa: BLE001 - status must remain available when EE is down
        gee_error = f"Earth Engine unavailable: {type(exc).__name__}."

    def sat(slug: str, name: str, dataset: str) -> DataSourceStatus:
        limitation = (
            f"Available through Google Earth Engine ({dataset}); scene queries run on demand."
            if gee_ok
            else gee_error or "Earth Engine has not been initialized."
        )
        return DataSourceStatus(
            slug=slug,
            name=name,
            is_available=gee_ok,
            last_checked=gee_checked_at,
            # Initializing Earth Engine only verifies credentials/connectivity. It
            # does not query this collection or mean a new scene was acquired.
            last_success=None,
            requires_credentials=True,
            known_limitations=limitation,
        )

    return [
        DataSourceStatus(
            slug="open-meteo",
            name="Open-Meteo Weather Forecast",
            is_available=forecast_status["is_available"],
            last_checked=forecast_status["last_checked"],
            last_success=forecast_status["last_success"],
            requires_credentials=False,
            known_limitations=forecast_status["known_limitations"],
        ),
        DataSourceStatus(
            slug="cwc-river-stage",
            name="CWC Arangaly River Gauge",
            is_available=stage_status["is_available"],
            last_checked=stage_status["last_checked"],
            last_success=stage_status["last_success"],
            requires_credentials=False,
            known_limitations=stage_status["known_limitations"],
        ),
        DataSourceStatus(
            slug="osm",
            name="OpenStreetMap / Overpass API",
            is_available=True,
            last_checked=None,
            last_success=None,
            requires_credentials=False,
            known_limitations="OSM completeness varies; shelter data often incomplete. May fall back to a curated asset list if Overpass is unreachable.",
        ),
        DataSourceStatus(
            slug="terrarium-dem",
            name="Terrain elevation (Terrarium / Copernicus DEM)",
            is_available=bool(elevation_status["is_available"]),
            last_checked=elevation_status["last_checked"],
            last_success=elevation_status["last_success"],
            requires_credentials=False,
            known_limitations=f"Backend samples Terrarium tiles first and falls back to Open-Meteo's Copernicus GLO-90 elevation API. Last successful sources: {elevation_status['sources']}",
        ),
        sat("sentinel-1", "Sentinel-1 SAR (Google Earth Engine)", "COPERNICUS/S1_GRD"),
        sat("sentinel-2", "Sentinel-2 optical (Google Earth Engine)", "COPERNICUS/S2_SR_HARMONIZED"),
        DataSourceStatus(
            slug="worldpop",
            name="WorldPop Population Raster",
            is_available=gee_ok,
            last_checked=gee_checked_at,
            # WorldPop is sampled during analysis runs, not during this status
            # check, so don't report the connectivity check as a data update.
            last_success=None,
            requires_credentials=True,
            known_limitations=(
                f"Available through Google Earth Engine ({gee.WORLDPOP}); exposed population is calculated for completed flood runs."
                if gee_ok else gee_error or "Earth Engine has not been initialized."
            ),
        ),
    ]


@router.get("/health", response_model=HealthResponse)
async def health():
    """Basic liveness check."""
    return HealthResponse(
        status="ok",
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(timezone.utc),
    )


@router.get("/status", response_model=StatusResponse)
async def status():
    """Detailed system status including database and data sources."""
    # Check database connectivity
    db_status = "unavailable"
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as exc:
        log.warning("status.db_check_failed", error=str(exc))
        db_status = f"error: {type(exc).__name__}"

    # Determine operating mode
    if db_status == "connected":
        mode = "live"
    else:
        mode = "degraded"

    return StatusResponse(
        api="ok",
        database=db_status,
        data_sources=_build_registry(),
        current_mode=mode,
        disclaimer=(
            "FloodLens AI is a research prototype. "
            "It is NOT an officially validated flood-warning service."
        ),
    )
