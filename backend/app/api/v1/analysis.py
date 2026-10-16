"""Flood analysis API: capabilities, runs, exports, model-lab experiments."""
from __future__ import annotations

import csv
import io
import json
import os
from dataclasses import fields
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from app.analysis import core, gee, runs

router = APIRouter()
EXPERIMENT_DIR = lambda: os.getenv("EXPERIMENT_DIR", "artifacts/experiments")  # noqa: E731


class RunRequest(BaseModel):
    west: float
    south: float
    east: float
    north: float
    pre_start: str
    pre_end: str
    event_start: str
    event_end: str
    orbit: Literal["ASCENDING", "DESCENDING", "ANY"] = "DESCENDING"
    threshold_db: float = Field(-16.0, ge=-30.0, le=-5.0)
    permanent_occurrence_pct: float = Field(90.0, ge=50.0, le=100.0)
    max_slope_deg: float = Field(5.0, ge=0.0, le=45.0)
    smooth_m: float = Field(0.0, ge=0.0, le=200.0)
    scale_m: int = Field(30, ge=10, le=100)


def _problem(status: int, code: str, message: str, errors: list[dict] | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": {"error": code, "message": message, "errors": errors or []}})


@router.get("/analysis/capabilities")
async def capabilities():
    cap = gee.capabilities()
    return {**cap, "datasets": {"sentinel1": gee.S1, "permanent_water": gee.GSW, "terrain": gee.SRTM}, "method": gee.METHOD,
            "limits": {"max_area_km2": 2500, "max_window_days": 92, "queue_limit": runs.MAX_ACTIVE, "cache_hours": runs.CACHE_HOURS}}


@router.post("/analysis/runs")
async def create_run(req: RunRequest):
    try:
        core.validate_bbox(req.west, req.south, req.east, req.north)
        core.validate_windows(req.pre_start, req.pre_end, req.event_start, req.event_end)
    except core.ValidationError as e:
        return _problem(422, "invalid_input", "The analysis request is invalid.", e.errors)
    cap = gee.capabilities()
    if not cap["ready"]:
        return _problem(503, "earth_engine_unavailable", "Earth Engine is not configured on the server: " + "; ".join(cap["blocking_reasons"]))
    params = {f.name: getattr(req, f.name) for f in fields(gee.FloodParams)}
    try:
        run = runs.submit(params)
    except runs.QueueFull as e:
        return _problem(429, "queue_full", str(e))
    return JSONResponse(status_code=200 if run.get("cache_hit") else 202, content=run)


@router.get("/analysis/runs")
async def list_runs(limit: int = 50):
    return {"runs": runs.list_runs(min(max(limit, 1), 200))}


@router.get("/analysis/runs/{run_id}")
async def get_run(run_id: str):
    r = runs.get_run(run_id)
    if not r:
        raise HTTPException(404, detail={"error": "not_found", "message": f"No analysis run {run_id}"})
    return r


@router.get("/analysis/runs/{run_id}/export.csv")
async def export_csv(run_id: str):
    r = runs.get_run(run_id)
    if not r:
        raise HTTPException(404, detail={"error": "not_found", "message": f"No analysis run {run_id}"})
    if r["status"] != "completed" or not r["result"]:
        raise HTTPException(409, detail={"error": "not_completed", "message": f"Run is {r['status']}; nothing to export"})
    res = r["result"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["run_id", "product", "validated", "metric", "value", "unit"])
    for k, v in res["areas_km2"].items():
        w.writerow([run_id, res["product"], res["validated"], k, f"{v:.6f}", "km2"])
    for k, v in res["scene_counts"].items():
        w.writerow([run_id, res["product"], res["validated"], f"scene_count_{k}", v, "scenes"])
    for k, v in res["parameters"].items():
        w.writerow([run_id, res["product"], res["validated"], f"param_{k}", v, ""])
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="hydrovista_{run_id}.csv"'})


@router.get("/model-lab/experiments")
async def experiments():
    """Real saved experiments only (artifacts/experiments/*.json). Empty list = nothing has been trained."""
    d = EXPERIMENT_DIR()
    out = []
    if os.path.isdir(d):
        for name in sorted(os.listdir(d), reverse=True):
            if name.endswith(".json"):
                try:
                    with open(os.path.join(d, name)) as f:
                        out.append(json.load(f))
                except (OSError, ValueError):
                    continue
    return {"experiments": out, "note": "Experiments are produced by `python -m app.analysis.ml_lab train --csv <labelled features>`; none are pre-loaded." if not out else None}
