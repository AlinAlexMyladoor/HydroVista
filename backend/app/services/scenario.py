"""
Scenario (Rain Dial) engine.

Computes what-if scenario outputs for a given additional rainfall amount
and duration. The engine:

1. Fetches the current baseline weather and exposure.
2. Adds the scenario rainfall to the existing 24h accumulation.
3. Recomputes exposure scores for all assets.
4. Recomputes road accessibility with the updated susceptibility map.
5. Returns deltas between baseline and scenario.

Methodology:
- The scenario rainfall is added linearly to the existing 24h NWP accumulation.
- Terrain susceptibility is unchanged (it depends on static terrain features).
- The combined (baseline + scenario) rainfall drives an updated rainfall_factor.
- Edge scenario-flagging uses the updated rainfall factor to scale a
  susceptibility-derived risk score per road segment.

This is a HYPOTHETICAL STRESS TEST, not a physical flood simulation.
The output must be clearly labelled as scenario-modelled, not forecast.

Limitations:
- No validated rainfall-to-depth relationship is used.
- Spatial distribution of rainfall is assumed uniform across the basin.
- Sub-basin routing and time-of-concentration are not modelled.
- Road-closure thresholds are scenario-calibrated, not physically validated.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import structlog

from app.services.exposure import compute_risk_score, rank_assets

log = structlog.get_logger(__name__)

SCENARIO_DISCLAIMER = (
    "This is a hypothetical stress test under stated rainfall assumptions. "
    "It is NOT a validated flood simulation or official forecast. "
    "Spatial rainfall distribution is assumed uniform. "
    "Road closures are scenario-flagged, not physically confirmed."
)

SCENARIO_METHOD = (
    "Scenario rainfall is added to the current NWP 24h forecast accumulation. "
    "Combined rainfall drives a normalised rainfall factor that adjusts exposure scores. "
    "Road edges with combined asset score ≥ threshold are flagged as scenario-inaccessible."
)


def compute_scenario(
    scenario_id: str,
    rainfall_mm: float,
    duration_hours: float,
    forecast_hour: int,
    closure_threshold: float,
    assets: list[dict],
    baseline_24h_rain_mm: float | None,
    elevation_lookup: dict[str, float] | None = None,
) -> dict[str, Any]:
    """
    Compute scenario outputs.

    Parameters
    ----------
    scenario_id : Unique scenario run ID
    rainfall_mm : Additional rainfall to apply (mm)
    duration_hours : Duration of the additional rainfall (hours)
    forecast_hour : Forecast horizon (hours from now)
    closure_threshold : Risk score threshold for flagging road edges
    assets : List of asset dicts
    baseline_24h_rain_mm : Current NWP 24h rainfall accumulation (mm)
    elevation_lookup : Optional dict of asset_id → elevation_m

    Returns
    -------
    dict with scenario summary, asset rankings, and road flags
    """
    # Combine baseline + scenario rainfall
    if baseline_24h_rain_mm is not None:
        combined_24h_mm = baseline_24h_rain_mm + rainfall_mm
    else:
        combined_24h_mm = rainfall_mm
        log.warning("scenario.no_baseline_rain", scenario_id=scenario_id)

    # Recompute exposure scores with combined rainfall
    scenario_rankings = rank_assets(
        assets=assets,
        rainfall_24h_mm=combined_24h_mm,
        elevation_lookup=elevation_lookup,
    )

    # Baseline rankings (unchanged rainfall)
    baseline_rankings = rank_assets(
        assets=assets,
        rainfall_24h_mm=baseline_24h_rain_mm,
        elevation_lookup=elevation_lookup,
    )

    # Build susceptibility map for road graph flagging
    # Each asset osm_id → scenario risk score
    susceptibility_map: dict[str, float] = {
        r["asset_id"]: r["risk_score"]
        for r in scenario_rankings
        if r["asset_id"]
    }

    # Count affected assets by category change
    baseline_by_id = {r["asset_id"]: r for r in baseline_rankings}
    escalated = []
    for sr in scenario_rankings:
        aid = sr["asset_id"]
        br = baseline_by_id.get(aid)
        if br and _risk_ordinal(sr["risk_category"]) > _risk_ordinal(br["risk_category"]):
            escalated.append({
                "asset_id": aid,
                "name": sr["asset_name"],
                "type": sr["asset_type"],
                "baseline_category": br["risk_category"],
                "scenario_category": sr["risk_category"],
                "delta_score": round(sr["risk_score"] - br["risk_score"], 3),
            })

    high_or_critical = [
        r for r in scenario_rankings if r["risk_category"] in ("high", "critical")
    ]
    baseline_high_or_critical = [
        r for r in baseline_rankings if r["risk_category"] in ("high", "critical")
    ]

    return {
        "scenario_id": scenario_id,
        "rainfall_mm": rainfall_mm,
        "duration_hours": duration_hours,
        "forecast_hour": forecast_hour,
        "closure_threshold": closure_threshold,
        "baseline_24h_mm": baseline_24h_rain_mm,
        "scenario_24h_mm": combined_24h_mm,
        "scenario_rankings": scenario_rankings[:50],  # top 50 by risk
        "susceptibility_map": susceptibility_map,
        "escalated_assets": escalated,
        "summary": {
            "baseline_high_critical_count": len(baseline_high_or_critical),
            "scenario_high_critical_count": len(high_or_critical),
            "delta_high_critical": len(high_or_critical) - len(baseline_high_or_critical),
            "escalated_count": len(escalated),
            "combined_24h_mm": combined_24h_mm,
        },
        "method": SCENARIO_METHOD,
        "assumptions": [
            f"Additional {rainfall_mm:.1f} mm over {duration_hours:.0f} hours added uniformly to basin.",
            f"Baseline 24h accumulation: {baseline_24h_rain_mm:.1f} mm" if baseline_24h_rain_mm is not None
            else "Baseline 24h accumulation: unavailable (using scenario-only rainfall).",
            f"Road closure threshold: risk score ≥ {closure_threshold:.2f}.",
            "No validated hydraulic model. Spatial rainfall distribution assumed uniform.",
            "Duration is recorded but does NOT change the result: only total depth drives the heuristic "
            "(no validated intensity-duration relationship is implemented).",
        ],
        "disclaimer": SCENARIO_DISCLAIMER,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }


def _risk_ordinal(category: str) -> int:
    return {"low": 0, "medium": 1, "high": 2, "critical": 3}.get(category, 0)
