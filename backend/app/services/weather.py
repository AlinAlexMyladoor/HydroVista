"""
Open-Meteo weather adapter for the Chalakudy River basin.

Open-Meteo is a free, open-source weather API that requires no API key.
Documentation: https://open-meteo.com/en/docs

Data retrieved:
- Hourly precipitation (mm)
- Temperature at 2 m (°C)
- Relative humidity at 2 m (%)
- Wind speed at 10 m (km/h)

Temporal coverage: forecast 7 days ahead; historical via archive endpoint.
Spatial resolution: ~1–11 km depending on the underlying model.
Coordinate system: WGS84 (EPSG:4326)
Units: see field_unit map below.

Limitations:
- Open-Meteo provides NWP model output, not rain-gauge observations.
- Precipitation is a model estimate and may differ from actual gauge readings.
- Historical data represents reanalysis/hindcast, not observed rain gauge records.
- No sub-hourly resolution.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.core.config import settings

log = structlog.get_logger(__name__)

# Pilot basin centroid (Chalakudy River basin, Kerala)
BASIN_LAT = settings.BASIN_LAT
BASIN_LON = settings.BASIN_LON

FORECAST_VARIABLES = [
    "precipitation",
    "temperature_2m",
    "relative_humidity_2m",
    "wind_speed_10m",
    "precipitation_probability",
    "et0_fao_evapotranspiration",
]

FIELD_UNITS = {
    "precipitation": "mm",
    "temperature_2m": "°C",
    "relative_humidity_2m": "%",
    "wind_speed_10m": "km/h",
    "precipitation_probability": "%",
    "et0_fao_evapotranspiration": "mm",
}


class WeatherDataError(Exception):
    """Raised when weather data cannot be retrieved or parsed."""


@retry(
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
)
async def _fetch_json(client: httpx.AsyncClient, url: str, params: dict) -> dict:
    resp = await client.get(url, params=params, timeout=20.0)
    resp.raise_for_status()
    return resp.json()


async def fetch_forecast(
    lat: float = BASIN_LAT,
    lon: float = BASIN_LON,
    forecast_days: int = 7,
    past_days: int = 0,
) -> dict[str, Any]:
    """
    Fetch 7-day hourly forecast from Open-Meteo.

    Returns a structured dict with:
      - source metadata
      - hourly time series
      - rainfall accumulations (1h, 3h, 6h, 24h, 72h)
      - data quality notes
    """
    url = f"{settings.OPEN_METEO_BASE_URL}/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": ",".join(FORECAST_VARIABLES),
        "forecast_days": forecast_days,
        "past_days": past_days,
        "timezone": "Asia/Kolkata",
        "timeformat": "iso8601",
    }

    retrieved_at = datetime.now(timezone.utc)

    try:
        async with httpx.AsyncClient() as client:
            raw = await _fetch_json(client, url, params)
    except httpx.HTTPStatusError as exc:
        raise WeatherDataError(
            f"Open-Meteo HTTP error {exc.response.status_code}: {exc.response.text[:200]}"
        ) from exc
    except Exception as exc:
        raise WeatherDataError(f"Open-Meteo request failed: {exc}") from exc

    # ── Parse hourly series ───────────────────────────────────────────────────
    hourly = raw.get("hourly", {})
    times = hourly.get("time", [])
    precipitation = hourly.get("precipitation", [])
    temperature = hourly.get("temperature_2m", [])
    humidity = hourly.get("relative_humidity_2m", [])
    wind = hourly.get("wind_speed_10m", [])

    now_utc = datetime.now(timezone.utc)

    parsed_hours: list[dict] = []
    for i, t in enumerate(times):
        try:
            dt = datetime.fromisoformat(t)
            if dt.tzinfo is None:
                try:
                    dt = dt.replace(tzinfo=ZoneInfo(raw.get("timezone", "UTC")))
                except Exception:
                    dt = dt.replace(tzinfo=timezone.utc)
            dt = dt.astimezone(timezone.utc)
        except ValueError:
            continue

        parsed_hours.append({
            "time": dt.isoformat(),
            "precipitation_mm": _safe_float(precipitation, i),
            "temperature_2m": _safe_float(temperature, i),
            "relative_humidity_2m": _safe_float(humidity, i),
            "wind_speed_10m": _safe_float(wind, i),
            "is_forecast": dt > now_utc,
        })

    # ── Rolling accumulations ─────────────────────────────────────────────────
    precip_values = [h["precipitation_mm"] for h in parsed_hours if h["precipitation_mm"] is not None]
    accumulations = _compute_accumulations(
        [h["precipitation_mm"] for h in parsed_hours],
        [h["time"] for h in parsed_hours],
    )

    # ── Data quality notes ────────────────────────────────────────────────────
    missing_pct = sum(1 for p in precipitation if p is None) / max(len(precipitation), 1) * 100
    quality_notes = [
        "Source: Open-Meteo NWP forecast model (not rain-gauge observations).",
        f"Spatial resolution: ~1–11 km (model-dependent).",
        f"Missing precipitation values: {missing_pct:.1f}%.",
        "Precipitation is a modelled estimate; not an official flood forecast.",
        "Historical data via reanalysis endpoint represents hindcast, not observed gauge readings.",
    ]
    if missing_pct > 20:
        quality_notes.append(
            "WARNING: More than 20% of precipitation values are missing. Use with caution."
        )

    model_info = raw.get("hourly_units", {})
    meta = raw.get("generationtime_ms")

    return {
        "source": "Open-Meteo",
        "source_url": "https://api.open-meteo.com/v1/forecast",
        "license": "CC BY 4.0 (Open-Meteo)",
        "retrieved_at": retrieved_at.isoformat(),
        "lat": lat,
        "lon": lon,
        "timezone": raw.get("timezone", "UTC"),
        "field_units": FIELD_UNITS,
        "api_generation_ms": meta,
        "hourly": parsed_hours,
        "rainfall_accumulations": accumulations,
        "data_quality_notes": quality_notes,
        "known_limitations": (
            "NWP model output at basin centroid. Not a river-gauge or rain-gauge observation. "
            "Not an official flood warning."
        ),
    }


async def fetch_historical(
    lat: float = BASIN_LAT,
    lon: float = BASIN_LON,
    start_date: str = "2018-08-01",
    end_date: str = "2018-08-31",
) -> dict[str, Any]:
    """
    Fetch historical reanalysis data from Open-Meteo archive endpoint.
    Used for ML feature construction and historical comparison.

    Note: This is ERA5-based reanalysis, not observed gauge data.
    """
    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start_date,
        "end_date": end_date,
        "hourly": "precipitation,temperature_2m,relative_humidity_2m,wind_speed_10m",
        "timezone": "Asia/Kolkata",
        "timeformat": "iso8601",
    }

    retrieved_at = datetime.now(timezone.utc)

    try:
        async with httpx.AsyncClient() as client:
            raw = await _fetch_json(client, url, params)
    except Exception as exc:
        raise WeatherDataError(f"Open-Meteo archive request failed: {exc}") from exc

    hourly = raw.get("hourly", {})
    times = hourly.get("time", [])
    parsed_hours = []
    for i, t in enumerate(times):
        try:
            dt = datetime.fromisoformat(t)
            if dt.tzinfo is None:
                try:
                    dt = dt.replace(tzinfo=ZoneInfo(raw.get("timezone", "UTC")))
                except Exception:
                    dt = dt.replace(tzinfo=timezone.utc)
            dt = dt.astimezone(timezone.utc)
        except ValueError:
            continue
        parsed_hours.append({
            "time": dt.isoformat(),
            "precipitation_mm": _safe_float(hourly.get("precipitation", []), i),
            "temperature_2m": _safe_float(hourly.get("temperature_2m", []), i),
            "relative_humidity_2m": _safe_float(hourly.get("relative_humidity_2m", []), i),
            "wind_speed_10m": _safe_float(hourly.get("wind_speed_10m", []), i),
            "is_forecast": False,
        })

    return {
        "source": "Open-Meteo ERA5 Archive",
        "source_url": "https://archive-api.open-meteo.com/v1/archive",
        "license": "CC BY 4.0 (Open-Meteo); ERA5 data via Copernicus",
        "retrieved_at": retrieved_at.isoformat(),
        "lat": lat,
        "lon": lon,
        "start_date": start_date,
        "end_date": end_date,
        "hourly": parsed_hours,
        "data_quality_notes": [
            "ERA5 reanalysis – not observed rain-gauge records.",
            "Spatial resolution ~31 km. Sub-basin variability not captured.",
            "Used for ML feature construction only.",
        ],
    }


async def fetch_river_discharge_forecast(
    lat: float = BASIN_LAT,
    lon: float = BASIN_LON,
    forecast_days: int = 14,
) -> dict[str, Any]:
    """Fetch modelled daily river discharge from Open-Meteo's GloFAS Flood API."""
    url = "https://flood-api.open-meteo.com/v1/flood"
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": "river_discharge",
        "forecast_days": forecast_days,
        "timezone": "GMT",
        "timeformat": "iso8601",
    }
    try:
        async with httpx.AsyncClient() as client:
            raw = await _fetch_json(client, url, params)
    except Exception as exc:
        raise WeatherDataError("Open-Meteo river discharge request failed") from exc

    daily = raw.get("daily", {})
    times = daily.get("time", [])
    discharge = daily.get("river_discharge", [])
    return {
        "source": "Open-Meteo Flood API (GloFAS)",
        "source_url": "https://open-meteo.com/en/docs/flood-api",
        "model": "GloFAS v4 Seamless",
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "lat": raw.get("latitude", lat),
        "lon": raw.get("longitude", lon),
        "units": raw.get("daily_units", {}).get("river_discharge", "m³/s"),
        "daily": [
            {"date": time, "river_discharge_m3s": _safe_float(discharge, i)}
            for i, time in enumerate(times)
        ],
        "known_limitations": (
            "Modelled discharge for a nearby river grid cell at about 5 km resolution; "
            "the selected river may not match the basin outlet. This is not gauge data."
        ),
    }


def _safe_float(lst: list, i: int) -> float | None:
    try:
        v = lst[i]
        return float(v) if v is not None else None
    except (IndexError, TypeError, ValueError):
        return None


def _compute_accumulations(
    precip_series: list[float | None],
    time_series: list[str],
) -> list[dict]:
    """Compute rolling rainfall accumulations over standard windows."""
    windows = [1, 3, 6, 24, 72]
    results = []
    now_str = datetime.now(timezone.utc).isoformat()

    for w in windows:
        # Use the most recent w hours of available data
        recent = precip_series[-w:] if len(precip_series) >= w else precip_series
        valid = [v for v in recent if v is not None]
        if valid:
            acc = round(sum(valid), 2)
            note = None
            if len(valid) < w:
                note = f"Only {len(valid)} of {w} expected hours had valid data."
        else:
            acc = None
            note = "No valid precipitation data for this window."

        results.append({
            "window_hours": w,
            "accumulation_mm": acc,
            "computed_at": now_str,
            "note": note,
        })

    return results
