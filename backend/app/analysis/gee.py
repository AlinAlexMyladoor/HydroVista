"""
Google Earth Engine pipeline: Sentinel-1 candidate inundation.

Implements the blueprint's stages 3-9 (scene query, consistent filtering, pre/event
composites, threshold, permanent-water exclusion, terrain mask, area, tile publication).

STATUS: written against the documented Earth Engine Python API but NOT executed from the
build environment (no Earth Engine credentials / egress). Treat as unverified until you run
`python -m app.analysis.gee --smoke` with your own project.

Credentials stay on the backend:
  EE_PROJECT_ID                       (required)
  EE_SERVICE_ACCOUNT + EE_PRIVATE_KEY_FILE   (optional; otherwise uses `earthengine authenticate` creds)
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass, asdict
from typing import Any

S1 = "COPERNICUS/S1_GRD"
GSW = "JRC/GSW1_4/GlobalSurfaceWater"
SRTM = "USGS/SRTMGL1_003"
METHOD = "S1 VV threshold on pre/event median composites; JRC permanent-water exclusion; SRTM slope mask"


class NoScenesError(RuntimeError):
    """Valid query, but Sentinel-1 returned no scenes. Not retryable; message is user-facing."""


class EEUnavailable(RuntimeError):
    """Earth Engine is not installed/configured/reachable. Message is safe to show to users."""


@dataclass
class FloodParams:
    west: float
    south: float
    east: float
    north: float
    pre_start: str
    pre_end: str
    event_start: str
    event_end: str
    orbit: str = "DESCENDING"        # ASCENDING | DESCENDING | ANY
    threshold_db: float = -16.0
    permanent_occurrence_pct: float = 90.0
    max_slope_deg: float = 5.0       # 0 disables the terrain mask
    smooth_m: float = 0.0            # focal-median radius to reduce speckle (0 = off)
    scale_m: int = 30                # processing resolution (10 m is possible but heavy)


def capabilities() -> dict[str, Any]:
    """Truthful readiness report: never 'ready' unless the package and a project id are present."""
    try:
        import ee  # noqa: F401
        installed = True
    except Exception:
        installed = False
    project = os.getenv("EE_PROJECT_ID")
    reasons = []
    if not installed:
        reasons.append("earthengine-api is not installed (pip install earthengine-api)")
    if not project:
        reasons.append("EE_PROJECT_ID is not set")
    return {"ready": installed and bool(project), "package_installed": installed, "project_configured": bool(project), "blocking_reasons": reasons}


_initialised = False


def init_ee() -> Any:
    global _initialised
    cap = capabilities()
    if not cap["ready"]:
        raise EEUnavailable("; ".join(cap["blocking_reasons"]))
    import ee

    if not _initialised:
        try:
            sa, key = os.getenv("EE_SERVICE_ACCOUNT"), os.getenv("EE_PRIVATE_KEY_FILE")
            if sa and key:
                ee.Initialize(ee.ServiceAccountCredentials(sa, key), project=os.environ["EE_PROJECT_ID"])
            else:
                ee.Initialize(project=os.environ["EE_PROJECT_ID"])
        except Exception as e:  # auth/permission/network
            raise EEUnavailable(f"Earth Engine initialisation failed: {type(e).__name__}: {e}") from e
        _initialised = True
    return ee


def _collection(ee: Any, roi: Any, p: FloodParams):
    col = (
        ee.ImageCollection(S1)
        .filterBounds(roi)
        .filter(ee.Filter.eq("instrumentMode", "IW"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
    )
    if p.orbit in ("ASCENDING", "DESCENDING"):
        col = col.filter(ee.Filter.eq("orbitProperties_pass", p.orbit))
    return col.select("VV")


def run_flood_analysis(p: FloodParams) -> dict[str, Any]:
    """Run the pipeline. Raises EEUnavailable (config/auth) or RuntimeError (no scenes / EE failure)."""
    ee = init_ee()
    t0 = time.perf_counter()
    roi = ee.Geometry.Rectangle([p.west, p.south, p.east, p.north])
    col = _collection(ee, roi, p)
    pre_col = col.filterDate(p.pre_start, p.pre_end)
    ev_col = col.filterDate(p.event_start, p.event_end)

    n_pre, n_ev = int(pre_col.size().getInfo()), int(ev_col.size().getInfo())
    if n_pre == 0 or n_ev == 0:
        raise NoScenesError(
            f"No usable Sentinel-1 scenes (pre-event: {n_pre}, event: {n_ev}) for orbit={p.orbit}, IW/VV. "
            "Widen the date windows, change the orbit filter, or check the study area."
        )
    dates = lambda c: [  # noqa: E731
        time.strftime("%Y-%m-%d", time.gmtime(ms / 1000)) for ms in c.aggregate_array("system:time_start").getInfo()
    ]
    pre_dates, ev_dates = sorted(set(dates(pre_col))), sorted(set(dates(ev_col)))

    pre = pre_col.median().clip(roi)
    ev = ev_col.median().clip(roi)
    if p.smooth_m > 0:
        pre = pre.focalMedian(p.smooth_m, "circle", "meters")
        ev = ev.focalMedian(p.smooth_m, "circle", "meters")

    candidate_water = ev.lt(p.threshold_db)
    occurrence = ee.Image(GSW).select("occurrence").unmask(0)  # unmask: JRC has no value where water was never seen
    permanent = occurrence.gte(p.permanent_occurrence_pct)
    candidate = candidate_water.And(permanent.Not())
    if p.max_slope_deg > 0:
        slope = ee.Terrain.slope(ee.Image(SRTM))
        candidate = candidate.And(slope.lte(p.max_slope_deg))
    candidate = candidate.selfMask().clip(roi)

    def area_km2(img: Any) -> float:
        v = ee.Image.pixelArea().updateMask(img).reduceRegion(
            reducer=ee.Reducer.sum(), geometry=roi, scale=p.scale_m, maxPixels=1e10, tileScale=4
        ).get("area").getInfo()
        return float(v or 0.0) / 1e6

    raw_km2 = area_km2(candidate_water.selfMask())
    after_perm_km2 = area_km2(candidate_water.And(permanent.Not()).selfMask())
    final_km2 = area_km2(candidate)
    roi_km2 = float(roi.area(1).getInfo()) / 1e6

    vis = {"min": 0, "max": 1, "palette": ["F97316"]}
    tile_url = candidate.getMapId(vis)["tile_fetcher"].url_format
    change_url = ev.subtract(pre).getMapId({"min": -8, "max": 8, "palette": ["2166AC", "FFFFFF", "B2182B"]})["tile_fetcher"].url_format

    return {
        "product": "candidate_inundation",  # NOT validated, NOT a forecast
        "validated": False,
        "method": METHOD,
        "datasets": {"sentinel1": S1, "permanent_water": GSW, "terrain": SRTM},
        "parameters": asdict(p),
        "scene_counts": {"pre_event": n_pre, "event": n_ev},
        "acquisition_dates": {"pre_event": pre_dates, "event": ev_dates},
        "areas_km2": {
            "study_area": roi_km2,
            "threshold_only": raw_km2,
            "after_permanent_water_exclusion": after_perm_km2,
            "candidate_inundation_final": final_km2,
        },
        "processing": {"scale_m": p.scale_m, "area_method": "ee.Image.pixelArea() sum at processing scale", "seconds": round(time.perf_counter() - t0, 1)},
        "tiles": {"candidate_inundation": tile_url, "vv_change_db": change_url},
        "limitations": [
            "Threshold-derived candidate extent; not validated against independent reference data.",
            "Radar shadow, layover, urban areas, wet soil and wind-roughened water cause errors; flooding under dense vegetation can be missed.",
            "Median composites over a window blur short-lived flooding and mix acquisition dates.",
            "Tile URLs are time-limited Earth Engine map IDs.",
        ],
    }


if __name__ == "__main__":  # smoke test: python -m app.analysis.gee --smoke
    import sys

    if "--smoke" in sys.argv:
        ee = init_ee()
        n = ee.ImageCollection(S1).filterBounds(ee.Geometry.Point([76.35, 10.30])).filterDate("2018-08-01", "2018-09-01").size().getInfo()
        print("Matching Sentinel-1 scenes:", n)
