"""
End-to-End integration test suite.
Validates the complete workflow:
Weather Ingestion -> Exposure Engine -> Rain Dial Scenario Delta -> Isolation Clock Routing.
"""
from __future__ import annotations

import pytest
import sys
import os
from datetime import datetime, timezone, timedelta

# Add paths
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.services.weather import _compute_accumulations
from app.services.exposure import rank_assets
from app.services.scenario import compute_scenario
from app.services.isolation import RoadGraph, compute_isolation_clock, DEFAULT_CLOSURE_THRESHOLD

SAMPLE_BASIN_ASSETS = [
    {
        "osm_id": "hosp-1",
        "name": "Chalakudy St. James Hospital",
        "asset_type": "hospital",
        "sub_type": "hospital",
        "lat": 10.3006,
        "lon": 76.3358,
    },
    {
        "osm_id": "bridge-1",
        "name": "Chalakudy River Bridge (NH 544)",
        "asset_type": "bridge",
        "sub_type": "bridge",
        "lat": 10.3020,
        "lon": 76.3320,
    },
    {
        "osm_id": "shelter-1",
        "name": "Pariyaram Relief Shelter",
        "asset_type": "shelter",
        "sub_type": "assembly_point",
        "lat": 10.3200,
        "lon": 76.3500,
    },
    {
        "osm_id": "substation-1",
        "name": "Chalakudy 110kV Substation",
        "asset_type": "substation",
        "sub_type": "substation",
        "lat": 10.2950,
        "lon": 76.3300,
    },
]


def test_end_to_end_hydrological_workflow():
    # 1. Weather forecast accumulation
    now = datetime.now(timezone.utc)
    precip_list = [2.5 for _ in range(72)]
    time_list = [(now + timedelta(hours=i)).isoformat() for i in range(72)]
    accumulations = _compute_accumulations(precip_list, time_list)
    acc_24 = next(a["accumulation_mm"] for a in accumulations if a["window_hours"] == 24)
    assert acc_24 == 60.0

    # 2. Exposure engine ranking
    baseline_ranked = rank_assets(SAMPLE_BASIN_ASSETS, rainfall_24h_mm=acc_24)
    assert len(baseline_ranked) == len(SAMPLE_BASIN_ASSETS)
    # Check that hospital has high risk
    top_risk = baseline_ranked[0]
    assert top_risk["risk_score"] >= 0.35
    assert top_risk["risk_category"] in ("medium", "high", "critical")

    # 3. Scenario stress test (+100mm synthetic convective rainfall)
    scenario_result = compute_scenario(
        scenario_id="e2e-scenario-test",
        rainfall_mm=100.0,
        duration_hours=6.0,
        forecast_hour=24,
        closure_threshold=0.60,
        assets=SAMPLE_BASIN_ASSETS,
        baseline_24h_rain_mm=acc_24,
    )
    summary = scenario_result["summary"]
    assert summary["combined_24h_mm"] == 160.0
    # Scenario risk should escalate or remain equal
    assert summary["scenario_high_critical_count"] >= summary["baseline_high_critical_count"]
    assert summary["delta_high_critical"] >= 0

    # 4. Isolation clock routing accessibility
    graph = RoadGraph()
    ways = [
        {
            "osm_id": "nh544",
            "name": "NH 544",
            "highway": "primary",
            "geometry": [[76.3358, 10.3006], [76.28, 10.40], [76.2144, 10.5276]],
        }
    ]
    graph.load_from_osm_ways(ways)

    facility = {
        "id": "hosp-1",
        "name": "Chalakudy St. James Hospital",
        "type": "hospital",
        "lat": 10.3006,
        "lon": 76.3358,
    }
    anchors = [
        {"id": "anchor-1", "name": "Thrissur General Hospital", "lat": 10.5276, "lon": 76.2144}
    ]
    forecast_steps = [
        {
            "time": now + timedelta(hours=i),
            "susceptibility_map": {"nh544": 0.4 if i < 12 else 0.85},
        }
        for i in range(24)
    ]

    isolation = compute_isolation_clock(
        facility=facility,
        anchors=anchors,
        road_graph=graph,
        forecast_steps=forecast_steps,
        closure_threshold=0.60,
    )
    assert isolation["facility_id"] == "hosp-1"
    assert isolation["is_connected"] is False  # becomes severed at hour 12
    assert isolation["time_to_isolation_hours"] == 1.0
