"""Sentinel-1 / Sentinel-2 endpoints (CDSE). Secrets stay on the server."""
from __future__ import annotations

import asyncio
import math

import httpx
from fastapi import APIRouter, HTTPException, Query, Response

from app.analysis import gee
from app.core.config import settings
from app.services import cdse
import structlog

router = APIRouter()
log = structlog.get_logger(__name__)
_TRANSPARENT_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000b49444154789c636000020000050001a5f645400000000049454e44ae426082"
)


def _creds() -> bool:
    return bool(settings.CDSE_CLIENT_ID and settings.CDSE_CLIENT_SECRET)


def _image_bbox() -> list[float]:
    """Return a finite [west, south, east, north] image extent."""
    try:
        bbox = [float(v) for v in settings.basin_bbox_list]
        west, south, east, north = bbox
        if (all(map(math.isfinite, bbox)) and -180 <= west < east <= 180
                and -90 <= south < north <= 90):
            return bbox
    except (TypeError, ValueError):
        pass
    return [-180.0, -85.0, 180.0, 85.0]


def _empty_image() -> Response:
    return Response(content=_TRANSPARENT_PNG, media_type="image/png", headers={
        "Cache-Control": "public, max-age=300",
        "X-Satellite-Status": "unavailable",
        "X-Scene-Bbox": ",".join(map(str, _image_bbox())),
            "Access-Control-Expose-Headers": "X-Scene-Acquired,X-Scene-Id,X-Scene-Bbox,X-Satellite-Status,X-Satellite-Source",
    })


@router.get("/satellite/status")
async def satellite_status():
    return {
        "s1": cdse.sensor_status("s1", _creds()),
        "s2": cdse.sensor_status("s2", _creds()),
        "bbox": settings.basin_bbox_list,
        "note": "Status reflects the last real call; run /satellite/scenes to refresh.",
    }


@router.get("/satellite/scenes")
async def satellite_scenes(sensor: str = Query("s2", pattern="^(s1|s2)$"), days: int = Query(30, ge=1, le=120)):
    try:
        scenes = await cdse.search_scenes(sensor, settings.basin_bbox_list, days=days)  # type: ignore[arg-type]
    except cdse.CDSEError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"sensor": sensor, "count": len(scenes), "scenes": [s.__dict__ for s in scenes[:10]], "bbox": settings.basin_bbox_list}


@router.get("/satellite/image")
async def satellite_image(sensor: str = Query("s2", pattern="^(s1|s2)$")):
    """Recent Sentinel PNG, using Earth Engine RGB when CDSE credentials are absent."""
    bbox = _image_bbox()
    png: bytes | None = None
    acquired: str | None = None
    scene_id: str | None = None
    provider = "CDSE"
    try:
        if _creds():
            scenes = await cdse.search_scenes(sensor, bbox)
            if scenes:
                token = await cdse.get_token(settings.CDSE_CLIENT_ID, settings.CDSE_CLIENT_SECRET)
                png = await cdse.render_png(sensor, scenes[0].acquired, bbox, token)
                acquired, scene_id = scenes[0].acquired, scenes[0].id
    except Exception as e:
        log.warning("satellite.cdse_unavailable", sensor=sensor, error=str(e))

    # CDSE Process API needs separate OAuth credentials. Earth Engine is already
    # configured for this deployment, so use its Sentinel-2 SR collection to
    # render a real cloud-masked RGB composite instead of returning a blank tile.
    if png is None and sensor == "s2":
        try:
            thumbnail_url, acquired = await asyncio.to_thread(gee.sentinel2_thumbnail_url, bbox)
            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
                image_response = await client.get(thumbnail_url)
                image_response.raise_for_status()
                if not image_response.content.startswith(b"\x89PNG\r\n\x1a\n"):
                    raise RuntimeError("Earth Engine returned a non-PNG thumbnail")
                png = image_response.content
            provider = "Google Earth Engine"
        except Exception as e:
            log.warning("satellite.earth_engine_unavailable", sensor=sensor, error=str(e))

    if png is None:
        return _empty_image()
    return Response(
        content=png,
        media_type="image/png",
        headers={
            "X-Scene-Acquired": acquired or "unknown",
            "X-Scene-Id": scene_id or "earth-engine-composite",
            "X-Scene-Bbox": ",".join(str(v) for v in bbox),
            "X-Satellite-Status": "available",
            "X-Satellite-Source": provider,
            "Cache-Control": "public, max-age=900",
            "Access-Control-Expose-Headers": "X-Scene-Acquired,X-Scene-Id,X-Scene-Bbox,X-Satellite-Status,X-Satellite-Source",
        },
    )
