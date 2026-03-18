"""Prediction helpers for the XAI service."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Any, Dict, Iterable, List, Tuple

from PIL import Image, ImageChops, ImageStat

from .loaders import ImageTamperModel, load_deepseek_client

try:
    import numpy as np
except ImportError:  # pragma: no cover - optional dependency during scaffolding
    np = None  # type: ignore


@dataclass
class PredictionResult:
    label: str
    confidence: float
    raw: Dict[str, Any]


def _heuristic_image_tamper_check(image: Image.Image) -> PredictionResult:
    """Fallback Error Level Analysis heuristic when the CNN model is unavailable."""

    ela_quality = 90
    buffer = BytesIO()
    image.convert("RGB").save(buffer, "JPEG", quality=ela_quality)
    buffer.seek(0)
    recompressed = Image.open(buffer)
    difference = ImageChops.difference(image.convert("RGB"), recompressed.convert("RGB"))

    grayscale = difference.convert("L")
    stats = ImageStat.Stat(grayscale)
    mean_error = float(stats.mean[0])
    max_error = float(stats.extrema[0][1])

    # Thresholds derived empirically; higher error suggests possible manipulation.
    flag_threshold = 12.0
    severe_threshold = 25.0

    if mean_error >= flag_threshold:
        label = "Likely tampered"
        confidence = min(0.98, 0.55 + (mean_error - flag_threshold) / (severe_threshold - flag_threshold + 1e-6))
    else:
        label = "Likely pristine"
        confidence = max(0.52, 0.85 - (flag_threshold - mean_error) / (flag_threshold + 1e-6))

    return PredictionResult(
        label=label,
        confidence=round(confidence, 2),
        raw={
            "analysis": "error_level",
            "mean_error": round(mean_error, 3),
            "max_error": round(max_error, 3),
            "quality": ela_quality,
            "note": (
                "Heuristic ELA indicates elevated error levels; inspect highlighted regions."
                if label == "Likely tampered"
                else "Error levels consistent with single-compression imagery."
            ),
        },
    )


def predict_image_tampering(model: ImageTamperModel, image: Any) -> PredictionResult:
    """Run tamper detection on an image and normalise the response."""

    try:
        output = model.predict(image)
    except NotImplementedError:
        return _heuristic_image_tamper_check(image)

    label = str(output.get("label", "unknown"))
    confidence = float(output.get("confidence", 0.0))
    return PredictionResult(label=label, confidence=confidence, raw=output)


def _safe_cosine_similarity(vec_a: Iterable[float], vec_b: Iterable[float]) -> float:
    if np is None:  # pragma: no cover - fallback path
        # Simple manual cosine similarity to avoid numpy dependency at runtime
        a = list(vec_a)
        b = list(vec_b)
        dot = sum(x * y for x, y in zip(a, b))
        mag_a = sum(x * x for x in a) ** 0.5
        mag_b = sum(x * x for x in b) ** 0.5
        if mag_a == 0 or mag_b == 0:
            return 0.0
        return dot / (mag_a * mag_b)

    arr_a = np.array(list(vec_a), dtype=float)
    arr_b = np.array(list(vec_b), dtype=float)
    denominator = (np.linalg.norm(arr_a) * np.linalg.norm(arr_b))
    if denominator == 0:  # pragma: no cover - guard against empty vectors
        return 0.0
    return float(arr_a.dot(arr_b) / denominator)


def predict_text_similarity(text: str, candidates: List[str]) -> List[Tuple[str, float]]:
    """Score similarity between ``text`` and a set of candidate strings.

    Uses the DeepSeek embedding client to compute cosine similarity. Returns a
    list sorted by similarity score in descending order.
    """

    if not candidates:
        return []

    client = load_deepseek_client()
    embeddings = client.embed([text, *candidates])
    anchor, rest = embeddings[0], embeddings[1:]
    scored = []
    for candidate, vector in zip(candidates, rest):
        score = _safe_cosine_similarity(anchor, vector)
        scored.append((candidate, score))
    scored.sort(key=lambda item: item[1], reverse=True)
    return scored
