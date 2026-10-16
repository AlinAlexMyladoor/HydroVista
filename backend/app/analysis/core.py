"""
Flood-analysis core: validation, thresholding, masking, area and metric calculations.

Pure numpy; no network, no Earth Engine. Everything here is unit-tested and is what the
Earth Engine pipeline's results are checked against.

Design rules (from the HydroVista blueprint):
  * Missing observations are NEVER treated as "not flooded". Classification is tri-state:
    FLOODED=1, NOT_FLOODED=0, NODATA=-1.
  * "Candidate inundation" (threshold output) is a different product from "validated flood
    area" (needs independent reference data). Nothing here produces the latter without labels.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any

import numpy as np

FLOODED, NOT_FLOODED, NODATA = 1, 0, -1
S1_GRD_START = date(2014, 10, 3)  # first Sentinel-1 GRD in the Earth Engine catalogue
EARTH_RADIUS_M = 6_371_008.8


class ValidationError(ValueError):
    """Carries a structured list of field errors for API responses."""

    def __init__(self, errors: list[dict[str, str]]):
        self.errors = errors
        super().__init__("; ".join(f"{e['field']}: {e['message']}" for e in errors))


# ─── Geometry / date validation ──────────────────────────────────────────────
def bbox_area_km2(west: float, south: float, east: float, north: float) -> float:
    """Spherical area of a lon/lat rectangle in km²."""
    dlon = math.radians(east - west)
    return abs(EARTH_RADIUS_M**2 * dlon * (math.sin(math.radians(north)) - math.sin(math.radians(south)))) / 1e6


def validate_bbox(west: float, south: float, east: float, north: float, max_area_km2: float = 2500.0) -> float:
    errs: list[dict[str, str]] = []
    for name, v, lo, hi in (("west", west, -180, 180), ("east", east, -180, 180), ("south", south, -90, 90), ("north", north, -90, 90)):
        if not isinstance(v, (int, float)) or math.isnan(v) or not (lo <= v <= hi):
            errs.append({"field": name, "message": f"must be a number in [{lo}, {hi}]"})
    if errs:
        raise ValidationError(errs)
    if west >= east:
        errs.append({"field": "west", "message": "west must be less than east (antimeridian-crossing boxes are not supported)"})
    if south >= north:
        errs.append({"field": "south", "message": "south must be less than north"})
    if errs:
        raise ValidationError(errs)
    area = bbox_area_km2(west, south, east, north)
    if area > max_area_km2:
        raise ValidationError([{"field": "bbox", "message": f"area {area:.0f} km² exceeds the {max_area_km2:.0f} km² limit"}])
    if area < 1.0:
        raise ValidationError([{"field": "bbox", "message": f"area {area:.2f} km² is too small (minimum 1 km²)"}])
    return area


def parse_date(field: str, value: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        raise ValidationError([{"field": field, "message": "must be an ISO date YYYY-MM-DD"}])


def validate_windows(pre_start: str, pre_end: str, event_start: str, event_end: str, today: date | None = None) -> dict[str, date]:
    today = today or datetime.now(timezone.utc).date()
    d = {k: parse_date(k, v) for k, v in dict(pre_start=pre_start, pre_end=pre_end, event_start=event_start, event_end=event_end).items()}
    errs: list[dict[str, str]] = []
    if d["pre_start"] >= d["pre_end"]:
        errs.append({"field": "pre_end", "message": "pre-event end must be after its start"})
    if d["event_start"] >= d["event_end"]:
        errs.append({"field": "event_end", "message": "event end must be after its start"})
    if d["pre_end"] > d["event_start"]:
        errs.append({"field": "event_start", "message": "event window must not start before the pre-event window ends"})
    if d["pre_start"] < S1_GRD_START:
        errs.append({"field": "pre_start", "message": f"Sentinel-1 GRD starts {S1_GRD_START.isoformat()}"})
    if d["event_end"] > today:
        errs.append({"field": "event_end", "message": "event window ends in the future"})
    for k in ("pre_start", "event_start"):
        pass
    if (d["event_end"] - d["event_start"]).days > 92 or (d["pre_end"] - d["pre_start"]).days > 92:
        errs.append({"field": "event_end", "message": "windows longer than 92 days are not supported"})
    if errs:
        raise ValidationError(errs)
    return d


# ─── Area ────────────────────────────────────────────────────────────────────
def pixel_area_km2_projected(pixel_size_m: float) -> float:
    return (pixel_size_m**2) / 1e6


def pixel_area_km2_geographic(lat_deg: np.ndarray | float, dlon_deg: float, dlat_deg: float) -> np.ndarray | float:
    """Area of lon/lat grid cells (km²) at the given latitude(s)."""
    lat = np.asarray(lat_deg, dtype=float)
    r = EARTH_RADIUS_M
    a = (r**2) * np.radians(dlon_deg) * (np.sin(np.radians(lat + dlat_deg / 2)) - np.sin(np.radians(lat - dlat_deg / 2)))
    out = np.abs(a) / 1e6
    return float(out) if out.ndim == 0 else out


def area_km2(mask: np.ndarray, cell_area_km2: float | np.ndarray) -> float:
    """Sum cell area where mask == FLOODED. `cell_area_km2` may be scalar or per-cell/row."""
    m = np.asarray(mask) == FLOODED
    if np.isscalar(cell_area_km2):
        return float(m.sum() * cell_area_km2)
    ca = np.asarray(cell_area_km2)
    if ca.ndim == 1:  # per-row
        ca = ca[:, None]
    return float((m * ca).sum())


# ─── Classification ──────────────────────────────────────────────────────────
def candidate_water(vv_db: np.ndarray, threshold_db: float) -> np.ndarray:
    """Tri-state candidate-water mask from VV backscatter (dB). NaN -> NODATA (never 'dry')."""
    vv = np.asarray(vv_db, dtype=float)
    out = np.full(vv.shape, NOT_FLOODED, dtype=np.int8)
    out[vv < threshold_db] = FLOODED
    out[np.isnan(vv)] = NODATA
    return out


def newly_inundated(pre_db: np.ndarray, event_db: np.ndarray, threshold_db: float, min_drop_db: float = 3.0) -> np.ndarray:
    """
    Tri-state *change-based* candidate mask (numpy twin of the Earth Engine expression in gee.py).

    A cell is FLOODED only if all three hold:
      1. event VV is below ``threshold_db``              (looks like open water now)
      2. event - pre <= -``min_drop_db``                  (backscatter fell, i.e. something changed)
      3. pre VV >= ``threshold_db``                       (it was NOT already water before the event)
    NaN in either image -> NODATA. A missing observation is never reported as dry land.
    """
    pre = np.asarray(pre_db, dtype=float)
    ev = np.asarray(event_db, dtype=float)
    if pre.shape != ev.shape:
        raise ValueError("pre_db and event_db must have the same shape")
    out = np.full(ev.shape, NOT_FLOODED, dtype=np.int8)
    with np.errstate(invalid="ignore"):
        flooded = (ev < threshold_db) & ((ev - pre) <= -abs(min_drop_db)) & (pre >= threshold_db)
    out[flooded] = FLOODED
    out[np.isnan(pre) | np.isnan(ev)] = NODATA
    return out


def exclude_permanent_water(candidate: np.ndarray, occurrence_pct: np.ndarray, max_occurrence_pct: float = 90.0) -> tuple[np.ndarray, int]:
    """
    Remove cells whose historical water occurrence >= max_occurrence_pct.
    Cells with unknown occurrence (NaN) are KEPT and counted, because absence of a JRC value
    over land means 'never observed as water', but NaN from masking means 'unknown'.
    Returns (mask, n_unknown_baseline_cells).
    """
    cand = np.asarray(candidate).copy()
    occ = np.asarray(occurrence_pct, dtype=float)
    perm = occ >= max_occurrence_pct
    cand[(cand == FLOODED) & perm] = NOT_FLOODED
    unknown = int(((cand == FLOODED) & np.isnan(occ)).sum())
    return cand, unknown


def apply_terrain_mask(mask: np.ndarray, slope_deg: np.ndarray, max_slope_deg: float = 5.0) -> np.ndarray:
    """Floodwater is not expected on steep slopes; those cells become NOT_FLOODED (radar shadow is a common false positive)."""
    out = np.asarray(mask).copy()
    out[(out == FLOODED) & (np.asarray(slope_deg, dtype=float) > max_slope_deg)] = NOT_FLOODED
    return out


def change_db(pre_db: np.ndarray, event_db: np.ndarray) -> np.ndarray:
    return np.asarray(event_db, dtype=float) - np.asarray(pre_db, dtype=float)


def otsu_threshold(values: np.ndarray, bins: int = 256) -> float | None:
    """Otsu threshold for exploratory use. Returns None if the data are not usable/bimodal-capable."""
    v = np.asarray(values, dtype=float)
    v = v[np.isfinite(v)]
    if v.size < 50 or np.ptp(v) == 0:
        return None
    hist, edges = np.histogram(v, bins=bins)
    p = hist / hist.sum()
    centers = (edges[:-1] + edges[1:]) / 2
    w0 = np.cumsum(p)
    w1 = 1 - w0
    m0 = np.cumsum(p * centers)
    mt = m0[-1]
    with np.errstate(divide="ignore", invalid="ignore"):
        between = (mt * w0 - m0) ** 2 / (w0 * w1)
    between[~np.isfinite(between)] = -1
    return float(centers[int(np.argmax(between))])


# ─── Metrics ─────────────────────────────────────────────────────────────────
@dataclass
class ClassMetrics:
    tp: int
    fp: int
    fn: int
    tn: int
    precision: float | None
    recall: float | None
    f1: float | None
    iou: float | None
    accuracy: float | None
    n: int
    positive_fraction: float | None

    def as_dict(self) -> dict[str, Any]:
        return {**self.__dict__, "confusion_matrix": [[self.tn, self.fp], [self.fn, self.tp]]}


def _ratio(a: float, b: float) -> float | None:
    return None if b == 0 else a / b


def binary_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> ClassMetrics:
    """Metrics with 1 = flooded. Undefined ratios are None (not 0) so the UI can say 'undefined'."""
    yt = np.asarray(y_true).astype(int)
    yp = np.asarray(y_pred).astype(int)
    if yt.shape != yp.shape:
        raise ValueError("y_true and y_pred must have the same shape")
    tp = int(((yt == 1) & (yp == 1)).sum())
    fp = int(((yt == 0) & (yp == 1)).sum())
    fn = int(((yt == 1) & (yp == 0)).sum())
    tn = int(((yt == 0) & (yp == 0)).sum())
    p, r = _ratio(tp, tp + fp), _ratio(tp, tp + fn)
    f1 = None if (p is None or r is None or (p + r) == 0) else 2 * p * r / (p + r)
    n = tp + fp + fn + tn
    return ClassMetrics(tp, fp, fn, tn, p, r, f1, _ratio(tp, tp + fp + fn), _ratio(tp + tn, n), n, _ratio(tp + fn, n))


# ─── Raster → vector ─────────────────────────────────────────────────────────
def mask_to_geojson(mask: np.ndarray, west: float, north: float, dlon: float, dlat: float) -> dict[str, Any]:
    """Polygonise FLOODED cells of a north-up lon/lat grid. Requires rasterio + shapely."""
    from rasterio import features
    from rasterio.transform import from_origin
    from shapely.geometry import shape, mapping

    arr = (np.asarray(mask) == FLOODED).astype("uint8")
    tr = from_origin(west, north, dlon, dlat)
    feats = []
    for geom, val in features.shapes(arr, mask=arr.astype(bool), transform=tr):
        if val == 1:
            feats.append({"type": "Feature", "properties": {"class": "candidate_inundation"}, "geometry": mapping(shape(geom))})
    return {"type": "FeatureCollection", "features": feats}
