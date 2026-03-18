"""Heuristic analysers for text evidence when ML models are unavailable.

These helpers score tokens extracted from the uploaded artefact to provide
fallback predictions and explanation artefacts (SHAP/LIME-style payloads).
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Keyword and pattern weights
# ---------------------------------------------------------------------------


SUSPICIOUS_KEYWORDS: Dict[str, float] = {
    "tamper": 1.0,
    "tampered": 1.0,
    "forged": 1.2,
    "breach": 1.1,
    "breached": 1.05,
    "fraud": 1.1,
    "fraudulent": 1.15,
    "malware": 1.1,
    "phishing": 1.0,
    "exploit": 0.9,
    "anomaly": 0.85,
    "compromise": 1.0,
    "compromised": 1.05,
    "override": 0.7,
    "manipulated": 1.0,
    "deletion": 0.7,
    "unauthorized": 0.95,
    "suspicious": 0.9,
    "threat": 0.8,
    "alert": 0.6,
    "breaching": 1.0,
    "ransom": 1.1,
    "backdoor": 1.2,
    "exfiltration": 1.2,
    "tampering": 1.0,
    "forensic": 0.65,
    "irregular": 0.6,
}

REASSURING_KEYWORDS: Dict[str, float] = {
    "authentic": -0.8,
    "verified": -0.7,
    "legitimate": -0.65,
    "clean": -0.6,
    "benign": -0.55,
    "intact": -0.55,
    "validated": -0.6,
    "checksum": -0.45,
    "hash": -0.4,
    "signed": -0.4,
    "secure": -0.5,
    "trusted": -0.45,
    "confirmed": -0.5,
}

SUSPICIOUS_SUFFIXES = (".exe", ".scr", ".dll", ".bin", ".bat", ".msi", ".ps1")

IP_REGEX = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
CURRENCY_REGEX = re.compile(r"(?:(?:usd|eur|inr|gbp)|[$€£₹])\d", re.IGNORECASE)
HASH_REGEX = re.compile(r"\b[a-f0-9]{32,64}\b")
ALPHANUM_ID_REGEX = re.compile(r"^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9_-]{6,}$")
FILE_TOKEN_REGEX = re.compile(r"^[\w.\-]+\.(?:csv|xlsx|zip|rar|tar|gz|pdf|docx|pptx|7z)$")


@dataclass
class TokenContribution:
    token: str
    weight: float
    reason: str
    frequency: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "token": self.token,
            "weight": round(self.weight, 3),
            "reason": self.reason,
            "frequency": self.frequency,
        }


def _tokenise(text: str) -> List[str]:
    return re.findall(r"[A-Za-z0-9._%-]+", text.lower())


def _score_token(token: str, frequency: int) -> Optional[TokenContribution]:
    weight = 0.0
    reasons: List[str] = []

    base = token.lower()
    if base in SUSPICIOUS_KEYWORDS:
        increment = SUSPICIOUS_KEYWORDS[base] * frequency
        weight += increment
        reasons.append(f"suspicious keyword x{frequency}")

    if base in REASSURING_KEYWORDS:
        decrement = REASSURING_KEYWORDS[base] * frequency
        weight += decrement
        reasons.append(f"reassuring keyword x{frequency}")

    if IP_REGEX.fullmatch(token):
        increment = 0.72 * frequency
        weight += increment
        reasons.append("IP address detected")

    if CURRENCY_REGEX.search(token) or base.endswith("usd") or base.endswith("inr"):
        increment = 0.55 * frequency
        weight += increment
        reasons.append("currency amount reference")

    if any(token.endswith(suffix) for suffix in SUSPICIOUS_SUFFIXES):
        increment = 0.9 * frequency
        weight += increment
        reasons.append("binary/installer file reference")

    if FILE_TOKEN_REGEX.fullmatch(token):
        increment = 0.35 * frequency
        weight += increment
        reasons.append("file reference in report")

    if HASH_REGEX.fullmatch(token):
        decrement = -0.35 * frequency
        weight += decrement
        reasons.append("hash-like token (confidence in integrity)")

    if ALPHANUM_ID_REGEX.fullmatch(token):
        increment = 0.4 * frequency
        weight += increment
        reasons.append("credential or identifier pattern")

    if token.isdigit() and len(token) >= 6:
        increment = 0.3 * frequency
        weight += increment
        reasons.append("long numeric identifier")

    if not reasons or abs(weight) < 1e-6:
        return None

    return TokenContribution(
        token=token,
        weight=weight,
        reason="; ".join(reasons),
        frequency=frequency,
    )


def _summarise_contributions(contributions: List[TokenContribution], *, total_tokens: int) -> Dict[str, Any]:
    positive = [c for c in contributions if c.weight > 0]
    negative = [c for c in contributions if c.weight < 0]

    positive_total = sum(c.weight for c in positive)
    negative_total = sum(-c.weight for c in negative)
    positive_token_count = sum(c.frequency for c in positive)
    negative_token_count = sum(c.frequency for c in negative)

    density = positive_token_count / max(1, total_tokens)
    net_score = positive_total - negative_total * 0.6

    return {
        "positive": positive,
        "negative": negative,
        "positive_total": positive_total,
        "negative_total": negative_total,
        "positive_tokens": positive_token_count,
        "negative_tokens": negative_token_count,
        "density": density,
        "net_score": net_score,
    }


def _derive_prediction(summary: Dict[str, Any], *, total_tokens: int) -> Dict[str, Any]:
    positive: List[TokenContribution] = summary["positive"]
    negative: List[TokenContribution] = summary["negative"]
    positive_total: float = summary["positive_total"]
    negative_total: float = summary["negative_total"]
    density: float = summary["density"]
    net_score: float = summary["net_score"]

    if total_tokens == 0:
        return {
            "label": "No textual content",
            "confidence": 0.55,
            "note": "Uploaded artefact contained no readable text; using neutral baseline.",
        }

    if net_score >= 2.2 or density >= 0.08:
        label = "Likely tampered"
    elif net_score >= 0.9 or density >= 0.045:
        label = "Flagged for review"
    else:
        label = "No anomaly detected"

    if label == "No anomaly detected":
        base = 0.62 + min(0.3, negative_total / (negative_total + 3) + max(0.0, 0.2 - density))
    elif label == "Flagged for review":
        base = 0.63 + min(0.32, (net_score + density * 4.5) / 3.2)
    else:  # Likely tampered
        base = 0.67 + min(0.31, (net_score + density * 6) / 3.8)

    confidence = round(max(0.55, min(0.98, base)), 2)

    if positive:
        highlight = ", ".join(f"{c.token} ({c.weight:+.2f})" for c in positive[:4])
        note = f"Risk indicators from uploaded file: {highlight}."
    elif negative:
        highlight = ", ".join(f"{c.token} ({c.weight:+.2f})" for c in negative[:4])
        note = f"Reassuring terms detected: {highlight}."
    else:
        note = "No strong heuristic indicators detected in uploaded artefact."

    return {
        "label": label,
        "confidence": confidence,
        "note": note,
    }


def analyse_text_evidence(text: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    metadata = metadata or {}
    stripped = text.strip()
    tokens = _tokenise(stripped)
    total_tokens = len(tokens)

    contributions: List[TokenContribution] = []
    for token, freq in Counter(tokens).items():
        scored = _score_token(token, freq)
        if scored is not None:
            contributions.append(scored)

    contributions.sort(key=lambda c: abs(c.weight), reverse=True)
    summary = _summarise_contributions(contributions, total_tokens=total_tokens)
    prediction_info = _derive_prediction(summary, total_tokens=total_tokens)

    snippet = stripped[:280]
    if len(stripped) > 280:
        snippet += "…"

    matched_keywords = sorted({c.token for c in summary["positive"]})
    keyword_density = summary["density"]

    prediction_payload = {
        "label": prediction_info["label"],
        "confidence": prediction_info["confidence"],
        "raw": {
            "note": prediction_info["note"],
            "total_tokens": total_tokens,
            "matched_keywords": matched_keywords,
            "keyword_density": round(keyword_density, 4),
            "sample": snippet,
            "case_id": metadata.get("caseId"),
            "evidence_type": metadata.get("evidenceType"),
            "top_positive_tokens": [c.to_dict() for c in summary["positive"][:8]],
            "top_negative_tokens": [c.to_dict() for c in summary["negative"][:8]],
            "net_score": round(summary["net_score"], 4),
            "positive_weight": round(summary["positive_total"], 4),
            "negative_weight": round(summary["negative_total"], 4),
        },
    }

    if total_tokens == 0:
        shap_payload = {
            "status": "heuristic",
            "task": "text",
            "method": "keyword_risk_scoring_v1",
            "features": [],
            "values": [],
            "note": "No textual content available for SHAP-style explanation.",
        }
        lime_payload = {
            "status": "heuristic",
            "task": "text",
            "tokens": [],
            "weights": [],
            "note": "No textual content available for LIME-style explanation.",
        }
        details = {
            "total_tokens": 0,
            "matched_keywords": [],
            "density": 0.0,
            "net_score": 0.0,
        }
        return {
            "prediction": prediction_payload,
            "shap": shap_payload,
            "lime": lime_payload,
            "details": details,
        }

    top_features = contributions[:10]
    shap_payload = {
        "status": "heuristic",
        "task": "text",
        "method": "keyword_risk_scoring_v1",
        "features": [c.token for c in top_features],
        "values": [round(c.weight, 3) for c in top_features],
        "positive_features": [c.to_dict() for c in summary["positive"][:6]],
        "negative_features": [c.to_dict() for c in summary["negative"][:6]],
        "total_tokens": total_tokens,
        "note": "Derived from uploaded artefact using keyword weighting heuristics.",
    }

    positive_sorted = sorted(summary["positive"], key=lambda c: c.weight, reverse=True)
    negative_sorted = sorted(summary["negative"], key=lambda c: c.weight)
    lime_tokens = positive_sorted[:6] + negative_sorted[:6]
    lime_payload = {
        "status": "heuristic",
        "task": "text",
        "tokens": [c.token for c in lime_tokens],
        "weights": [round(c.weight, 3) for c in lime_tokens],
        "positive_tokens": [c.to_dict() for c in positive_sorted[:8]],
        "negative_tokens": [c.to_dict() for c in negative_sorted[:8]],
        "note": "Positive weights support tampering; negative weights support a clean verdict.",
    }

    details = {
        "total_tokens": total_tokens,
        "matched_keywords": matched_keywords,
        "density": round(keyword_density, 4),
        "net_score": round(summary["net_score"], 4),
        "positive_weight": round(summary["positive_total"], 4),
        "negative_weight": round(summary["negative_total"], 4),
    }

    return {
        "prediction": prediction_payload,
        "shap": shap_payload,
        "lime": lime_payload,
        "details": details,
    }
