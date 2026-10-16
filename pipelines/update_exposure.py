#!/usr/bin/env python3
"""
Automated Exposure Score Calculation Pipeline.
Combines latest rainfall accumulations, topographic susceptibility,
and infrastructure vulnerability to rank critical assets.
"""
from __future__ import annotations

import os
import sys
import json
from datetime import datetime, timezone

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.services.exposure import rank_assets
from app.services.osm import KNOWN_CHALAKUDY_ASSETS


def run_exposure_pipeline():
    print(f"[{datetime.now(timezone.utc).isoformat()}] Running Exposure Engine Pipeline...")

    # Read latest weather accumulation if available
    weather_file = "data/latest_weather.json"
    rainfall_24h = 45.0  # default 24h monsoon rainfall
    if os.path.exists(weather_file):
        try:
            with open(weather_file) as f:
                wdata = json.load(f)
                rainfall_24h = wdata.get("summary", {}).get("rainfall_24h_mm", rainfall_24h)
        except Exception as e:
            print(f"Warning reading weather file: {e}")

    print(f"Applying 24h rainfall: {rainfall_24h} mm across {len(KNOWN_CHALAKUDY_ASSETS)} basin assets.")
    ranked = rank_assets(KNOWN_CHALAKUDY_ASSETS, rainfall_24h_mm=rainfall_24h)

    critical_count = sum(1 for a in ranked if a.get("risk_category") == "critical")
    high_count = sum(1 for a in ranked if a.get("risk_category") == "high")
    medium_count = sum(1 for a in ranked if a.get("risk_category") == "medium")
    low_count = sum(1 for a in ranked if a.get("risk_category") == "low")

    print(f"Pipeline Result: Critical={critical_count}, High={high_count}, Medium={medium_count}, Low={low_count}")

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "rainfall_24h_mm": rainfall_24h,
        "total_assets": len(ranked),
        "summary": {
            "critical": critical_count,
            "high": high_count,
            "medium": medium_count,
            "low": low_count,
        },
        "assets": [
            {
                "asset_id": a.get("asset_id"),
                "asset_name": a.get("asset_name"),
                "asset_type": a.get("asset_type"),
                "risk_score": round(a.get("risk_score", 0.0), 3),
                "risk_category": a.get("risk_category"),
                "elevation_m": a.get("terrain_elevation_m"),
                "evidence": a.get("evidence"),
            }
            for a in ranked
        ],
    }

    os.makedirs("data", exist_ok=True)
    with open("data/latest_exposure.json", "w") as f:
        json.dump(output, f, indent=2)

    print("✓ Successfully written to data/latest_exposure.json")
    return output


if __name__ == "__main__":
    run_exposure_pipeline()
