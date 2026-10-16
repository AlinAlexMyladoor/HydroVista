"""
Explainability and Feature Attribution Module.
Generates local and global feature importance attribution for flood hazard models.
"""
from __future__ import annotations

import numpy as np
from typing import Dict, Any, List


FEATURE_NAMES = [
    "elevation_m",
    "slope_deg",
    "hand_m",
    "rainfall_24h_mm",
    "twi_index",
    "distance_river_m",
    "criticality_weight",
]


def compute_heuristic_shapley_values(feature_dict: Dict[str, float]) -> Dict[str, float]:
    """
    Computes normalized marginal contributions for each hydrological feature.
    Mimics Shapley value axioms (efficiency, symmetry, additivity) for the heuristic baseline.
    """
    elev = feature_dict.get("elevation_m", 15.0)
    rainfall = feature_dict.get("rainfall_24h_mm", 40.0)
    dist_river = feature_dict.get("distance_river_m", 500.0)
    criticality = feature_dict.get("criticality_weight", 0.8)

    # Marginals
    # 1. Elevation: lower elevation increases risk
    phi_elev = max(0.0, min(1.0, (50.0 - elev) / 50.0)) * 0.35

    # 2. Rainfall: higher rainfall increases risk
    phi_rain = max(0.0, min(1.0, rainfall / 150.0)) * 0.30

    # 3. Distance to River: closer increases risk
    phi_dist = max(0.0, min(1.0, (1500.0 - dist_river) / 1500.0)) * 0.20

    # 4. Criticality weighting
    phi_crit = criticality * 0.15

    total = phi_elev + phi_rain + phi_dist + phi_crit
    if total > 0:
        return {
            "elevation_contribution": round(phi_elev / total, 3),
            "rainfall_contribution": round(phi_rain / total, 3),
            "proximity_contribution": round(phi_dist / total, 3),
            "criticality_contribution": round(phi_crit / total, 3),
        }
    return {
        "elevation_contribution": 0.25,
        "rainfall_contribution": 0.25,
        "proximity_contribution": 0.25,
        "criticality_contribution": 0.25,
    }
