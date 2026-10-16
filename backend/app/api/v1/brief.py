"""Brief / situational summary endpoint."""
from __future__ import annotations

from datetime import datetime, timezone

import structlog
from fastapi import APIRouter

from app.api.v1.assets import _get_or_fetch_assets
from app.api.v1.forecast import _forecast_cache
from app.services.exposure import rank_assets
from app.core.config import settings

log = structlog.get_logger(__name__)
router = APIRouter()


@router.get("/brief")
async def get_brief():
    """
    Return a concise situational summary for the Chalakudy basin.
    Aggregates weather, exposure, and data-freshness information.
    """
    now = datetime.now(timezone.utc)

    # Weather
    rainfall_24h_mm: float | None = None
    forecast_time: str | None = None
    data_freshness = "unavailable"
    is_stale = True

    if _forecast_cache:
        is_stale = _forecast_cache.get("is_stale", True)
        for acc in _forecast_cache.get("rainfall_accumulations", []):
            if acc["window_hours"] == 24:
                rainfall_24h_mm = acc.get("accumulation_mm")
                break
        hourly = _forecast_cache.get("hourly", [])
        if hourly:
            forecast_time = hourly[-1].get("time")
        data_freshness = "stale" if is_stale else "current"

    # Exposure
    assets, _ = await _get_or_fetch_assets()
    rankings = rank_assets(assets=assets, rainfall_24h_mm=rainfall_24h_mm) if assets else []

    high_critical = [r for r in rankings if r["risk_category"] in ("high", "critical")]
    max_category = rankings[0]["risk_category"] if rankings else None

    warnings: list[str] = []
    if data_freshness == "unavailable":
        warnings.append("Weather data not yet loaded. Call /api/v1/forecast/latest first.")
    if is_stale and data_freshness != "unavailable":
        warnings.append("Weather forecast data is stale. Refresh recommended.")
    if not assets:
        warnings.append("Infrastructure data not yet loaded.")
    if rainfall_24h_mm and rainfall_24h_mm > 100:
        warnings.append(f"24h NWP rainfall {rainfall_24h_mm:.1f} mm exceeds heavy-rain threshold (100 mm).")

    mode = "degraded" if data_freshness == "unavailable" else "live"

    return {
        "basin": settings.BASIN_NAME,
        "generated_at": now.isoformat(),
        "forecast_horizon_hours": 168,
        "rainfall_24h_mm": rainfall_24h_mm,
        "max_risk_category": max_category,
        "affected_roads_count": None,  # Full road analysis pending
        "isolated_facilities_count": None,  # Requires full road graph
        "data_freshness": data_freshness,
        "operating_mode": mode,
        "key_warnings": warnings,
        "disclaimer": (
            "FloodLens AI is a research prototype. "
            "Risk estimates are relative rankings based on terrain and NWP rainfall. "
            "Not an official flood forecast or warning service."
        ),
    }
