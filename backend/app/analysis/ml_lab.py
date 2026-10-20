"""
Model Lab: flood-classification experiment (Random Forest vs. radar-threshold baseline).

Input: a labelled feature table you supply (CSV). Required columns:
    label (0/1), region_id (spatial group), VV/vv, and any of: VH/vh, elevation, slope, vv_change
This module does NOT create labels or download imagery, and it ships no pre-trained model.
Nothing is reported unless you run it on real labelled data.

Evaluation uses GroupShuffleSplit on region_id so train/test regions are disjoint
(random pixel splits overstate skill because neighbouring pixels are correlated).
Sigmoid probability calibration is fitted on group-separated out-of-fold predictions
from training regions only; the held-out test region is never used for calibration.

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


class GroupCalibratedModel:
    """Cross-validated sigmoid ensemble with a full-data estimator for explanations."""

    def __init__(self, estimator: Any, calibrated_estimators: list[tuple[Any, Any]]):
        self.estimator = estimator
        self.calibrated_estimators = calibrated_estimators

    def predict_proba(self, X: Any) -> np.ndarray:
        calibrated = []
        for estimator, calibrator in self.calibrated_estimators:
            raw = estimator.predict_proba(X)[:, 1].reshape(-1, 1)
            calibrated.append(calibrator.predict_proba(raw)[:, 1])
        positive = np.mean(calibrated, axis=0)
        return np.column_stack((1 - positive, positive))

    def predict(self, X: Any) -> np.ndarray:
        return (self.predict_proba(X)[:, 1] >= 0.5).astype(int)


def load_table(csv_path: str) -> pd.DataFrame:
    if not os.path.isfile(csv_path):
        raise ExperimentError(
            f"{csv_path} not found. No labelled training table ships with the repo: build it from an independent "
            "flood reference (columns: label, region_id, vv, vh, elevation, slope) - see data/README.md."
        )
    try:
        df = pd.read_csv(csv_path)
    except pd.errors.EmptyDataError as exc:
        raise ExperimentError(f"{csv_path} is empty. Add labeled rows before training; required columns include label/is_flooded, region_id, and VV.") from exc
    # Earth Engine exports commonly use uppercase band names; keep the model schema stable.
    df = df.rename(columns={column: column.strip().lower() for column in df.columns})
    aliases = {
        "distance_to_river": "river_distance_m",
        "river_distance": "river_distance_m",
        "accumulated_rainfall_mm": "rainfall_24h_mm",
        "rainfall_mm": "rainfall_24h_mm",
        "rainfall": "rainfall_24h_mm",
    }
    df = df.rename(columns={column: aliases.get(column, column) for column in df.columns})
    if "label" not in df.columns and "is_flooded" in df.columns:
        df = df.rename(columns={"is_flooded": "label"})
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


def resolve_experiment_dir(out_dir: str | Path | None = None) -> Path:
    """Resolve directory containing experiment artifacts across diverse execution environments."""
    if env_dir := os.getenv("EXPERIMENT_DIR"):
        return Path(env_dir)
    if out_dir:
        p = Path(out_dir)
        if p.is_dir() and any(p.glob("*.json")):
            return p
    candidates = [
        Path("artifacts/experiments"),
        Path("backend/artifacts/experiments"),
        Path(__file__).resolve().parents[2] / "artifacts" / "experiments",
        Path(__file__).resolve().parents[3] / "artifacts" / "experiments",
    ]
    for p in candidates:
        if p.is_dir() and any(p.glob("*.json")):
            return p
    for p in candidates:
        if p.is_dir():
            return p
    return Path(out_dir) if out_dir else Path("artifacts/experiments")


def latest_experiment(out_dir: str | Path = "artifacts/experiments") -> dict[str, Any] | None:
    """Newest saved experiment JSON with evaluated metrics, or None if nothing has been trained."""
    resolved = resolve_experiment_dir(out_dir)
    if not resolved.is_dir():
        return None
    experiments: list[dict[str, Any]] = []
    for name in sorted(os.listdir(resolved), reverse=True):
        if name.startswith("experiment_") and name.endswith(".json"):
            try:
                with open(resolved / name) as f:
                    experiments.append(json.load(f))
            except (OSError, ValueError):
                continue
    if not experiments:
        return None
    for exp in experiments:
        rf_metrics = exp.get("models", {}).get("random_forest", {}).get("metrics", {})
        if rf_metrics.get("f1") is not None or rf_metrics.get("tp", 0) > 0:
            return exp
    return experiments[0]


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
    from sklearn.base import clone
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import GroupKFold, GroupShuffleSplit
    from sklearn.pipeline import make_pipeline

    df = load_table(csv_path)
    y, g = df["label"].astype(int).to_numpy(), df["region_id"].to_numpy()
    pseudo_labels = np.array_equal(y, (df["vv"].to_numpy(dtype=float) < baseline_threshold_db).astype(int))
    features = [c for c in CANDIDATE_FEATURES if c in df.columns]
    if pseudo_labels:
        features = [c for c in features if c not in {"vv", "vh", "vv_change"}]
    if not features:
        raise ExperimentError("No non-leaking features remain after removing predictors used to construct the label")
    X = df[features]

    tr, te = next(GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=seed).split(X, y, groups=g))
    for name, idx in (("train", tr), ("test", te)):
        if len(set(y[idx])) < 2:
            raise ExperimentError(f"The {name} split contains a single class; add regions or change the seed/test_size")

    base_model = make_pipeline(
        SimpleImputer(strategy="median"),
        RandomForestClassifier(n_estimators=n_estimators, class_weight="balanced", random_state=seed, n_jobs=-1),
    )

    # Build calibration data from spatially held-out folds inside the training split.
    # No observation from the final held-out test regions participates here.
    train_groups = g[tr]
    n_calibration_folds = min(5, len(set(train_groups)))
    calibrated_estimators = []
    n_calibration_samples = 0
    if n_calibration_folds >= 2:
        cv = GroupKFold(n_splits=n_calibration_folds)
        for fit_idx, calibration_idx in cv.split(X.iloc[tr], y[tr], groups=train_groups):
            if len(set(y[tr][calibration_idx])) < 2:
                continue
            fold_model = clone(base_model)
            fold_model.fit(X.iloc[tr].iloc[fit_idx], y[tr][fit_idx])
            fold_probability = fold_model.predict_proba(X.iloc[tr].iloc[calibration_idx])[:, 1]
            calibrator = LogisticRegression(solver="lbfgs", random_state=seed)
            calibrator.fit(fold_probability.reshape(-1, 1), y[tr][calibration_idx])
            calibrated_estimators.append((fold_model, calibrator))
            n_calibration_samples += len(calibration_idx)
    calibration_available = n_calibration_samples >= 20 and len(calibrated_estimators) >= 2

    base_model.fit(X.iloc[tr], y[tr])
    model = GroupCalibratedModel(base_model, calibrated_estimators) if calibration_available else base_model

    test = df.iloc[te]
    scored = test["vv"].notna().to_numpy()  # baseline needs a VV value; compare both models on identical rows
    yt = y[te][scored]
    rf_pred = model.predict(X.iloc[te][scored])
    rf_proba = model.predict_proba(X.iloc[te][scored])[:, 1]
    rf_m = binary_metrics(yt, rf_pred)
    base_m = None if pseudo_labels else binary_metrics(yt, (test["vv"].to_numpy()[scored] < baseline_threshold_db).astype(int))
    prob_metrics = _probability_metrics(yt, rf_proba)

    per_region = {}
    for rid in sorted(set(g[te])):
        sel = (g[te] == rid)[scored]
        if sel.sum():
            per_region[str(rid)] = {"n": int(sel.sum()), "rf_f1": binary_metrics(yt[sel], rf_pred[sel]).f1, "baseline_f1": binary_metrics(yt[sel], (test["vv"].to_numpy()[scored][sel] < baseline_threshold_db).astype(int)).f1 if base_m is not None else None}

    importances = dict(zip(features, [float(v) for v in base_model[-1].feature_importances_]))
    warnings = []
    if len(yt) < 200:
        warnings.append(f"Small test set ({len(yt)} rows): metrics have wide uncertainty.")
    if int(yt.sum()) < 30:
        warnings.append(f"Only {int(yt.sum())} flooded test samples.")
    if pseudo_labels:
        warnings.append(f"Target is exactly VV < {baseline_threshold_db:g} dB across the supplied table. VV and VH were excluded; scores measure agreement with pseudo-labels, not independent flood detection.")
        warnings.append("Replace threshold labels with an independent event reference (for example KSDMA inundation observations) before interpreting this model as flood validation.")
    if int((~scored).sum()):
        warnings.append(f"{int((~scored).sum())} test rows without VV were excluded from both models' scores.")
    if calibration_available:
        warnings.append("Probabilities use sigmoid calibration fitted on group-separated out-of-fold training predictions; they are calibrated model scores, not guarantees of local flood conditions.")
    else:
        warnings.append("Probability calibration was unavailable: too few spatial training folds or class examples. Do not present raw scores as confidence.")
    score_values = {"precision": rf_m.precision, "recall": rf_m.recall, "f1": rf_m.f1, "iou": rf_m.iou, "roc_auc": prob_metrics["roc_auc"]}
    perfect_scores = [name for name, value in score_values.items() if value is not None and value >= 0.999]
    if perfect_scores:
        warnings.append("Near-perfect held-out score(s) (" + ", ".join(perfect_scores) + "): audit for label leakage, permanent-water memorization, and test-set support before operational interpretation.")

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
            **({} if base_m is None else {"threshold_baseline": {"metrics": base_m.as_dict(), "threshold_db": baseline_threshold_db, "rule": "VV < threshold_db => flooded"}}),
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
            "label_source": "vv_threshold_pseudo_label" if pseudo_labels else "unverified_binary_label",
            "versions": {"scikit-learn": sklearn.__version__, "numpy": np.__version__, "pandas": pd.__version__},
            "probability_calibration": {"method": "sigmoid", "training_only": True, "grouped_oof": True, "available": bool(calibration_available), "n_oof": int(n_calibration_samples)},
        },
        "warnings": warnings,
    }
    with open(os.path.join(out_dir, f"experiment_{exp_id}.json"), "w") as f:
        json.dump(exp, f, indent=2)
    return exp


def _load_provided_split(csv_path: str, split_name: str) -> pd.DataFrame:
    """Load an explicitly supplied train/test CSV with label aliases and basic validation."""
    if not os.path.isfile(csv_path):
        raise ExperimentError(f"{split_name} CSV not found: {csv_path}")
    try:
        df = pd.read_csv(csv_path)
    except pd.errors.EmptyDataError as exc:
        raise ExperimentError(f"{split_name} CSV is empty: {csv_path}") from exc
    df = df.rename(columns={column: column.strip().lower() for column in df.columns})
    aliases = {
        "distance_to_river": "river_distance_m",
        "river_distance": "river_distance_m",
        "accumulated_rainfall_mm": "rainfall_24h_mm",
        "rainfall_mm": "rainfall_24h_mm",
        "rainfall": "rainfall_24h_mm",
    }
    df = df.rename(columns={column: aliases.get(column, column) for column in df.columns})
    if "label" not in df.columns and "is_flooded" in df.columns:
        df = df.rename(columns={"is_flooded": "label"})
    if len(df) < MIN_ROWS:
        raise ExperimentError(f"{split_name} CSV has only {len(df)} rows; at least {MIN_ROWS} are required")
    if "label" not in df or df["label"].isna().any() or not set(df["label"].unique()) <= {0, 1}:
        raise ExperimentError(f"{split_name} label must contain non-null 0/1 values (column: label or is_flooded)")
    if len(set(df["label"].astype(int))) < 2:
        raise ExperimentError(f"{split_name} split contains only one class")
    return df


def train_provided_split_experiment(
    train_csv: str,
    test_csv: str,
    out_dir: str = "artifacts/experiments",
    threshold_db: float = -16.0,
    seed: int = 42,
    n_estimators: int = 300,
    model_path: str | None = None,
) -> dict[str, Any]:
    """Train on explicit files while excluding SAR bands when labels are VV-threshold pseudo-labels."""
    import joblib
    import sklearn
    from sklearn.base import clone
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedKFold
    from sklearn.pipeline import make_pipeline

    train_df = _load_provided_split(train_csv, "train")
    test_df = _load_provided_split(test_csv, "test")
    y_train = train_df["label"].astype(int).to_numpy()
    y_test = test_df["label"].astype(int).to_numpy()
    train_is_threshold_label = "vv" in train_df and np.array_equal(y_train, (train_df["vv"].to_numpy(dtype=float) < threshold_db).astype(int))
    test_is_threshold_label = "vv" in test_df and np.array_equal(y_test, (test_df["vv"].to_numpy(dtype=float) < threshold_db).astype(int))
    pseudo_labels = bool(train_is_threshold_label and test_is_threshold_label)

    # Keep only physically independent predictors for the pseudo-label proxy.
    safe_features = ["elevation", "slope", "river_distance_m", "rainfall_24h_mm", "accumulated_precipitation"]
    features = [name for name in safe_features if name in train_df.columns and name in test_df.columns]
    if not features:
        raise ExperimentError("No independent predictors found; expected elevation, slope, river distance, or rainfall")
    # This explicit-input route uses only independent predictors even if label provenance is unclear.
    X_train, X_test = train_df[features], test_df[features]

    base_model = make_pipeline(
        SimpleImputer(strategy="median"),
        RandomForestClassifier(n_estimators=n_estimators, class_weight="balanced", random_state=seed, n_jobs=-1),
    )
    region_ids = train_df["region_id"].to_numpy() if "region_id" in train_df and train_df["region_id"].nunique() >= 2 else None
    grouped_calibration = region_ids is not None
    folds = min(5, len(set(region_ids)) if region_ids is not None else int(np.bincount(y_train).min()))
    calibrated_estimators = []
    calibration_rows = 0
    if folds >= 2:
        cv = GroupKFold(n_splits=folds) if grouped_calibration else StratifiedKFold(n_splits=folds, shuffle=True, random_state=seed)
        split_iter = cv.split(X_train, y_train, groups=region_ids) if grouped_calibration else cv.split(X_train, y_train)
        for fit_idx, calibration_idx in split_iter:
            if len(set(y_train[fit_idx])) < 2 or len(set(y_train[calibration_idx])) < 2:
                continue
            fold_model = clone(base_model)
            fold_model.fit(X_train.iloc[fit_idx], y_train[fit_idx])
            fold_probs = fold_model.predict_proba(X_train.iloc[calibration_idx])[:, 1]
            calibrator = LogisticRegression(solver="lbfgs", random_state=seed)
            calibrator.fit(fold_probs.reshape(-1, 1), y_train[calibration_idx])
            calibrated_estimators.append((fold_model, calibrator))
            calibration_rows += len(calibration_idx)
    calibration_available = len(calibrated_estimators) >= 2

    base_model.fit(X_train, y_train)
    model = GroupCalibratedModel(base_model, calibrated_estimators) if calibration_available else base_model
    pred = model.predict(X_test)
    probability = model.predict_proba(X_test)[:, 1]
    metrics = {**binary_metrics(y_test, pred).as_dict(), **_probability_metrics(y_test, probability)}
    importances = dict(zip(features, [float(v) for v in base_model[-1].feature_importances_]))

    warnings = []
    if pseudo_labels:
        warnings.append("Target is a VV-threshold pseudo-label; these scores measure agreement with that rule, not independent flood detection.")
    warnings.append("VV and VH were excluded from predictors in this run.")
    has_region_id = "region_id" in train_df and "region_id" in test_df
    spatial_split_verified = bool(has_region_id and not (set(train_df["region_id"]) & set(test_df["region_id"])))
    if not spatial_split_verified:
        warnings.append("Provided train/test separation could not be verified as spatial: disjoint region_id values are unavailable.")
    if int(y_test.sum()) < 30:
        warnings.append(f"Only {int(y_test.sum())} flooded test samples; positive-class metrics are uncertain.")
    perfect = [name for name in ("precision", "recall", "f1", "iou", "roc_auc") if metrics.get(name) is not None and metrics[name] >= 0.999]
    if perfect:
        warnings.append("Near-perfect test score(s) (" + ", ".join(perfect) + "): investigate pseudo-label construction and sample dependence.")
    if calibration_available:
        if pseudo_labels:
            warnings.append("Sigmoid scores are calibrated to the pseudo-labels using training-fold predictions; they are not calibrated flood probabilities.")
        else:
            warnings.append("Sigmoid scores use training-fold predictions only; calibration quality depends on label provenance and split independence.")
    else:
        warnings.append("Probability calibration unavailable because the training file has too few examples per class.")

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
        "models": {"random_forest": {"metrics": metrics, "feature_importance": importances, "n_estimators": n_estimators, "artifact": model_file}},
        "per_region_test": {},
        "provenance": {
            "csv_sha256": {"train": _sha256(train_csv), "test": _sha256(test_csv)},
            "csv_name": f"{os.path.basename(train_csv)} / {os.path.basename(test_csv)}",
            "label_source": "vv_threshold_pseudo_label" if pseudo_labels else "unverified_binary_label",
            "n_rows": int(len(train_df) + len(test_df)), "n_train": int(len(train_df)), "n_test": int(len(test_df)),
            "features": features,
            "split": {"method": "provided train/test files" + ("; disjoint region_id groups" if spatial_split_verified else "; spatial separation unverified"), "test_size": len(test_df) / (len(train_df) + len(test_df)), "seed": seed, "train_regions": sorted(map(str, set(train_df["region_id"]))) if has_region_id else [], "test_regions": sorted(map(str, set(test_df["region_id"]))) if has_region_id else []},
            "class_balance": {"train_positive_fraction": float(y_train.mean()), "test_positive_fraction": float(y_test.mean())},
            "probability_calibration": {"method": "sigmoid", "training_only": True, "grouped_oof": grouped_calibration, "available": calibration_available, "n_oof": int(calibration_rows)},
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
    t.add_argument("--csv")
    t.add_argument("--train-csv")
    t.add_argument("--test-csv")
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
        if bool(a.train_csv) != bool(a.test_csv) or (not a.csv and not a.train_csv):
            ap.error("train requires --csv <grouped table> or both --train-csv <file> --test-csv <file>")
        if a.train_csv:
            exp = train_provided_split_experiment(a.train_csv, a.test_csv, a.out, a.threshold_db, a.seed, model_path=a.model_path)
        else:
            exp = train_experiment(a.csv, a.out, a.threshold_db, a.test_size, a.seed, model_path=a.model_path)
        rf = exp["models"]["random_forest"]["metrics"]
        baseline = exp["models"].get("threshold_baseline", {}).get("metrics")
        baseline_text = f" | baseline F1={baseline['f1']} IoU={baseline['iou']}" if baseline else " | direct VV baseline omitted (label leakage)"
        print(f"RF   F1={rf['f1']} IoU={rf['iou']}{baseline_text}  (id {exp['id']})")


if __name__ == "__main__":
    main()
