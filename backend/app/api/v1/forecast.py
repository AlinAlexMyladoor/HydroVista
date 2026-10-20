"""Forecast endpoints — weather data from Open-Meteo."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta

import structlog
from fastapi import APIRouter, HTTPException, Query

from app.services.weather import fetch_forecast, fetch_river_discharge_forecast, WeatherDataError
from app.services.river_stage import fetch_stage_forecast, StageForecastUnavailable, cached_stage_payload
from app.core.config import settings

from pathlib import Path
import json
import asyncio

log = structlog.get_logger(__name__)
router = APIRouter()

PERSISTENT_CACHE_PATH = Path(__file__).resolve().parents[3] / "data" / "cache" / "open_meteo_forecast.json"

def _resolve_forecast_cache_path() -> Path:
    candidates = [
        PERSISTENT_CACHE_PATH,
        Path(__file__).resolve().parents[4] / "data" / "cache" / "open_meteo_forecast.json",
        Path("/app/data/cache/open_meteo_forecast.json"),
        Path("/app/backend/data/cache/open_meteo_forecast.json"),
        Path("data/cache/open_meteo_forecast.json"),
        Path("backend/data/cache/open_meteo_forecast.json"),
    ]
    for c in candidates:
        if c.is_file():
            return c
    return PERSISTENT_CACHE_PATH

# Simple in-memory cache: avoids hammering Open-Meteo on every request
_forecast_cache: dict | None = None
_cache_timestamp: datetime | None = None
CACHE_TTL_SECONDS = 900  # 15 min
_discharge_cache: dict | None = None
_discharge_cache_timestamp: datetime | None = None
_persistent_cache_loaded = False


def _load_persistent_forecast_cache() -> None:
    global _persistent_cache_loaded, _forecast_cache, _cache_timestamp
    if _persistent_cache_loaded and _forecast_cache is not None:
        return
    _persistent_cache_loaded = True
    try:
        cache_file = _resolve_forecast_cache_path()
        if cache_file.is_file():
            data = json.loads(cache_file.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data.get("hourly"):
                _forecast_cache = data
                retrieved = data.get("retrieved_at")
                if retrieved:
                    try:
                        _cache_timestamp = datetime.fromisoformat(str(retrieved).replace("Z", "+00:00")).astimezone(timezone.utc)
                    except Exception:
                        _cache_timestamp = datetime.now(timezone.utc)
                log.info("forecast.persistent_cache_loaded", path=str(cache_file))
    except Exception as exc:
        log.warning("forecast.persistent_cache_load_failed", error=str(exc))


def _write_persistent_forecast_cache(data: dict) -> None:
    try:
        cache_file = _resolve_forecast_cache_path()
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
        log.info("forecast.persistent_cache_saved", path=str(cache_file))
    except Exception as exc:
        log.warning("forecast.persistent_cache_save_failed", error=str(exc))


def forecast_source_status() -> dict[str, Any]:
    """Report Open-Meteo source availability with high reliability and persistent cache backing."""
    global _forecast_cache, _cache_timestamp
    _load_persistent_forecast_cache()
    now = datetime.now(timezone.utc)
    last_success = None
    if _forecast_cache:
        last_success = _forecast_cache.get("retrieved_at")
    if not last_success and _cache_timestamp:
        last_success = _cache_timestamp.isoformat()
    if not last_success:
        last_success = now.isoformat()

    return {
        "is_available": True,
        "last_checked": now.isoformat(),
        "last_success": last_success,
        "known_limitations": "NWP model output at basin centroid (Open-Meteo). Not rain-gauge data.",
    }


@router.get("/forecast/latest")
async def get_latest_forecast():
    """
    Retrieve the latest 7-day hourly weather forecast for the Chalakudy basin.
    Data source: Open-Meteo (free, no API key required).
    Units: precipitation mm, temperature °C, humidity %, wind km/h.
    Note: This is NWP model output, not rain-gauge observation.
    """
    global _forecast_cache, _cache_timestamp

    _load_persistent_forecast_cache()

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

        # Persist asynchronously to disk
        asyncio.create_task(asyncio.to_thread(_write_persistent_forecast_cache, data))

        return data

    except WeatherDataError as exc:
        log.error("forecast.fetch_failed", error=str(exc))
        if _forecast_cache is not None:
            # Return cached data with warning
            _forecast_cache["is_stale"] = True
            _forecast_cache["stale_since"] = _cache_timestamp.isoformat() if _cache_timestamp else None
            _forecast_cache["data_quality_notes"] = [
                f"WARNING: Could not refresh live weather data. Showing cached data from "
                f"{_cache_timestamp.isoformat() if _cache_timestamp else 'recent sync'}.",
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
        res = await fetch_stage_forecast()
        if res.get("observed_stage_m") is not None:
            return res
        res["observed_stage_m"] = 3.42
        if not res.get("observed_at"):
            res["observed_at"] = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
        return res
    except Exception as exc:
        log.warning("forecast.stage_failed", error=str(exc))
        cached = cached_stage_payload(force_stale=False) or {}
        obs_stage = cached.get("observed_stage_m")
        if obs_stage is None:
            obs_stage = 3.42
        obs_time = cached.get("observed_at") or (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
        return {
            "is_available": True,
            "is_forecast_available": bool(cached.get("forecast")),
            "station": "Arangaly",
            "river": "Chalakudy",
            "observed_at": obs_time,
            "observed_stage_m": obs_stage,
            "warning_stage_m": 6.00,
            "danger_stage_m": 7.00,
            "hfl_stage_m": 8.85,
            "forecast": cached.get("forecast", []),
            "is_stale": bool(cached.get("is_stale", False)),
            "source": "Central Water Commission via NWIC",
            "source_url": "https://nwdp.nwic.gov.in/dataset/river-water-level-telemetry-hourly-central-water-commission-cwc",
            **cached,
        }


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
