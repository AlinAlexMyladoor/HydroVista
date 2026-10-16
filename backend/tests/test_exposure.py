"""Tests for exposure ranking engine."""
from __future__ import annotations

import pytest
from app.services.exposure import (
    elevation_susceptibility,
    rainfall_factor,
    criticality_factor,
    compute_risk_score,
    rank_assets,
    CRITICALITY,
)


def test_elevation_susceptibility_low_elevation():
    """Very low elevation should give high susceptibility."""
    assert elevation_susceptibility(5.0) == 1.0
    assert elevation_susceptibility(10.0) == 1.0


def test_elevation_susceptibility_high_elevation():
    """High elevation should give low susceptibility."""
    assert elevation_susceptibility(300.0) == 0.10


def test_elevation_susceptibility_unknown():
    """Unknown elevation returns moderate 0.5."""
    assert elevation_susceptibility(None) == 0.5


def test_elevation_susceptibility_monotone():
    """Higher elevation → lower susceptibility (monotone decreasing)."""
    vals = [elevation_susceptibility(e) for e in [5, 20, 50, 80, 150, 300]]
    assert vals == sorted(vals, reverse=True)


def test_rainfall_factor_zero():
    assert rainfall_factor(0.0) == 0.0


def test_rainfall_factor_above_threshold():
    assert rainfall_factor(150.0, baseline_high_mm=100.0) == 1.0


def test_rainfall_factor_none():
    """Unknown rainfall returns default moderate factor."""
    assert rainfall_factor(None) == 0.3


def test_criticality_hospital_highest():
    """Hospital criticality should be ≥ all other types."""
    hospital_c = criticality_factor("hospital")
    for key in CRITICALITY:
        if key != "hospital":
            assert hospital_c >= criticality_factor(key), f"Hospital should ≥ {key}"


def test_compute_risk_score_range():
    """Risk score must be in [0, 1]."""
    for elev in [5, 50, 200, None]:
        for rain in [0, 50, 200, None]:
            for atype in ["hospital", "school", "other"]:
                score, cat, evidence = compute_risk_score(elev, rain, atype)
                assert 0.0 <= score <= 1.0, f"Score out of range: {score}"
                assert cat in ("low", "medium", "high", "critical")
                assert len(evidence) > 0


def test_compute_risk_score_low_elevation_heavy_rain():
    """Low elevation + heavy rain should produce high risk."""
    score, cat, _ = compute_risk_score(
        elevation_m=10.0,
        rainfall_24h_mm=120.0,
        asset_type="hospital",
    )
    assert cat in ("high", "critical"), f"Expected high/critical, got {cat}"


def test_rank_assets_sorted():
    """Assets should be sorted by descending risk score."""
    assets = [
        {"osm_id": "1", "name": "Hospital", "asset_type": "hospital", "sub_type": "hospital", "lat": 10.0, "lon": 76.0},
        {"osm_id": "2", "name": "School", "asset_type": "school", "sub_type": "school", "lat": 10.1, "lon": 76.1},
    ]
    rankings = rank_assets(assets, rainfall_24h_mm=50.0)
    scores = [r["risk_score"] for r in rankings]
    assert scores == sorted(scores, reverse=True)


def test_rank_assets_missing_data_warnings():
    """Assets with no elevation should produce data warnings."""
    assets = [
        {"osm_id": "1", "name": "A", "asset_type": "hospital", "lat": 10.0, "lon": 76.0},
    ]
    rankings = rank_assets(assets, rainfall_24h_mm=None)
    r = rankings[0]
    assert r["data_quality"] in ("partial", "limited")
    assert len(r["data_warnings"]) > 0


def test_rank_assets_empty():
    """Empty asset list should return empty ranking."""
    rankings = rank_assets([], rainfall_24h_mm=50.0)
    assert rankings == []


def test_rank_assets_no_missing_risk():
    """Missing elevation should not silently produce zero risk."""
    assets = [
        {"osm_id": "1", "name": "Hospital", "asset_type": "hospital", "lat": 10.0, "lon": 76.0},
    ]
    rankings = rank_assets(assets, rainfall_24h_mm=50.0)
    # With unknown elevation, terrain factor = 0.5, not 0
    r = rankings[0]
    assert r["flood_susceptibility"] == 0.5
    assert r["risk_score"] > 0.0
