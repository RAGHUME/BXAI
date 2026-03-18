"""High-level orchestration for XAI analyses."""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

# Keywords used for simple heuristic scoring when real models are unavailable.
_SUSPICIOUS_KEYWORDS = {
    "tamper",
    "forged",
    "suspicious",
    "breach",
    "fraud",
    "alert",
    "anomaly",
    "compromised",
    "manipulated",
}

from pymongo.collection import Collection

from .artifacts import save_artifacts_bundle
from .evidence import (
    EvidenceAccessError,
    load_image,
    load_metadata_from_mongo,
    load_text,
)
from .explainers import ExplainerContext, gradcam_heatmap, lime_explainer, shap_explainer
from .hashing import consolidate_hashes, hash_artifacts
from .heuristics import analyse_text_evidence
from .loaders import load_image_tamper_model
from .predictions import predict_image_tampering
from .reasoning import generate_nemotron_reasoning
from .similarity import compare_with_existing_evidence


class XAIServiceError(RuntimeError):
    """Raised when the XAI pipeline cannot complete."""


def _determine_storage_root(evidence_id: str, base_dir: str | os.PathLike[str]) -> Path:
    root = Path(base_dir) / evidence_id
    root.mkdir(parents=True, exist_ok=True)
    return root


def _fallback_text_prediction(text: str, metadata: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Produce a deterministic heuristic prediction for text evidence."""

    metadata = metadata or {}
    normalised_text = text or metadata.get("description", "") or metadata.get("summary", "") or ""
    tokens = [
        token.strip(".,;:!?\"'`()").lower()
        for token in normalised_text.split()
        if token.strip()
    ]
    total_tokens = len(tokens)
    matched_keywords = [
        token
        for token in tokens
        if any(keyword in token for keyword in _SUSPICIOUS_KEYWORDS)
    ]
    unique_matches = sorted({match for match in matched_keywords})
    density = len(matched_keywords) / max(1, total_tokens)

    if matched_keywords:
        label = "Flagged for review"
        confidence = round(min(0.95, 0.5 + density * 3), 2)
        note = (
            "Heuristic flag triggered by keywords: "
            + ", ".join(unique_matches[:6])
            + ("…" if len(unique_matches) > 6 else "")
        )
    else:
        label = "No anomaly detected"
        # Use token count to modulate confidence while keeping it above 0.55.
        confidence = round(max(0.55, 0.8 - min(total_tokens, 1200) / 3000), 2)
        note = "No high-risk keywords detected in supplied artefact." \
            if total_tokens else "Artefact lacked textual content; defaulting to baseline verdict."

    snippet = normalised_text.strip()[:280]
    if len(normalised_text.strip()) > 280:
        snippet += "…"

    raw_payload = {
        "note": note,
        "total_tokens": total_tokens,
        "matched_keywords": unique_matches,
        "keyword_density": round(density, 4),
        "sample": snippet,
        "case_id": metadata.get("caseId"),
        "evidence_type": metadata.get("evidenceType"),
    }

    return {
        "label": label,
        "confidence": confidence,
        "raw": raw_payload,
    }


def run_xai_pipeline(
    *,
    evidence_id: str,
    mongo_collections: Dict[str, Collection],
    artifact_root: str | os.PathLike[str],
    blockchain_anchor: Optional[Any] = None,
    activity_logger: Optional[Any] = None,
) -> Dict[str, Any]:
    """Execute the XAI pipeline for a given evidence item.

    Returns a summary dictionary ready to be persisted in ``xai_insights``.
    """

    evidence_collection = mongo_collections["evidence"]
    xai_collection = mongo_collections["xai_insights"]

    metadata = load_metadata_from_mongo(evidence_collection, evidence_id)
    evidence_type = metadata.get("evidenceType") or metadata.get("type") or "unknown"

    # ------------------------------------------------------------------
    # Model inference & explainability stubs
    # ------------------------------------------------------------------
    tamper_model = load_image_tamper_model()
    shap_payload = None
    lime_payload = None
    gradcam_payload = None
    prediction_payload = None

    if evidence_type.lower() == "image":
        file_info = (metadata.get("file") or {}).get("path") or metadata.get("filePath")
        if not file_info:
            raise XAIServiceError("Image evidence missing file path metadata")
        image = load_image(file_info)
        prediction = predict_image_tampering(tamper_model, image)
        prediction_payload = {
            "label": prediction.label,
            "confidence": prediction.confidence,
            "raw": prediction.raw,
        }

        if str(prediction_payload.get("label", "")).lower() in {"", "unknown"}:
            prediction_payload["raw"] = {
                **(prediction_payload.get("raw") or {}),
                "note": "Image tamper model not yet integrated; replace with real inference results.",
            }
            prediction_payload["confidence"] = prediction_payload.get("confidence") or 0.5
            prediction_payload["label"] = "Analysis pending"

        context = ExplainerContext(model=tamper_model, task="image", metadata=metadata)
        shap_payload = shap_explainer(context, image)
        lime_payload = lime_explainer(context, image)
        gradcam_payload = gradcam_heatmap(tamper_model, image)
    else:
        # Text / generic evidence placeholder
        file_info = (metadata.get("file") or {}).get("path") or metadata.get("filePath")
        text = ""
        if file_info:
            try:
                text = load_text(file_info)
            except EvidenceAccessError as exc:
                if activity_logger:
                    activity_logger(
                        action="xai_text_evidence_missing_file",
                        details={
                            "evidenceId": evidence_id,
                            "path": str(file_info),
                            "error": str(exc),
                        },
                    )
                text = ""

        if not text:
            text = metadata.get("extractedText") or metadata.get("description", "")
        if not text:
            text = metadata.get("rawText") or metadata.get("notes", "")

        heuristic_results = analyse_text_evidence(text, metadata)
        prediction_payload = heuristic_results["prediction"]
        shap_payload = heuristic_results["shap"]
        lime_payload = heuristic_results["lime"]

    # ------------------------------------------------------------------
    # Similarity search (placeholder implementation)
    # ------------------------------------------------------------------
    candidate_cursor = evidence_collection.find({"caseId": metadata.get("caseId")})
    candidates = [doc for doc in candidate_cursor if str(doc.get("_id")) != str(metadata.get("_id"))]
    query_text = metadata.get("description") or metadata.get("title") or ""
    similarity_results = compare_with_existing_evidence(query_text=query_text, candidate_records=candidates)
    similarity_payload = [
        {
            "evidenceId": result.evidence_id,
            "score": result.score,
            "metadata": result.metadata,
        }
        for result in similarity_results
    ]

    # ------------------------------------------------------------------
    # Nemotron reasoning summaries
    # ------------------------------------------------------------------
    nemotron_payload = generate_nemotron_reasoning(
        {
            "prediction": prediction_payload,
            "shap": shap_payload,
            "lime": lime_payload,
            "gradcam": gradcam_payload,
            "similarity": similarity_payload,
        }
    )

    # ------------------------------------------------------------------
    # Artefact persistence
    # ------------------------------------------------------------------
    output_dir = _determine_storage_root(str(evidence_id), artifact_root)
    pdf_lines = [
        f"Evidence ID: {evidence_id}",
        f"Case ID: {metadata.get('caseId', '—')}",
        "",
        "Prediction:",
        f"  Label: {prediction_payload.get('label')}",
        f"  Confidence: {prediction_payload.get('confidence')}",
        "",
        "Nemotron Summary:",
        nemotron_payload.get("investigator_summary", "Unavailable"),
    ]

    artifact_paths = save_artifacts_bundle(
        output_dir=output_dir,
        shap_payload=shap_payload,
        lime_payload=lime_payload,
        gradcam_payload=gradcam_payload,
        similarity_payload={"results": similarity_payload},
        nemotron_summary=nemotron_payload.get("investigator_summary", ""),
        pdf_content={
            "title": "XAI Analysis Report",
            "subtitle": datetime.utcnow().strftime("Generated %Y-%m-%d %H:%M UTC"),
            "lines": pdf_lines,
        },
    )

    hashes = hash_artifacts(artifact_paths)
    consolidated_hash = consolidate_hashes(hashes.values())

    tx_hash = None
    if blockchain_anchor is not None:
        try:
            tx_hash = blockchain_anchor(consolidated_hash)
        except Exception as exc:  # pragma: no cover - blockchain dependency
            if activity_logger:
                activity_logger(
                    action="xai_anchor_failed",
                    details={"evidenceId": evidence_id, "error": str(exc)},
                )
            tx_hash = None

    record = {
        "evidenceId": evidence_id,
        "caseId": metadata.get("caseId"),
        "evidenceType": evidence_type,
        "modelUsed": "image_tamper_model" if evidence_type.lower() == "image" else "generic",
        "prediction": prediction_payload,
        "shapPath": str(artifact_paths.shap_path) if artifact_paths.shap_path else None,
        "limePath": str(artifact_paths.lime_path) if artifact_paths.lime_path else None,
        "gradcamPath": str(artifact_paths.gradcam_path) if artifact_paths.gradcam_path else None,
        "similarityPath": str(artifact_paths.similarity_path) if artifact_paths.similarity_path else None,
        "nemotronSummaryPath": str(artifact_paths.nemotron_summary_path) if artifact_paths.nemotron_summary_path else None,
        "pdfReportPath": str(artifact_paths.pdf_report_path) if artifact_paths.pdf_report_path else None,
        "explanationHash": consolidated_hash,
        "blockchainTxHash": tx_hash,
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
    }

    xai_collection.update_one(
        {"evidenceId": evidence_id},
        {"$set": record},
        upsert=True,
    )

    if activity_logger:
        activity_logger(
            action="xai_analysis_completed",
            details={"evidenceId": evidence_id, "explanationHash": consolidated_hash, "txHash": tx_hash},
        )

    return record
