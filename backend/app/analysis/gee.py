"""
Google Earth Engine pipeline: Sentinel-1 candidate inundation by pre/event change detection.

Stages: scene query, consistent filtering, pre/event composites, change-based candidate water
(event below threshold AND backscatter drop AND not already water pre-event), observation-validity
(NODATA kept distinct from dry), JRC permanent-water exclusion, SRTM slope mask, area, vector
polygons for the 3D map, tile publication.

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
from pathlib import Path
from typing import Any

S1 = "COPERNICUS/S1_GRD"
S2 = "COPERNICUS/S2_SR_HARMONIZED"
WORLDPOP = "WorldPop/POP"
GSW = "JRC/GSW1_4/GlobalSurfaceWater"
SRTM = "USGS/SRTMGL1_003"
METHOD = (
    "S1 VV change detection (event < threshold AND backscatter drop vs pre-event AND not already water pre-event); "
    "tri-state output keeps missing observations as NODATA; JRC permanent-water exclusion; SRTM slope mask"
)
NODATA_CODE = -1          # value of the "class" band where Sentinel-1 had no usable observation
MAX_VECTOR_FEATURES = 3000  # polygons returned to the browser; largest first, truncation is reported


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
    smooth_m: float = 50.0           # focal-median radius to reduce speckle (0 = off); change detection is speckle-sensitive
    min_drop_db: float = 3.0         # required backscatter drop (event - pre <= -min_drop_db) to count as *newly* flooded
    scale_m: int = 30                # processing resolution (10 m is possible but heavy)
    optical_fusion: bool = True
    mndwi_threshold: float = 0.2
    max_cloud_pct: float = 40.0


def capabilities() -> dict[str, Any]:
    """Truthful readiness report: never 'ready' unless the package and a project id are present."""
    try:
        import ee  # noqa: F401
        installed = True
    except Exception:
        installed = False
    project = os.getenv("EE_PROJECT_ID")
    service_account, key_file = _service_account_config()
    reasons = []
    if not installed:
        reasons.append("earthengine-api is not installed (pip install earthengine-api)")
    if not project:
        reasons.append("EE_PROJECT_ID is not set")
    if not service_account:
        reasons.append("EE_SERVICE_ACCOUNT is not set and gee-key.json has no client_email")
    if not os.path.isfile(key_file):
        reasons.append("GEE service-account key file was not found")
    return {
        "ready": installed and bool(project) and bool(service_account) and os.path.isfile(key_file),
        "package_installed": installed,
        "project_configured": bool(project),
        "service_account_configured": bool(service_account),
        "blocking_reasons": reasons,
    }


_initialised = False
DEFAULT_KEY_FILE = Path(__file__).resolve().parents[2] / "gee-key.json"


def _service_account_config() -> tuple[str | None, str]:
    key_file = os.getenv("EE_PRIVATE_KEY_FILE", str(DEFAULT_KEY_FILE))
    service_account = os.getenv("EE_SERVICE_ACCOUNT")
    if not service_account and os.path.isfile(key_file):
        try:
            import json

            with open(key_file, encoding="utf-8") as f:
                service_account = json.load(f).get("client_email")
        except (OSError, ValueError):
            service_account = None
    return service_account, key_file


def init_ee() -> Any:
    global _initialised
    cap = capabilities()
    if not cap["ready"]:
        raise EEUnavailable("; ".join(cap["blocking_reasons"]))
    import ee

    if not _initialised:
        try:
            sa, key = _service_account_config()
            if not sa:
                raise EEUnavailable("GEE service-account email is not configured")
            credentials = ee.ServiceAccountCredentials(sa, key)
            ee.Initialize(credentials=credentials, project=os.environ["EE_PROJECT_ID"])
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


def _optical_collection(ee: Any, roi: Any, p: FloodParams):
    return (
        ee.ImageCollection(S2)
        .filterBounds(roi)
        .filter(ee.Filter.lte("CLOUDY_PIXEL_PERCENTAGE", p.max_cloud_pct))
        .select(["B3", "B11", "SCL"])
    )


def _mndwi_image(ee: Any, image: Any) -> Any:
    clear = (
        image.select("SCL").neq(3)
        .And(image.select("SCL").neq(8))
        .And(image.select("SCL").neq(9))
        .And(image.select("SCL").neq(10))
        .And(image.select("SCL").neq(11))
    )
    return image.normalizedDifference(["B3", "B11"]).rename("mndwi").updateMask(clear)


def run_flood_analysis(p: FloodParams) -> dict[str, Any]:
    """Run the pipeline. Raises EEUnavailable (config/auth) or RuntimeError (no scenes / EE failure)."""
    ee = init_ee()
    t0 = time.perf_counter()
    roi = ee.Geometry.Rectangle([p.west, p.south, p.east, p.north])
    col = _collection(ee, roi, p)
    pre_col = col.filterDate(p.pre_start, p.pre_end)
    ev_col = col.filterDate(p.event_start, p.event_end)
    optical_col = _optical_collection(ee, roi, p)
    optical_ev_col = optical_col.filterDate(p.event_start, p.event_end)

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
    n_optical = int(optical_ev_col.size().getInfo())

    # ── Composites + observation validity ────────────────────────────────────────────────
    # median() of an empty stack is MASKED, not zero. We keep that information explicitly:
    # `valid` is 1 only where BOTH windows have at least one usable acquisition.
    pre = pre_col.median().clip(roi)
    ev = ev_col.median().clip(roi)
    if p.smooth_m > 0:
        pre = pre.focalMedian(p.smooth_m, "circle", "meters")
        ev = ev.focalMedian(p.smooth_m, "circle", "meters")
    valid = pre_col.count().gt(0).And(ev_col.count().gt(0)).And(pre.mask()).And(ev.mask()).unmask(0).clip(roi)

    # ── Change-based candidate water (mirror of core.newly_inundated) ──────────────────
    diff = ev.subtract(pre)                                   # dB; negative = backscatter fell
    water_now = ev.lt(p.threshold_db)                         # looks like open water in the event window
    dropped = diff.lte(-abs(p.min_drop_db))                   # something changed
    dry_before = pre.gte(p.threshold_db)                      # was not already water (excludes seasonal/permanent water)
    newly = water_now.And(dropped).And(dry_before).unmask(0).And(valid)

    occurrence = ee.Image(GSW).select("occurrence").unmask(0)  # unmask: JRC has no value where water was never seen
    permanent = occurrence.gte(p.permanent_occurrence_pct)
    after_perm = newly.And(permanent.Not())
    final = after_perm
    if p.max_slope_deg > 0:
        slope = ee.Terrain.slope(ee.Image(SRTM)).unmask(0)    # SRTM voids -> slope 0 -> not excluded (reported in limitations)
        final = final.And(slope.lte(p.max_slope_deg))

    radar_final = final
    mndwi = ee.Image(0).rename("mndwi").updateMask(ee.Image(0))
    optical_valid = ee.Image(0).rename("mndwi_valid")
    if p.optical_fusion and n_optical:
        mndwi_col = optical_ev_col.map(lambda image: _mndwi_image(ee, image))
        mndwi = mndwi_col.median().clip(roi)
        optical_valid = mndwi_col.count().gt(0).clip(roi)
        optical_water = mndwi.gte(p.mndwi_threshold)
        # Require clear-sky optical water confirmation only where Sentinel-2 has coverage.
        final = radar_final.And(optical_water.Or(optical_valid.Not()))

    # Tri-state classification band: 1 flooded / 0 not flooded / -1 no observation.
    classified = ee.Image(0).where(final, 1).where(valid.Not(), NODATA_CODE).rename("class").clip(roi)
    candidate = classified.eq(1).selfMask()
    nodata_img = classified.eq(NODATA_CODE).selfMask()

    def area_km2(img: Any) -> float:
        v = ee.Image.pixelArea().updateMask(img).reduceRegion(
            reducer=ee.Reducer.sum(), geometry=roi, scale=p.scale_m, maxPixels=1e10, tileScale=4
        ).get("area").getInfo()
        return float(v or 0.0) / 1e6

    threshold_only_km2 = area_km2(water_now.unmask(0).And(valid).selfMask())
    change_km2 = area_km2(newly.selfMask())
    after_perm_km2 = area_km2(after_perm.selfMask())
    final_km2 = area_km2(candidate)
    nodata_km2 = area_km2(nodata_img)
    roi_km2 = float(roi.area(1).getInfo()) / 1e6

    worldpop = ee.ImageCollection(WORLDPOP).filterBounds(roi).mosaic().select("population")
    population_value = worldpop.updateMask(candidate).reduceRegion(
        reducer=ee.Reducer.sum(), geometry=roi, scale=100, maxPixels=1e10, tileScale=4
    ).get("population").getInfo()
    exposed_population = max(0, round(float(population_value or 0.0)))

    vis = {"min": 0, "max": 1, "palette": ["F97316"]}
    tile_url = candidate.getMapId(vis)["tile_fetcher"].url_format
    nodata_url = nodata_img.getMapId({"min": 0, "max": 1, "palette": ["9CA3AF"]})["tile_fetcher"].url_format
    change_url = diff.getMapId({"min": -8, "max": 8, "palette": ["2166AC", "FFFFFF", "B2182B"]})["tile_fetcher"].url_format
    mndwi_url = mndwi.getMapId({"min": -1, "max": 1, "palette": ["B2182B", "FFFFFF", "2166AC"]})["tile_fetcher"].url_format

    # ── Vector polygons (for draping on the 3D terrain). Failure here must not fail the run. ──
    geojson, vectors_meta = None, {"available": False, "reason": "not attempted"}
    try:
        geojson, vectors_meta = _vectorise(ee, candidate, roi, p)
    except Exception as e:  # noqa: BLE001 - EE raises many types; the raster result is still valid
        vectors_meta = {"available": False, "reason": f"{type(e).__name__}: {e}"}

    return {
        "product": "candidate_inundation",  # NOT validated, NOT a forecast
        "validated": False,
        "method": METHOD,
        "datasets": {"sentinel1": S1, "sentinel2": S2, "permanent_water": GSW, "terrain": SRTM},
        "parameters": asdict(p),
        "scene_counts": {"pre_event": n_pre, "event": n_ev, "sentinel2_event": n_optical},
        "acquisition_dates": {"pre_event": pre_dates, "event": ev_dates},
        "areas_km2": {
            "study_area": roi_km2,
            "threshold_only": threshold_only_km2,
            "after_change_detection": change_km2,
            "after_permanent_water_exclusion": after_perm_km2,
            "radar_candidate_before_optical": area_km2(radar_final.selfMask()),
            "candidate_inundation_final": final_km2,
            "no_observation": nodata_km2,
        },
        "exposed_population": exposed_population,
        "population_dataset": WORLDPOP,
        "coverage": {
            "no_observation_fraction": (nodata_km2 / roi_km2) if roi_km2 else None,
            "note": "Cells without a usable pre-event or event Sentinel-1 observation are classified NODATA, never 'dry'.",
        },
        "vectors": vectors_meta,
        "processing": {"scale_m": p.scale_m, "area_method": "ee.Image.pixelArea() sum at processing scale", "seconds": round(time.perf_counter() - t0, 1)},
        "tiles": {"candidate_inundation": tile_url, "vv_change_db": change_url, "mndwi": mndwi_url, "no_observation": nodata_url},
        "limitations": [
            "Threshold + change-derived candidate extent; not validated against independent reference data.",
            "Radar shadow, layover, urban areas, wet soil and wind-roughened water cause errors; flooding under dense vegetation can be missed.",
            "Median composites over a window blur short-lived flooding and mix acquisition dates.",
            "Sentinel-2 MNDWI confirmation is applied only where clear optical observations exist; cloudy/no-observation pixels retain the radar result.",
            "Areas with no usable Sentinel-1 observation are reported as no_observation and are NOT evidence of dry land.",
            "SRTM voids are treated as 'not excluded' by the slope mask.",
            "Tile URLs are time-limited Earth Engine map IDs.",
        ],
        "_geojson": geojson,  # popped by runs._execute and stored as a file; never kept in the run JSON
    }


def _vectorise(ee: Any, candidate: Any, roi: Any, p: FloodParams) -> tuple[dict[str, Any], dict[str, Any]]:
    """Polygonise the candidate raster. Largest polygons first; truncation is reported, never hidden."""
    scale = max(p.scale_m, 30)
    fc = candidate.reduceToVectors(
        geometry=roi, scale=scale, geometryType="polygon", eightConnected=False,
        maxPixels=1e9, bestEffort=True, tileScale=4, labelProperty="flooded",
    )
    fc = fc.map(lambda f: f.set("area_m2", f.geometry().area(1)).setGeometry(f.geometry().simplify(scale / 2)))
    total = int(fc.size().getInfo())
    top = fc.sort("area_m2", False).limit(MAX_VECTOR_FEATURES)
    gj = top.getInfo()  # {"type": "FeatureCollection", "features": [...]}
    kept = len(gj.get("features", []))
    return gj, {
        "available": True,
        "feature_count": kept,
        "total_polygons": total,
        "truncated": total > kept,
        "min_polygon_area_m2": min((f["properties"].get("area_m2", 0.0) for f in gj["features"]), default=None),
        "simplify_m": scale / 2,
    }


if __name__ == "__main__":  # smoke test: python -m app.analysis.gee --smoke
    import sys

    if "--smoke" in sys.argv:
        ee = init_ee()
        n = ee.ImageCollection(S1).filterBounds(ee.Geometry.Point([76.35, 10.30])).filterDate("2018-08-01", "2018-09-01").size().getInfo()
        print("Matching Sentinel-1 scenes:", n)
