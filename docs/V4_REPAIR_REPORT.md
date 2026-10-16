# HydroVista v4 repair report

Status legend: **T** implemented + tested here · **U** implemented, unverified (needs your browser/credentials) · **B** blocked · **N** not implemented

| Feature | Status | Notes |
|---|---|---|
| Cross-section "shader error" | **U** | Root cause: `loseContext()` in effect cleanup + React StrictMode re-acquiring the same dead context (and re-running on every exaggeration change). Fixed; program built once, buffers re-uploaded per mesh, context-restore handled, real info logs surfaced, 2D profile fallback. tsc/build pass; **not seen in a browser** |
| Risk card fabricated "probability" (rain/120×100) | **T** (build) | Removed. Shows forecast mm, heuristic category, explicit no-data states |
| "Rainfall (min–max)" invented ×1.18 range | **T** (build) | Removed |
| "Flooded area" tile showing a road count | **T** (build) | Replaced with "No model" state |
| Contradictory forecast/risk states | **U** | Risk category hidden when forecast missing; timestamps shown |
| "Observed" legend without observations | **T** (build) | Only shown if hourly rows are non-forecast, labelled "model analysis, not gauge data" |
| COP-DEM label vs Terrarium tiles | **T** (build) | Relabelled everywhere; backend registry corrected |
| Hard-coded "available" sources | **T** | Registry is call-derived; `/data-sources` and `/status` share one source (pytest) |
| Fabricated sample citizen reports | **T** (build) | Removed; empty state instead |
| `DEMIngestion` synthetic elevation claiming Copernicus | **T** | Marked synthetic test fixture, `is_operational=False` |
| Sentinel-1/2 catalogue search (CDSE STAC) | **U** | Implemented + unit-tested with mocked HTTP; never called against live CDSE (no network egress here) |
| Sentinel imagery via Process API + map layer | **U / B** | Implemented; needs `CDSE_CLIENT_ID/SECRET`. S1 water tint is a fixed −18 dB threshold: indicative only |
| Map terrain camera (pitch 62, bearing 70, ×2.0, eastward view) | **U** | Defaults changed; visual result unverified |
| Flood inundation overlay / depth / affected population | **B** | Needs a validated hydraulic model or observed flood dataset. Not invented |
| Rain Dial duration | **T** (found) | Duration does **not** affect results; now disclosed in API assumptions. Real intensity-duration logic not implemented |
| Isolation Clock vs road graph | **N** | Not re-audited this pass |
| Every-button audit, automated UI tests | **N** | Needs a browser; not done |
| Reference-layout restyle, responsive pass | **N** | Not done |
| Malayalam completeness | **N** | Not audited |

## Tests run
- `web`: `tsc --noEmit` clean, 8 unit tests pass, `next build` succeeds. `eslint`: 21 errors / 73 warnings remain (pre-existing; none in files changed for this report's lint-checked list).
- `backend`: 44 pytest pass (incl. 7 new). Root `tests/`: 9 pass.

## Run
`cd backend && uvicorn app.main:app --reload` · `cd web && npm i && npm run dev`
Optional satellite: set `CDSE_CLIENT_ID`/`CDSE_CLIENT_SECRET` in `backend/.env`.
