"""Model metadata and evaluation endpoints."""
from __future__ import annotations

from datetime import datetime, timezone

import structlog
from fastapi import APIRouter

log = structlog.get_logger(__name__)
router = APIRouter()

MODEL_DISCLAIMER = (
    "No ML model has been trained yet. Training requires labeled flood-observation data "
    "from Sentinel-1 or another validated source, plus terrain features from a DEM. "
    "See docs/model-card.md for the intended training methodology."
)


@router.get("/model/metadata")
async def get_model_metadata():
    """Return ML model metadata. Status reflects actual training state."""
    return {
        "model_type": "XGBoost classifier (not yet trained)",
        "version": "0.0.0-untrained",
        "target": "Binary flood-observation label (SAR-derived, when available)",
        "intended_features": [
            "elevation_m",
            "slope_degrees",
            "hand_m",
            "dist_to_drainage_m",
            "flow_accumulation",
            "precipitation_1h_mm",
            "precipitation_6h_mm",
            "precipitation_24h_mm",
            "precipitation_72h_mm",
        ],
        "feature_names": [],
        "n_train": None,
        "n_val": None,
        "n_test": None,
        "trained_at": None,
        "status": "not_trained",
        "requirements_to_train": [
            "Copernicus DEM downloaded and preprocessed (see docs/data-sources.md).",
            "Sentinel-1 flood labels derived for ≥1 flood event.",
            "Terrain features computed: elevation, slope, HAND, flow accumulation.",
            "Training script: ml/models/train.py",
        ],
        "disclaimer": MODEL_DISCLAIMER,
    }


@router.get("/model/evaluation")
async def get_model_evaluation():
    """Return evaluation results. Returns honest 'not_evaluated' state when model not trained."""
    return {
        "model_version": "0.0.0-untrained",
        "evaluated_at": None,
        "metrics": {
            "precision": None,
            "recall": None,
            "f1": None,
            "iou": None,
            "critical_success_index": None,
            "brier_score": None,
        },
        "class_balance": None,
        "baseline_comparison": None,
        "spatial_split": "Intended: spatial block split by grid cell, held-out flood event.",
        "notes": [
            "Model not yet trained. No evaluation results available.",
            "Evaluation will use spatial block splits to prevent leakage.",
            "All metrics will be from a held-out test set, never training data.",
            "Baseline comparisons (terrain-only, rainfall-threshold) will be included.",
        ],
        "status": "not_evaluated",
    }


@router.get("/model/explain/{asset_id}")
async def get_explanation(asset_id: str):
    """
    Return SHAP explanation for a specific asset.
    Returns honest 'not_available' state when model not trained.
    """
    return {
        "asset_id": asset_id,
        "asset_name": None,
        "prediction": None,
        "prediction_label": None,
        "feature_contributions": [],
        "base_value": None,
        "model_version": None,
        "limitation": (
            "SHAP explanations are not available because the ML model has not been trained. "
            "See /api/v1/model/metadata for training requirements."
        ),
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "status": "model_not_trained",
    }
