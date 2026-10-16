# HydroVista v5 — blueprint implementation report

Legend: **T** implemented + tested here · **U** implemented, unverified (needs Earth Engine / your browser) · **B** blocked on data/credentials · **N** not implemented

| Blueprint item | Status | Where / notes |
|---|---|---|
| Geometry + date validation, area (km²), unit/area maths | **T** | `backend/app/analysis/core.py`, 14 tests |
| Tri-state classification (missing ≠ dry), permanent-water & slope masks, Otsu, change detection | **T** | `core.py` |
| Metrics: precision/recall/F1/IoU/confusion, undefined → null | **T** | `core.binary_metrics` |
| Raster→vector (GeoJSON) | **T** (library fn) | `core.mask_to_geojson`; not yet exposed as an API download |
| Earth Engine Sentinel-1 pipeline (scene counts/dates, composites, threshold, JRC, slope, area, tiles) | **U** | `analysis/gee.py`; never run (no EE account here). Smoke test: `python -m app.analysis.gee --smoke` |
| Async jobs: queued/running/completed/failed, retries+backoff, cache, queue limit, structured errors, persisted runs, timing logs | **T** | `analysis/runs.py` (SQLite + thread pool), tested with injected fakes |
| API: capabilities, create/list/get run, CSV export, 422/503/429/404 structured errors | **T** | `api/v1/analysis.py` |
| Flood Analysis Workspace page (params, run history, polling, result map, areas table, provenance) | **U** | build/typecheck pass; not seen in a browser |
| Model Lab: grouped-split Random Forest vs threshold baseline, per-region metrics, provenance, saved experiments | **T** | `analysis/ml_lab.py`; tested on synthetic data **in tests only** |
| Model Lab page (comparison, confusion matrices, feature importance, empty state) | **U** | empty until you train |
| Trained model / reported accuracy | **B** | needs your independent labelled flood table — none exists, so **no accuracy number is shown anywhere** |
| Methodology page | **T** (build) | `MethodologyView.tsx` |
| Sentinel-2 MNDWI analysis | **N** | only the CDSE true-colour layer from v4 exists; no water-index pipeline |
| Susceptibility model, impact/exposure overlay on flood extent, population | **N / B** | not built |
| GeoJSON/raster export, PostGIS, Celery/Redis | **N** | SQLite + threads is the stated first step |
| Design restyle to new palette / reference image | **N** | existing UI kept; new pages use blueprint palette |
| Removed fabricated data | **T** | Infrastructure fallback "demo assets" (made-up elevations) deleted; empty state instead |
| Your map-style workarounds in v5 (`style-liberty.json`, missing-image handler) | kept | unchanged |

## Tests
- backend `pytest`: 70 pass (new: 14 core, 12 pipeline/API/ML). Root `tests/`: unchanged.
- web: `tsc` clean, 8 unit tests pass, `next build` succeeds, new files lint-clean (1 warning).

## To make the first real analysis
1. `pip install earthengine-api`; `earthengine authenticate`; set `EE_PROJECT_ID`.
2. `python -m app.analysis.gee --smoke` → expect a non-zero scene count.
3. Open **Flood Analysis**, keep the example Aug-2018 inputs, Run. Compare the area to a trusted reference before trusting it.
4. For ML: build a labelled CSV (see Model Lab page), run `python -m app.analysis.ml_lab train --csv …`.
