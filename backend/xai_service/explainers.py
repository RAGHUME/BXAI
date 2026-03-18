"""Explainability utilities (SHAP, LIME, Grad-CAM).

The implementations provided here are scaffolds: they establish the public
API shape and handle common bookkeeping, while leaving room for the actual
model-specific logic to be plugged in later.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

try:  # Optional heavy dependencies
    import numpy as np
except ImportError:  # pragma: no cover
    np = None  # type: ignore

try:
    import shap  # type: ignore
except ImportError:  # pragma: no cover
    shap = None  # type: ignore

try:
    from lime import lime_image, lime_text  # type: ignore
except ImportError:  # pragma: no cover
    lime_image = None  # type: ignore
    lime_text = None  # type: ignore


@dataclass
class ExplainerContext:
    model: Any
    task: str
    metadata: Optional[Dict[str, Any]] = None


def shap_explainer(context: ExplainerContext, data: Any) -> Dict[str, Any]:
    """Compute SHAP values for the provided ``data``.

    Returns a dictionary with enough metadata to serialise to JSON later.
    """

    if shap is None:  # pragma: no cover - placeholder behaviour
        tokens = []
        if isinstance(data, str):
            tokens = data.split()
        elif isinstance(data, (list, tuple)):
            tokens = list(data)

        top_features = tokens[:5] if tokens else ["feature_1", "feature_2", "feature_3"]
        values = [round(1.0 / (index + 1), 3) for index, _ in enumerate(top_features)]
        return {
            "status": "stubbed",
            "reason": "shap package not installed",
            "task": context.task,
            "features": top_features,
            "values": values,
        }

    # The actual SHAP integration will depend heavily on the model/task. For
    # now we return a stub to avoid run-time failures in the scaffolding stage.
    return {
        "status": "pending",
        "task": context.task,
        "note": "Implement SHAP integration for the specific model",
    }


def lime_explainer(context: ExplainerContext, data: Any) -> Dict[str, Any]:
    """Generate LIME explanations for either text or image data."""

    if context.task == "image" and lime_image is None:
        return {
            "status": "stubbed",
            "reason": "lime_image not installed",
            "task": context.task,
            "features": ["region_1", "region_2", "region_3"],
            "scores": [0.45, -0.32, 0.18],
        }
    if context.task == "text" and lime_text is None:
        tokens = []
        if isinstance(data, str):
            tokens = data.split()[:12]
        if not tokens:
            tokens = ["token_1", "token_2", "token_3"]
        weights = [round(((index % 4) - 1.5) / 3, 3) for index, _ in enumerate(tokens)]
        return {
            "status": "stubbed",
            "reason": "lime_text not installed",
            "task": context.task,
            "tokens": tokens,
            "weights": weights,
        }

    return {
        "status": "pending",
        "task": context.task,
        "note": "Implement LIME integration for the specific model",
    }


def gradcam_heatmap(model: Any, image: Any, *, layer_name: Optional[str] = None) -> Dict[str, Any]:
    """Produce a Grad-CAM heatmap for CNN image evidence.

    Returns a dictionary with heatmap metadata to be turned into a PNG by
    the artefact writer.
    """

    if np is None:  # pragma: no cover
        return {
            "status": "stubbed",
            "reason": "numpy not installed",
            "heatmap": None,
            "note": "Install numpy and implement Grad-CAM for real heatmaps.",
        }

    return {
        "status": "pending",
        "note": "Implement Grad-CAM for the chosen CNN architecture",
        "layer": layer_name,
    }
