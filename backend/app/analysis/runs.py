"""
Persistent analysis runs + a small in-process job runner.

  * Runs are stored in SQLite (stdlib) with parameters, status, timings, result and error.
    (Blueprint's PostgreSQL/PostGIS + Celery/Redis is the production target; this is the
    "simpler task queue initially" step and keeps the same record schema.)
  * Statuses: queued -> running -> completed | failed.
  * Identical parameters reuse a completed run younger than CACHE_HOURS (flagged cache_hit).
  * Transient failures are retried with backoff; config/validation/no-scene errors are not.
"""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

import structlog

from app.analysis import gee
from app.analysis.core import ValidationError

log = structlog.get_logger(__name__)
CACHE_HOURS = 24
MAX_ACTIVE = 5
MAX_ATTEMPTS = 3
_lock = threading.Lock()
_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="analysis")


class QueueFull(RuntimeError):
    pass


def _db_path() -> str:
    return os.getenv("ANALYSIS_DB_PATH", "data/analysis_runs.sqlite")


def _conn() -> sqlite3.Connection:
    path = _db_path()
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    c = sqlite3.connect(path, timeout=30)
    c.row_factory = sqlite3.Row
    c.execute(
        """CREATE TABLE IF NOT EXISTS runs(
            id TEXT PRIMARY KEY, params_hash TEXT, params TEXT, status TEXT,
            created_at TEXT, started_at TEXT, finished_at TEXT, attempts INTEGER DEFAULT 0,
            result TEXT, error TEXT, error_code TEXT, cache_of TEXT)"""
    )
    return c


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def params_hash(params: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()


def _row(r: sqlite3.Row) -> dict[str, Any]:
    d = dict(r)
    d["params"] = json.loads(d["params"])
    d["result"] = json.loads(d["result"]) if d["result"] else None
    return d


def get_run(run_id: str) -> dict[str, Any] | None:
    with _conn() as c:
        r = c.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
    return _row(r) if r else None


def list_runs(limit: int = 50) -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute("SELECT * FROM runs ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    out = []
    for r in rows:
        d = _row(r)
        d.pop("result", None)  # list view stays light; fetch a run for its result
        out.append(d)
    return out


def _update(run_id: str, **fields: Any) -> None:
    sets = ", ".join(f"{k}=?" for k in fields)
    with _conn() as c:
        c.execute(f"UPDATE runs SET {sets} WHERE id=?", (*fields.values(), run_id))


def _execute(run_id: str, params: dict[str, Any], fn: Callable[[gee.FloodParams], dict[str, Any]], sleep: Callable[[float], None]) -> None:
    _update(run_id, status="running", started_at=_now())
    t0 = time.perf_counter()
    for attempt in range(1, MAX_ATTEMPTS + 1):
        _update(run_id, attempts=attempt)
        try:
            result = fn(gee.FloodParams(**params))
            result["run"] = {"id": run_id, "seconds_total": round(time.perf_counter() - t0, 1), "attempts": attempt}
            _update(run_id, status="completed", finished_at=_now(), result=json.dumps(result), error=None, error_code=None)
            log.info("analysis.completed", run_id=run_id, seconds=round(time.perf_counter() - t0, 1), attempts=attempt)
            return
        except (gee.EEUnavailable, gee.NoScenesError, ValidationError) as e:  # not retryable
            code = {"EEUnavailable": "earth_engine_unavailable", "NoScenesError": "no_scenes", "ValidationError": "invalid_input"}[type(e).__name__]
            _update(run_id, status="failed", finished_at=_now(), error=str(e), error_code=code)
            log.warning("analysis.failed", run_id=run_id, code=code, error=str(e))
            return
        except Exception as e:  # assumed transient (network/EE quota/timeouts)
            log.warning("analysis.attempt_failed", run_id=run_id, attempt=attempt, error=str(e))
            if attempt == MAX_ATTEMPTS:
                _update(run_id, status="failed", finished_at=_now(), error=f"{type(e).__name__}: {e} (after {attempt} attempts)", error_code="processing_failed")
                return
            sleep(2**attempt)


def submit(
    params: dict[str, Any],
    fn: Callable[[gee.FloodParams], dict[str, Any]] = gee.run_flood_analysis,
    run_inline: bool = False,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    h = params_hash(params)
    with _lock:
        with _conn() as c:
            cutoff = (datetime.now(timezone.utc) - timedelta(hours=CACHE_HOURS)).isoformat()
            hit = c.execute(
                "SELECT id FROM runs WHERE params_hash=? AND status='completed' AND finished_at>? ORDER BY finished_at DESC LIMIT 1", (h, cutoff)
            ).fetchone()
            if hit:
                run = get_run(hit["id"]) or {}
                run["cache_hit"] = True
                return run
            active = c.execute("SELECT COUNT(*) n FROM runs WHERE status IN ('queued','running')").fetchone()["n"]
            if active >= MAX_ACTIVE:
                raise QueueFull(f"{active} analyses are already queued or running (limit {MAX_ACTIVE}); try again shortly")
            run_id = uuid.uuid4().hex[:12]
            c.execute("INSERT INTO runs(id, params_hash, params, status, created_at) VALUES(?,?,?,?,?)", (run_id, h, json.dumps(params), "queued", _now()))
    if run_inline:
        _execute(run_id, params, fn, sleep)
    else:
        _pool.submit(_execute, run_id, params, fn, sleep)
    run = get_run(run_id) or {}
    run["cache_hit"] = False
    return run
