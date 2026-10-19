"""API v1 router — aggregates all endpoint modules."""
from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.health import router as health_router
from app.api.v1.forecast import router as forecast_router
from app.api.v1.assets import router as assets_router
from app.api.v1.exposure import router as exposure_router
from app.api.v1.isolation import router as isolation_router
from app.api.v1.scenario import router as scenario_router
from app.api.v1.model import router as model_router
from app.api.v1.historical import router as historical_router
from app.api.v1.reports import router as reports_router
from app.api.v1.brief import router as brief_router
from app.api.v1.satellite import router as satellite_router
from app.api.v1.analysis import router as analysis_router
from app.api.v1.assistant import router as assistant_router

router = APIRouter()

router.include_router(health_router, tags=["health"])
router.include_router(forecast_router, tags=["forecast"])
router.include_router(assets_router, tags=["assets"])
router.include_router(exposure_router, tags=["exposure"])
router.include_router(isolation_router, tags=["isolation"])
router.include_router(scenario_router, tags=["scenario"])
router.include_router(model_router, tags=["model"])
router.include_router(historical_router, tags=["historical"])
router.include_router(reports_router, tags=["reports"])
router.include_router(brief_router, tags=["brief"])
router.include_router(satellite_router, tags=["satellite"])
router.include_router(analysis_router, tags=["analysis"])
router.include_router(assistant_router, tags=["assistant"])
