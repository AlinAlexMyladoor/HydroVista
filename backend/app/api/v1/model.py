"""Model metadata and evaluation endpoints."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import structlog
from fastapi import APIRouter, HTTPException, Query

from app.analysis import ml_lab
from app.core.config import settings
from app.services.elevation import terrain_distribution

log = structlog.get_logger(__name__)
router = APIRouter()
_terrain_distribution_cache: dict | None = None
_terrain_distribution_cached_at: datetime | None = None

MODEL_DISCLAIMER = (
    "No ML model has been trained yet. Training requires labeled flood-observation data "
    "from Sentinel-1 or another validated source, plus terrain features from a DEM. "
    "See docs/model-card.md for the intended training methodology."
)


def _terrain_distribution_from_csv() -> dict | None:
    """Use cached GEE point samples when public DEM tiles cannot be fetched."""
    data_dirs = [
        Path(__file__).resolve().parents[4] / "data",
        Path(__file__).resolve().parents[3] / "data",
        Path(__file__).resolve().parents[2] / "data",
        Path("data"),
        Path("backend/data"),
    ]
    candidates: list[Path] = []
    for d in data_dirs:
        candidates.extend([
            d / "HydroVista_Train_Stratified.csv",
            d / "HydroVista_Train_Data_JRC_Shifted.csv",
            d / "HydroVista_Train_Data_JRC.csv",
        ])
    csv_path = next((path for path in candidates if path.is_file()), None)
    if csv_path is None:
        return None
    try:
        frame = pd.read_csv(csv_path)
        required = {"elevation", "slope"}
        if not required.issubset(frame.columns):
            return None
        columns = ["elevation", "slope"]
        if {"latitude", "longitude"}.issubset(frame.columns):
            columns += ["latitude", "longitude"]
        frame = frame[columns].apply(pd.to_numeric, errors="coerce").dropna(subset=["elevation", "slope"])
        if {"latitude", "longitude"}.issubset(frame.columns):
            frame = frame.drop_duplicates(subset=["latitude", "longitude"])
        frame = frame[(frame.elevation >= -500) & (frame.elevation <= 9000) & (frame.slope >= 0) & (frame.slope <= 90)]
        if len(frame) < 100:
            return None

        percentiles = list(range(0, 101, 5))
        hypsometric = [
            {"elevation_m": round(float(frame.elevation.quantile(p / 100)), 2), "area_below_pct": p}
            for p in percentiles
        ]
        bins = [0, 2, 5, 15, float("inf")]
        labels = ["0–2°", "2–5°", "5–15°", ">15°"]
        groups = pd.cut(frame.slope, bins=bins, labels=labels, right=False, include_lowest=True)
        counts = groups.value_counts(sort=False)
        slope_histogram = [
            {"slope_bin": label, "share_pct": round(float(counts[label]) / len(frame) * 100, 2)}
            for label in labels
        ]
        bounds = None
        if {"latitude", "longitude"}.issubset(frame.columns):
            bounds = [float(frame.longitude.min()), float(frame.latitude.min()), float(frame.longitude.max()), float(frame.latitude.max())]
        return {
            "source": f"{csv_path.name} · GEE terrain point samples",
            "bounds": bounds,
            "grid_size": None,
            "sampled_cells": int(len(frame)),
            "slope_cells": int(len(frame)),
            "coverage_pct": None,
            "measurement_basis": "sample_points",
            "hypsometric": hypsometric,
            "slope_histogram": slope_histogram,
            "known_limitations": "These CSV rows are stratified point samples, not a complete DEM raster or area-weighted sample. Percentages describe the supplied sample only and must not be interpreted as basin-area proportions.",
        }
    except (OSError, ValueError, pd.errors.ParserError) as exc:
        log.warning("model.terrain_csv_fallback_unavailable", error=str(exc))
        return None


@router.get("/model/terrain-distribution")
async def get_terrain_distribution():
    """Serve local GEE terrain samples, falling back to a live Terrarium grid when absent."""
    global _terrain_distribution_cache, _terrain_distribution_cached_at
    now = datetime.now(timezone.utc)
    if _terrain_distribution_cache and _terrain_distribution_cached_at and (now - _terrain_distribution_cached_at).total_seconds() < 86_400:
        return _terrain_distribution_cache
    # The checked-in working environment may not have outbound access to the public tile host.
    # Prefer the existing GEE point sample so the analytics charts still have real input data.
    sample_result = _terrain_distribution_from_csv()
    if sample_result:
        _terrain_distribution_cache = sample_result
        _terrain_distribution_cached_at = now
        return sample_result
    try:
        result = await terrain_distribution(settings.basin_bbox_list)
        _terrain_distribution_cache = result
        _terrain_distribution_cached_at = now
        return result
    except Exception as exc:
        log.warning("model.terrain_distribution_unavailable", error=str(exc))
        if _terrain_distribution_cache:
            return {**_terrain_distribution_cache, "is_stale": True}
        raise HTTPException(status_code=503, detail="Study-area DEM samples are temporarily unavailable") from exc


def _experiment_dir() -> str:
    return str(ml_lab.resolve_experiment_dir())


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
                "For independent validation, provide labels from an authoritative flood reference and a spatial region_id.",
                "The checked-in 2018 CSVs use VV-threshold pseudo-labels; they support a topography proxy experiment only.",
                "Run from backend/: python -m app.analysis.ml_lab train --train-csv ../data/HydroVista_Train_Data_2018.csv --test-csv ../data/HydroVista_Test_Data_2018.csv",
            ],
            "disclaimer": MODEL_DISCLAIMER,
        }
    prov = exp["provenance"]
    rf = exp["models"]["random_forest"]
    label_source = prov.get("label_source", "unverified_binary_label")
    return {
        "model_type": f"RandomForestClassifier (n_estimators={rf['n_estimators']})",
        "version": exp["id"],
        "target": "VV-threshold pseudo-label proxy" if label_source == "vv_threshold_pseudo_label" else "Binary label from supplied table",
        "intended_features": prov["features"],
        "feature_names": prov["features"],
        "n_train": prov.get("n_train"), "n_val": None, "n_test": prov.get("n_test", rf["metrics"]["n"]),
        "trained_at": exp["created_at"],
        "status": "trained",
        "requirements_to_train": [],
        "disclaimer": "Metrics describe the supplied label and split only; pseudo-label agreement is not independent flood validation.",
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
    bl = exp["models"].get("threshold_baseline")
    prov = exp["provenance"]
    return {
        "model_version": exp["id"],
        "evaluated_at": exp["created_at"],
        "metrics": {k: rf.get(k) for k in ("precision", "recall", "f1", "iou", "accuracy", "roc_auc", "brier_score")},
        "confusion_matrix": {"labels": ["not_flooded", "flooded"], "matrix": rf["confusion_matrix"], "layout": "[[TN, FP], [FN, TP]]"},
        "n_test": rf["n"],
        "class_balance": prov["class_balance"],
        "baseline_comparison": {"rule": bl["rule"], "threshold_db": bl["threshold_db"], "metrics": bl["metrics"]} if bl else None,
        "feature_importance": exp["models"]["random_forest"]["feature_importance"],
        "probability_calibration": prov.get("probability_calibration", {"available": False, "method": None}),
        "split": prov["split"],
        "per_region_test": exp["per_region_test"],
        "csv_name": prov["csv_name"],
        "csv_sha256": prov["csv_sha256"],
        "label_source": prov.get("label_source", "unverified_binary_label"),
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
    label_source = exp["provenance"].get("label_source", "unverified_binary_label")
    calibration = exp["provenance"].get("probability_calibration", {})
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
        "prediction_label": ("pseudo_flooded" if prediction >= 0.5 else "pseudo_not_flooded") if label_source == "vv_threshold_pseudo_label" else ("flooded" if prediction >= 0.5 else "not_flooded"),
        "label_source": label_source,
        "feature_contributions": [
            {"feature": feature, "value": values[feature], "shap_value": float(value),
             "direction": "increases_flood_risk" if value >= 0 else "decreases_flood_risk"}
            for feature, value in zip(features, contributions)
        ],
        "base_value": base_value,
        "model_version": exp["id"],
        "status": "explained",
        "limitation": ("This model predicts a VV-threshold pseudo-label, not verified flooding. TreeSHAP contributions explain the full-data Random Forest raw output; the displayed prediction is the " + ("sigmoid-calibrated ensemble" if calibration.get("available") else "uncalibrated Random Forest") + " score, not an additive SHAP decomposition or causal effect." if label_source == "vv_threshold_pseudo_label" else "TreeSHAP contributions explain the full-data Random Forest raw output; the displayed prediction is the model score, not an additive SHAP decomposition or causal effect."),
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }
