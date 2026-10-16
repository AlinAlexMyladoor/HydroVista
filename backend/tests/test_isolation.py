"""
Isolation Clock algorithm tests.
Tests use synthetic graphs with known expected behavior.
"""
from __future__ import annotations

import pytest
from datetime import datetime, timezone, timedelta

from app.services.isolation import RoadGraph, compute_isolation_clock, haversine_m


def test_haversine_m_known_distance():
    """Test haversine distance between two known points."""
    # Chalakudy to Thrissur straight-line distance ~28.5 km
    dist = haversine_m(10.3006, 76.3358, 10.5276, 76.2144)
    assert 25_000 < dist < 35_000, f"Expected ~28-29km, got {dist:.0f}m"


def test_haversine_m_same_point():
    """Distance from a point to itself should be zero."""
    dist = haversine_m(10.0, 76.0, 10.0, 76.0)
    assert dist < 1.0


def test_road_graph_load_ways():
    """Test that ways are correctly loaded into the graph."""
    graph = RoadGraph()
    ways = [
        {
            "osm_id": "way-1",
            "name": "Main Road",
            "highway": "primary",
            "geometry": [[76.0, 10.0], [76.1, 10.0], [76.2, 10.0]],
        }
    ]
    edges_added = graph.load_from_osm_ways(ways)
    assert edges_added == 2
    assert graph.G.number_of_nodes() == 3
    assert graph.G.number_of_edges() == 2


def test_road_graph_empty_way():
    """Ways with < 2 coordinates should be skipped."""
    graph = RoadGraph()
    ways = [{"osm_id": "way-bad", "geometry": [[76.0, 10.0]]}]
    edges_added = graph.load_from_osm_ways(ways)
    assert edges_added == 0


def test_connected_route():
    """Facility should find route to anchor when graph is fully connected."""
    graph = RoadGraph()
    # Build simple path: facility → intermediate → anchor
    ways = [
        {
            "osm_id": "way-1",
            "geometry": [[76.0, 10.0], [76.05, 10.0], [76.1, 10.0]],
            "highway": "primary",
        }
    ]
    graph.load_from_osm_ways(ways)

    facility_lat, facility_lon = 10.0, 76.0
    anchors = [{"id": "a1", "name": "Anchor 1", "lat": 10.0, "lon": 76.1}]

    result = graph.route_to_anchors(facility_lat, facility_lon, anchors, exclude_flagged=False)
    assert result["is_connected"] is True
    assert result["distance_m"] is not None
    assert result["distance_m"] > 0


def test_disconnected_route():
    """Facility should not find route if all edges are flagged."""
    graph = RoadGraph()
    ways = [
        {
            "osm_id": "way-1",
            "geometry": [[76.0, 10.0], [76.1, 10.0]],
            "highway": "primary",
        }
    ]
    graph.load_from_osm_ways(ways)

    # Flag all edges
    graph.apply_scenario_flags({"way-1": 1.0}, threshold=0.5)

    anchors = [{"id": "a1", "name": "Anchor 1", "lat": 10.0, "lon": 76.1}]
    result = graph.route_to_anchors(10.0, 76.0, anchors, exclude_flagged=True)
    assert result["is_connected"] is False


def test_scenario_flagging():
    """Apply scenario flags and verify count."""
    graph = RoadGraph()
    ways = [
        {"osm_id": "w1", "geometry": [[76.0, 10.0], [76.1, 10.0]], "highway": "primary"},
        {"osm_id": "w2", "geometry": [[76.1, 10.0], [76.2, 10.0]], "highway": "secondary"},
    ]
    graph.load_from_osm_ways(ways)

    # Only w1 exceeds threshold
    flagged = graph.apply_scenario_flags({"w1": 0.8, "w2": 0.3}, threshold=0.65)
    assert flagged == 1

    for u, v, d in graph.G.edges(data=True):
        if d.get("osm_id") == "w1":
            assert d["is_flagged"] is True
        if d.get("osm_id") == "w2":
            assert d["is_flagged"] is False


def test_multiple_anchors_uses_nearest():
    """With multiple anchors, should route to the nearest reachable one."""
    graph = RoadGraph()
    # Linear path: facility at 76.0, anchor1 at 76.05, anchor2 at 76.1
    ways = [
        {"osm_id": "w1", "geometry": [[76.0, 10.0], [76.05, 10.0]], "highway": "primary"},
        {"osm_id": "w2", "geometry": [[76.05, 10.0], [76.1, 10.0]], "highway": "primary"},
    ]
    graph.load_from_osm_ways(ways)

    anchors = [
        {"id": "near", "name": "Near Anchor", "lat": 10.0, "lon": 76.05},
        {"id": "far", "name": "Far Anchor", "lat": 10.0, "lon": 76.1},
    ]
    result = graph.route_to_anchors(10.0, 76.0, anchors, exclude_flagged=False)
    assert result["is_connected"] is True
    # Should prefer the nearer anchor (shorter distance)
    assert result["anchor"]["id"] == "near"


def test_isolation_clock_no_disconnection():
    """With all edges passable, facility should never become isolated."""
    graph = RoadGraph()
    ways = [{"osm_id": "w1", "geometry": [[76.0, 10.0], [76.1, 10.0]], "highway": "primary"}]
    graph.load_from_osm_ways(ways)

    now = datetime.now(timezone.utc)
    forecast_steps = [
        {"time": now + timedelta(hours=h), "susceptibility_map": {"w1": 0.1}}
        for h in range(0, 24, 6)
    ]
    anchors = [{"id": "a1", "name": "A", "lat": 10.0, "lon": 76.1}]

    result = compute_isolation_clock(
        facility={"id": "f1", "name": "Hospital A", "type": "hospital", "lat": 10.0, "lon": 76.0},
        anchors=anchors,
        road_graph=graph,
        forecast_steps=forecast_steps,
        closure_threshold=0.65,
    )
    assert result["is_connected"] is True
    assert result["first_disconnected_time"] is None
    assert result["time_to_isolation_hours"] is None
    assert len(result["assumptions"]) > 0
    assert result["uncertainty_note"]


def test_isolation_clock_with_disconnection():
    """Facility becomes isolated when all edges are flagged above threshold."""
    graph = RoadGraph()
    ways = [{"osm_id": "w1", "geometry": [[76.0, 10.0], [76.1, 10.0]], "highway": "primary"}]
    graph.load_from_osm_ways(ways)

    now = datetime.now(timezone.utc)
    forecast_steps = [
        {"time": now, "susceptibility_map": {"w1": 0.3}},        # connected
        {"time": now + timedelta(hours=6), "susceptibility_map": {"w1": 0.9}},  # disconnected
        {"time": now + timedelta(hours=12), "susceptibility_map": {"w1": 0.9}}, # still disconnected
    ]
    anchors = [{"id": "a1", "name": "A", "lat": 10.0, "lon": 76.1}]

    result = compute_isolation_clock(
        facility={"id": "f1", "name": "Hospital A", "type": "hospital", "lat": 10.0, "lon": 76.0},
        anchors=anchors,
        road_graph=graph,
        forecast_steps=forecast_steps,
        closure_threshold=0.65,
    )
    assert result["first_disconnected_time"] is not None
