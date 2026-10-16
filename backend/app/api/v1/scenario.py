"""Scenario (Rain Dial) API endpoints."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, HTTPException

from app.api.v1.assets import _get_or_fetch_assets
from app.api.v1.forecast import _forecast_cache
from app.schemas.schemas import ScenarioRequest
from app.services.scenario import compute_scenario

log = structlog.get_logger(__name__)
router = APIRouter()

_scenario_store: dict[str, dict] = {}


@router.post("/scenario")
async def create_scenario(request: ScenarioRequest):
    """
    Compute a what-if rainfall scenario.

    This is a HYPOTHETICAL STRESS TEST.
    The additional rainfall is added uniformly to the basin-level 24h NWP forecast.
    Results are scenario-modelled, NOT physically simulated.
    """
    assets, asset_warnings = await _get_or_fetch_assets()

    # Get baseline rainfall from forecast cache
    baseline_24h_mm: float | None = None
    if _forecast_cache:
        for acc in _forecast_cache.get("rainfall_accumulations", []):
            if acc["window_hours"] == 24:
                baseline_24h_mm = acc.get("accumulation_mm")
                break

    scenario_id = str(uuid.uuid4())
    closure_threshold = request.closure_threshold or 0.65

    result = compute_scenario(
        scenario_id=scenario_id,
        rainfall_mm=request.rainfall_mm,
        duration_hours=request.duration_hours,
        forecast_hour=request.forecast_hour,
        closure_threshold=closure_threshold,
        assets=assets,
        baseline_24h_rain_mm=baseline_24h_mm,
    )

    result["warnings"] = asset_warnings
    _scenario_store[scenario_id] = result

    log.info(
        "scenario.computed",
        id=scenario_id,
        rainfall_mm=request.rainfall_mm,
        assets=len(assets),
    )

    return result


@router.get("/scenario/{scenario_id}")
async def get_scenario(scenario_id: str):
    """Retrieve a previously computed scenario by ID."""
    if scenario_id not in _scenario_store:
        raise HTTPException(
            status_code=404,
            detail={"error": "scenario_not_found", "scenario_id": scenario_id},
        )
    return _scenario_store[scenario_id]
