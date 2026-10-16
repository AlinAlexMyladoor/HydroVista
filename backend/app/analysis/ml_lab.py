"""
Model Lab: flood-classification experiment (Random Forest vs. radar-threshold baseline).

Input: a labelled feature table you supply (CSV). Required columns:
    label (0/1), region_id (spatial group), VV/vv, and any of: VH/vh, elevation, slope, vv_change
This module does NOT create labels or download imagery, and it ships no pre-trained model.
Nothing is reported unless you run it on real labelled data.

Evaluation uses GroupShuffleSplit on region_id so train/test regions are disjoint
(random pixel splits overstate skill because neighbouring pixels are correlated).
Both models are scored on the SAME test rows. Probabilities are not claimed to be calibrated.

CLI:  python -m app.analysis.ml_lab train --csv data/labeled_flood_features.csv [--threshold-db -16]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.analysis.core import binary_metrics

CANDIDATE_FEATURES = ["vv", "vh", "elevation", "slope", "vv_change"]
FORECAST_FEATURES = ["rainfall_24h_mm", "river_distance_m", "elevation", "slope"]
MIN_ROWS = 50


class ExperimentError(ValueError):
    pass


def load_table(csv_path: str) -> pd.DataFrame:
    if not os.path.isfile(csv_path):
        raise ExperimentError(
            f"{csv_path} not found. No labelled training table ships with the repo: build it from an independent "
            "flood reference (columns: label, region_id, vv, vh, elevation, slope) - see data/README.md."
        )
    df = pd.read_csv(csv_path)
    # Earth Engine exports commonly use uppercase band names; keep the model schema stable.
    df = df.rename(columns={column: column.strip().lower() for column in df.columns})
    missing = [c for c in ("label", "region_id", "vv") if c not in df.columns]
    if missing:
        raise ExperimentError(f"CSV is missing required columns: {missing}")
    if len(df) < MIN_ROWS:
        raise ExperimentError(f"Only {len(df)} rows; at least {MIN_ROWS} are required")
    if not set(df["label"].dropna().unique()) <= {0, 1}:
        raise ExperimentError("label must contain only 0 (not flooded) and 1 (flooded)")
    if df["label"].isna().any():
        raise ExperimentError("label contains missing values; drop or label those rows")
    if df["region_id"].nunique() < 3:
        raise ExperimentError("Need at least 3 distinct region_id groups for a spatially separated split")
    return df


def _normalise_forecast_columns(df: pd.DataFrame) -> pd.DataFrame:
    aliases = {
        "rainfall": "rainfall_24h_mm",
        "rainfall_mm": "rainfall_24h_mm",
        "rainfall_24h": "rainfall_24h_mm",
        "river_distance": "river_distance_m",
        "distance_river": "river_distance_m",
        "distance_river_m": "river_distance_m",
    }
    return df.rename(columns=lambda column: aliases.get(column.strip().lower(), column.strip().lower()))


def load_forecast_table(csv_path: str) -> pd.DataFrame:
    if not os.path.isfile(csv_path):
        raise ExperimentError(f"{csv_path} not found")
    df = _normalise_forecast_columns(pd.read_csv(csv_path))
    missing = [c for c in ("label", "region_id", *FORECAST_FEATURES) if c not in df.columns]
    if missing:
        raise ExperimentError(f"Forecast CSV is missing required columns: {missing}")
    if len(df) < MIN_ROWS:
        raise ExperimentError(f"Only {len(df)} rows; at least {MIN_ROWS} are required")
    if df["label"].isna().any() or not set(df["label"].unique()) <= {0, 1}:
        raise ExperimentError("label must contain only 0 (not flooded) and 1 (flooded)")
    if df["region_id"].nunique() < 3:
        raise ExperimentError("Need at least 3 distinct region_id groups for a spatially separated split")
    return df


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _probability_metrics(y_true: np.ndarray, proba: np.ndarray) -> dict[str, Any]:
    """ROC-AUC and Brier score on held-out rows. None (not 0) when undefined, e.g. one class present."""
    from sklearn.metrics import brier_score_loss, roc_auc_score

    out: dict[str, Any] = {"roc_auc": None, "brier_score": None}
    if len(set(y_true.tolist())) == 2:
        out["roc_auc"] = float(roc_auc_score(y_true, proba))
    if len(y_true):
        out["brier_score"] = float(brier_score_loss(y_true, proba))
    return out


def latest_experiment(out_dir: str = "artifacts/experiments") -> dict[str, Any] | None:
    """Newest saved experiment JSON, or None if nothing has been trained."""
    if not os.path.isdir(out_dir):
        return None
    for name in sorted(os.listdir(out_dir), reverse=True):
        if name.startswith("experiment_") and name.endswith(".json"):
            try:
                with open(os.path.join(out_dir, name)) as f:
                    return json.load(f)
            except (OSError, ValueError):
                continue
    return None


def train_experiment(
    csv_path: str,
    out_dir: str = "artifacts/experiments",
    baseline_threshold_db: float = -16.0,
    test_size: float = 0.2,
    seed: int = 42,
    n_estimators: int = 300,
    model_path: str | None = None,
) -> dict[str, Any]:
    import joblib
    import sklearn
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.impute import SimpleImputer
    from sklearn.model_selection import GroupShuffleSplit
    from sklearn.pipeline import make_pipeline

    df = load_table(csv_path)
    features = [c for c in CANDIDATE_FEATURES if c in df.columns]
    X, y, g = df[features], df["label"].astype(int).to_numpy(), df["region_id"].to_numpy()

    tr, te = next(GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=seed).split(X, y, groups=g))
    for name, idx in (("train", tr), ("test", te)):
        if len(set(y[idx])) < 2:
            raise ExperimentError(f"The {name} split contains a single class; add regions or change the seed/test_size")

    model = make_pipeline(
        SimpleImputer(strategy="median"),
        RandomForestClassifier(n_estimators=n_estimators, class_weight="balanced", random_state=seed, n_jobs=-1),
    )
    model.fit(X.iloc[tr], y[tr])

    test = df.iloc[te]
    scored = test["vv"].notna().to_numpy()  # baseline needs a VV value; compare both models on identical rows
    yt = y[te][scored]
    rf_pred = model.predict(X.iloc[te][scored])
    rf_proba = model.predict_proba(X.iloc[te][scored])[:, 1]
    base_pred = (test["vv"].to_numpy()[scored] < baseline_threshold_db).astype(int)
    rf_m, base_m = binary_metrics(yt, rf_pred), binary_metrics(yt, base_pred)
    prob_metrics = _probability_metrics(yt, rf_proba)

    per_region = {}
    for rid in sorted(set(g[te])):
        sel = (g[te] == rid)[scored]
        if sel.sum():
            per_region[str(rid)] = {"n": int(sel.sum()), "rf_f1": binary_metrics(yt[sel], rf_pred[sel]).f1, "baseline_f1": binary_metrics(yt[sel], base_pred[sel]).f1}

    importances = dict(zip(features, [float(v) for v in model[-1].feature_importances_]))
    warnings = []
    if len(yt) < 200:
        warnings.append(f"Small test set ({len(yt)} rows): metrics have wide uncertainty.")
    if int(yt.sum()) < 30:
        warnings.append(f"Only {int(yt.sum())} flooded test samples.")
    if int((~scored).sum()):
        warnings.append(f"{int((~scored).sum())} test rows without VV were excluded from both models' scores.")
    warnings.append("Predicted probabilities are uncalibrated; do not present them as confidence.")

    created = datetime.now(timezone.utc)
    exp_id = created.strftime("%Y%m%dT%H%M%SZ")
    os.makedirs(out_dir, exist_ok=True)
    model_file = f"flood_rf_{exp_id}.joblib"
    joblib.dump(model, os.path.join(out_dir, model_file))
    stable_model_path = Path(model_path) if model_path else Path(__file__).resolve().parents[2] / "models" / "flood_classifier.joblib"
    stable_model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, stable_model_path)
    exp = {
        "id": exp_id,
        "created_at": created.isoformat(),
        "task": "flood_classification",
        "models": {
            "random_forest": {"metrics": {**rf_m.as_dict(), **prob_metrics}, "feature_importance": importances, "n_estimators": n_estimators, "artifact": model_file},
            "threshold_baseline": {"metrics": base_m.as_dict(), "threshold_db": baseline_threshold_db, "rule": "VV < threshold_db => flooded"},
        },
        "per_region_test": per_region,
        "provenance": {
            "csv_sha256": _sha256(csv_path),
            "csv_name": os.path.basename(csv_path),
            "n_rows": int(len(df)),
            "n_train": int(len(tr)),
            "n_test": int(len(te)),
            "features": features,
            "split": {"method": "GroupShuffleSplit(region_id)", "test_size": test_size, "seed": seed,
                      "train_regions": sorted(map(str, set(g[tr]))), "test_regions": sorted(map(str, set(g[te])))},
            "class_balance": {"train_positive_fraction": float(y[tr].mean()), "test_positive_fraction": float(y[te].mean())},
            "versions": {"scikit-learn": sklearn.__version__, "numpy": np.__version__, "pandas": pd.__version__},
        },
        "warnings": warnings,
    }
    with open(os.path.join(out_dir, f"experiment_{exp_id}.json"), "w") as f:
        json.dump(exp, f, indent=2)
    return exp


def train_forecast_experiment(
    csv_path: str,
    out_dir: str = "artifacts/experiments",
    test_size: float = 0.2,
    seed: int = 42,
    model_path: str | None = None,
) -> dict[str, Any]:
    """Train a grouped future-risk model from historical rainfall and terrain predictors."""
    import joblib
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import GroupShuffleSplit
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    df = load_forecast_table(csv_path)
    X = df[FORECAST_FEATURES]
    y = df["label"].astype(int).to_numpy()
    groups = df["region_id"].to_numpy()
    train_idx, test_idx = next(
        GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=seed).split(X, y, groups=groups)
    )
    for name, idx in (("train", train_idx), ("test", test_idx)):
        if len(set(y[idx])) < 2:
            raise ExperimentError(f"The {name} split contains a single class; add regions or change the seed/test_size")

    model = make_pipeline(
        SimpleImputer(strategy="median"),
        StandardScaler(),
        LogisticRegression(class_weight="balanced", max_iter=1000, random_state=seed),
    )
    model.fit(X.iloc[train_idx], y[train_idx])
    predicted = model.predict(X.iloc[test_idx])
    metrics = binary_metrics(y[test_idx], predicted).as_dict()

    created = datetime.now(timezone.utc)
    exp_id = created.strftime("%Y%m%dT%H%M%SZ")
    os.makedirs(out_dir, exist_ok=True)
    model_file = f"flood_forecast_{exp_id}.joblib"
    joblib.dump(model, os.path.join(out_dir, model_file))
    stable_path = Path(model_path) if model_path else Path(__file__).resolve().parents[2] / "models" / "flood_forecast_classifier.joblib"
    stable_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, stable_path)
    exp = {
        "id": exp_id,
        "created_at": created.isoformat(),
        "task": "future_flood_susceptibility",
        "model": {"type": "LogisticRegression", "metrics": metrics, "artifact": model_file},
        "provenance": {
            "csv_sha256": _sha256(csv_path),
            "csv_name": os.path.basename(csv_path),
            "n_rows": int(len(df)),
            "n_train": int(len(train_idx)),
            "n_test": int(len(test_idx)),
            "features": FORECAST_FEATURES,
            "split": {
                "method": "GroupShuffleSplit(region_id)",
                "test_size": test_size,
                "seed": seed,
                "train_regions": sorted(map(str, set(groups[train_idx]))),
                "test_regions": sorted(map(str, set(groups[test_idx]))),
            },
        },
        "warnings": ["This is a susceptibility estimate, not a calibrated flood probability or official warning."],
    }
    with open(os.path.join(out_dir, f"forecast_experiment_{exp_id}.json"), "w") as f:
        json.dump(exp, f, indent=2)
    return exp


def main() -> None:
    ap = argparse.ArgumentParser(prog="ml_lab")
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("train")
    t.add_argument("--csv", required=True)
    t.add_argument("--out", default="artifacts/experiments")
    t.add_argument("--model-path", default=None)
    t.add_argument("--threshold-db", type=float, default=-16.0)
    t.add_argument("--test-size", type=float, default=0.2)
    t.add_argument("--seed", type=int, default=42)
    f = sub.add_parser("forecast-train")
    f.add_argument("--csv", required=True)
    f.add_argument("--out", default="artifacts/experiments")
    f.add_argument("--model-path", default=None)
    f.add_argument("--test-size", type=float, default=0.2)
    f.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()
    if a.cmd == "forecast-train":
        metrics = train_forecast_experiment(a.csv, a.out, a.test_size, a.seed, a.model_path)["model"]["metrics"]
        print(f"Forecast model F1={metrics['f1']} IoU={metrics['iou']}")
    else:
        exp = train_experiment(a.csv, a.out, a.threshold_db, a.test_size, a.seed, model_path=a.model_path)
        rf, bl = exp["models"]["random_forest"]["metrics"], exp["models"]["threshold_baseline"]["metrics"]
        print(f"RF   F1={rf['f1']} IoU={rf['iou']}  |  baseline F1={bl['f1']} IoU={bl['iou']}  (id {exp['id']})")


if __name__ == "__main__":
    main()
