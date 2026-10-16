"""
Topographic analysis for flood susceptibility.
Computes Slope, Height Above Nearest Drainage (HAND), and Topographic Wetness Index (TWI).
"""
from __future__ import annotations

import math
from typing import Dict, Any


def calculate_slope(elevation_center: float, elevation_neighbors: list[float], cell_size_m: float = 30.0) -> float:
    """
    Computes slope gradient in degrees using 4-neighborhood elevation difference.
    """
    if not elevation_neighbors or len(elevation_neighbors) < 4:
        return 0.0
    # North, East, South, West
    n, e, s, w = elevation_neighbors[:4]
    dz_dx = (e - w) / (2.0 * cell_size_m)
    dz_dy = (n - s) / (2.0 * cell_size_m)
    slope_radians = math.atan(math.sqrt(dz_dx**2 + dz_dy**2))
    return math.degrees(slope_radians)


def calculate_hand(elevation_m: float, nearest_drainage_elev_m: float) -> float:
    """
    Height Above Nearest Drainage (HAND).
    Normalizes elevation relative to the local hydrologic stream network base level.
    HAND < 3m represents active floodplain.
    HAND 3m - 8m represents moderate flood risk terrace.
    HAND > 8m represents low susceptibility upland.
    """
    return max(0.0, float(elevation_m - nearest_drainage_elev_m))


def topographic_wetness_index(catchment_area_m2: float, slope_degrees: float) -> float:
    """
    Topographic Wetness Index: TWI = ln(a / tan(beta)).
    Where 'a' is specific catchment area and 'beta' is slope angle.
    High TWI indicates flat areas with large contributing upslope areas (flood prone).
    """
    beta_rad = math.radians(max(0.5, slope_degrees))
    tan_beta = math.tan(beta_rad)
    return math.log(max(1.0, catchment_area_m2) / max(0.001, tan_beta))
