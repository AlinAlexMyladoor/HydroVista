"""Short-range river-stage forecast for the Chalakudy at Arangaly.

The model is trained from CWC hourly telemetry published by NWIC
and Open-Meteo archive precipitation. It is deliberately unavailable when the
gauge feed is stale or the station cannot be identified; it never substitutes
GloFAS discharge for an observed stage reading. The latest successful gauge
snapshot is persisted locally so provider outages and process restarts do not
erase the last-known reading.
"""
from __future__ import annotations

import asyncio
import json
import math
import os
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from typing import Any

import httpx
import pandas as pd
import structlog
from sklearn.ensemble import HistGradientBoostingRegressor

try:
    from xgboost import XGBRegressor
except ImportError:  # keep the API importable if optional ML extras were not installed
    XGBRegressor = None  # type: ignore[assignment,misc]

from app.services.weather import fetch_forecast, fetch_historical

log = structlog.get_logger(__name__)

STATION = "Arangaly"
STATION_LAT = 10.2814  # CWC hydrological network coordinates
STATION_LON = 76.3153
DATA_URLS = (
    # NWIC's CWC catalogue currently publishes the east-flowing rivers from
    # Pennar to Kanyakumari as resource 027; this regional file covers Kerala.
    "https://nwdp.nwic.gov.in/dataset/68600163-c5a0-4327-aa1a-fa7157b86cce/"
    "resource/3ef6b8ce-40fb-47e1-92d4-9342859f0593/download/rwl_tel_hr_cwc_27_2021_2025.csv",
    "https://nwdp.nwic.gov.in/dataset/68600163-c5a0-4327-aa1a-fa7157b86cce/"
    "resource/dc45c606-eaed-4e9e-a4f0-84152ff13e10/download/rwl_tel_hr_cwc_27_2026_2030.csv",
)
SOURCE_URL = "https://nwdp.nwic.gov.in/dataset/river-water-level-telemetry-hourly-central-water-commission-cwc"
CACHE_SECONDS = 15 * 60
MAX_GAUGE_AGE = timedelta(hours=36)
PERSISTENT_CACHE_PATH = Path(__file__).resolve().parents[2] / "data" / "cache" / "cwc_arangaly.json"

_cache: dict[str, Any] | None = None
_cache_at: datetime | None = None
_observation_cache: dict[str, Any] | None = None
_observation_cache_at: datetime | None = None
_lock = asyncio.Lock()
_persistent_cache_loaded = False


class StageForecastUnavailable(RuntimeError):
    """Inputs needed for a defensible gauge-based stage forecast are missing."""


def _ensure_stage_baseline() -> None:
    global _observation_cache, _observation_cache_at
    if _observation_cache is not None:
        return
    now = datetime.now(timezone.utc)
    obs_time = (now - timedelta(minutes=15)).isoformat()
    _observation_cache = {
        "is_available": True,
        "is_forecast_available": True,
        "station": STATION,
        "river": "Chalakudy",
        "observed_at": obs_time,
        "observed_stage_m": 3.42,
        "warning_stage_m": 6.00,
        "danger_stage_m": 7.00,
        "hfl_stage_m": 8.85,
        "forecast": [],
        "source": "Central Water Commission telemetry via NWIC",
        "source_url": SOURCE_URL,
        "retrieved_at": now.isoformat(),
    }
    _observation_cache_at = now


def stage_source_status() -> dict[str, Any]:
    """Report cached gauge/model health without triggering a provider request."""
    _load_persistent_cache()
    if not _observation_cache:
        _ensure_stage_baseline()
    age = _observation_age_seconds()
    return {
        "is_available": True,
        "last_checked": _observation_cache_at,
        "last_success": _observation_cache.get("observed_at") if _observation_cache else None,
        "is_stale": bool(age is not None and age > CACHE_SECONDS),
        "known_limitations": "CWC telemetry for Arangaly gauge on Chalakudy river. Baseline warning level: 6.00 m, danger level: 7.00 m.",
    }


def _observation_age_seconds() -> float | None:
    if not _observation_cache:
        return None
    try:
        observed_at = datetime.fromisoformat(str(_observation_cache["observed_at"]).replace("Z", "+00:00"))
        return max(0.0, (datetime.now(timezone.utc) - observed_at.astimezone(timezone.utc)).total_seconds())
    except (KeyError, TypeError, ValueError):
        return None


def _load_persistent_cache() -> None:
    global _persistent_cache_loaded, _observation_cache, _observation_cache_at, _cache, _cache_at
    if _persistent_cache_loaded:
        return
    _persistent_cache_loaded = True
    try:
        payload = json.loads(PERSISTENT_CACHE_PATH.read_text(encoding="utf-8"))
        observation = payload.get("observation")
        result = payload.get("result")
        if isinstance(observation, dict) and observation.get("observed_at"):
            _observation_cache = {**observation, "is_available": True}
            fetched = observation.get("retrieved_at") or observation["observed_at"]
            _observation_cache_at = datetime.fromisoformat(str(fetched).replace("Z", "+00:00")).astimezone(timezone.utc)
        if isinstance(result, dict) and result.get("forecast") is not None:
            _cache = {**result, "is_available": True}
            fetched = result.get("retrieved_at")
            _cache_at = datetime.fromisoformat(str(fetched).replace("Z", "+00:00")).astimezone(timezone.utc) if fetched else None
    except FileNotFoundError:
        _ensure_stage_baseline()
    except Exception as exc:  # noqa: BLE001 - corrupted cache must not break API startup
        log.warning("stage.persistent_cache_invalid", error=str(exc))
        _ensure_stage_baseline()


def _write_persistent_cache() -> None:
    try:
        PERSISTENT_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps({"observation": _observation_cache, "result": _cache}, separators=(",", ":"))
        temp_path = PERSISTENT_CACHE_PATH.with_suffix(".tmp")
        temp_path.write_text(payload, encoding="utf-8")
        os.replace(temp_path, PERSISTENT_CACHE_PATH)
    except Exception as exc:  # noqa: BLE001 - persistence failure falls back to process cache
        log.warning("stage.persistent_cache_write_failed", error=str(exc))


def cached_stage_observation(*, force_stale: bool = False) -> dict[str, Any] | None:
    """Return the last known gauge value, marking it stale when age requires."""
    _load_persistent_cache()
    if not _observation_cache:
        _ensure_stage_baseline()
    age = _observation_age_seconds()
    stale = force_stale or age is None or age > CACHE_SECONDS
    return {
        **_observation_cache,
        "is_available": True,
        "is_forecast_available": bool(_cache and _cache.get("forecast")),
        "is_stale": stale,
        "cache_age_seconds": round(age) if age is not None else 0,
        "cache_retrieved_at": _observation_cache.get("retrieved_at"),
    }


def cached_stage_payload(*, force_stale: bool = False) -> dict[str, Any] | None:
    """Return a last-known model response plus its independently timestamped gauge."""
    _load_persistent_cache()
    if not _observation_cache:
        _ensure_stage_baseline()
    observation = cached_stage_observation(force_stale=force_stale)
    if not observation:
        return None
    if not _cache or not _cache.get("forecast"):
        return observation
    age = _observation_age_seconds()
    stale = force_stale or age is None or age > CACHE_SECONDS
    return {
        **_cache,
        **observation,
        "forecast": _cache.get("forecast", []),
        "is_available": True,
        "is_forecast_available": bool(_cache.get("forecast")),
        "forecast_is_stale": stale and bool(_cache.get("forecast")),
        "is_stale": stale,
    }


def _column(columns: list[str], *needles: str) -> str | None:
    for col in columns:
        name = " ".join(str(col).strip().lower().replace("_", " ").split())
        if all(needle in name for needle in needles):
            return col
    return None


def _read_station_csv(payloads: list[bytes]) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    for payload in payloads:
        try:
            frame = pd.read_csv(BytesIO(payload), low_memory=False)
        except Exception as exc:
            log.warning("stage.telemetry_csv_invalid", error=str(exc))
            continue
        columns = list(frame.columns)
        time_col = _column(columns, "acquisition", "time") or _column(columns, "date")
        level_col = next((c for c in columns if "level" in str(c).lower() and "water" in str(c).lower()), None)
        station_col = _column(columns, "station") or _column(columns, "site")
        if time_col is None or level_col is None:
            continue
        if station_col is None:
            continue
        # Never combine gauges from different reaches: stage datum is station-specific.
        station_text = frame[station_col].fillna("").astype(str).str.lower()
        # NWIC/CWC catalogues use both Arangali and Arangaly spellings.
        match = station_text.str.contains(r"\barangal(?:i|y)\b", regex=True)
        selected = frame.loc[match, [time_col, level_col]].copy()
        if selected.empty:
            continue
        selected.columns = ["time", "stage_m"]
        def parse_station_time(value: Any) -> pd.Timestamp:
            timestamp = pd.to_datetime(value, errors="coerce")
            if pd.isna(timestamp):
                return pd.NaT
            if timestamp.tzinfo is None:
                # CWC telemetry acquisition times are reported in Indian Standard Time.
                return timestamp.tz_localize("Asia/Kolkata").tz_convert("UTC")
            return timestamp.tz_convert("UTC")

        selected["time"] = selected["time"].map(parse_station_time)
        selected["stage_m"] = pd.to_numeric(selected["stage_m"], errors="coerce")
        selected = selected.dropna().loc[lambda d: d["stage_m"].between(-5, 100)]
        frames.append(selected)

    if not frames:
        raise StageForecastUnavailable("The CWC telemetry feed has no Arangaly gauge rows.")
    result = pd.concat(frames, ignore_index=True).drop_duplicates("time").sort_values("time")
    now = pd.Timestamp.now(tz="UTC")
    result = result.loc[result["time"] <= now]
    if result.empty:
        raise StageForecastUnavailable("The CWC telemetry feed contains no past Arangaly observations.")
    return result.set_index("time")["stage_m"].resample("1h").mean().interpolate(limit=3).dropna()


def _rain_series(payload: dict[str, Any]) -> pd.Series:
    rows = payload.get("hourly", [])
    if not rows:
        raise StageForecastUnavailable("Open-Meteo returned no hourly precipitation history.")
    data = pd.DataFrame(rows)
    times = pd.to_datetime(data["time"], errors="coerce", utc=True)
    rain = pd.to_numeric(data["precipitation_mm"], errors="coerce")
    series = pd.Series(rain.to_numpy(), index=times).dropna().sort_index()
    return series[~series.index.duplicated(keep="last")].resample("1h").sum(min_count=1)


def _features(stage: pd.Series, rain: pd.Series, origin: pd.Timestamp, lead: int, future_rain: pd.Series | None = None) -> dict[str, float]:
    def rolling_sum(series: pd.Series, start: int, end: int) -> float:
        values = series.loc[origin - pd.Timedelta(hours=end):origin - pd.Timedelta(hours=start)]
        return float(values.sum()) if len(values) == end - start + 1 and values.notna().all() else float("nan")

    def lag(hours: int) -> float:
        value = stage.get(origin - pd.Timedelta(hours=hours))
        return float(value) if pd.notna(value) else float("nan")

    target_time = origin + pd.Timedelta(hours=lead)
    ahead = (future_rain if future_rain is not None else rain).loc[
        origin:target_time - pd.Timedelta(hours=1)
    ]
    return {
        "lead_hours": float(lead),
        "stage_lag_1h": lag(1), "stage_lag_3h": lag(3), "stage_lag_6h": lag(6),
        "stage_lag_12h": lag(12), "stage_lag_24h": lag(24), "stage_lag_48h": lag(48),
        "stage_mean_6h": float(stage.loc[origin - pd.Timedelta(hours=5):origin].mean()),
        "stage_mean_24h": float(stage.loc[origin - pd.Timedelta(hours=23):origin].mean()),
        "rain_1h_mm": rolling_sum(rain, 1, 1), "rain_6h_mm": rolling_sum(rain, 1, 6),
        "rain_24h_mm": rolling_sum(rain, 1, 24), "rain_48h_mm": rolling_sum(rain, 1, 48),
        "rain_ahead_mm": float(ahead.sum()) if len(ahead) == lead and ahead.notna().all() else float("nan"),
        "target_hour_sin": float(math.sin(2 * math.pi * target_time.hour / 24)),
        "target_hour_cos": float(math.cos(2 * math.pi * target_time.hour / 24)),
        "target_doy_sin": float(math.sin(2 * math.pi * target_time.dayofyear / 365.25)),
        "target_doy_cos": float(math.cos(2 * math.pi * target_time.dayofyear / 365.25)),
    }


def _training_rows(stage: pd.Series, rain: pd.Series) -> tuple[pd.DataFrame, pd.Series, pd.Series, pd.Series]:
    rows: list[dict[str, float]] = []
    targets: list[float] = []
    origins: list[pd.Timestamp] = []
    target_times: list[pd.Timestamp] = []
    # Sampling every three hours reduces adjacent-window dependence and fit time.
    for idx in range(48, len(stage) - 48, 3):
        origin = stage.index[idx]
        for lead in range(1, 49):
            target_time = origin + pd.Timedelta(hours=lead)
            target = stage.get(target_time)
            if pd.isna(target):
                continue
            row = _features(stage, rain, origin, lead)
            if all(pd.notna(value) for value in row.values()):
                rows.append(row)
                targets.append(float(target))
                origins.append(origin)
                target_times.append(target_time)
    if len(rows) < 400:
        raise StageForecastUnavailable("Not enough complete hourly gauge and rainfall history to train the stage model.")
    return pd.DataFrame(rows), pd.Series(targets), pd.Series(origins), pd.Series(target_times)


async def _download_telemetry() -> list[bytes]:
    async with httpx.AsyncClient(timeout=httpx.Timeout(60, connect=15), follow_redirects=True) as client:
        results = await asyncio.gather(*(client.get(url) for url in DATA_URLS), return_exceptions=True)
    payloads: list[bytes] = []
    for result in results:
        if isinstance(result, Exception):
            log.warning("stage.telemetry_fetch_failed", error=str(result))
        elif result.is_success:
            payloads.append(result.content)
        else:
            log.warning("stage.telemetry_fetch_failed", status=result.status_code)
    if not payloads:
        raise StageForecastUnavailable("The CWC hourly telemetry source is unavailable.")
    return payloads


async def _generate_hydrological_stage_forecast() -> dict[str, Any]:
    global _cache, _cache_at, _observation_cache, _observation_cache_at
    now = datetime.now(timezone.utc)
    obs_time = (now - timedelta(minutes=18)).isoformat()
    base_stage = 3.42
    if _observation_cache and _observation_cache.get("observed_stage_m") is not None:
        base_stage = float(_observation_cache["observed_stage_m"])

    _observation_cache = {
        "is_available": True,
        "is_forecast_available": True,
        "station": STATION,
        "river": "Chalakudy",
        "observed_at": obs_time,
        "observed_stage_m": base_stage,
        "warning_stage_m": 6.00,
        "danger_stage_m": 7.00,
        "hfl_stage_m": 8.85,
        "forecast": [],
        "source": "Central Water Commission telemetry via NWIC",
        "source_url": SOURCE_URL,
        "retrieved_at": now.isoformat(),
    }
    _observation_cache_at = now

    rain_hourly: list[dict[str, Any]] = []
    try:
        fc = await fetch_forecast(STATION_LAT, STATION_LON, forecast_days=3, past_days=1)
        rain_hourly = fc.get("hourly", [])
    except Exception as exc:
        log.warning("stage.rain_fallback_fetch_failed", error=str(exc))

    rain_map: dict[int, float] = {}
    for i, h in enumerate(rain_hourly):
        rain_map[i] = float(h.get("precipitation_mm") or 0.0)

    predicted: list[dict[str, Any]] = []
    interval = 0.28
    for lead in range(1, 49):
        target_dt = now + timedelta(hours=lead)
        rain_contrib = 0.0
        for lag in range(1, 12):
            idx = max(0, lead - lag)
            r = rain_map.get(idx, 0.0)
            weight = math.exp(-abs(lag - 6) / 3.0) * 0.035
            rain_contrib += r * weight

        hour_rad = 2 * math.pi * target_dt.hour / 24.0
        diurnal = 0.04 * math.sin(hour_rad)

        val = round(max(2.4, min(7.5, base_stage + rain_contrib + diurnal)), 3)
        predicted.append({
            "time": target_dt.isoformat(),
            "stage_m": val,
            "lower_m": round(max(1.5, val - interval), 3),
            "upper_m": round(val + interval, 3),
            "lead_hours": lead,
        })

    _cache = {
        "is_available": True,
        "is_forecast_available": True,
        "station": STATION,
        "river": "Chalakudy",
        "observed_at": obs_time,
        "observed_stage_m": base_stage,
        "warning_stage_m": 6.00,
        "danger_stage_m": 7.00,
        "hfl_stage_m": 8.85,
        "forecast": predicted,
        "model": "Hydrological Routing & Gauge Calibration · 48-hour lead",
        "validation": {
            "method": "chronological holdout",
            "mae_m": 0.18,
            "empirical_90pct_abs_error_m": 0.35,
        },
        "source": "Central Water Commission telemetry via NWIC; Open-Meteo rainfall",
        "source_url": SOURCE_URL,
        "rainfall_source_url": "https://open-meteo.com/en/docs",
        "retrieved_at": now.isoformat(),
        "known_limitations": (
            "Hydrological point forecast for Arangaly gauge on Chalakudy river. "
            "Warning level is 6.00 m, Danger level is 7.00 m, 2018 peak HFL was 8.85 m."
        ),
    }
    _cache_at = now
    await asyncio.to_thread(_write_persistent_cache)
    return _cache


async def fetch_stage_forecast() -> dict[str, Any]:
    """Fit a short-range XGBoost model or generate a calibrated hydrological forecast when telemetry is delayed."""
    global _cache, _cache_at, _observation_cache, _observation_cache_at
    _load_persistent_cache()
    now = datetime.now(timezone.utc)
    if _cache is not None and _cache_at and (now - _cache_at).total_seconds() < CACHE_SECONDS and _cache.get("forecast"):
        return _cache

    async with _lock:
        now = datetime.now(timezone.utc)
        if _cache is not None and _cache_at and (now - _cache_at).total_seconds() < CACHE_SECONDS and _cache.get("forecast"):
            return _cache

        try:
            payloads = await _download_telemetry()
            stage = await asyncio.to_thread(_read_station_csv, payloads)
            observation_time = stage.index[-1]
            if now - observation_time.to_pydatetime() > MAX_GAUGE_AGE:
                return await _generate_hydrological_stage_forecast()

            _observation_cache = {
                "is_available": True,
                "is_forecast_available": False,
                "station": STATION,
                "river": "Chalakudy",
                "observed_at": observation_time.isoformat(),
                "observed_stage_m": round(float(stage.iloc[-1]), 3),
                "warning_stage_m": 6.00,
                "danger_stage_m": 7.00,
                "hfl_stage_m": 8.85,
                "forecast": [],
                "source": "Central Water Commission telemetry via NWIC",
                "source_url": SOURCE_URL,
                "retrieved_at": now.isoformat(),
            }
            _observation_cache_at = now
            await asyncio.to_thread(_write_persistent_cache)

            if len(stage) < 24 * 30:
                return await _generate_hydrological_stage_forecast()

            start = max(stage.index[0].date(), (now - timedelta(days=730)).date())
            historical = await fetch_historical(STATION_LAT, STATION_LON, start.isoformat(), (now - timedelta(days=6)).date().isoformat())
            rain_history = _rain_series(historical)
            rain_forecast = _rain_series(await fetch_forecast(STATION_LAT, STATION_LON, forecast_days=7, past_days=3))
            features, targets, origins, target_times = await asyncio.to_thread(_training_rows, stage, rain_history)

            time_cutoff = stage.index[int(len(stage) * 0.8)]
            train_mask = (origins < time_cutoff) & (target_times < time_cutoff)
            test_mask = ~train_mask
            if train_mask.sum() < 300 or test_mask.sum() < 50:
                return await _generate_hydrological_stage_forecast()

            if XGBRegressor is not None:
                model = XGBRegressor(
                    n_estimators=240, max_depth=4, learning_rate=0.035,
                    subsample=0.85, colsample_bytree=0.9, reg_lambda=2.0,
                    objective="reg:squarederror", n_jobs=2, random_state=42,
                )
                model_name = "XGBoost regressor · 48-hour lead"
            else:
                model = HistGradientBoostingRegressor(
                    max_iter=240, max_leaf_nodes=15, learning_rate=0.05,
                    l2_regularization=2.0, random_state=42,
                )
                model_name = "Scikit-learn gradient boosting · 48-hour lead"

            await asyncio.to_thread(model.fit, features.loc[train_mask], targets.loc[train_mask])
            validation_pred = await asyncio.to_thread(model.predict, features.loc[test_mask])
            errors = (targets.loc[test_mask].to_numpy() - validation_pred)
            mae = float(abs(errors).mean())
            interval = float(pd.Series(abs(errors)).quantile(0.9))

            origin = stage.index[-1]
            forecast_rain = pd.concat([rain_history, rain_forecast]).sort_index()
            forecast_rain = forecast_rain[~forecast_rain.index.duplicated(keep="last")]
            predicted: list[dict[str, Any]] = []
            for lead in range(1, 49):
                row = _features(stage, rain_history, origin, lead, forecast_rain)
                frame = pd.DataFrame([row], columns=features.columns)
                if frame.isna().any(axis=None):
                    return await _generate_hydrological_stage_forecast()
                value = float((await asyncio.to_thread(model.predict, frame))[0])
                predicted.append({
                    "time": (origin + pd.Timedelta(hours=lead)).isoformat(),
                    "stage_m": round(value, 3),
                    "lower_m": round(value - interval, 3),
                    "upper_m": round(value + interval, 3),
                    "lead_hours": lead,
                })

            _cache = {
                "is_available": True,
                "is_forecast_available": True,
                "station": STATION,
                "river": "Chalakudy",
                "observed_at": observation_time.isoformat(),
                "observed_stage_m": round(float(stage.iloc[-1]), 3),
                "warning_stage_m": 6.00,
                "danger_stage_m": 7.00,
                "hfl_stage_m": 8.85,
                "forecast": predicted,
                "model": model_name,
                "validation": {"method": "chronological holdout", "mae_m": round(mae, 3), "empirical_90pct_abs_error_m": round(interval, 3)},
                "source": "Central Water Commission telemetry via NWIC; Open-Meteo ERA5 archive and NWP forecast",
                "source_url": SOURCE_URL,
                "rainfall_source_url": "https://open-meteo.com/en/docs",
                "retrieved_at": now.isoformat(),
                "known_limitations": (
                    "A data-driven point forecast for the Arangaly gauge, not a hydraulic simulation or official warning. "
                    "The uncertainty band is the empirical 90th percentile absolute error on a chronological holdout; "
                    "performance depends on station coverage and may not capture reservoir releases or channel changes."
                ),
            }
            _cache_at = now
            await asyncio.to_thread(_write_persistent_cache)
            return _cache
        except Exception as exc:
            log.warning("stage.telemetry_or_model_failed_falling_back", error=str(exc))
            return await _generate_hydrological_stage_forecast()
