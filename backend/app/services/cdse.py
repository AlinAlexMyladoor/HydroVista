"""
Copernicus Data Space Ecosystem (CDSE) client: Sentinel-1 GRD and Sentinel-2 L2A.

What this module does
  * Scene DISCOVERY via the public CDSE STAC catalogue (no credentials needed).
  * Server-side IMAGERY rendering via the CDSE Sentinel Hub Process API (needs OAuth
    client credentials: CDSE_CLIENT_ID / CDSE_CLIENT_SECRET, backend env only).

What it does NOT do
  * It does not claim "live" status because credentials exist. Status is derived from
    the last real catalogue/imagery call and always carries acquisition time and age.
  * The Sentinel-1 water mask is a fixed VV backscatter threshold for visual indication
    only. It is NOT a validated flood extent (no calibration against reference data,
    no speckle filtering beyond the service's, no permanent-water or terrain masking).

STATUS: written against the documented CDSE APIs but NOT yet exercised against the live
services from the build environment (network egress to CDSE was unavailable).
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import httpx

TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
STAC_SEARCH_URL = "https://stac.dataspace.copernicus.eu/v1/search"
PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process"

Sensor = Literal["s1", "s2"]
COLLECTION = {"s1": "sentinel-1-grd", "s2": "sentinel-2-l2a"}
TIMEOUT = httpx.Timeout(30.0, connect=10.0)

# Sentinel-2: true colour, cloud/shadow/cirrus/snow masked via SCL -> transparent.
EVALSCRIPT_S2 = """//VERSION=3
function setup(){return{input:["B04","B03","B02","SCL","dataMask"],output:{bands:4}};}
function evaluatePixel(s){
  var bad=[3,8,9,10,11];                      // shadow, cloud med/high, cirrus, snow
  var a=(s.dataMask==1 && bad.indexOf(s.SCL)<0)?1:0;
  return [2.5*s.B04,2.5*s.B03,2.5*s.B02,a];
}"""

# Sentinel-1: VV backscatter (dB) as greyscale; low-backscatter pixels tinted blue.
# Indicative only: open water is dark in VV but so are radar shadow, smooth tarmac, sand.
S1_WATER_DB = -18.0
EVALSCRIPT_S1 = """//VERSION=3
function setup(){return{input:["VV","dataMask"],output:{bands:4}};}
function evaluatePixel(s){
  var db=10*Math.log(Math.max(s.VV,1e-6))/Math.LN10;
  var g=Math.min(Math.max((db+25)/25,0),1);
  if(db < %(thr)s) return [0.1,0.45,0.85,s.dataMask*0.8];
  return [g,g,g,s.dataMask*0.9];
}""" % {"thr": S1_WATER_DB}


class CDSEError(Exception):
    """Raised with a human-readable reason that is safe to show in the UI."""


@dataclass
class SceneInfo:
    id: str
    sensor: str
    acquired: str
    cloud_cover: float | None
    processing_level: str
    platform: str | None
    bbox: list[float] | None
    score: float = 0.0


@dataclass
class _State:
    token: str | None = None
    token_exp: float = 0.0
    last_search_ok: str | None = None
    last_search_error: dict[str, str | None] = field(default_factory=lambda: {"s1": None, "s2": None})
    last_scene: dict[str, SceneInfo | None] = field(default_factory=lambda: {"s1": None, "s2": None})
    last_image_ok: dict[str, str | None] = field(default_factory=lambda: {"s1": None, "s2": None})
    last_image_error: dict[str, str | None] = field(default_factory=lambda: {"s1": None, "s2": None})


STATE = _State()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def rank_scenes(scenes: list[SceneInfo], now: datetime | None = None) -> list[SceneInfo]:
    """Rank by recency first, then lower cloud cover (S2). Pure function; unit-tested."""
    now = now or _now()
    for s in scenes:
        age_days = max((now - datetime.fromisoformat(s.acquired.replace("Z", "+00:00"))).total_seconds() / 86400, 0)
        cloud_pen = (s.cloud_cover or 0.0) / 100.0 * 10.0 if s.sensor == "s2" else 0.0
        s.score = -(age_days + cloud_pen)
    return sorted(scenes, key=lambda s: s.score, reverse=True)


def parse_stac_features(sensor: Sensor, features: list[dict[str, Any]]) -> list[SceneInfo]:
    out: list[SceneInfo] = []
    for f in features:
        p = f.get("properties", {}) or {}
        acquired = p.get("datetime") or p.get("start_datetime")
        if not acquired:
            continue
        out.append(
            SceneInfo(
                id=f.get("id", ""),
                sensor=sensor,
                acquired=acquired,
                cloud_cover=p.get("eo:cloud_cover"),
                processing_level="L2A" if sensor == "s2" else "GRD",
                platform=p.get("platform"),
                bbox=f.get("bbox"),
            )
        )
    return out


async def search_scenes(
    sensor: Sensor, bbox: list[float], days: int = 30, max_cloud: float = 60.0, client: httpx.AsyncClient | None = None
) -> list[SceneInfo]:
    """Search the CDSE STAC catalogue. Raises CDSEError with a reason on any failure."""
    end = _now()
    start = end - timedelta(days=days)
    body: dict[str, Any] = {
        "collections": [COLLECTION[sensor]],
        "bbox": bbox,
        "datetime": f"{start.strftime('%Y-%m-%dT%H:%M:%SZ')}/{end.strftime('%Y-%m-%dT%H:%M:%SZ')}",
        "limit": 50,
        "sortby": [{"field": "datetime", "direction": "desc"}],
    }
    if sensor == "s2":
        body["filter-lang"] = "cql2-json"
        body["filter"] = {"op": "<=", "args": [{"property": "eo:cloud_cover"}, max_cloud]}
    own = client is None
    client = client or httpx.AsyncClient(timeout=TIMEOUT)
    try:
        r = await client.post(STAC_SEARCH_URL, json=body)
        r.raise_for_status()
        scenes = rank_scenes(parse_stac_features(sensor, r.json().get("features", [])))
    except httpx.TimeoutException as e:
        STATE.last_search_error[sensor] = "CDSE catalogue timed out"
        raise CDSEError("CDSE catalogue timed out") from e
    except httpx.HTTPStatusError as e:
        msg = f"CDSE catalogue returned HTTP {e.response.status_code}"
        STATE.last_search_error[sensor] = msg
        raise CDSEError(msg) from e
    except (httpx.HTTPError, ValueError) as e:
        msg = f"CDSE catalogue unreachable: {type(e).__name__}"
        STATE.last_search_error[sensor] = msg
        raise CDSEError(msg) from e
    finally:
        if own:
            await client.aclose()
    STATE.last_search_ok = _now().isoformat()
    STATE.last_search_error[sensor] = None
    STATE.last_scene[sensor] = scenes[0] if scenes else None
    return scenes


async def get_token(client_id: str | None, client_secret: str | None, client: httpx.AsyncClient | None = None) -> str:
    if not (client_id and client_secret):
        raise CDSEError("CDSE_CLIENT_ID / CDSE_CLIENT_SECRET are not configured on the backend")
    if STATE.token and time.time() < STATE.token_exp - 30:
        return STATE.token
    own = client is None
    client = client or httpx.AsyncClient(timeout=TIMEOUT)
    try:
        r = await client.post(
            TOKEN_URL,
            data={"grant_type": "client_credentials", "client_id": client_id, "client_secret": client_secret},
        )
        if r.status_code in (400, 401):
            raise CDSEError("CDSE rejected the credentials (invalid or expired client secret)")
        r.raise_for_status()
        j = r.json()
        STATE.token = j["access_token"]
        STATE.token_exp = time.time() + float(j.get("expires_in", 300))
        return STATE.token
    except httpx.TimeoutException as e:
        raise CDSEError("CDSE token endpoint timed out") from e
    except (httpx.HTTPError, KeyError, ValueError) as e:
        raise CDSEError(f"CDSE token request failed: {type(e).__name__}") from e
    finally:
        if own:
            await client.aclose()


async def render_png(
    sensor: Sensor,
    scene_acquired: str,
    bbox: list[float],
    token: str,
    width: int = 1024,
    height: int = 1024,
    client: httpx.AsyncClient | None = None,
) -> bytes:
    """Render the acquisition's day over bbox as RGBA PNG via the Process API (EPSG:4326)."""
    t0 = datetime.fromisoformat(scene_acquired.replace("Z", "+00:00"))
    payload = {
        "input": {
            "bounds": {"bbox": bbox, "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"}},
            "data": [
                {
                    "type": "sentinel-2-l2a" if sensor == "s2" else "sentinel-1-grd",
                    "dataFilter": {
                        "timeRange": {
                            "from": (t0 - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "to": (t0 + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                        },
                        **({"acquisitionMode": "IW", "polarization": "DV", "resolution": "HIGH"} if sensor == "s1" else {}),
                    },
                    **({"processing": {"backCoeff": "GAMMA0_TERRAIN", "orthorectify": True}} if sensor == "s1" else {}),
                }
            ],
        },
        "output": {"width": width, "height": height, "responses": [{"identifier": "default", "format": {"type": "image/png"}}]},
        "evalscript": EVALSCRIPT_S2 if sensor == "s2" else EVALSCRIPT_S1,
    }
    own = client is None
    client = client or httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=10.0))
    try:
        r = await client.post(PROCESS_URL, json=payload, headers={"Authorization": f"Bearer {token}"})
        if r.status_code == 401:
            STATE.token = None
            raise CDSEError("CDSE token expired or invalid; retry")
        r.raise_for_status()
        if not r.content.startswith(b"\x89PNG"):
            raise CDSEError("Process API did not return a PNG")
        STATE.last_image_ok[sensor] = _now().isoformat()
        STATE.last_image_error[sensor] = None
        return r.content
    except httpx.TimeoutException as e:
        STATE.last_image_error[sensor] = "Process API timed out"
        raise CDSEError("CDSE Process API timed out") from e
    except httpx.HTTPStatusError as e:
        STATE.last_image_error[sensor] = f"Process API HTTP {e.response.status_code}"
        raise CDSEError(f"CDSE Process API returned HTTP {e.response.status_code}") from e
    except CDSEError as e:
        STATE.last_image_error[sensor] = str(e)
        raise
    except httpx.HTTPError as e:
        STATE.last_image_error[sensor] = type(e).__name__
        raise CDSEError(f"CDSE Process API unreachable: {type(e).__name__}") from e
    finally:
        if own:
            await client.aclose()


def sensor_status(sensor: Sensor, credentials_configured: bool) -> dict[str, Any]:
    """Truthful status: 'available' only after a real successful call, never from config alone."""
    scene = STATE.last_scene[sensor]
    age_h = None
    if scene:
        age_h = round((_now() - datetime.fromisoformat(scene.acquired.replace("Z", "+00:00"))).total_seconds() / 3600, 1)
    return {
        "sensor": sensor,
        "catalogue_ok": STATE.last_search_error[sensor] is None and STATE.last_search_ok is not None,
        "catalogue_error": STATE.last_search_error[sensor],
        "catalogue_last_success": STATE.last_search_ok,
        "credentials_configured": credentials_configured,
        "imagery_ok": STATE.last_image_ok[sensor] is not None and STATE.last_image_error[sensor] is None,
        "imagery_last_success": STATE.last_image_ok[sensor],
        "imagery_error": STATE.last_image_error[sensor],
        "latest_scene": scene.__dict__ if scene else None,
        "latest_scene_age_hours": age_h,
        "limitations": (
            "Optical imagery is cloud-masked (clouds are transparent). Revisit is ~5 days (S2) / ~6-12 days (S1); this is "
            "not a live feed."
            if sensor == "s2"
            else "SAR water tint is a fixed VV < %.0f dB threshold: indicative only, not a validated flood extent." % S1_WATER_DB
        ),
    }
