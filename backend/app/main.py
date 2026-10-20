"""
FloodLens AI – Backend Application Entry Point
"""
from __future__ import annotations

import time
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import settings
from app.core.logging import configure_logging
from app.api.v1 import router as api_v1_router
from app.db.session import engine, Base

configure_logging()
log = structlog.get_logger(__name__)

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("floodlens.startup", version=settings.APP_VERSION, env=settings.ENVIRONMENT)
    # Create tables if they do not exist (dev convenience; use Alembic in prod)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    log.info("floodlens.db_ready")
    try:
        from app.analysis import runs as analysis_runs

        analysis_runs.recover_orphans()
    except Exception as e:  # noqa: BLE001 - never block API start-up on housekeeping
        log.warning("analysis.recover_failed", error=str(e))
    try:
        from app.analysis import gee

        cap = gee.capabilities()
        if cap["ready"]:
            gee.init_ee()
            log.info("earth_engine.ready")
        else:
            log.info("earth_engine.unavailable", reasons=cap["blocking_reasons"])
    except Exception as e:  # noqa: BLE001 - external credentials must not prevent API startup
        log.warning("earth_engine.initialisation_failed", error=str(e))
    yield
    log.info("floodlens.shutdown")
    await engine.dispose()


app = FastAPI(
    title="FloodLens AI API",
    description=(
        "Flood Risk & Infrastructure Accessibility Intelligence for the "
        "Chalakudy River basin, Kerala, India. Research prototype — not an "
        "officially validated flood-warning service."
    ),
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ─── Middleware ────────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.API_CORS_ORIGINS_LIST,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_request_timing(request: Request, call_next) -> Response:
    start = time.perf_counter()
    response: Response = await call_next(request)
    elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
    response.headers["X-Response-Time-Ms"] = str(elapsed_ms)
    log.info(
        "http.request",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        ms=elapsed_ms,
    )
    return response


# ─── Routes ───────────────────────────────────────────────────────────────────
app.include_router(api_v1_router, prefix="/api/v1")


@app.get("/", tags=["root"])
async def root():
    return {
        "service": "FloodLens AI",
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "status": "/api/v1/health",
        "disclaimer": (
            "Research prototype. Not an officially validated flood-warning service."
        ),
    }
