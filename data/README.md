# data/

## Flood label provenance

The current `labeled_flood_features.csv` and `HydroVista_*_Data_2018.csv` labels are pseudo-labels: every provided
row matches `is_flooded = (VV < -16 dB)`. They are not independent flood observations. The training pipeline detects
this rule, removes VV/VH predictors, omits the circular VV threshold baseline, and labels all resulting scores as
pseudo-label agreement. The downloaded train/test files have empty `.geo` values and no `region_id`, so the claimed
spatial holdout cannot be independently verified.

Run the provided-file proxy experiment from `backend/`:

    python -m app.analysis.ml_lab train --train-csv ../data/HydroVista_Train_Data_2018.csv --test-csv ../data/HydroVista_Test_Data_2018.csv

The model uses non-SAR predictors available in both files (currently elevation and slope). Sigmoid scores are
calibrated to the pseudo-labels using training-fold predictions; they are not calibrated flood probabilities.
For flood validation, replace these labels with georeferenced event observations from KSDMA or another independent
reference and include a spatial group identifier.

KSDMA documents a 2018 crowdsourcing effort with 13,000 inundation-depth observations, but the public page currently
links to a rendered PDF map rather than a machine-readable point table. It is therefore documented as a candidate
reference and is not silently treated as training truth: https://sdma.kerala.gov.in/crowd-sourcing-flood-2018/.

## Independent labelled feature table schema

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
That `region_id` requirement applies to the grouped single-file route; the explicit `--train-csv`/`--test-csv` route
does not require it, but reports spatial independence as unverified when group metadata is absent.

Train (from `backend/`):

    python -m app.analysis.ml_lab train --csv ../data/labeled_flood_features.csv

Results are written to `artifacts/experiments/` and served at `GET /api/v1/model/evaluation`
and `GET /api/v1/model-lab/experiments`. The API reports the latest saved experiment and its label provenance.
