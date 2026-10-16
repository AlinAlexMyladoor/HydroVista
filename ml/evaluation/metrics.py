"""
ML Evaluation Metrics and Spatial Cross-Validation.

Implements spatial block cross-validation (preventing spatial autocorrelation leakage),
Area Under Precision-Recall Curve (PR-AUC), and Brier Score for probability calibration.
"""
from __future__ import annotations

import numpy as np
from typing import Dict, Any, List, Tuple
from sklearn.metrics import (
    roc_auc_score,
    precision_recall_curve,
    auc,
    brier_score_loss,
    confusion_matrix,
)


def evaluate_flood_predictions(
    y_true: np.ndarray,
    y_pred_proba: np.ndarray,
    threshold: float = 0.5,
) -> Dict[str, Any]:
    """
    Evaluates probabilistic flood classification predictions.
    Computes ROC-AUC, PR-AUC (crucial for imbalanced flood events), Brier score, and Confusion Matrix.
    """
    if len(y_true) == 0 or len(np.unique(y_true)) < 2:
        return {
            "status": "Insufficient class variance (need both flooded and non-flooded samples)",
            "roc_auc": None,
            "pr_auc": None,
            "brier_score": None,
        }

    y_pred_binary = (y_pred_proba >= threshold).astype(int)

    # ROC-AUC
    roc_auc = float(roc_auc_score(y_true, y_pred_proba))

    # PR-AUC
    precision, recall, _ = precision_recall_curve(y_true, y_pred_proba)
    pr_auc = float(auc(recall, precision))

    # Calibration Brier score (lower is better, 0.0 is perfect)
    brier = float(brier_score_loss(y_true, y_pred_proba))

    # Confusion Matrix
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred_binary).ravel()

    return {
        "roc_auc": round(roc_auc, 4),
        "pr_auc": round(pr_auc, 4),
        "brier_score": round(brier, 4),
        "confusion_matrix": {
            "true_positive": int(tp),
            "false_positive": int(fp),
            "true_negative": int(tn),
            "false_negative": int(fn),
        },
        "precision": round(tp / max(1, tp + fp), 4),
        "recall": round(tp / max(1, tp + fn), 4),
    }


def spatial_block_split(
    coordinates: np.ndarray,
    n_blocks: int = 5,
    random_state: int = 42,
) -> List[Tuple[np.ndarray, np.ndarray]]:
    """
    Splits coordinates into spatial blocks to evaluate generalization across geographic sub-basins.
    Ensures training and test points are spatially separated.
    """
    from sklearn.cluster import KMeans

    kmeans = KMeans(n_clusters=n_blocks, random_state=random_state, n_init="auto")
    block_labels = kmeans.fit_predict(coordinates)

    splits = []
    for test_block in range(n_blocks):
        test_indices = np.where(block_labels == test_block)[0]
        train_indices = np.where(block_labels != test_block)[0]
        splits.append((train_indices, test_indices))

    return splits
