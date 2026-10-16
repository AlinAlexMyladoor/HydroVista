"""Isolation Clock API endpoint."""
from __future__ import annotations

import structlog
from fastapi import APIRouter, Query
from typing import Optional

from app.api.v1.assets import _get_or_fetch_assets
from app.services.isolation import RoadGraph, compute_isolation_clock

log = structlog.get_logger(__name__)
router = APIRouter()

DISCLAIMER = (
    "Isolation estimates are scenario-modelled. They represent computed "
    "accessibility under stated rainfall assumptions, NOT confirmed road closures. "
    "Actual passability depends on real-time water depth, emergency decisions, "
    "and conditions not captured by this model."
)

# Safe-access anchors: elevated, accessible locations in the Chalakudy area.
# These are documented reference points, not authoritative government evacuation sites.
SAFE_ACCESS_ANCHORS = [
    {"id": "anchor-1", "name": "Chalakudy Town Centre (elevated)", "lat": 10.3006, "lon": 76.3358},
    {"id": "anchor-2", "name": "Thrissur City (regional hub)", "lat": 10.5276, "lon": 76.2144},
    {"id": "anchor-3", "name": "Athirappilly Plateau", "lat": 10.2845, "lon": 76.5704},
]


@router.get("/isolation")
async def get_isolation(
    scenario_id: Optional[str] = Query(None),
    closure_threshold: float = Query(0.65, ge=0.1, le=1.0),
):
    """
    Compute modelled connectivity status for critical facilities.
    Uses scenario-based road graph analysis.
    Returns Isolation Clock results for hospitals and emergency facilities.
    """
    assets, warnings = await _get_or_fetch_assets()

    # Filter to critical facilities only
    critical = [
        a for a in assets
        if a.get("asset_type") in ("hospital", "emergency")
        or a.get("sub_type") in ("hospital", "clinic")
    ]

    if not critical:
        return {
            "items": [],
            "disclaimer": DISCLAIMER,
            "warnings": warnings + ["No critical facilities found in the asset dataset."],
            "anchors": SAFE_ACCESS_ANCHORS,
        }

    # Build a minimal synthetic road graph from facility locations
    # (In production this would use actual OSM road ways from osmnx)
    road_graph = RoadGraph()

    # For now, create a simple star graph connecting each facility to each anchor
    # via synthetic direct edges. A full road graph would require osmnx download.
    for facility in critical:
        for anchor in SAFE_ACCESS_ANCHORS:
            road_graph.G.add_node(
                (facility["lat"], facility["lon"]),
                lat=facility["lat"], lon=facility["lon"]
            )
            road_graph.G.add_node(
                (anchor["lat"], anchor["lon"]),
                lat=anchor["lat"], lon=anchor["lon"]
            )
            from app.services.isolation import haversine_m
            dist = haversine_m(
                facility["lat"], facility["lon"],
                anchor["lat"], anchor["lon"]
            )
            road_graph.G.add_edge(
                (facility["lat"], facility["lon"]),
                (anchor["lat"], anchor["lon"]),
                length_m=dist,
                osm_id=f"synthetic_{facility.get('osm_id', '')}",
                name="Synthetic route (OSM road graph not yet loaded)",
                highway="primary",
                is_flagged=False,
                risk_score=0.0,
            )

    results = []
    from datetime import datetime, timezone, timedelta

    # Generate synthetic forecast steps for scenario analysis
    now = datetime.now(timezone.utc)
    forecast_steps = [
        {"time": now + timedelta(hours=h), "susceptibility_map": {}}
        for h in range(0, 73, 6)
    ]

    for facility in critical[:20]:  # limit for performance
        result = compute_isolation_clock(
            facility={
                "id": str(facility.get("osm_id", "")),
                "name": facility.get("name", "Unknown"),
                "type": facility.get("sub_type", facility.get("asset_type", "facility")),
                "lat": facility["lat"],
                "lon": facility["lon"],
            },
            anchors=SAFE_ACCESS_ANCHORS,
            road_graph=road_graph,
            forecast_steps=forecast_steps,
            closure_threshold=closure_threshold,
        )
        result["scenario_id"] = scenario_id
        results.append(result)

    return {
        "items": results,
        "safe_access_anchors": SAFE_ACCESS_ANCHORS,
        "closure_threshold": closure_threshold,
        "warnings": warnings + [
            "Road graph built from synthetic direct edges. Full OSM road graph integration pending.",
            "Use osmnx or pre-downloaded road network for production routing.",
        ],
        "disclaimer": DISCLAIMER,
        "scenario_id": scenario_id,
    }
