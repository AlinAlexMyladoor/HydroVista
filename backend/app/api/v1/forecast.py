"""Forecast endpoints — weather data from Open-Meteo."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, HTTPException, Query

from app.services.weather import fetch_forecast, fetch_river_discharge_forecast, WeatherDataError
from app.services.river_stage import fetch_stage_forecast, StageForecastUnavailable
from app.core.config import settings

log = structlog.get_logger(__name__)
router = APIRouter()

# Simple in-memory cache: avoids hammering Open-Meteo on every request
_forecast_cache: dict | None = None
_cache_timestamp: datetime | None = None
CACHE_TTL_SECONDS = 900  # 15 min
_discharge_cache: dict | None = None
_discharge_cache_timestamp: datetime | None = None


@router.get("/forecast/latest")
async def get_latest_forecast():
    """
    Retrieve the latest 7-day hourly weather forecast for the Chalakudy basin.
    Data source: Open-Meteo (free, no API key required).
    Units: precipitation mm, temperature °C, humidity %, wind km/h.
    Note: This is NWP model output, not rain-gauge observation.
    """
    global _forecast_cache, _cache_timestamp

    now = datetime.now(timezone.utc)
    cache_age = (now - _cache_timestamp).total_seconds() if _cache_timestamp else None

    is_stale = cache_age is not None and cache_age > CACHE_TTL_SECONDS

    if _forecast_cache is not None and not is_stale:
        log.info("forecast.cache_hit", age_s=round(cache_age or 0))
        return _forecast_cache

    try:
        data = await fetch_forecast(
            lat=settings.BASIN_LAT,
            lon=settings.BASIN_LON,
        )
        run_id = str(uuid.uuid4())
        data["run_id"] = run_id
        data["basin"] = settings.BASIN_NAME
        data["forecast_horizon_hours"] = 168  # 7 days
        data["is_stale"] = False
        data["stale_since"] = None

        _forecast_cache = data
        _cache_timestamp = now

        return data

    except WeatherDataError as exc:
        log.error("forecast.fetch_failed", error=str(exc))
        if _forecast_cache is not None:
            # Return stale cache with warning
            _forecast_cache["is_stale"] = True
            _forecast_cache["stale_since"] = _cache_timestamp.isoformat() if _cache_timestamp else None
            _forecast_cache["data_quality_notes"] = [
                f"WARNING: Could not refresh weather data. Showing cached data from "
                f"{_cache_timestamp.isoformat() if _cache_timestamp else 'unknown time'}.",
                "Live data retrieval failed: " + str(exc),
            ] + _forecast_cache.get("data_quality_notes", [])
            return _forecast_cache
        raise HTTPException(
            status_code=503,
            detail={
                "error": "weather_data_unavailable",
                "message": str(exc),
                "source": "Open-Meteo",
                "recommendation": "Check network connectivity. Open-Meteo requires no API key.",
            },
        )


@router.get("/forecast/discharge")
async def get_river_discharge_forecast():
    """Return modelled GloFAS discharge for the basin-centroid river grid cell."""
    global _discharge_cache, _discharge_cache_timestamp
    now = datetime.now(timezone.utc)
    if _discharge_cache and _discharge_cache_timestamp and (now - _discharge_cache_timestamp).total_seconds() < CACHE_TTL_SECONDS:
        return _discharge_cache
    try:
        result = await fetch_river_discharge_forecast(settings.BASIN_LAT, settings.BASIN_LON)
        _discharge_cache = result
        _discharge_cache_timestamp = now
        return result
    except WeatherDataError as exc:
        log.warning("forecast.discharge_failed", error=str(exc))
        if _discharge_cache:
            return {**_discharge_cache, "is_stale": True}
        raise HTTPException(status_code=503, detail="River discharge forecast is temporarily unavailable") from exc


@router.get("/forecast/stage")
async def get_river_stage_forecast():
    """Return a gauge-conditioned 48-hour stage forecast for Arangaly, Chalakudy."""
    try:
        return await fetch_stage_forecast()
    except StageForecastUnavailable as exc:
        log.warning("forecast.stage_unavailable", reason=str(exc))
        raise HTTPException(
            status_code=503,
            detail={
                "error": "stage_forecast_unavailable",
                "message": str(exc),
                "station": "Arangaly",
                "source": "Central Water Commission via NWIC",
            },
        ) from exc


@router.get("/forecast/{run_id}")
async def get_forecast_by_run(run_id: str):
    """Get a specific forecast run by ID. Currently returns cached run if IDs match."""
    if _forecast_cache and _forecast_cache.get("run_id") == run_id:
        return _forecast_cache
    raise HTTPException(status_code=404, detail={"error": "forecast_run_not_found", "run_id": run_id})


@router.get("/data-sources")
async def get_data_sources():
    """Single source of truth: same registry as /status (real, call-derived availability)."""
    from app.api.v1.health import _build_registry

    return {"sources": [d.model_dump(mode="json") for d in _build_registry()]}
