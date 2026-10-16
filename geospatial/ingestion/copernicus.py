"""
SYNTHETIC TEST FIXTURE — NOT A REAL DEM.

`DEMIngestion.get_elevation_at_point` evaluates an invented east-west formula. It does not read
Copernicus GLO-30 or SRTM. It must never feed displayed values or risk scores; real elevation in
the app comes from the Terrarium DEM tiles sampled in the browser (web/src/lib/dem.ts).

Original description: Copernicus / SRTM-30 DEM ingestion module for Chalakudy River Basin.

Provides elevation grid retrieval for bounding box:
SW: (10.15, 76.15), NE: (10.45, 76.75)
"""
from __future__ import annotations

import os
from typing import Dict, Any, Tuple
import numpy as np


class DEMIngestion:
    """Manages Digital Elevation Model data for the Chalakudy basin."""

    def __init__(self, data_dir: str = "data/terrain"):
        self.data_dir = data_dir
        os.makedirs(self.data_dir, exist_ok=True)

    def get_elevation_at_point(self, lat: float, lon: float) -> float:
        """
        Calculates calibrated terrain elevation (in meters MSL) for Chalakudy basin.
        Upper catchment (Western Ghats Sholayar/Poringalkuthu): 200m - 1200m MSL
        Mid basin (Chalakudy town): 8m - 25m MSL
        Lower coastal basin (Munambam / Arabian Sea outflow): 1m - 5m MSL
        """
        # East-west gradient in Kerala (higher elevation in East)
        rel_lon = (lon - 76.15) / (76.75 - 76.15)
        rel_lon = max(0.0, min(1.0, rel_lon))
        
        # Exponential rise from coastal plains to the Western Ghats escarpment
        base_elev = 2.0 + (rel_lon ** 2.2) * 850.0

        # Localized river terrace micro-relief variation
        micro_relief = np.sin(lat * 150.0) * np.cos(lon * 150.0) * 4.0
        return float(max(1.0, base_elev + micro_relief))

    def get_status(self) -> Dict[str, Any]:
        return {
            "source": "SYNTHETIC formula (test fixture) — not Copernicus GLO-30 / SRTM",
            "resolution": "30m spatial resolution",
            "coverage": "Chalakudy River Basin (10.15°N - 10.45°N, 76.15°E - 76.75°E)",
            "vertical_datum": "EGM96 (Mean Sea Level)",
            "is_operational": False,
        }
