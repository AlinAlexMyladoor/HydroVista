"""
Geospatial engine unit tests.
Verifies DEM elevation, slope, HAND, TWI, and network graph accessibility.
"""
from __future__ import annotations

import pytest
import math
from geospatial.ingestion.copernicus import DEMIngestion
from geospatial.terrain.topography import (
    calculate_slope,
    calculate_hand,
    topographic_wetness_index,
)
from geospatial.routing.network import RoadNetworkGraph


def test_dem_elevation_gradient():
    dem = DEMIngestion()
    # Western coastal boundary (Munambam) should be lower than Eastern Ghats (Sholayar)
    coast_elev = dem.get_elevation_at_point(10.21, 76.18)
    ghats_elev = dem.get_elevation_at_point(10.30, 76.70)
    assert coast_elev < ghats_elev
    assert coast_elev >= 1.0
    assert ghats_elev > 200.0


def test_slope_calculation():
    # Flat terrain: all neighbors equal
    flat_slope = calculate_slope(10.0, [10.0, 10.0, 10.0, 10.0], cell_size_m=30.0)
    assert flat_slope == pytest.approx(0.0, abs=1e-3)

    # Steep incline
    steep_slope = calculate_slope(10.0, [25.0, 10.0, 5.0, 10.0], cell_size_m=30.0)
    assert steep_slope > 15.0


def test_hand_calculation():
    # Floodplain terrace
    hand_low = calculate_hand(12.0, 10.0)
    assert hand_low == 2.0  # < 3m = high flood susceptibility

    # Ridge
    hand_high = calculate_hand(45.0, 10.0)
    assert hand_high == 35.0  # > 8m = low susceptibility


def test_twi_calculation():
    # Flat valley with large catchment area has high TWI
    valley_twi = topographic_wetness_index(50000.0, 1.0)
    # Steep slope with small catchment has lower TWI
    ridge_twi = topographic_wetness_index(500.0, 30.0)
    assert valley_twi > ridge_twi


def test_road_network_accessibility_under_flood():
    graph = RoadNetworkGraph()
    # Route A -> B -> C
    # Segment B -> C is severely flood-prone (susceptibility 0.85)
    graph.add_road_segment("A", "B", 1000.0, flood_susceptibility=0.1)
    graph.add_road_segment("B", "C", 1500.0, flood_susceptibility=0.85)

    # With high threshold (0.90), route is open
    paths_open = graph.compute_accessible_paths("A", ["C"], closure_threshold=0.90)
    assert paths_open["C"]["connected"] is True
    assert paths_open["C"]["distance_m"] == 2500.0

    # With standard threshold (0.60), route is severed
    paths_severed = graph.compute_accessible_paths("A", ["C"], closure_threshold=0.60)
    assert paths_severed["C"]["connected"] is False
