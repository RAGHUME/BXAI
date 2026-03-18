"""Blockchain API routes for anchoring and verifying evidence."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Dict, Iterable, Optional

from bson import ObjectId
from flask import Blueprint, abort, current_app, jsonify, request, send_file

from ..services.blockchain_service import init_blockchain_service


blockchain_bp = Blueprint("blockchain", __name__)


def _collections():
    collections = current_app.config.get("MONGO_COLLECTIONS")
    if not collections:
        abort(500, description="Database collections not initialised")
    return collections


def _records_collection():
    return _collections()["blockchain_records"]


def _chain_collection():
    return _collections().get("chain_of_custody")


def _evidence_collection():
    return _collections()["evidence"]


def _activity_service():
    return current_app.config.get("ACTIVITY_LOG_SERVICE")


def _resolve_user_context():
    headers = request.headers
    user_id = (
        headers.get("X-Account-Id")
        or headers.get("X-User-Id")
        or headers.get("X-Admin-Id")
    )
    user_role = headers.get("X-Account-Role") or headers.get("X-User-Role") or headers.get("X-Admin-Role")
    return user_id, user_role


def _log_blockchain_event(action_type: str, *, success: bool, details: Optional[Dict[str, Any]] = None, is_critical: Optional[bool] = None) -> None:
    service = _activity_service()
    if not service:
        return

    payload: Dict[str, Any] = {"success": success}
    if details:
        payload.update(details)

    user_id, user_role = _resolve_user_context()
    now = datetime.utcnow()

    try:
        service.log(
            user_id=user_id,
            user_role=user_role,
            action_type=action_type,
            action_details=payload,
            ip_address=request.remote_addr,
            user_agent=request.headers.get("User-Agent"),
            timestamp_start=now,
            timestamp_end=now,
            is_critical=is_critical,
            request_method=request.method,
            request_path=request.path,
            status_code=None,
        )
    except Exception as exc:  # pragma: no cover - logging must not break responses
        current_app.logger.exception("Failed to record blockchain activity event: %s", exc)


def _require_role(allowed_roles: Iterable[str]) -> str:
    header_value = (request.headers.get("X-Account-Role") or "").strip().lower()
    allowed = {role.lower() for role in allowed_roles}
    if header_value not in allowed:
        abort(403, description="Permission denied for this operation")
    return header_value


def _get_service():
    extensions = getattr(current_app, "extensions", None)
    if extensions is None:
        current_app.extensions = {}
        extensions = current_app.extensions

    service = extensions.get("blockchain_service")
    if service:
        return service

    service = init_blockchain_service(
        _records_collection(),
        chain_collection=_chain_collection(),
    )
    extensions["blockchain_service"] = service
    return service


def _find_evidence(evidence_id: str):
    collection = _evidence_collection()
    document = None
    if ObjectId.is_valid(evidence_id):
        document = collection.find_one({"_id": ObjectId(evidence_id)})
    if not document:
        document = collection.find_one({"_id": evidence_id})
    return document


def _ensure_ledger_id(evidence: dict) -> Optional[str]:
    ledger_id = evidence.get("ledgerId")
    if ledger_id:
        return ledger_id

    base_identifier = str(evidence.get("_id") or evidence.get("id") or "").strip()
    if not base_identifier:
        return None

    ledger_id = "0x" + hashlib.sha256(base_identifier.encode("utf-8")).hexdigest()
    _evidence_collection().update_one({"_id": evidence["_id"]}, {"$set": {"ledgerId": ledger_id}})
    evidence["ledgerId"] = ledger_id
    return ledger_id


def _format_timestamp(value) -> str:
    if not value:
        return "—"

    if isinstance(value, (int, float)):
        value = datetime.utcfromtimestamp(value)
    elif isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value

    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S UTC")

    return str(value)


def _render_pdf(title: str, lines):
    renderer = current_app.config.get("RENDER_PDF")
    if renderer:
        return renderer(title, lines)

    # Fallback: lightweight PDF generation (kept consistent with main app renderer)
    from io import BytesIO
    from reportlab.lib.pagesizes import LETTER
    from reportlab.pdfgen import canvas

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=LETTER)
    width, height = LETTER
    x_margin = 72
    y = height - 72

    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(x_margin, y, title)
    pdf.setFont("Helvetica", 12)
    y -= 32

    for line in lines:
        if y < 72:
            pdf.showPage()
            y = height - 72
            pdf.setFont("Helvetica", 12)
        pdf.drawString(x_margin, y, line)
        y -= 18

    pdf.save()
    buffer.seek(0)
    return buffer


def _slugify(value: str) -> str:
    return "-".join(filter(None, [chunk for chunk in value.lower().split()]))


def _blockchain_summary_for_ledger(ledger_id: str) -> Optional[Dict[str, Any]]:
    records = _records_collection()
    query = {"ledger_id": ledger_id}
    history_count = records.count_documents(query)
    if history_count == 0:
        return None

    latest_cursor = (
        records.find(query)
        .sort([("created_at", -1), ("blockchain_timestamp", -1)])
        .limit(1)
    )
    latest_record = next(iter(latest_cursor), None)

    verification_cursor = (
        records.find({**query, "action": "verify"})
        .sort([("created_at", -1), ("blockchain_timestamp", -1)])
        .limit(1)
    )
    verification_record = next(iter(verification_cursor), None)

    summary: Dict[str, Any] = {
        "ledgerId": ledger_id,
        "historyCount": history_count,
    }

    if latest_record:
        summary.update(
            {
                "status": latest_record.get("verification_status")
                or latest_record.get("action")
                or "anchored",
                "transactionHash": latest_record.get("transaction_hash"),
                "blockNumber": latest_record.get("block_number"),
                "timestamp": _format_timestamp(
                    latest_record.get("blockchain_timestamp") or latest_record.get("created_at")
                ),
                "network": latest_record.get("network"),
                "uploader": latest_record.get("uploader_address") or latest_record.get("from"),
                "hash": latest_record.get("file_hash"),
            }
        )

    if verification_record:
        summary["verification"] = {
            "verified": verification_record.get("verified"),
            "onchain_hash": verification_record.get("onchain_hash"),
            "local_hash": verification_record.get("local_hash"),
            "timestamp": _format_timestamp(
                verification_record.get("blockchain_timestamp") or verification_record.get("created_at")
            ),
        }

    return summary


@blockchain_bp.get("/status")
def blockchain_status():
    try:
        service = _get_service()
        latest_block = service.web3.eth.block_number
        connected = True
        contract_address = service.contract.address
        operator = service.admin_account.address
        network = service.network_label
    except Exception as exc:  # pragma: no cover - connection issues
        return (
            jsonify(
                {
                    "connected": False,
                    "error": str(exc),
                }
            ),
            503,
        )

    total_anchors = _records_collection().count_documents({"verification_status": "anchored"})
    return jsonify(
        {
            "connected": connected,
            "latestBlock": latest_block,
            "contractAddress": contract_address,
            "accountAddress": operator,
            "network": network,
            "totalAnchored": total_anchors,
        }
    )


@blockchain_bp.post("/anchor")
def anchor_evidence():
    _require_role({"investigator", "admin"})
    payload = request.get_json(force=True)

    evidence_id = payload.get("evidence_id") or payload.get("evidenceId")
    if not evidence_id:
        abort(400, description="evidence_id is required")

    evidence = _find_evidence(evidence_id)
    if not evidence:
        abort(404, description="Evidence not found")

    ledger_id = _ensure_ledger_id(evidence)
    if not ledger_id:
        abort(400, description="Unable to derive ledger identifier for evidence")

    file_document = (evidence.get("file") or {})
    file_hash = file_document.get("hash")
    if not file_hash:
        file_hash = payload.get("file_hash") or payload.get("fileHash")
    if not file_hash:
        fallback_payload = json.dumps(
            {
                "title": evidence.get("title"),
                "caseId": evidence.get("caseId"),
                "description": evidence.get("description"),
                "createdAt": str(evidence.get("createdAt")),
            },
            sort_keys=True,
        )
        file_hash = "0x" + hashlib.sha256(fallback_payload.encode("utf-8")).hexdigest()

    uploader = payload.get("uploader_address") or payload.get("uploaderAddress")
    service = _get_service()
    if not uploader:
        uploader = service.admin_account.address

    description = payload.get("description") or evidence.get("description") or evidence.get("title") or "Evidence item"

    onchain_record = None
    try:
        onchain_record = service.get_evidence(ledger_id)
    except Exception:
        onchain_record = None

    reanchored = False
    reused_anchor = False
    if onchain_record and not onchain_record.get("removed"):
        existing_hash = (onchain_record.get("fileHash") or "").lower()
        target_hash = (file_hash or "").lower()
        if existing_hash and target_hash and existing_hash != target_hash:
            try:
                service.remove_evidence(ledger_id, reference_id=str(evidence.get("_id")))
                reanchored = True
            except Exception as exc:
                abort(502, description=f"Failed to retire previous on-chain record: {exc}")
        elif existing_hash and existing_hash == target_hash:
            reused_anchor = True

    record = None
    if not reused_anchor:
        try:
            record = service.anchor_evidence(
                ledger_id,
                file_hash,
                description,
                uploader,
                reference_id=str(evidence.get("_id")),
            )
        except Exception as exc:
            abort(502, description=f"Failed to anchor evidence: {exc}")

    verification = None
    verification_success = False
    if file_hash:
        try:
            verification = service.verify_evidence(
                ledger_id,
                file_hash,
                reference_id=str(evidence.get("_id")),
            )
            verification_success = bool(verification.get("verified"))
        except Exception as exc:
            abort(502, description=f"Failed to verify anchored evidence: {exc}")

    _evidence_collection().update_one(
        {"_id": evidence["_id"]},
        {
            "$set": {
                "ledgerId": ledger_id,
                "verified": verification_success,
            }
        },
    )

    summary = _blockchain_summary_for_ledger(ledger_id) or {
        "ledgerId": ledger_id,
    }

    message = "Evidence anchored and verified."
    if reused_anchor:
        message = "Evidence already anchored; verification refreshed."
    elif reanchored:
        message = "Evidence re-anchored with updated file hash and verified."

    if verification is not None:
        _log_blockchain_event(
            "evidence_auto_verification",
            success=verification_success,
            details={
                "ledgerId": ledger_id,
                "evidenceId": str(evidence.get("_id")),
                "reanchored": reanchored,
            },
            is_critical=None if verification_success else True,
        )

        if not verification_success:
            current_app.logger.warning(
                "Tamper detection triggered for evidence %s (ledger %s)",
                evidence_id,
                ledger_id,
            )

    if reanchored:
        _log_blockchain_event(
            "evidence_reanchored",
            success=True,
            details={
                "ledgerId": ledger_id,
                "evidenceId": str(evidence.get("_id")),
            },
        )

    response_payload = {
        "message": message,
        "record": record,
        "summary": summary,
        "verification": verification,
        "reanchored": reanchored,
    }

    return jsonify(response_payload)


@blockchain_bp.get("/verify/<string:evidence_id>")
def verify_evidence(evidence_id: str):
    _require_role({"admin"})
    evidence = _find_evidence(evidence_id)
    if not evidence:
        abort(404, description="Evidence not found")

    ledger_id = _ensure_ledger_id(evidence)
    if not ledger_id:
        abort(404, description="Evidence has not been anchored")

    local_hash = request.args.get("local_hash") or request.args.get("localHash")
    if not local_hash:
        local_hash = (evidence.get("file") or {}).get("hash")
    if not local_hash:
        abort(400, description="local_hash query parameter required when evidence file hash is unavailable")

    service = _get_service()
    try:
        verification = service.verify_evidence(
            ledger_id,
            local_hash,
            reference_id=str(evidence.get("_id")),
        )
    except Exception as exc:
        abort(502, description=f"Verification failed: {exc}")

    _evidence_collection().update_one(
        {"_id": evidence["_id"]},
        {
            "$set": {
                "verified": bool(verification.get("verified")),
            }
        },
    )

    _log_blockchain_event(
        "evidence_manual_verification",
        success=bool(verification.get("verified")),
        details={
            "ledgerId": ledger_id,
            "evidenceId": evidence_id,
        },
        is_critical=None if verification.get("verified") else True,
    )

    if not verification.get("verified"):
        current_app.logger.warning(
            "Manual verification detected tampering for evidence %s (ledger %s)",
            evidence_id,
            ledger_id,
        )

    return jsonify({"message": "Verification completed", "verification": verification})


@blockchain_bp.get("/get/<string:evidence_id>")
def get_onchain_record(evidence_id: str):
    _require_role({"admin", "investigator"})
    evidence = _find_evidence(evidence_id)
    if not evidence:
        abort(404, description="Evidence not found")

    ledger_id = _ensure_ledger_id(evidence)
    if not ledger_id:
        abort(404, description="Evidence has not been anchored")

    service = _get_service()
    try:
        record = service.get_evidence(ledger_id)
    except Exception as exc:
        abort(502, description=f"Unable to fetch on-chain record: {exc}")

    return jsonify({"ledgerId": ledger_id, "record": record})


def _pdf_lines_for_record(record: dict) -> list:
    description = record.get("description") or record.get("action") or record.get("verification_status") or "Event"
    timestamp = _format_timestamp(record.get("blockchain_timestamp") or record.get("created_at"))
    parts = [f"• {timestamp} | {description}"]

    if record.get("transaction_hash"):
        parts.append(f"  Tx: {record['transaction_hash']}")
    if record.get("block_number") is not None:
        parts.append(f"  Block: {record['block_number']}")
    if record.get("uploader_address"):
        parts.append(f"  Uploader: {record['uploader_address']}")
    if record.get("from"):
        parts.append(f"  From: {record['from']}")
    if record.get("to"):
        parts.append(f"  To: {record['to']}")
    if record.get("file_hash"):
        parts.append(f"  File hash: {record['file_hash']}")
    if record.get("verified") is not None:
        parts.append(f"  Verified: {record['verified']}")

    return parts


@blockchain_bp.get("/report/summary.pdf")
def blockchain_summary_report():
    _require_role({"admin"})
    records_cursor = _records_collection().find().sort([("created_at", -1)])
    records = list(records_cursor)

    lines = [
        "Blockchain Ledger Summary",
        f"Generated at: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}",
        f"Total records: {len(records)}",
        "",
    ]

    if not records:
        lines.append("No blockchain activity recorded yet.")
    else:
        for record in records:
            lines.extend(_pdf_lines_for_record(record))
            lines.append("")

    buffer = _render_pdf("Blockchain Ledger Summary", lines)
    return send_file(
        buffer,
        mimetype="application/pdf",
        as_attachment=True,
        download_name="blockchain-summary.pdf",
    )


@blockchain_bp.get("/report/chain-of-custody/<string:evidence_id>.pdf")
def chain_of_custody_report(evidence_id: str):
    _require_role({"admin", "investigator"})
    evidence = _find_evidence(evidence_id)
    if not evidence:
        abort(404, description="Evidence not found")

    ledger_id = _ensure_ledger_id(evidence)
    if not ledger_id:
        abort(404, description="Evidence has not been anchored")

    query = {"ledger_id": ledger_id}
    records_cursor = _records_collection().find(query).sort([("created_at", 1), ("blockchain_timestamp", 1)])
    records = list(records_cursor)

    if not records:
        abort(404, description="No blockchain records found for evidence")

    title = evidence.get("title") or "Evidence"
    case_title = evidence.get("caseTitle") or evidence.get("caseId") or "Unknown case"

    lines = [
        f"Chain of custody for {title}",
        f"Case: {case_title}",
        f"Ledger ID: {ledger_id}",
        "",
    ]

    for record in records:
        lines.extend(_pdf_lines_for_record(record))
        lines.append("")

    buffer = _render_pdf("Chain of Custody", lines)
    filename = f"chain-of-custody-{_slugify(title)}.pdf"
    return send_file(
        buffer,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )
