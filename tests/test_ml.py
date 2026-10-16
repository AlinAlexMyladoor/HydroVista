"""
ML metrics and spatial cross-validation unit tests.
"""
from __future__ import annotations

import pytest
import numpy as np
from ml.evaluation.metrics import evaluate_flood_predictions, spatial_block_split
from ml.explainability.shap_values import compute_heuristic_shapley_values


def test_ml_evaluation_metrics():
    y_true = np.array([1, 1, 0, 0, 1, 0, 1, 0])
    y_pred = np.array([0.9, 0.8, 0.2, 0.1, 0.85, 0.3, 0.7, 0.4])

    metrics = evaluate_flood_predictions(y_true, y_pred, threshold=0.5)

    assert metrics["roc_auc"] > 0.8
    assert metrics["pr_auc"] > 0.8
    assert metrics["brier_score"] < 0.2
    assert metrics["precision"] >= 0.75
    assert metrics["recall"] >= 0.75


def test_spatial_block_split():
    # 20 points distributed across 2D plane
    coords = np.random.RandomState(42).rand(20, 2)
    splits = spatial_block_split(coords, n_blocks=4, random_state=42)

    assert len(splits) == 4
    for train_idx, test_idx in splits:
        assert len(train_idx) + len(test_idx) == 20
        # Disjoint sets (no leakage)
        assert len(set(train_idx).intersection(set(test_idx))) == 0


def test_shapley_feature_attribution():
    features = {
        "elevation_m": 8.0,
        "rainfall_24h_mm": 120.0,
        "distance_river_m": 200.0,
        "criticality_weight": 1.0,
    }
    attrib = compute_heuristic_shapley_values(features)

    assert "elevation_contribution" in attrib
    assert "rainfall_contribution" in attrib
    assert "proximity_contribution" in attrib
    assert "criticality_contribution" in attrib

    total = sum(attrib.values())
    assert pytest.approx(1.0, abs=1e-2) == total
