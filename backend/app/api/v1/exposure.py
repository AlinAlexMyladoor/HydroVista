"""Exposure ranking API endpoint."""
from __future__ import annotations

from typing import Optional

import structlog
from fastapi import APIRouter, Query

from app.api.v1.assets import _get_or_fetch_assets
from app.api.v1 import forecast as forecast_api
from app.services.exposure import rank_assets

log = structlog.get_logger(__name__)
router = APIRouter()


@router.get("/exposure")
async def get_exposure(
    asset_type: Optional[str] = Query(None),
    risk_category: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    scenario_id: Optional[str] = Query(None),
):
    """
    Return infrastructure exposure rankings.
    Risk score = weighted combination of terrain susceptibility + rainfall factor + criticality.
    All scores are relative rankings, NOT calibrated probabilities.
    """
    assets, asset_warnings = await _get_or_fetch_assets()

    # Get 24h rainfall from cached forecast
    rainfall_24h_mm: float | None = None
    forecast_time = None
    if forecast_api._forecast_cache:
        for acc in forecast_api._forecast_cache.get("rainfall_accumulations", []):
            if acc["window_hours"] == 24:
                rainfall_24h_mm = acc.get("accumulation_mm")
                break
        hourly = forecast_api._forecast_cache.get("hourly", [])
        if hourly:
            forecast_time = hourly[-1].get("time")

    rankings = rank_assets(assets=assets, rainfall_24h_mm=rainfall_24h_mm)

    if asset_type:
        rankings = [r for r in rankings if r.get("asset_type") == asset_type]
    if risk_category:
        rankings = [r for r in rankings if r.get("risk_category") == risk_category]

    total = len(rankings)
    start = (page - 1) * page_size
    page_items = rankings[start : start + page_size]

    return {
        "items": page_items,
        "meta": {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
        },
        "rainfall_24h_mm": rainfall_24h_mm,
        "forecast_time": forecast_time,
        "scenario_id": scenario_id,
        "warnings": asset_warnings,
        "disclaimer": (
            "Risk scores are relative rankings based on terrain susceptibility and "
            "NWP rainfall estimates. They are NOT calibrated flood probabilities "
            "or validated depth forecasts."
        ),
    }
