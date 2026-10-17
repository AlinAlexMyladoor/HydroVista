"""Database session and engine setup."""
from __future__ import annotations

import asyncio
import os
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.engine import make_url

from app.core.config import settings

db_url = os.getenv("DATABASE_URL", settings.DATABASE_URL)

# Fallback to local SQLite if postgresql is requested but asyncpg isn't installed
if "postgresql" in db_url:
    try:
        import asyncpg
    except ImportError:
        db_url = "sqlite+aiosqlite:///./dev.db"

# SQLite does not create missing parent directories. Resolve and create the
# configured database directory before SQLAlchemy opens the first connection.
if db_url.startswith("sqlite"):
    sqlite_url = make_url(db_url)
    sqlite_path = sqlite_url.database
    if sqlite_path and sqlite_path != ":memory:":
        sqlite_path = Path(sqlite_path).expanduser()
        if not sqlite_path.is_absolute():
            # Resolve relative SQLite URLs from the backend directory, not
            # whichever directory happened to launch uvicorn.
            sqlite_path = Path(__file__).resolve().parents[2] / sqlite_path
        sqlite_path = sqlite_path.resolve()
        sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        db_url = str(sqlite_url.set(database=str(sqlite_path)))

if "sqlite" in db_url:
    engine = create_async_engine(
        db_url,
        echo=False,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_async_engine(
        db_url,
        echo=settings.ENVIRONMENT == "development",
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


_schema_ready = False
_schema_lock = asyncio.Lock()


async def ensure_schema() -> None:
    """Create missing tables even when the ASGI server has lifespan disabled."""
    global _schema_ready
    if _schema_ready:
        return
    async with _schema_lock:
        if _schema_ready:
            return
        # Import models here as well as through API routers so metadata is
        # complete for CLI tools and servers started with --lifespan off.
        from app.models import models as _models  # noqa: F401

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        _schema_ready = True


async def get_db() -> AsyncSession:
    await ensure_schema()
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
