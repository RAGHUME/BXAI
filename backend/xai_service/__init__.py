"""Explainable AI service package for BXAI backend.

This package exposes high-level helpers for loading ML models,
performing inference, producing explainability artefacts, and
coordinating persistence + blockchain anchoring of explanations.

Modules are organised by responsibility so that individual pieces can
be unit-tested and replaced independently (e.g., swapping model
providers or similarity engines).
"""

from .loaders import (
    load_deepseek_client,
    load_image_tamper_model,
    load_nemotron_client,
)
from .evidence import load_image, load_metadata_from_mongo, load_text
from .predictions import predict_image_tampering, predict_text_similarity
from .explainers import gradcam_heatmap, lime_explainer, shap_explainer
from .reasoning import generate_nemotron_reasoning
from .similarity import (
    compare_with_existing_evidence,
    compute_embeddings,
)
from .artifacts import save_artifacts_bundle
from .hashing import hash_artifacts, consolidate_hashes

__all__ = [
    "load_deepseek_client",
    "load_image_tamper_model",
    "load_nemotron_client",
    "load_image",
    "load_text",
    "load_metadata_from_mongo",
    "predict_image_tampering",
    "predict_text_similarity",
    "shap_explainer",
    "lime_explainer",
    "gradcam_heatmap",
    "generate_nemotron_reasoning",
    "compute_embeddings",
    "compare_with_existing_evidence",
    "save_artifacts_bundle",
    "hash_artifacts",
    "consolidate_hashes",
]
