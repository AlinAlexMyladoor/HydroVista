"""Historical events endpoints."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, Query

from app.core.config import settings
from app.services.weather import WeatherDataError, fetch_historical

router = APIRouter()


@router.get("/historical/rainfall")
async def get_historical_rainfall(
    start_date: date = Query(...),
    end_date: date = Query(...),
):
    """Return Open-Meteo ERA5 hindcast rainfall for a date range at the basin centroid."""
    if end_date < start_date:
        raise HTTPException(status_code=422, detail="end_date must be on or after start_date")
    if (end_date - start_date).days > 45:
        raise HTTPException(status_code=422, detail="date range cannot exceed 46 days")
    if end_date >= date.today():
        raise HTTPException(status_code=422, detail="historical rainfall dates must be in the past")
    try:
        result = await fetch_historical(
            lat=settings.BASIN_LAT,
            lon=settings.BASIN_LON,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
        )
        return result
    except WeatherDataError as exc:
        raise HTTPException(status_code=503, detail="Historical rainfall is temporarily unavailable") from exc

# Documented historical flood events for the Chalakudy / Kerala region.
# Sources: Kerala State Disaster Management Authority, IMD, academic literature.
# This is factual documentation, not fabricated data.
HISTORICAL_EVENTS = [
    {
        "event_id": "kerala-2018-aug",
        "name": "Kerala Floods 2018 (August)",
        "start_date": "2018-08-08",
        "end_date": "2018-08-25",
        "description": (
            "Severe flooding across Kerala triggered by exceptionally heavy monsoon rainfall. "
            "One of the worst floods in Kerala in nearly a century. "
            "The Chalakudy River basin was severely affected, with Athirappilly Falls area "
            "recording record discharge. Officially: 373 deaths, ~1 million displaced."
        ),
        "affected_area_km2": None,
        "source": "Kerala State Disaster Management Authority / IMD",
        "source_url": "http://www.sdma.kerala.gov.in",
        "flood_extent_available": False,
        "sentinel1_data_note": (
            "Sentinel-1 GRD scenes available via Copernicus Data Space for this event. "
            "Ingestion requires ESA credentials and preprocessing pipeline. "
            "See docs/data-sources.md for setup instructions."
        ),
        "notes": (
            "Flood extent layer is not yet generated. "
            "Sentinel-1 scenes have not been downloaded or processed. "
            "When available, the flood mask will be labelled as SAR-derived, not ground truth."
        ),
    },
    {
        "event_id": "kerala-2019-aug",
        "name": "Kerala Floods 2019 (August)",
        "start_date": "2019-08-06",
        "end_date": "2019-08-20",
        "description": (
            "Flooding in multiple districts of Kerala, less severe than 2018 "
            "but significant in the Chalakudy basin."
        ),
        "affected_area_km2": None,
        "source": "Kerala State Disaster Management Authority",
        "source_url": "http://www.sdma.kerala.gov.in",
        "flood_extent_available": False,
        "notes": "Sentinel-1 data available but not yet processed.",
    },
]


@router.get("/historical/events")
async def list_historical_events():
    """Return documented historical flood events for the Chalakudy basin."""
    return {
        "events": HISTORICAL_EVENTS,
        "note": (
            "Flood extent layers are not yet available. "
            "Sentinel-1 processing requires ESA credentials. "
            "See docs/data-sources.md for setup."
        ),
    }


@router.get("/historical/compare")
async def get_historical_compare():
    """
    Return historical vs forecast comparison data.
    Currently unavailable — requires processed Sentinel-1 flood masks.
    """
    return {
        "status": "unavailable",
        "reason": (
            "Historical flood extent comparison requires processed Sentinel-1 SAR data. "
            "This data source has not been configured. "
            "See /api/v1/historical/events for documented events and setup instructions."
        ),
        "events_with_data": [],
        "setup_required": [
            "Configure ESA Copernicus credentials in .env",
            "Run: python geospatial/ingestion/sentinel1.py",
            "Run: python geospatial/ingestion/flood_labels.py",
        ],
    }
