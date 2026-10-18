"""Sample OSM asset elevations from public Terrarium and Copernicus DEMs."""
from __future__ import annotations

import asyncio
import math
from math import isfinite
from datetime import datetime, timezone

import httpx
import structlog

log = structlog.get_logger(__name__)
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
OPEN_METEO_URL = "https://api.open-meteo.com/v1/elevation"
ZOOM = 11
_tile_cache: dict[tuple[int, int, int], bytes | None] = {}
_tile_retry_after: dict[tuple[int, int, int], float] = {}
_cache_lock = asyncio.Lock()
_elevation_cache: dict[tuple[float, float], tuple[float, str]] = {}
_last_checked_at: datetime | None = None
_last_success_at: datetime | None = None
_last_sources: set[str] = set()


def _tile_and_pixel(lon: float, lat: float, zoom: int) -> tuple[int, int, int, int, int]:
    n = 2**zoom
    lat_rad = math.radians(max(-85.05112878, min(85.05112878, lat)))
    px = (lon + 180.0) / 360.0 * n * 256
    py = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n * 256
    x, y = int(px // 256), int(py // 256)
    return x, y, int(px) % 256, int(py) % 256, zoom


async def _load_tile(client: httpx.AsyncClient, x: int, y: int, zoom: int) -> bytes | None:
    key = (zoom, x, y)
    async with _cache_lock:
        if key in _tile_cache:
            return _tile_cache[key]
        if _tile_retry_after.get(key, 0) > asyncio.get_running_loop().time():
            return None
    pixels = None
    try:
        response = None
        for attempt in range(3):
            try:
                response = await client.get(TILE_URL.format(z=zoom, x=x, y=y))
                response.raise_for_status()
                break
            except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError):
                if attempt == 2:
                    raise
                await asyncio.sleep(0.2 * (2**attempt))
        assert response is not None
        # Rasterio is already a backend dependency and reads PNGs without adding
        # another image library. Terrarium values are RGB-encoded elevations.
        import rasterio
        from rasterio.io import MemoryFile

        with MemoryFile(response.content) as memfile:
            with memfile.open() as dataset:
                bands = dataset.read((1, 2, 3))
                if bands.shape[1:] == (256, 256):
                    pixels = b"".join(bands[channel].tobytes() for channel in range(3))
    except Exception as exc:
        pixels = None
        log.warning("elevation.tile_unavailable", z=zoom, x=x, y=y, error=str(exc))
    async with _cache_lock:
        if pixels is not None:
            _tile_cache[key] = pixels
            _tile_retry_after.pop(key, None)
        else:
            # Don't permanently cache transient network or decoder failures.
            _tile_retry_after[key] = asyncio.get_running_loop().time() + 30
    return pixels


async def _sample_open_meteo(
    client: httpx.AsyncClient,
    points: list[tuple[str, float, float]],
) -> dict[str, float]:
    """Batch missing points against Open-Meteo's Copernicus GLO-90 DEM."""
    result: dict[str, float] = {}
    # Open-Meteo accepts at most 100 coordinates per request.
    for start in range(0, len(points), 100):
        batch = points[start : start + 100]
        try:
            response = await client.get(
                OPEN_METEO_URL,
                params={
                    "latitude": ",".join(f"{lat:.6f}" for _, lat, _ in batch),
                    "longitude": ",".join(f"{lon:.6f}" for _, _, lon in batch),
                },
            )
            response.raise_for_status()
            elevations = response.json().get("elevation", [])
            if len(elevations) != len(batch):
                log.warning("elevation.open_meteo_count_mismatch", requested=len(batch), returned=len(elevations))
                continue
            for (asset_id, lat, lon), value in zip(batch, elevations):
                if value is None:
                    continue
                elevation = float(value)
                if isfinite(elevation):
                    result[asset_id] = elevation
                    _elevation_cache[(round(lat, 6), round(lon, 6))] = (elevation, "Open-Meteo Copernicus GLO-90")
        except Exception as exc:  # noqa: BLE001 - DEM is best-effort; retain explicit missing values
            log.warning("elevation.open_meteo_unavailable", batch_start=start, batch_size=len(batch), error=str(exc))
    return result


async def sample_assets_detailed(assets: list[dict]) -> tuple[dict[str, float], dict[str, str]]:
    """Return asset elevations and their DEM source, with a real-data fallback."""
    global _last_checked_at, _last_success_at, _last_sources
    points = []
    for asset in assets:
        try:
            if asset.get("lat") is None or asset.get("lon") is None:
                continue
            lat, lon = float(asset["lat"]), float(asset["lon"])
            if not (isfinite(lat) and isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
                continue
            asset_id = str(asset.get("id") or asset.get("osm_id") or "")
            if not asset_id:
                continue
            x, y, px, py, zoom = _tile_and_pixel(lon, lat, ZOOM)
            points.append((asset_id, lat, lon, x, y, px, py, zoom))
        except (TypeError, ValueError):
            continue
    unique = {(x, y, zoom) for _, _, _, x, y, _, _, zoom in points}
    async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=3.0)) as client:
        tiles = await asyncio.gather(*(_load_tile(client, x, y, z) for x, y, z in unique))
    tile_map = dict(zip(unique, tiles))
    result: dict[str, float] = {}
    sources: dict[str, str] = {}
    missing: list[tuple[str, float, float]] = []
    for asset_id, lat, lon, x, y, px, py, zoom in points:
        pixels = tile_map.get((x, y, zoom))
        if pixels is not None:
            offset = py * 256 + px
            r, g, b = pixels[offset], pixels[65536 + offset], pixels[131072 + offset]
            elevation = r * 256 + g + b / 256 - 32768
            result[asset_id] = elevation
            sources[asset_id] = "Mapzen Terrarium"
            _elevation_cache[(round(lat, 6), round(lon, 6))] = (elevation, "Mapzen Terrarium")
            continue

        cached = _elevation_cache.get((round(lat, 6), round(lon, 6)))
        if cached:
            result[asset_id], sources[asset_id] = cached
        else:
            missing.append((asset_id, lat, lon))

    if missing:
        async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=3.0)) as client:
            fallback = await _sample_open_meteo(client, missing)
        result.update(fallback)
        for asset_id in fallback:
            sources[asset_id] = "Open-Meteo Copernicus GLO-90"
    _last_checked_at = datetime.now(timezone.utc)
    if result:
        _last_success_at = _last_checked_at
        _last_sources = set(sources.values())
    return result, sources


async def sample_assets(assets: list[dict]) -> dict[str, float]:
    """Return asset ID → elevation metres; keep compatibility for callers."""
    elevations, _ = await sample_assets_detailed(assets)
    return elevations


def source_status() -> dict[str, object]:
    """Describe observed DEM availability; never assume the provider is online."""
    healthy = _last_success_at is not None and (datetime.now(timezone.utc) - _last_success_at).total_seconds() < 6 * 60 * 60
    state = "; ".join(sorted(_last_sources)) if _last_sources else "No successful DEM sample yet."
    return {
        "is_available": healthy,
        "last_checked": _last_checked_at,
        "last_success": _last_success_at,
        "sources": state,
    }


async def terrain_distribution(bounds: list[float], grid_size: int = 96) -> dict[str, object]:
    """Summarize Terrarium DEM elevation and derived slope over a regular study-area grid."""
    west, south, east, north = map(float, bounds)
    if not (-180 <= west < east <= 180 and -85 <= south < north <= 85):
        raise ValueError("Invalid study-area bounds")
    grid_size = max(32, min(int(grid_size), 128))
    coordinates = [
        (west + (east - west) * col / (grid_size - 1), north - (north - south) * row / (grid_size - 1))
        for row in range(grid_size) for col in range(grid_size)
    ]
    tile_refs = [_tile_and_pixel(lon, lat, ZOOM) for lon, lat in coordinates]
    unique_tiles = sorted({(z, x, y) for x, y, _, _, z in tile_refs})
    async with httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=4.0)) as client:
        tile_pixels = await asyncio.gather(*(_load_tile(client, x, y, z) for z, x, y in unique_tiles))
    tile_map = {(z, x, y): data for (z, x, y), data in zip(unique_tiles, tile_pixels)}

    import numpy as np

    dem = np.full((grid_size, grid_size), np.nan, dtype=float)
    for index, (x, y, px, py, zoom) in enumerate(tile_refs):
        pixels = tile_map.get((zoom, x, y))
        if pixels is None:
            continue
        offset = py * 256 + px
        r, g, b = pixels[offset], pixels[65_536 + offset], pixels[131_072 + offset]
        dem.flat[index] = r * 256 + g + b / 256 - 32_768

    valid = np.isfinite(dem)
    if int(valid.sum()) < 100:
        raise RuntimeError("Insufficient Terrarium DEM coverage for the study area")

    lat_step_m = (north - south) * 111_320 / (grid_size - 1)
    slope_values: list[tuple[float, float]] = []
    elevation_values: list[tuple[float, float]] = []
    for row in range(1, grid_size - 1):
        cos_lat = math.cos(math.radians(north - (north - south) * row / (grid_size - 1)))
        lon_step_m = (east - west) * 111_320 * cos_lat / (grid_size - 1)
        for col in range(1, grid_size - 1):
            elevation = dem[row, col]
            if not math.isfinite(elevation):
                continue
            weight = max(cos_lat, 0.01)
            elevation_values.append((float(elevation), weight))
            neighbors = dem[row - 1:row + 2, col - 1:col + 2]
            if not np.isfinite(neighbors).all():
                continue
            dz_dx = (dem[row, col + 1] - dem[row, col - 1]) / (2 * lon_step_m)
            dz_dy = (dem[row + 1, col] - dem[row - 1, col]) / (2 * lat_step_m)
            slope = math.degrees(math.atan(math.hypot(dz_dx, dz_dy)))
            slope_values.append((slope, weight))

    def weighted_quantiles(values: list[tuple[float, float]], percentiles: list[int], value_key: str) -> list[dict[str, float]]:
        ordered = sorted(values)
        total = sum(weight for _, weight in ordered)
        output = []
        for percentile in percentiles:
            target = total * percentile / 100
            cumulative = 0.0
            value = ordered[-1][0]
            for sample, weight in ordered:
                cumulative += weight
                if cumulative >= target:
                    value = sample
                    break
            output.append({value_key: round(value, 2), "area_below_pct": percentile})
        return output

    slope_bins = [(0, 2, "0–2°"), (2, 5, "2–5°"), (5, 10, "5–10°"), (10, 20, "10–20°"), (20, math.inf, ">20°")]
    slope_total = sum(weight for _, weight in slope_values)
    histogram = []
    for lower, upper, label in slope_bins:
        area = sum(weight for value, weight in slope_values if lower <= value < upper)
        histogram.append({"slope_bin": label, "share_pct": round(100 * area / slope_total, 2) if slope_total else 0.0})

    return {
        "source": "Mapzen Terrarium DEM (AWS Open Data)",
        "bounds": bounds,
        "grid_size": grid_size,
        "sampled_cells": len(elevation_values),
        "slope_cells": len(slope_values),
        "coverage_pct": round(100 * int(valid.sum()) / dem.size, 1),
        "measurement_basis": "regular_grid_samples",
        "hypsometric": weighted_quantiles(elevation_values, list(range(0, 101, 5)), "elevation_m"),
        "slope_histogram": histogram,
        "known_limitations": "Area weights use a regular grid clipped to the configured bounding box; no basin polygon is available to exclude out-of-basin cells. Slope is derived at the grid sampling scale.",
    }
