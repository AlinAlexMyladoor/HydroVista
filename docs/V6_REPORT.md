# HydroVista v6 — report

Legend: **T** implemented + tested here · **U** implemented, not runnable here (needs Earth Engine / browser / FastAPI install) · **B** blocked on your data

| Item | Status | Where |
|---|---|---|
| Change-based candidate water (event < thr AND drop ≥ `min_drop_db` AND pre ≥ thr) | **U** (EE) / **T** (numpy twin) | `analysis/gee.py`, `core.newly_inundated` |
| NODATA kept distinct from dry (`class` band 1/0/−1, `no_observation` km², grey tile) | **U** (EE) / **T** (numpy) | `gee.py`, `core.py` |
| JRC permanent-water exclusion kept | **U** | `gee.py` |
| Candidate polygons (`reduceToVectors`, largest 3000, truncation reported) → file → API | **U** (EE) / **T** (storage/API logic) | `gee._vectorise`, `runs.py`, `GET /analysis/runs/{id}/inundation.geojson` |
| Async jobs: queued/running/completed/failed, `GET /analysis/runs/{id}/status`, 202 + Location, orphan recovery on restart | **T** (logic) | `runs.py`, `api/v1/analysis.py`, `main.py` |
| Random Forest + GroupShuffleSplit(region_id) + P/R/F1/IoU/confusion + ROC-AUC/Brier | **T** (synthetic data in tests only) | `analysis/ml_lab.py` |
| `/model/evaluation` + `/model/metadata` serve the latest real experiment | **T** | `api/v1/model.py` |
| Hardcoded 0.894 / 0.082 / 91.2% / 87.8% / 4.1% / fake SHAP weights removed | **U** (UI) | `AnalyticsView.tsx` |
| Inundation polygons draped on MapLibre 3D terrain with OSM layers | **U** (browser) | `FloodMap.tsx`, `AnalysisView.tsx` |
| Trained model / accuracy numbers | **B** | needs `data/labeled_flood_features.csv` |

## Notes
* DEM for the 3D mesh is the free Terrarium tile set (already in v3–v5), not Copernicus DEM / `USGS/SRTMGL1_003` tiles. SRTM is used server-side for the slope mask.
* The map's `maxBounds` is the Chalakudy basin; analyses outside it will not be framed.
* Default `smooth_m` is now 50 m (change detection is speckle-sensitive); `min_drop_db` defaults to 3 dB. Both are untuned starting values.
