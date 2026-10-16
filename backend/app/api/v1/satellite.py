"""Sentinel-1 / Sentinel-2 endpoints (CDSE). Secrets stay on the server."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Response

from app.core.config import settings
from app.services import cdse

router = APIRouter()


def _creds() -> bool:
    return bool(settings.CDSE_CLIENT_ID and settings.CDSE_CLIENT_SECRET)


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
    """PNG of the best recent scene over the basin bbox (EPSG:4326, bbox in X-Scene-Bbox)."""
    try:
        scenes = await cdse.search_scenes(sensor, settings.basin_bbox_list)  # type: ignore[arg-type]
        if not scenes:
            raise HTTPException(status_code=404, detail="No suitable Sentinel scene in the last 30 days (cloud/availability).")
        token = await cdse.get_token(settings.CDSE_CLIENT_ID, settings.CDSE_CLIENT_SECRET)
        png = await cdse.render_png(sensor, scenes[0].acquired, settings.basin_bbox_list, token)  # type: ignore[arg-type]
    except cdse.CDSEError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return Response(
        content=png,
        media_type="image/png",
        headers={
            "X-Scene-Acquired": scenes[0].acquired,
            "X-Scene-Id": scenes[0].id,
            "X-Scene-Bbox": ",".join(str(v) for v in settings.basin_bbox_list),
            "Cache-Control": "public, max-age=900",
            "Access-Control-Expose-Headers": "X-Scene-Acquired,X-Scene-Id,X-Scene-Bbox",
        },
    )
