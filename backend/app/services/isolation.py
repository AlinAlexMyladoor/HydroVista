"""
Road Accessibility Engine — Isolation Clock

Implements the Isolation Clock algorithm using NetworkX.

The algorithm:
1. Build a road graph from OSM road segments (nodes = intersections, edges = road segments).
2. Identify critical facilities (hospitals, clinics) and safe-access anchors.
3. For each forecast time step, determine which edges are scenario-flagged.
4. Recompute reachability from each facility to any anchor.
5. Find the earliest forecast step where no valid route exists → isolation time.

Key design decisions:
- Roads are flagged (not confirmed closed) when they intersect high-risk flood zones.
- The graph operates on actual OSM data, not synthetic geometries.
- Isolation is labelled as scenario-modelled, not physically confirmed.
- All assumptions are explicitly documented in the output.

Graph representation:
- Nodes: OSM node IDs (integers)
- Edges: OSM way segments with attributes: length_m, highway type, name, osm_id
- Edge weight: Euclidean-approximated distance in metres

Limitations:
- Graph built from OSM data; incompleteness affects results.
- Flood flagging is based on terrain susceptibility / scenario rainfall, not
  validated hydraulic depth.
- Travel time not modelled (only connectivity).
- Graph is undirected (one-way roads not yet enforced).
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

import networkx as nx
import structlog

log = structlog.get_logger(__name__)

# Kerala state flood susceptibility index thresholds (scenario-based, not validated depth)
DEFAULT_CLOSURE_THRESHOLD = 0.65


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres between two WGS84 coordinates."""
    R = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class RoadGraph:
    """Lightweight road graph built from OSM GeoJSON-style road segments."""

    def __init__(self) -> None:
        self.G: nx.Graph = nx.Graph()
        self._edge_susceptibility: dict[tuple, float] = {}  # edge → risk score

    def load_from_osm_ways(self, ways: list[dict]) -> int:
        """
        Load road segments from OSM way features.
        Each way should have: osm_id, geometry (list of [lon, lat] pairs), name, highway.
        Returns number of edges added.
        """
        edges_added = 0
        for way in ways:
            coords = way.get("geometry", [])
            if len(coords) < 2:
                continue
            for i in range(len(coords) - 1):
                lon1, lat1 = coords[i]
                lon2, lat2 = coords[i + 1]
                # Use coordinate-based node IDs (rounded to 6 dp)
                n1 = (round(lat1, 6), round(lon1, 6))
                n2 = (round(lat2, 6), round(lon2, 6))
                if n1 == n2:
                    continue
                dist = haversine_m(lat1, lon1, lat2, lon2)
                edge_key = (min(n1, n2), max(n1, n2))
                self.G.add_node(n1, lat=lat1, lon=lon1)
                self.G.add_node(n2, lat=lat2, lon=lon2)
                self.G.add_edge(
                    n1, n2,
                    length_m=dist,
                    osm_id=way.get("osm_id", ""),
                    name=way.get("name"),
                    highway=way.get("highway", "road"),
                    is_flagged=False,
                )
                edges_added += 1

        log.info("graph.loaded", nodes=self.G.number_of_nodes(), edges=self.G.number_of_edges())
        return edges_added

    def apply_scenario_flags(
        self,
        susceptibility_map: dict[str, float],
        threshold: float = DEFAULT_CLOSURE_THRESHOLD,
    ) -> int:
        """
        Flag road edges whose OSM ID has a scenario susceptibility score ≥ threshold.
        Returns number of edges flagged.

        Note: Flagged edges are removed from the routing graph for scenario analysis.
        They are labelled 'scenario-flagged' not 'confirmed closed'.
        """
        flagged = 0
        for u, v, data in self.G.edges(data=True):
            osm_id = data.get("osm_id", "")
            score = susceptibility_map.get(osm_id, 0.0)
            data["is_flagged"] = score >= threshold
            data["risk_score"] = score
            if data["is_flagged"]:
                flagged += 1
        return flagged

    def get_routing_graph(self, exclude_flagged: bool = True) -> nx.Graph:
        """Return a subgraph with flagged edges removed (for scenario routing)."""
        if not exclude_flagged:
            return self.G
        edges_to_keep = [
            (u, v) for u, v, d in self.G.edges(data=True) if not d.get("is_flagged", False)
        ]
        return self.G.edge_subgraph(edges_to_keep).copy()

    def nearest_node(self, lat: float, lon: float) -> tuple | None:
        """Find the closest graph node to a given coordinate."""
        if not self.G.nodes:
            return None
        return min(
            self.G.nodes,
            key=lambda n: haversine_m(lat, lon, self.G.nodes[n]["lat"], self.G.nodes[n]["lon"]),
        )

    def route_to_anchors(
        self,
        facility_lat: float,
        facility_lon: float,
        anchors: list[dict],
        exclude_flagged: bool = True,
    ) -> dict[str, Any]:
        """
        Find the shortest route from a facility to any safe-access anchor.
        Returns route metadata or a no-route result.
        """
        routing_G = self.get_routing_graph(exclude_flagged=exclude_flagged)

        src = self.nearest_node(facility_lat, facility_lon)
        if src is None or src not in routing_G:
            return {
                "is_connected": False,
                "reason": "Facility node not in routing graph.",
                "route": None,
                "distance_m": None,
                "anchor": None,
            }

        best: dict | None = None
        for anchor in anchors:
            dst = self.nearest_node(anchor["lat"], anchor["lon"])
            if dst is None or dst not in routing_G:
                continue
            try:
                length = nx.shortest_path_length(routing_G, src, dst, weight="length_m")
                path = nx.shortest_path(routing_G, src, dst, weight="length_m")
                if best is None or length < best["distance_m"]:
                    best = {
                        "is_connected": True,
                        "distance_m": round(length, 1),
                        "path_nodes": path,
                        "anchor": anchor,
                        "reason": None,
                    }
            except nx.NetworkXNoPath:
                continue
            except nx.NodeNotFound:
                continue

        if best is None:
            return {
                "is_connected": False,
                "reason": "No valid route to any safe-access anchor.",
                "route": None,
                "distance_m": None,
                "anchor": None,
            }
        return best

    def count_alternative_routes(
        self,
        facility_lat: float,
        facility_lon: float,
        anchor: dict,
        exclude_flagged: bool = True,
        k: int = 3,
    ) -> int:
        """Count simple alternative paths (up to k) between facility and anchor."""
        routing_G = self.get_routing_graph(exclude_flagged=exclude_flagged)
        src = self.nearest_node(facility_lat, facility_lon)
        dst = self.nearest_node(anchor["lat"], anchor["lon"])
        if src is None or dst is None:
            return 0
        try:
            paths = list(nx.shortest_simple_paths(routing_G, src, dst, weight="length_m"))
            return min(len(paths), k)
        except (nx.NetworkXNoPath, nx.NodeNotFound, nx.NetworkXError):
            return 0


def compute_isolation_clock(
    facility: dict,
    anchors: list[dict],
    road_graph: RoadGraph,
    forecast_steps: list[dict],
    closure_threshold: float = DEFAULT_CLOSURE_THRESHOLD,
) -> dict[str, Any]:
    """
    Compute the Isolation Clock for a single critical facility.

    Parameters
    ----------
    facility : dict
        {"id", "name", "type", "lat", "lon"}
    anchors : list[dict]
        [{"id", "name", "lat", "lon"}, ...]
    road_graph : RoadGraph
        Pre-built graph with edge attributes.
    forecast_steps : list[dict]
        Time-ordered list of {"time": datetime, "susceptibility_map": {osm_id: score}}.
    closure_threshold : float
        Risk score at or above which an edge is flagged.

    Returns
    -------
    dict  See IsolationResult schema.
    """
    baseline_result = road_graph.route_to_anchors(
        facility["lat"], facility["lon"], anchors, exclude_flagged=False
    )
    alt_count_baseline = (
        road_graph.count_alternative_routes(
            facility["lat"], facility["lon"],
            baseline_result["anchor"], exclude_flagged=False
        )
        if baseline_result["is_connected"] and baseline_result["anchor"]
        else 0
    )

    last_connected: datetime | None = None
    first_disconnected: datetime | None = None

    for step in forecast_steps:
        step_time = step["time"]
        susceptibility_map = step.get("susceptibility_map", {})

        road_graph.apply_scenario_flags(susceptibility_map, threshold=closure_threshold)
        result = road_graph.route_to_anchors(
            facility["lat"], facility["lon"], anchors, exclude_flagged=True
        )

        if result["is_connected"]:
            last_connected = step_time
            first_disconnected = None  # reset if re-connected
        else:
            if first_disconnected is None:
                first_disconnected = step_time

    # Compute time-to-isolation
    time_to_iso_hours: float | None = None
    if last_connected is not None and first_disconnected is not None:
        delta = first_disconnected - last_connected
        time_to_iso_hours = round(delta.total_seconds() / 3600, 1)

    # Collect flagged edge IDs from the last scenario step
    flagged_edges = [
        data.get("osm_id", "")
        for _, _, data in road_graph.G.edges(data=True)
        if data.get("is_flagged", False)
    ][:10]  # limit to 10 for readability

    return {
        "facility_id": facility["id"],
        "facility_name": facility["name"],
        "facility_type": facility["type"],
        "lat": facility["lat"],
        "lon": facility["lon"],
        "is_connected": first_disconnected is None,
        "last_connected_time": last_connected.isoformat() if last_connected else None,
        "first_disconnected_time": first_disconnected.isoformat() if first_disconnected else None,
        "time_to_isolation_hours": time_to_iso_hours,
        "baseline_route": None,  # Full segment list computed separately if needed
        "alternative_routes_count": alt_count_baseline,
        "flagged_edges": flagged_edges,
        "assumptions": [
            f"Edges with scenario risk score ≥ {closure_threshold:.2f} are treated as inaccessible.",
            "Risk scores are terrain-susceptibility estimates, not validated flood depths.",
            "Graph built from OSM road data; missing roads will affect results.",
            "Isolation is modelled under scenario assumptions, not physically confirmed.",
        ],
        "uncertainty_note": (
            "This is a scenario-based accessibility estimate. "
            "Actual road passability depends on real-time water depth, emergency closures, "
            "and debris that are not captured in this model."
        ),
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }
