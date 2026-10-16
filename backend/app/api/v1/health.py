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
    from app.api.v1.forecast import _forecast_cache
    from app.services import cdse

    creds = bool(settings.CDSE_CLIENT_ID and settings.CDSE_CLIENT_SECRET)
    fc_ok = _forecast_cache is not None and not _forecast_cache.get("is_stale", True)

    def sat(sensor: str, name: str) -> DataSourceStatus:
        st = cdse.sensor_status(sensor, creds)  # type: ignore[arg-type]
        scene = st["latest_scene"]
        lim = st["limitations"]
        if not creds:
            lim += " Imagery rendering needs CDSE_CLIENT_ID/SECRET on the backend."
        if scene:
            lim += f" Latest scene {scene['acquired']} ({st['latest_scene_age_hours']} h old)."
        return DataSourceStatus(
            slug="sentinel-1" if sensor == "s1" else "sentinel-2",
            name=name,
            is_available=bool(st["imagery_ok"]),
            last_checked=st["catalogue_last_success"],
            last_success=st["imagery_last_success"],
            requires_credentials=True,
            known_limitations=lim,
        )

    return [
        DataSourceStatus(
            slug="open-meteo",
            name="Open-Meteo Weather Forecast",
            is_available=fc_ok,
            last_checked=None,
            last_success=(_forecast_cache or {}).get("retrieved_at") if _forecast_cache else None,
            requires_credentials=False,
            known_limitations="NWP model output at basin centroid. Not rain-gauge data.",
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
            name="Terrarium DEM tiles (Mapzen / AWS Open Data)",
            is_available=True,
            last_checked=None,
            last_success=None,
            requires_credentials=False,
            known_limitations="Browser-side tiles (SRTM/ASTER/other mix, ~30 m, z11 over the basin). Backend does not ingest a DEM; exposure terrain factor uses default when elevation is unavailable.",
        ),
        sat("s1", "Sentinel-1 SAR (CDSE)"),
        sat("s2", "Sentinel-2 optical (CDSE)"),
        DataSourceStatus(
            slug="worldpop",
            name="WorldPop Population Raster",
            is_available=False,
            last_checked=None,
            last_success=None,
            requires_credentials=False,
            known_limitations="Not ingested. Population exposure unavailable.",
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
