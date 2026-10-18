# data/

## labeled_flood_features.csv

One row per labelled sample (pixel or small cell).

| column      | required | meaning |
|-------------|----------|---------|
| `label`     | yes      | 1 = flooded, 0 = not flooded, from an **independent** reference (not from the threshold rule being compared) |
| `region_id` | yes      | spatial group (e.g. sub-watershed / tile id). Train and test regions are disjoint (`GroupShuffleSplit`). Need >= 3 groups |
| `vv` / `VV` | yes      | Sentinel-1 VV backscatter, dB |
| `vh` / `VH` | no       | Sentinel-1 VH backscatter, dB |
| `elevation` | no       | metres (SRTM / Copernicus DEM) |
| `slope`     | no       | degrees |
| `vv_change` | no       | event − pre-event VV, dB |

Missing values in features are median-imputed; missing `label` is rejected. The grouped holdout needs at least three
`region_id` groups, with both classes represented in the train and test regions.

The Random Forest probability layer is sigmoid-calibrated from group-separated folds within the training regions;
the spatially held-out test region is excluded from calibration. Calibration does not correct biased labels or
make a score a guarantee of local flood conditions. Small positive test counts and near-perfect metrics are flagged
in the evaluation response for review. CSVs with `is_flooded` instead of `label` are accepted, but still need `region_id`.

Train (from `backend/`):

    python -m app.analysis.ml_lab train --csv ../data/labeled_flood_features.csv

Results are written to `artifacts/experiments/` and served at `GET /api/v1/model/evaluation`
and `GET /api/v1/model-lab/experiments`. Until you train, those endpoints say "not trained".
