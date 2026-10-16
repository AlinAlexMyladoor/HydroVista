"""
Geospatial road network and routing accessibility module.
Builds networkx directional graphs with flood susceptibility edge restrictions.
"""
from __future__ import annotations

import networkx as nx
from typing import Dict, List, Tuple, Optional


class RoadNetworkGraph:
    """Graph model representing arterial and local road accessibility in the basin."""

    def __init__(self):
        self.graph = nx.Graph()

    def add_road_segment(
        self,
        u: str,
        v: str,
        length_m: float,
        road_type: str = "primary",
        flood_susceptibility: float = 0.1,
    ):
        """Adds a road segment between intersection nodes u and v."""
        self.graph.add_edge(
            u,
            v,
            weight=length_m,
            length_m=length_m,
            road_type=road_type,
            flood_susceptibility=flood_susceptibility,
        )

    def compute_accessible_paths(
        self,
        origin: str,
        destinations: List[str],
        closure_threshold: float = 0.60,
    ) -> Dict[str, Dict]:
        """
        Calculates shortest drivable path from origin to designated destination nodes,
        excluding edges where flood susceptibility exceeds closure_threshold.
        """
        results = {}

        # Create active sub-graph excluding severed edges
        active_subgraph = nx.Graph()
        for u, v, data in self.graph.edges(data=True):
            if data.get("flood_susceptibility", 0.0) < closure_threshold:
                active_subgraph.add_edge(u, v, **data)

        for dest in destinations:
            if origin not in active_subgraph or dest not in active_subgraph:
                results[dest] = {"connected": False, "distance_m": None, "path": []}
                continue

            try:
                path = nx.shortest_path(active_subgraph, origin, dest, weight="weight")
                dist = nx.shortest_path_length(active_subgraph, origin, dest, weight="weight")
                results[dest] = {"connected": True, "distance_m": dist, "path": path}
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                results[dest] = {"connected": False, "distance_m": None, "path": []}

        return results
