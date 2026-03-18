"""XAI API routes for orchestrating explainability analyses."""

from __future__ import annotations

from datetime import datetime
from typing import Dict, Iterable, Optional

from flask import Blueprint, abort, current_app, g, jsonify, request, send_file

from xai_service.pipeline import XAIServiceError, run_xai_pipeline
from xai_service.evidence import EvidenceAccessError, EvidenceNotFoundError

from ..services.blockchain_service import init_blockchain_service


xai_bp = Blueprint("xai", __name__)


ALLOWED_ARTIFACT_FIELDS = {
    "shap": "shapPath",
    "lime": "limePath",
    "gradcam": "gradcamPath",
    "similarity": "similarityPath",
    "summary": "nemotronSummaryPath",
}


def _require_role(allowed_roles: Iterable[str]) -> str:
    header_value = (request.headers.get("X-Account-Role") or "").strip().lower()
    allowed = {role.lower() for role in allowed_roles}
    if header_value not in allowed:
        abort(403, description="Permission denied for this operation")
    return header_value


def _collections() -> Dict[str, any]:
    collections = getattr(g, "mongo", None)
    if not collections:
        abort(500, description="Database collections not initialised")
    return collections


def _get_activity_service():
    return current_app.config.get("ACTIVITY_LOG_SERVICE")


def _log_activity(action: str, details: Optional[dict] = None, *, tx_hash: Optional[str] = None) -> None:
    service = _get_activity_service()
    if not service:
        return
    try:
        service.log(
            user_id=getattr(g, "request_user_id", None),
            user_role=getattr(g, "request_user_role", None),
            action_type=action,
            action_details=details or {},
            request_method=request.method,
            request_path=request.path,
            status_code=getattr(getattr(g, "response", None), "status_code", None),
            tx_hash=tx_hash,
        )
    except Exception:  # pragma: no cover - logging must not break responses
        current_app.logger.exception("Failed to record XAI activity")


def _get_blockchain_service():
    extensions = getattr(current_app, "extensions", None)
    if extensions is None:
        current_app.extensions = {}
        extensions = current_app.extensions

    service = extensions.get("blockchain_service")
    if service:
        return service

    collections = current_app.config.get("MONGO_COLLECTIONS")
    if not collections:
        raise RuntimeError("Database collections not initialised for blockchain service")

    service = init_blockchain_service(
        collections["blockchain_records"],
        chain_collection=collections.get("chain_of_custody"),
    )
    extensions["blockchain_service"] = service
    return service


def _anchor_explanation(evidence_id: str, explanation_hash: str) -> Optional[str]:
    try:
        service = _get_blockchain_service()
    except Exception as exc:  # pragma: no cover - blockchain optional during scaffolding
        current_app.logger.warning("Blockchain service unavailable for XAI anchoring: %s", exc)
        return None

    anchor_method = getattr(service, "anchor_explanation", None)
    if not callable(anchor_method):
        current_app.logger.info("Blockchain service missing anchor_explanation method; skipping anchor")
        return None

    receipt = anchor_method(evidence_id, explanation_hash)
    if isinstance(receipt, dict):
        return receipt.get("transaction_hash") or receipt.get("txHash")
    return str(receipt) if receipt else None


def _serialize_document(document: dict) -> dict:
    serialized = dict(document)
    identifier = serialized.get("_id")
    if identifier is not None:
        serialized["_id"] = str(identifier)
    for key in ("createdAt", "updatedAt"):
        value = serialized.get(key)
        if isinstance(value, datetime):
            serialized[key] = value.isoformat()
    return serialized


@xai_bp.post("/analyze")
def analyze_evidence():
    _require_role({"admin", "investigator"})
    payload = request.get_json(force=True) or {}
    evidence_id = payload.get("evidenceId") or payload.get("evidence_id")
    if not evidence_id:
        abort(400, description="evidenceId is required")

    collections = _collections()
    artifact_root = current_app.config.get("XAI_ARTIFACT_DIR")
    if not artifact_root:
        abort(500, description="XAI artifact directory is not configured")

    _log_activity("xai_analysis_requested", {"evidenceId": evidence_id})

    def _pipeline_logger(action: str, details: dict):
        _log_activity(action, details)

    def _blockchain_anchor_wrapper(explanation_hash: str):
        tx_hash = _anchor_explanation(evidence_id, explanation_hash)
        if tx_hash:
            _log_activity("xai_anchor_submitted", {"evidenceId": evidence_id}, tx_hash=tx_hash)
        return tx_hash

    try:
        record = run_xai_pipeline(
            evidence_id=evidence_id,
            mongo_collections=collections,
            artifact_root=artifact_root,
            blockchain_anchor=_blockchain_anchor_wrapper,
            activity_logger=_pipeline_logger,
        )
    except EvidenceNotFoundError:
        abort(404, description="Evidence not found")
    except EvidenceAccessError as exc:
        abort(400, description=str(exc))
    except XAIServiceError as exc:
        abort(500, description=str(exc))
    except Exception as exc:  # pragma: no cover - guard unexpected errors
        current_app.logger.exception("Unexpected XAI pipeline failure")
        abort(500, description=f"XAI pipeline failed: {exc}")

    response = {
        "status": "success",
        "evidenceId": evidence_id,
        "prediction": record.get("prediction"),
        "explanationHash": record.get("explanationHash"),
        "txHash": record.get("blockchainTxHash"),
    }
    return jsonify(response)


@xai_bp.get("/insights")
def list_insights():
    _require_role({"admin", "investigator"})
    evidence_id = request.args.get("evidenceId")
    case_id = request.args.get("caseId")
    collections = _collections()
    query: Dict[str, any] = {}
    if evidence_id:
        query["evidenceId"] = evidence_id
    if case_id:
        query["caseId"] = case_id

    cursor = collections["xai_insights"].find(query).sort([("createdAt", -1)])
    results = [_serialize_document(doc) for doc in cursor]
    return jsonify({"results": results})


def _get_insight_or_404(evidence_id: str) -> dict:
    collections = _collections()
    document = collections["xai_insights"].find_one({"evidenceId": evidence_id})
    if not document:
        abort(404, description="XAI insight not found")
    return document


def _resolve_artifact_path(document: dict, artifact_type: str):
    field = ALLOWED_ARTIFACT_FIELDS.get(artifact_type)
    if not field:
        abort(400, description="Unsupported artifact type")
    path = document.get(field)
    if not path:
        abort(404, description="Artifact not found")
    return path


@xai_bp.get("/artifact/<string:evidence_id>/<string:artifact_type>")
def fetch_artifact(evidence_id: str, artifact_type: str):
    _require_role({"admin", "investigator"})
    document = _get_insight_or_404(evidence_id)
    path = _resolve_artifact_path(document, artifact_type)
    return send_file(path, as_attachment=False)


@xai_bp.get("/report/<string:evidence_id>")
def fetch_report(evidence_id: str):
    _require_role({"admin", "investigator"})
    document = _get_insight_or_404(evidence_id)
    path = document.get("pdfReportPath")
    if not path:
        abort(404, description="Report not generated")
    return send_file(path, mimetype="application/pdf", download_name=f"xai-report-{evidence_id}.pdf")
