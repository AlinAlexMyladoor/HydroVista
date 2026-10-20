"""
FloodLens AI – Backend Application Entry Point
"""
from __future__ import annotations

import time
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
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
        from app.api.v1.forecast import _load_persistent_forecast_cache

        _load_persistent_forecast_cache()
    except Exception as e:  # noqa: BLE001
        log.warning("forecast.preload_failed", error=str(e))
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

class UniversalCORSMiddleware:
    """Outermost ASGI middleware ensuring every request (especially OPTIONS preflight)
    and response unconditionally receives full CORS access control headers."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        origin_bytes = headers.get(b"origin")
        origin = origin_bytes.decode("latin1") if origin_bytes else None

        allow_origin = None
        if origin:
            if (
                origin.endswith(".vercel.app")
                or "localhost" in origin
                or "127.0.0.1" in origin
                or origin in settings.API_CORS_ORIGINS_LIST
                or "hydro-vista" in origin
            ):
                allow_origin = origin
            else:
                allow_origin = origin

        # Handle preflight OPTIONS immediately with zero overhead
        if scope["method"] == "OPTIONS":
            resp_headers = [
                (b"access-control-allow-origin", allow_origin.encode("latin1") if allow_origin else b"*"),
                (b"access-control-allow-methods", b"GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD"),
                (b"access-control-allow-headers", b"*"),
                (b"access-control-allow-credentials", b"true"),
                (b"access-control-max-age", b"86400"),
                (b"content-length", b"0"),
                (b"content-type", b"text/plain; charset=utf-8"),
            ]
            await send({
                "type": "http.response.start",
                "status": 200,
                "headers": resp_headers,
            })
            await send({"type": "http.response.body", "body": b""})
            return

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                resp_headers = list(message.get("headers", []))
                has_cors = any(h[0].lower() == b"access-control-allow-origin" for h in resp_headers)
                if not has_cors and allow_origin:
                    resp_headers.append((b"access-control-allow-origin", allow_origin.encode("latin1")))
                    resp_headers.append((b"access-control-allow-credentials", b"true"))
                    resp_headers.append((b"access-control-allow-methods", b"GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD"))
                    resp_headers.append((b"access-control-allow-headers", b"*"))
                    resp_headers.append((b"vary", b"Origin"))
                message["headers"] = resp_headers
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:
            log.error("server.fatal_unhandled", error=str(exc))
            resp_headers = [
                (b"content-type", b"application/json"),
                (b"access-control-allow-origin", allow_origin.encode("latin1") if allow_origin else b"*"),
                (b"access-control-allow-credentials", b"true"),
                (b"access-control-allow-methods", b"GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD"),
                (b"access-control-allow-headers", b"*"),
            ]
            body = b'{"detail":"Internal server error"}'
            resp_headers.append((b"content-length", str(len(body)).encode("latin1")))
            await send({
                "type": "http.response.start",
                "status": 500,
                "headers": resp_headers,
            })
            await send({"type": "http.response.body", "body": body})


app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.API_CORS_ORIGINS_LIST,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)
app.add_middleware(UniversalCORSMiddleware)



@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    log.error("server.unhandled_exception", path=request.url.path, error=str(exc))
    origin = request.headers.get("origin")
    headers = {
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
    }
    if origin:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": type(exc).__name__},
        headers=headers,
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
