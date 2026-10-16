"""
XGBoost flood-risk classifier training pipeline.

Status: NOT YET TRAINED
Reason: Training requires labeled flood observations from Sentinel-1 SAR data
        and terrain features from a processed DEM (Copernicus GLO-30 or similar).
        Neither dataset has been ingested yet.

This script documents the intended methodology and will execute when data is available.

Usage:
    python ml/models/train.py --event kerala-2018-aug

Prerequisites:
    1. Run geospatial/ingestion/dem.py to download and preprocess the DEM.
    2. Run geospatial/terrain/features.py to compute terrain features.
    3. Run geospatial/ingestion/sentinel1.py to download SAR scenes.
    4. Run geospatial/ingestion/flood_labels.py to derive flood masks.
    5. Run ml/features/build_features.py to assemble the feature matrix.

Output:
    ml/models/artifacts/xgb_model.pkl
    ml/models/artifacts/model_metadata.json
    ml/evaluation/evaluation_report.json

Design decisions:
    - Spatial block split: Hold out a spatial grid block to prevent leakage.
    - Event split: Hold out at least one flood event for independent testing.
    - Class balance: Flooding is rare. Use scale_pos_weight or sample weighting.
    - Features: Elevation, HAND, slope, dist_to_drainage, flow_acc, rainfall accumulations.
    - Target: Binary (1 = SAR-observed flood pixel, 0 = dry/non-flood pixel).
    - Evaluation: F1, IoU, CSI, Brier score on held-out test set only.
    - SHAP: Computed after training for global and local explanations.
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

# These imports are guarded to allow the file to be imported without all deps
try:
    import pandas as pd
    import xgboost as xgb
    from sklearn.model_selection import GroupShuffleSplit
    from sklearn.metrics import (
        precision_score, recall_score, f1_score,
        brier_score_loss, classification_report,
    )
    import shap
    ML_AVAILABLE = True
except ImportError as e:
    ML_AVAILABLE = False
    _ml_import_error = str(e)

ARTIFACTS_DIR = Path(__file__).parent / "artifacts"
FEATURES_DIR = Path(__file__).parent.parent / "features"
LABELS_DIR = Path(__file__).parent.parent / "labels"


def check_prerequisites() -> dict[str, bool]:
    """Check which required data files exist."""
    checks = {
        "feature_matrix": (FEATURES_DIR / "features.parquet").exists(),
        "flood_labels": (LABELS_DIR / "flood_labels.parquet").exists(),
        "ml_libraries": ML_AVAILABLE,
    }
    return checks


def critical_success_index(y_true, y_pred) -> float:
    """CSI = TP / (TP + FP + FN). Appropriate for rare-event detection."""
    tp = ((y_true == 1) & (y_pred == 1)).sum()
    fp = ((y_true == 0) & (y_pred == 1)).sum()
    fn = ((y_true == 1) & (y_pred == 0)).sum()
    denom = tp + fp + fn
    return float(tp / denom) if denom > 0 else 0.0


def train(event_id: str = "kerala-2018-aug") -> dict[str, Any]:
    """
    Train XGBoost classifier and evaluate on held-out data.
    Returns metadata dict with actual evaluation results.
    """
    prereqs = check_prerequisites()
    if not all(prereqs.values()):
        missing = [k for k, v in prereqs.items() if not v]
        return {
            "status": "prerequisites_missing",
            "missing": missing,
            "instructions": {
                "feature_matrix": "Run: python geospatial/terrain/features.py",
                "flood_labels": "Run: python geospatial/ingestion/flood_labels.py",
                "ml_libraries": "pip install xgboost scikit-learn shap pandas",
            },
        }

    import pandas as pd
    import xgboost as xgb
    from sklearn.metrics import precision_score, recall_score, f1_score, brier_score_loss

    print(f"[train] Loading features from {FEATURES_DIR / 'features.parquet'}")
    features_df = pd.read_parquet(FEATURES_DIR / "features.parquet")
    labels_df = pd.read_parquet(LABELS_DIR / "flood_labels.parquet")

    df = features_df.merge(labels_df, on=["grid_id", "event_id"], how="inner")
    print(f"[train] Merged dataset: {len(df)} examples")

    if len(df) < 100:
        return {
            "status": "insufficient_data",
            "n_examples": len(df),
            "note": "At least 100 labeled examples needed for training.",
        }

    FEATURE_COLS = [
        "elevation_m", "slope_degrees", "hand_m",
        "dist_to_drainage_m", "flow_accumulation",
        "precip_1h_mm", "precip_6h_mm",
        "precip_24h_mm", "precip_72h_mm",
    ]
    feature_cols = [c for c in FEATURE_COLS if c in df.columns]
    TARGET = "is_flooded"

    if TARGET not in df.columns:
        return {"status": "label_column_missing", "expected_column": TARGET}

    # Spatial block split: hold out one spatial block
    # This prevents spatial autocorrelation leakage
    if "spatial_block" in df.columns:
        test_block = df["spatial_block"].max()
        train_df = df[df["spatial_block"] < test_block]
        test_df = df[df["spatial_block"] == test_block]
    else:
        # Fall back to 80/20 split if no spatial blocks
        split_idx = int(len(df) * 0.8)
        train_df = df.iloc[:split_idx]
        test_df = df.iloc[split_idx:]
        print("[WARN] No spatial_block column. Using positional split (may have spatial leakage).")

    X_train = train_df[feature_cols].values
    y_train = train_df[TARGET].values
    X_test = test_df[feature_cols].values
    y_test = test_df[TARGET].values

    # Class balance
    pos_frac = y_train.mean()
    scale_pos_weight = (1 - pos_frac) / pos_frac if pos_frac > 0 else 1.0
    print(f"[train] Class balance: {pos_frac:.3f} positive. scale_pos_weight={scale_pos_weight:.1f}")

    model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos_weight,
        eval_metric="logloss",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )

    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    # Evaluation metrics (computed only from held-out test set)
    metrics = {
        "precision": round(float(precision_score(y_test, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, y_pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_test, y_pred, zero_division=0)), 4),
        "critical_success_index": round(critical_success_index(y_test, y_pred), 4),
        "brier_score": round(float(brier_score_loss(y_test, y_prob)), 4),
    }
    print(f"[train] Test metrics: {metrics}")

    # SHAP global feature importance
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X_test[:min(500, len(X_test))])
    global_importance = dict(zip(feature_cols, np.abs(shap_values).mean(axis=0).tolist()))

    # Save artifacts
    ARTIFACTS_DIR.mkdir(exist_ok=True)
    import pickle
    model_path = ARTIFACTS_DIR / "xgb_model.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(model, f)

    metadata = {
        "model_type": "XGBClassifier",
        "version": f"1.0.0-{datetime.now(timezone.utc).strftime('%Y%m%d')}",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "event_id": event_id,
        "feature_names": feature_cols,
        "n_train": len(train_df),
        "n_test": len(test_df),
        "class_balance_train": round(float(pos_frac), 4),
        "metrics": metrics,
        "global_shap_importance": global_importance,
        "artifact_path": str(model_path),
        "spatial_split": "block" if "spatial_block" in df.columns else "positional",
        "disclaimer": (
            "Model trained on SAR-derived flood labels for documented flood events. "
            "Predictions are an estimate of similarity to historical flood conditions. "
            "Not a validated hydraulic flood forecast."
        ),
    }

    meta_path = ARTIFACTS_DIR / "model_metadata.json"
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"[train] Artifacts saved to {ARTIFACTS_DIR}")
    return {"status": "success", **metadata}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train FloodLens XGBoost classifier")
    parser.add_argument("--event", default="kerala-2018-aug", help="Flood event ID")
    args = parser.parse_args()

    result = train(event_id=args.event)
    print("\n=== Training Result ===")
    print(json.dumps(result, indent=2, default=str))
