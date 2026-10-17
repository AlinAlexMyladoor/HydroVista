"""
Exposure and risk ranking engine.

Computes a relative risk score for each infrastructure asset based on:
  - Terrain susceptibility (elevation, slope-based proxy)
  - Rainfall accumulation from weather forecast
  - Asset criticality (hospital > school > shelter > other)
  - Known vulnerability factors

Formula:
  risk_score = clip(
      w_terrain * terrain_factor
    + w_rainfall * rainfall_factor
    + w_criticality * criticality_factor,
      0, 1
  )

All components are normalised to [0, 1].
The resulting score is a relative ranking, NOT a calibrated probability.

Limitations:
- No validated hydraulic model underlies this calculation.
- Terrain susceptibility is a simple elevation-based proxy.
- Rainfall factor uses basin-centroid NWP forecast, not point-specific gauge data.
- Population exposure requires a population raster (unavailable in this version).
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any


# Criticality weights by asset type (higher = more critical)
CRITICALITY = {
    "hospital": 1.0,
    "clinic": 0.85,
    "doctors": 0.75,
    "emergency": 0.90,
    "school": 0.60,
    "shelter": 0.70,
    "assembly_point": 0.70,
    "pharmacy": 0.50,
    "other": 0.40,
}

RISK_CATEGORIES = [
    (0.75, "critical"),
    (0.50, "high"),
    (0.25, "medium"),
    (0.0, "low"),
]

# Component weights (must sum to 1.0)
W_TERRAIN = 0.40
W_RAINFALL = 0.35
W_CRITICALITY = 0.25


def elevation_susceptibility(elevation_m: float | None) -> float:
    """
    Simple elevation-based susceptibility proxy.
    Lower elevation → higher susceptibility.
    Uses a sigmoid-style mapping; not a validated flood model.
    """
    if elevation_m is None:
        return 0.5  # unknown → moderate
    # Chalakudy basin range roughly 10–500 m
    # Below 30 m → high susceptibility
    # Above 200 m → low susceptibility
    if elevation_m <= 10:
        return 1.0
    elif elevation_m <= 30:
        return 0.85
    elif elevation_m <= 60:
        return 0.65
    elif elevation_m <= 100:
        return 0.45
    elif elevation_m <= 200:
        return 0.25
    else:
        return 0.10


def rainfall_factor(rainfall_24h_mm: float | None, baseline_high_mm: float = 100.0) -> float:
    """
    Normalise 24h rainfall accumulation to [0, 1].
    baseline_high_mm is the reference heavy-rainfall threshold for Kerala IMD.
    """
    if rainfall_24h_mm is None:
        return 0.3  # unknown → slightly elevated
    return min(rainfall_24h_mm / baseline_high_mm, 1.0)


def criticality_factor(asset_type: str, sub_type: str | None = None) -> float:
    """Return criticality weight for an asset type."""
    key = (sub_type or asset_type).lower()
    return CRITICALITY.get(key, CRITICALITY.get(asset_type.lower(), CRITICALITY["other"]))


def compute_risk_score(
    elevation_m: float | None,
    rainfall_24h_mm: float | None,
    asset_type: str,
    sub_type: str | None = None,
) -> tuple[float, str, list[str]]:
    """
    Compute a normalised risk score and category.
    Returns: (score, category, evidence_list)
    """
    t_factor = elevation_susceptibility(elevation_m)
    r_factor = rainfall_factor(rainfall_24h_mm)
    c_factor = criticality_factor(asset_type, sub_type)

    score = W_TERRAIN * t_factor + W_RAINFALL * r_factor + W_CRITICALITY * c_factor
    score = round(min(max(score, 0.0), 1.0), 3)

    category = "low"
    for threshold, cat in RISK_CATEGORIES:
        if score >= threshold:
            category = cat
            break

    evidence = [
        f"Terrain susceptibility factor: {t_factor:.2f} "
        f"(elevation {elevation_m:.0f} m)" if elevation_m is not None
        else "Terrain susceptibility factor: 0.50 (elevation unknown)",

        f"Rainfall factor: {r_factor:.2f} "
        f"(24h accumulation {rainfall_24h_mm:.1f} mm)" if rainfall_24h_mm is not None
        else "Rainfall factor: 0.30 (rainfall data unavailable)",

        f"Asset criticality: {c_factor:.2f} (type: {sub_type or asset_type})",

        f"Weighted score: {W_TERRAIN}×{t_factor:.2f} + "
        f"{W_RAINFALL}×{r_factor:.2f} + "
        f"{W_CRITICALITY}×{c_factor:.2f} = {score:.3f}",
    ]

    return score, category, evidence


def rank_assets(
    assets: list[dict],
    rainfall_24h_mm: float | None,
    elevation_lookup: dict[str, float] | None = None,
    elevation_source_lookup: dict[str, str] | None = None,
) -> list[dict]:
    """
    Compute exposure scores for a list of assets and return ranked list.

    Parameters
    ----------
    assets : list of asset dicts
    rainfall_24h_mm : basin-level 24h rainfall from NWP forecast (mm)
    elevation_lookup : optional dict of asset_id → elevation_m

    Returns
    -------
    list of exposure dicts, sorted by risk_score descending
    """
    elevation_lookup = elevation_lookup or {}
    elevation_source_lookup = elevation_source_lookup or {}
    computed_at = datetime.now(timezone.utc).isoformat()
    results = []

    for asset in assets:
        asset_id = str(asset.get("id", asset.get("osm_id", "")))
        elevation_m = elevation_lookup.get(asset_id)

        score, category, evidence = compute_risk_score(
            elevation_m=elevation_m,
            rainfall_24h_mm=rainfall_24h_mm,
            asset_type=asset.get("asset_type", "other"),
            sub_type=asset.get("sub_type"),
        )

        warnings: list[str] = []
        data_quality = "good"

        if elevation_m is None:
            warnings.append("Elevation not available; terrain factor uses default 0.50.")
            data_quality = "partial"
        if rainfall_24h_mm is None:
            warnings.append("Rainfall data unavailable; rainfall factor uses default 0.30.")
            data_quality = "partial" if data_quality == "good" else "limited"

        results.append({
            "asset_id": asset_id,
            "asset_name": asset.get("name"),
            "asset_type": asset.get("asset_type", "other"),
            "sub_type": asset.get("sub_type"),
            "lat": asset.get("lat"),
            "lon": asset.get("lon"),
            "risk_score": score,
            "risk_category": category,
            "flood_susceptibility": round(elevation_susceptibility(elevation_m), 3),
            "rainfall_accumulation_mm": rainfall_24h_mm,
            "terrain_elevation_m": elevation_m,
            "terrain_source": elevation_source_lookup.get(asset_id),
            "evidence": evidence,
            "data_quality": data_quality,
            "data_warnings": warnings,
            "computed_at": computed_at,
        })

    results.sort(key=lambda x: x["risk_score"], reverse=True)
    return results
