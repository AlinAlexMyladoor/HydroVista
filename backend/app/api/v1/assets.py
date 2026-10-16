"""Assets API endpoints — infrastructure from OpenStreetMap."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.models import Asset
from app.services.osm import fetch_infrastructure, OSMDataError
from app.core.config import settings
from app.schemas.schemas import AssetDetail, PaginationMeta

log = structlog.get_logger(__name__)
router = APIRouter()

# In-memory asset cache (refreshed on demand or at startup)
_asset_cache: list[dict] | None = None
_asset_cache_timestamp: datetime | None = None
ASSET_CACHE_TTL_SECONDS = 3600  # 1 hour


async def _get_or_fetch_assets() -> tuple[list[dict], list[str]]:
    """Return assets from cache or fetch from OSM."""
    global _asset_cache, _asset_cache_timestamp

    now = datetime.now(timezone.utc)
    if _asset_cache is not None:
        age = (now - _asset_cache_timestamp).total_seconds() if _asset_cache_timestamp else ASSET_CACHE_TTL_SECONDS + 1
        if age < ASSET_CACHE_TTL_SECONDS:
            return _asset_cache, []

    try:
        result = await fetch_infrastructure(
            bbox=tuple(settings.basin_bbox_list),  # type: ignore
        )
        features = result.get("features", [])
        warnings = result.get("warnings", []) + result.get("errors", [])

        _asset_cache = features
        _asset_cache_timestamp = now
        log.info("assets.cache_refreshed", count=len(features))
        return features, warnings

    except OSMDataError as exc:
        log.error("assets.osm_failed", error=str(exc))
        if _asset_cache:
            return _asset_cache, [f"Using cached data (OSM refresh failed: {exc})"]
        return [], [f"Asset data unavailable: {exc}"]

    except Exception as exc:
        log.error("assets.unexpected_error", error=str(exc))
        if _asset_cache:
            return _asset_cache, [f"Using cached data (error: {exc})"]
        return [], [f"Unexpected error: {exc}"]


@router.get("/assets")
async def list_assets(
    asset_type: Optional[str] = Query(None, description="Filter by type: hospital|school|shelter|emergency"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """
    List infrastructure assets from OpenStreetMap.
    Source: Overpass API (© OpenStreetMap contributors, ODbL).
    """
    assets, warnings = await _get_or_fetch_assets()

    if asset_type:
        assets = [a for a in assets if a.get("asset_type") == asset_type]

    total = len(assets)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = assets[start:end]

    return {
        "items": page_items,
        "meta": {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
        },
        "warnings": warnings,
        "source": "OpenStreetMap (Overpass API)",
        "license": "ODbL — © OpenStreetMap contributors",
        "cached_at": _asset_cache_timestamp.isoformat() if _asset_cache_timestamp else None,
        "limitations": [
            "OSM completeness varies. Some facilities may be absent.",
            "Shelter data is often incomplete in OSM.",
            "is_verified=False for all features; independent verification recommended.",
        ],
    }


@router.get("/assets/{asset_id}")
async def get_asset(asset_id: str):
    """Get a single asset by OSM ID."""
    assets, warnings = await _get_or_fetch_assets()
    match = next((a for a in assets if a.get("osm_id") == asset_id), None)
    if match is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "asset_not_found", "osm_id": asset_id},
        )
    return {**match, "warnings": warnings}


@router.post("/assets/refresh")
async def refresh_assets():
    """Force refresh of asset cache from OSM."""
    global _asset_cache, _asset_cache_timestamp
    _asset_cache = None
    _asset_cache_timestamp = None
    assets, warnings = await _get_or_fetch_assets()
    return {
        "status": "refreshed",
        "count": len(assets),
        "warnings": warnings,
        "cached_at": _asset_cache_timestamp.isoformat() if _asset_cache_timestamp else None,
    }
