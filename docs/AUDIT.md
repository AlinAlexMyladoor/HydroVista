# HydroVista upgrade — Phase 1 audit (FloodLensAI baseline)

Audited: 2026-10-15. Method: source read-through, test runs, grep, and an attempted external-reachability check.
Statuses: **V** implemented & verified · **U** implemented, unverified · **P** partial · **M** missing · **B** blocked externally.

## Baseline measurements (before any code change)
| Check | Result |
|---|---|
| Backend tests, fresh install from `requirements.txt` | **13 errors** — `aiosqlite` and `greenlet` missing from requirements |
| Backend tests after adding those two packages | **46 passed** |
| Frontend `tsc --noEmit` | clean |
| Frontend `eslint` | 12 errors, 52 warnings (`no-explicit-any`, unused imports) |
| Frontend `next build` | succeeds, 1 warning (maplibre-gl CSS vs serverExternalPackages); **1 route only (`/`)** |
| Frontend tests | **none exist** (no Vitest/Jest/Playwright in package.json) |

## Feature inventory
| Area | Status | Evidence |
|---|---|---|
| Rain Dial scenario endpoint | **P** | Honest labelling, deterministic. But `duration_hours` and `forecast_hour` are echoed, never used in the calculation. |
| Exposure scoring | **P** | Formula documented. **No caller passes `elevation_lookup`**, so every asset gets elevation=None → constant terrain factor 0.5 (40% of the score is inert). |
| Isolation Clock endpoint | **Defective** | `api/v1/isolation.py` builds a *synthetic star graph* (facility→anchor direct edges) and passes an empty susceptibility map. No facility can ever be disconnected. Warning text admits it, but the UI still renders results. |
| `services/isolation.py` + `geospatial/routing/network.py` (NetworkX logic) | **U** | Unit-tested on toy graphs only; never fed real OSM roads. |
| Weather adapter (Open-Meteo) | **U / B** | Code present; `data/latest_weather.json` exists but cannot be re-fetched here (api.open-meteo.com unreachable from sandbox). |
| OSM infrastructure (Overpass) | **U / B** | Code present; Overpass unreachable here. Falls back to `KNOWN_CHALAKUDY_ASSETS` (hand-written list) — fallback is flagged in warnings. |
| DEM / terrain | **M** | `geospatial/terrain/topography.py` has scalar helpers only; no raster read, no DEM download, no slope/HAND grids. `rasterio` is a dependency but unused. |
| Sentinel-1 / Copernicus ingestion | **M** | 38/46-line client stubs. |
| ML training (`ml/models/train.py`) | **P** | Pipeline code exists; no labels, no feature matrix, no artifact. |
| Model endpoints | **P** | Return hard-coded "untrained" JSON **without checking for an artifact**; would stay "untrained" even after training. Reference nonexistent `docs/model-card.md`. |
| SHAP | **M** | Code present, correctly gated; nothing to explain. |
| Citizen reports | **U** | Endpoint + form; persistence needs the DB (Postgres in `.env`, not available here). |
| Alembic | **M** | Dependency listed, no `alembic/` directory; tables created by `create_all`. |
| Frontend map | **Defective** | River centreline and two "arterial roads" are **hand-typed coordinates** in `FloodMap.tsx`; SH-21 is hard-coded `status: "flagged"`. No DEM, no terrain, no 3D. Popup falls back to the literal string `"SRTM-30"` when elevation is absent (implies a data source that isn't used). Uses `tile.openstreetmap.org` directly (tile-usage-policy risk). |
| Frontend navigation | **P** | Single route; sidebar swaps panels via Zustand. No URL state; Analytics / Scenarios / Infrastructure / About routes absent. |
| Design system | **P** | Palette is close to spec (`#246B62` vs `#155E59` primary, etc.), no tokens module, dark data-panel styling mixed in. |
| i18n | **P** | `translations.ts` (150 lines) covers en/ml for existing labels only. |
| 3D (Three.js / R3F), D3 | **M** | Not in dependencies. |
| Docker / CI | **U** | Files present; not run (no Docker in sandbox). CI runs backend tests only. |

## Secrets & distribution findings
- `.env` is byte-identical to `.env.example` → placeholders, no real credential detected. `.env` was **never committed** (git log clean).
- The uploaded 424 MB zip bundles `venv/` (~110k files), `node_modules/`, `.next/`, `.git/`, `.env`, `__MACOSX/`. None should ship.
- `backend/dev.db` and `test.db` were tracked in git → untracked in this branch (files left on disk).
- One uncommitted edit to `pipelines/update_exposure.py` existed; preserved in commit `de8037d` and on branch `backup/pre-hydrovista-audit`.
- `.env` points at PostgreSQL; no Postgres in the audit sandbox, tests use their own override.

## Fixes applied in Phase 1
1. `requirements.txt`: added `aiosqlite`, switched to `sqlalchemy[asyncio]` (greenlet), removed duplicate `httpx`.
2. `.gitignore`: `*.db`, `*.sqlite*`, `data/latest_*.json`, `tsbuildinfo`.
3. Untracked committed DB files.
Result: clean-venv install → **46 passed**.

## Not yet verified / external blockers
- Live Open-Meteo and Overpass calls (sandbox egress allowlist blocks both).
- Docker builds, Postgres, deployment.
- Any DEM or Sentinel-1 download (not attempted; network + credentials + size).
