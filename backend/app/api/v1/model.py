"""Model metadata and evaluation endpoints."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import structlog
from fastapi import APIRouter, Query

from app.analysis import ml_lab

log = structlog.get_logger(__name__)
router = APIRouter()

MODEL_DISCLAIMER = (
    "No ML model has been trained yet. Training requires labeled flood-observation data "
    "from Sentinel-1 or another validated source, plus terrain features from a DEM. "
    "See docs/model-card.md for the intended training methodology."
)


def _experiment_dir() -> str:
    return os.getenv("EXPERIMENT_DIR", "artifacts/experiments")


def _rf_model_path() -> Path:
    return Path(os.getenv("MODEL_PATH", Path(__file__).resolve().parents[3] / "models" / "flood_classifier.joblib"))


@router.get("/model/metadata")
async def get_model_metadata():
    """Model metadata. Status reflects whether a Random Forest experiment has actually been trained."""
    exp = ml_lab.latest_experiment(_experiment_dir())
    if exp is None:
        return {
            "model_type": "RandomForestClassifier (not yet trained)",
            "version": "0.0.0-untrained",
            "target": "Binary flood label from your labelled table (data/labeled_flood_features.csv)",
            "intended_features": ml_lab.CANDIDATE_FEATURES,
            "feature_names": [],
            "n_train": None, "n_val": None, "n_test": None, "trained_at": None,
            "status": "not_trained",
            "requirements_to_train": [
                "Build data/labeled_flood_features.csv from an independent flood reference (columns: label, region_id, vv, vh, elevation, slope).",
                "At least 3 distinct region_id groups; both classes present in the train and test regions.",
                "Run: cd backend && python -m app.analysis.ml_lab train --csv data/labeled_flood_features.csv",
            ],
            "disclaimer": MODEL_DISCLAIMER,
        }
    prov = exp["provenance"]
    rf = exp["models"]["random_forest"]
    return {
        "model_type": f"RandomForestClassifier (n_estimators={rf['n_estimators']})",
        "version": exp["id"],
        "target": "Binary flood label from the supplied labelled table",
        "intended_features": ml_lab.CANDIDATE_FEATURES,
        "feature_names": prov["features"],
        "n_train": prov.get("n_train"), "n_val": None, "n_test": prov.get("n_test", rf["metrics"]["n"]),
        "trained_at": exp["created_at"],
        "status": "trained",
        "requirements_to_train": [],
        "disclaimer": "Metrics describe held-out regions of the supplied labelled table only; they do not transfer automatically to other regions or events.",
    }


@router.get("/model/evaluation")
async def get_model_evaluation():
    """Real held-out evaluation of the latest saved experiment, or an honest 'not_evaluated' state."""
    exp = ml_lab.latest_experiment(_experiment_dir())
    if exp is None:
        return {
            "model_version": "0.0.0-untrained",
            "evaluated_at": None,
            "metrics": {k: None for k in ("precision", "recall", "f1", "iou", "roc_auc", "brier_score")},
            "confusion_matrix": None,
            "class_balance": None,
            "baseline_comparison": None,
            "split": None,
            "probability_calibration": {"available": False, "method": None},
            "notes": ["No Random Forest has been trained, so there are no evaluation results. Nothing is estimated or pre-filled."],
            "status": "not_evaluated",
        }
    rf = exp["models"]["random_forest"]["metrics"]
    bl = exp["models"]["threshold_baseline"]
    prov = exp["provenance"]
    return {
        "model_version": exp["id"],
        "evaluated_at": exp["created_at"],
        "metrics": {k: rf.get(k) for k in ("precision", "recall", "f1", "iou", "accuracy", "roc_auc", "brier_score")},
        "confusion_matrix": {"labels": ["not_flooded", "flooded"], "matrix": rf["confusion_matrix"], "layout": "[[TN, FP], [FN, TP]]"},
        "n_test": rf["n"],
        "class_balance": prov["class_balance"],
        "baseline_comparison": {"rule": bl["rule"], "threshold_db": bl["threshold_db"], "metrics": bl["metrics"]},
        "feature_importance": exp["models"]["random_forest"]["feature_importance"],
        "probability_calibration": prov.get("probability_calibration", {"available": False, "method": None}),
        "split": prov["split"],
        "per_region_test": exp["per_region_test"],
        "csv_name": prov["csv_name"],
        "csv_sha256": prov["csv_sha256"],
        "notes": exp["warnings"],
        "status": "evaluated",
    }


@router.get("/model/explain/{asset_id}")
async def get_explanation(
    asset_id: str,
    vv: float | None = Query(None),
    vh: float | None = Query(None),
    elevation: float | None = Query(None),
    slope: float | None = Query(None),
    vv_change: float | None = Query(None),
    rainfall_24h_mm: float | None = Query(None),
    river_distance_m: float | None = Query(None),
):
    """Return exact TreeSHAP contributions for a supplied pixel feature vector."""
    exp = ml_lab.latest_experiment(_experiment_dir())
    model_path = _rf_model_path()
    if exp is None or not model_path.is_file():
        return {
            "asset_id": asset_id, "prediction": None, "feature_contributions": [], "base_value": None,
            "model_version": None, "status": "model_not_trained",
            "limitation": "The persisted Random Forest artifact is unavailable.",
            "computed_at": datetime.now(timezone.utc).isoformat(),
        }

    features = exp["provenance"].get("features", ml_lab.CANDIDATE_FEATURES)
    values = {
        "vv": vv, "vh": vh, "elevation": elevation, "slope": slope,
        "vv_change": vv_change, "rainfall_24h_mm": rainfall_24h_mm,
        "river_distance_m": river_distance_m,
    }
    missing = [feature for feature in features if values.get(feature) is None]
    if missing:
        return {
            "asset_id": asset_id, "prediction": None, "feature_contributions": [], "base_value": None,
            "model_version": exp["id"], "status": "features_required",
            "required_features": features, "missing_features": missing,
            "limitation": "Exact TreeSHAP requires the model feature values for this pixel; no heuristic values are substituted.",
            "computed_at": datetime.now(timezone.utc).isoformat(),
        }

    try:
        import joblib
        import shap

        model = joblib.load(model_path)
        estimator = getattr(model, "estimator", model)
        input_frame = pd.DataFrame([[values[feature] for feature in features]], columns=features)
        imputer = estimator.named_steps["simpleimputer"]
        forest = estimator.named_steps["randomforestclassifier"]
        transformed = imputer.transform(input_frame)
        shap_values = shap.TreeExplainer(forest).shap_values(transformed, check_additivity=False)
        class_values = shap_values[1] if isinstance(shap_values, list) else shap_values[:, :, 1]
        contributions = class_values[0].tolist()
        expected = shap.TreeExplainer(forest).expected_value
        base_value = float(expected[1] if hasattr(expected, "__len__") else expected)
        prediction = float(model.predict_proba(input_frame)[0, 1])
    except Exception as exc:  # noqa: BLE001 - return structured explainability failure
        log.exception("model.shap_failed", asset_id=asset_id)
        return {
            "asset_id": asset_id, "prediction": None, "feature_contributions": [], "base_value": None,
            "model_version": exp["id"], "status": "explanation_failed",
            "limitation": f"TreeSHAP could not explain this feature vector: {type(exc).__name__}.",
            "computed_at": datetime.now(timezone.utc).isoformat(),
        }

    return {
        "asset_id": asset_id,
        "prediction": prediction,
        "prediction_label": "flooded" if prediction >= 0.5 else "not_flooded",
        "feature_contributions": [
            {"feature": feature, "value": values[feature], "shap_value": float(value),
             "direction": "increases_flood_risk" if value >= 0 else "decreases_flood_risk"}
            for feature, value in zip(features, contributions)
        ],
        "base_value": base_value,
        "model_version": exp["id"],
        "status": "explained",
        "limitation": "TreeSHAP contributions explain the full-data Random Forest raw output; the displayed prediction is the group-calibrated ensemble score, so contributions are not an additive decomposition of that score or a causal effect.",
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }
