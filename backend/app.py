# app.py (full file - corrected and integrated with X-LAD)
import os
import re
import csv
import hashlib
import ssl
import smtplib
import threading
import time
from io import BytesIO, StringIO
from uuid import uuid4
from ipaddress import ip_address
from datetime import datetime, timedelta
from typing import Dict, Optional

from flask import Flask, jsonify, request, g, send_file, abort, Response
from flask_cors import CORS
from pymongo import MongoClient
from dotenv import load_dotenv
from bson import ObjectId
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

# --- PDF Generation ---
from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas

# --- Service Imports ---
from api.services.activity_log_service import ActivityLogService
from api.services.blockchain_service import init_blockchain_service
# X-LAD service (user uploaded)
from api.services.log_anomaly_service import LogAnomalyService

# --- Route Blueprints ---
from api.routes.blockchain_routes import blockchain_bp
from api.routes.xai_routes import xai_bp
# [ADDON] Log Routes (user uploaded)
from api.routes.log_routes import log_bp


# --- Global Database & Service References ---
mongo_client = None
db = None
admin_collection = None
accounts_collection = None
cases_collection = None
case_requests_collection = None
evidence_collection = None
activity_collection = None
activity_log_service = None
xai_insights_collection = None
blockchain_records_collection = None
chain_of_custody_collection = None
# [ADDON] Global
system_logs_collection = None

# --- Sensitivity keys for scrubbing
SENSITIVE_KEYS = {
    "password",
    "password_hash",
    "token",
    "access_token",
    "refresh_token",
    "authorization",
    "ssn",
    "credit_card",
    "cc_number",
    "cvv",
    "secret",
    "smtp_password",
    "api_key",
    "api_token",
}


def init_db(url: str):
    """Initializes the MongoDB connection and collections."""
    global mongo_client, db, admin_collection, accounts_collection, cases_collection, case_requests_collection
    global evidence_collection
    global activity_collection, xai_insights_collection
    global blockchain_records_collection, chain_of_custody_collection, activity_log_service
    # [ADDON] Global
    global system_logs_collection

    if mongo_client:
        return

    mongo_client = MongoClient(url)
    db = mongo_client["BXAI"]

    # Initialize Collections
    admin_collection = db["admins"]
    accounts_collection = db["accounts"]
    cases_collection = db["cases"]
    case_requests_collection = db["case_requests"]
    evidence_collection = db["evidence"]
    activity_collection = db["activity_logs"]
    xai_insights_collection = db["xai_insights"]
    blockchain_records_collection = db["blockchain_records"]
    chain_of_custody_collection = db["chain_of_custody"]

    # [ADDON] Point system_logs to activity_logs for live analysis
    system_logs_collection = db["activity_logs"]

    # Initialize Services & Indexes
    activity_log_service = ActivityLogService(activity_collection)
    xai_insights_collection.create_index("evidenceId", unique=True)
    xai_insights_collection.create_index("caseId")
    xai_insights_collection.create_index("createdAt")


def create_app():
    """Configures and creates the Flask application factory."""
    load_dotenv()
    app = Flask(__name__)

    # --- CORS Configuration ---
    raw_origins = os.getenv("FRONTEND_ORIGINS")
    if raw_origins:
        allowed_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    else:
        allowed_origins = [
            os.getenv("FRONTEND_ORIGIN", "http://localhost:5173"),
            "http://127.0.0.1:5173",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
            "http://localhost:5000",
            "http://127.0.0.1:5000",
        ]

    seen = set()
    normalized_origins = []
    for origin in allowed_origins:
        if not origin or origin in seen:
            continue
        seen.add(origin)
        normalized_origins.append(origin)

    upload_dir = os.getenv("EVIDENCE_UPLOAD_DIR") or os.path.join(os.getcwd(), "uploads", "evidence")
    os.makedirs(upload_dir, exist_ok=True)
    app.config["EVIDENCE_UPLOAD_DIR"] = upload_dir

    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": normalized_origins,
                "allow_headers": ["Content-Type", "X-Account-Role"],
                "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            }
        },
        supports_credentials=True,
    )

    # --- Database Connection ---
    mongo_url = os.getenv("MONGODB_URL")
    if not mongo_url:
        raise RuntimeError("MONGODB_URL is not set. Please update backend/.env")

    init_db(mongo_url)

    # --- Register Blueprints ---
    app.register_blueprint(blockchain_bp, url_prefix="/api/blockchain")
    app.register_blueprint(xai_bp, url_prefix="/api/xai")
    # [ADDON] Register
    app.register_blueprint(log_bp, url_prefix="/api/logs")

    app.config["ACTIVITY_LOG_SERVICE"] = activity_log_service

    # [ADDON] --- X-LAD Background Service Integration ---
    # Use activity_collection to see live logs
    log_service = LogAnomalyService(activity_collection)

    # Background Thread to process logs
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        print("X-LAD: Initializing Fast Mode...")
        log_service.reset_stuck_logs()

        def background_log_processor():
            with app.app_context():
                while True:
                    try:
                        # Process pending logs. If 0 processed, sleep 2s.
                        if log_service.analyze_pending_logs() == 0:
                            time.sleep(2)
                    except Exception as e:
                        print(f"Background Log Worker Error: {e}")
                        time.sleep(5)

        threading.Thread(target=background_log_processor, daemon=True).start()
    # --------------------------------------------------

    # --- Config Helpers ---
    app.config["MONGO_COLLECTIONS"] = {
        "db": db,
        "admins": admin_collection,
        "accounts": accounts_collection,
        "cases": cases_collection,
        "evidence": evidence_collection,
        "activity": activity_collection,
        "xai_insights": xai_insights_collection,
        "blockchain_records": blockchain_records_collection,
        "chain_of_custody": chain_of_custody_collection,
        "system_logs": system_logs_collection # [ADDON]
    }

    xai_artifact_root = os.getenv("XAI_ARTIFACT_DIR") or os.path.join(os.getcwd(), "uploads", "xai")
    os.makedirs(xai_artifact_root, exist_ok=True)
    app.config["XAI_ARTIFACT_DIR"] = xai_artifact_root

    # --- Admin Seeding & SMTP ---
    ADMIN_EMAIL = "raghu.bldeacet17@gmail.com"
    ADMIN_PASSWORD_HASH = "scrypt:32768:8:1$TuNy3BHBx1Px2lW9$a900d6b74cb440518fd8f1f51bdfbca9aa0d52b40f724e6f6d2af3bc61b52047594422f631717433501f15cd2fb080c60ce903c06d821463818d30a59ff2dd50"

    smtp_settings = {
        "host": os.getenv("SMTP_HOST"),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "username": os.getenv("SMTP_USERNAME"),
        "password": os.getenv("SMTP_PASSWORD"),
        "from_email": os.getenv("SMTP_FROM_EMAIL"),
        "use_tls": os.getenv("SMTP_USE_TLS", "true").lower() == "true",
        "use_ssl": os.getenv("SMTP_USE_SSL", "false").lower() == "true",
    }

    def seed_admin():
        admin_collection.update_one(
            {"email": ADMIN_EMAIL},
            {
                "$set": {
                    "email": ADMIN_EMAIL,
                    "password_hash": ADMIN_PASSWORD_HASH,
                    "name": "BXAI Admin",
                }
            },
            upsert=True,
        )

    seed_admin()

    # --- Helpers & Routes ---

    def _blockchain_service():
        service = getattr(app, "_blockchain_service", None)
        if service is None:
            collections = app.config.get("MONGO_COLLECTIONS")
            if not collections:
                raise RuntimeError("Database collections not initialised for blockchain service")
            app._blockchain_service = init_blockchain_service(
                collections["blockchain_records"],
                chain_collection=collections.get("chain_of_custody"),
            )
            service = app._blockchain_service
        return service

    @app.after_request
    def _ensure_cors_headers(response):
        origin = request.headers.get("Origin")
        allow_origin = None
        if origin and (not normalized_origins or origin in normalized_origins):
            allow_origin = origin
        elif not origin:
            allow_origin = "*"
        elif origin not in normalized_origins:
            allow_origin = "*"

        if allow_origin:
            response.headers["Access-Control-Allow-Origin"] = allow_origin
            if allow_origin != "*":
                response.headers.setdefault("Access-Control-Allow-Credentials", "true")
            response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type, X-Account-Role")
            response.headers.setdefault(
                "Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            )
            vary_header = response.headers.get("Vary")
            if vary_header:
                if "Origin" not in vary_header:
                    response.headers["Vary"] = f"{vary_header}, Origin"
            else:
                response.headers["Vary"] = "Origin"
        return response

    def _activity_service():
        service = app.config.get("ACTIVITY_LOG_SERVICE")
        if not service:
            raise RuntimeError("Activity log service not initialised")
        return service

    def _client_ip():
        forwarded = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
        candidate = forwarded or request.remote_addr or ""
        try:
            return str(ip_address(candidate))
        except ValueError:
            return candidate or None

    def _scrub_payload(value):
        if isinstance(value, dict):
            return {key: ("***" if key in SENSITIVE_KEYS else _scrub_payload(val)) for key, val in value.items()}
        if isinstance(value, list):
            return [_scrub_payload(item) for item in value]
        return value

    def _scrubbed_hash(value):
        try:
            serialized = repr(value).encode("utf-8")
        except Exception:
            return None
        return hashlib.sha256(serialized).hexdigest()

    def _resolve_user_context(payload):
        headers = request.headers
        user_id = headers.get("X-Account-Id") or headers.get("X-User-Id") or headers.get("X-Admin-Id")
        user_role = headers.get("X-Account-Role") or headers.get("X-User-Role")
        if not user_id and isinstance(payload, dict):
            user_id = payload.get("accountId") or payload.get("userId") or payload.get("adminId")
        if not user_role and isinstance(payload, dict):
            user_role = payload.get("role") or payload.get("userRole")
        return user_id, user_role

    def _auth_user_details(document):
        if not document:
            return None, None
        identifier = document.get("_id")
        if isinstance(identifier, ObjectId):
            identifier = str(identifier)
        role = document.get("role") or ("admin" if document.get("email") == ADMIN_EMAIL else None)
        return identifier, role

    def _resolve_action_type(method: str, endpoint: Optional[str], path: str) -> str:
        mapping = {
            ("POST", "admin_login"): "admin_login",
            ("POST", "auth_login"): "login",
            ("POST", "signup"): "create_account",
            ("POST", "create_case"): "create_case",
            ("POST", "create_evidence"): "create_evidence",
            ("GET", "admin_summary"): "view_admin_summary",
            ("POST", "admin_update_case_request_status"): "update_case_request",
        }
        key = (method.upper(), endpoint)
        if key in mapping:
            return mapping[key]
        normalized_path = path.strip("/").replace("/", "_").replace("-", "_") or "root"
        return f"{method.lower()}_{normalized_path}"

    def _log_auth_event(
        action_type: str,
        *,
        user_id: Optional[str],
        user_role: Optional[str],
        success: bool,
        details: Optional[dict] = None,
        is_critical: Optional[bool] = None,
    ) -> None:
        try:
            service = _activity_service()
            payload = {"success": success}
            if details:
                payload.update(details)
            service.log(
                user_id=user_id,
                user_role=user_role,
                action_type=action_type,
                action_details=payload,
                ip_address=_client_ip(),
                user_agent=request.headers.get("User-Agent"),
                timestamp_start=datetime.utcnow(),
                timestamp_end=datetime.utcnow(),
                is_critical=is_critical,
            )
        except Exception as exc:
            app.logger.exception("Failed to record auth event: %s", exc)

    # Move login helpers inside create_app so they can call _log_auth_event
    def _log_login_success(account_document, action_type="login"):
        try:
            identifier = account_document.get("_id")
            user_id = str(identifier) if identifier is not None else None
        except Exception:
            user_id = None

        user_role = account_document.get("role", "admin") if isinstance(account_document, dict) else "admin"

        _log_auth_event(
            action_type,
            user_id=user_id,
            user_role=user_role,
            success=True,
            details={"email": account_document.get("email") if isinstance(account_document, dict) else None},
            is_critical=True,
        )

    def _log_login_failure(identifier, action_type="login", reason="invalid_credentials"):
        _log_auth_event(
            action_type,
            user_id=identifier,
            user_role=None,
            success=False,
            details={"reason": reason},
            is_critical=True,
        )

    def _close_session(
        action_type: str,
        *,
        user_id: Optional[str],
        user_role: Optional[str],
        success: bool = True,
        details: Optional[dict] = None,
    ) -> None:
        if not user_id:
            _log_auth_event(
                action_type,
                user_id=None,
                user_role=user_role,
                success=success,
                details={"note": "Missing userId", **(details or {})},
            )
            return

        try:
            service = _activity_service()
            service.end_active_session(
                user_id=user_id,
                termination_action=action_type,
                action_details=details,
            )
        except Exception as exc:
            app.logger.exception("Failed to end session for %s: %s", user_id, exc)

        _log_auth_event(
            action_type,
            user_id=user_id,
            user_role=user_role,
            success=success,
            details=details,
        )

    @app.before_request
    def attach_collections():
        g.mongo = {
            "db": db,
            "admins": admin_collection,
            "accounts": accounts_collection,
            "cases": cases_collection,
            "evidence": evidence_collection,
            "activity": activity_collection,
            "xai_insights": xai_insights_collection,
            "blockchain_records": blockchain_records_collection,
            "chain_of_custody": chain_of_custody_collection,
            "system_logs": system_logs_collection # [ADDON]
        }
        g.request_started_at = datetime.utcnow()
        g.request_payload = None
        g.request_user_id = None
        g.request_user_role = None
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            payload = request.get_json(silent=True)
            if payload:
                scrubbed = _scrub_payload(payload)
                g.request_payload = scrubbed
                g.request_payload_hash = _scrubbed_hash(scrubbed)
                user_id, user_role = _resolve_user_context(payload)
                g.request_user_id = user_id
                g.request_user_role = user_role
        else:
            g.request_user_id, g.request_user_role = _resolve_user_context(request.args.to_dict())
            g.request_payload_hash = _scrubbed_hash(request.args.to_dict())

    @app.after_request
    def log_request_activity(response):
        if request.method == "OPTIONS":
            return response
        try:
            service = _activity_service()
            duration_end = datetime.utcnow()
            action_type = _resolve_action_type(request.method, request.endpoint, request.path)
            service.log(
                user_id=g.get("request_user_id"),
                user_role=g.get("request_user_role"),
                action_type=action_type,
                action_details={
                    "query": request.args.to_dict(flat=False),
                    "payload": g.get("request_payload"),
                    "payloadHash": g.get("request_payload_hash"),
                },
                ip_address=_client_ip(),
                user_agent=request.headers.get("User-Agent"),
                timestamp_start=g.get("request_started_at"),
                timestamp_end=duration_end,
                request_method=request.method,
                request_path=request.path,
                status_code=response.status_code,
                client_timestamp=request.headers.get("X-Client-Timestamp"),
            )
        except Exception as logging_error:
            app.logger.exception("Failed to record activity log: %s", logging_error)
        return response

    def _render_pdf(title: str, lines):
        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=LETTER)
        width, height = LETTER
        margin_x = 72
        margin_y = 72
        y_position = height - margin_y

        pdf.setTitle(title)
        pdf.setFont("Helvetica-Bold", 16)
        pdf.drawString(margin_x, y_position, title)
        y_position -= 32

        pdf.setFont("Helvetica", 10)
        timestamp = datetime.utcnow().strftime("Generated %Y-%m-%d %H:%M UTC")
        pdf.drawString(margin_x, y_position, timestamp)
        y_position -= 24

        pdf.setFont("Helvetica", 11)
        for line in lines:
            text = line if isinstance(line, str) else str(line)

            if y_position < margin_y:
                pdf.showPage()
                y_position = height - margin_y
                pdf.setFont("Helvetica", 11)

            pdf.drawString(margin_x, y_position, text)
            y_position -= 16

        pdf.showPage()
        pdf.save()
        buffer.seek(0)
        return buffer

    # --- Login Routes (Preserved) ---
    # (Rest of your existing endpoints remain unchanged)
    # I am pasting the existing login/signup logic here to ensure the file is complete.

    @app.post("/api/admin/login")
    def admin_login():
        payload = request.get_json(force=True)
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""

        admin = admin_collection.find_one({"email": email})
        if not admin:
            _log_login_failure(email, action_type="admin_login", reason="admin_not_found")
            return jsonify({"message": "Invalid credentials"}), 401

        if not check_password_hash(admin.get("password_hash", ""), password):
            _log_login_failure(email, action_type="admin_login", reason="password_mismatch")
            return jsonify({"message": "Invalid credentials"}), 401

        response_payload = {
            "message": "Login successful",
            "admin": {
                "_id": str(admin.get("_id")),
                "email": admin.get("email", ADMIN_EMAIL),
                "name": admin.get("name", "BXAI Admin"),
            },
        }
        _log_login_success(admin, action_type="admin_login")
        return jsonify(response_payload)

    @app.post("/api/auth/signup")
    def signup():
        payload = request.get_json(force=True)
        role = payload.get("role")
        if role not in {"investigator", "user"}:
            return jsonify({"message": "Role must be 'investigator' or 'user'"}), 400

        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password")
        first_name = (payload.get("firstName") or "").strip()
        last_name = (payload.get("lastName") or "").strip()
        if not all([email, password, first_name, last_name]):
            return jsonify({"message": "Missing required fields"}), 400

        if accounts_collection.find_one({"email": email}) or email == ADMIN_EMAIL:
            return jsonify({"message": "An account with this email already exists"}), 409

        account_document = {
            "email": email,
            "password_hash": generate_password_hash(password),
            "firstName": first_name,
            "lastName": last_name,
            "role": role,
            "organization": payload.get("organization"),
            "idNumber": payload.get("idNumber"),
            "createdAt": datetime.utcnow(),
        }

        result = accounts_collection.insert_one(account_document)
        account_document["_id"] = str(result.inserted_id)

        _log_auth_event(
            "create_account",
            user_id=account_document["_id"],
            user_role=role,
            success=True,
            details={"email": account_document["email"], "role": role},
            is_critical=True,
        )

        return (
            jsonify(
                {
                    "message": "Account created",
                    "account": {
                        "_id": account_document["_id"],
                        "email": account_document["email"],
                        "firstName": account_document["firstName"],
                        "lastName": account_document["lastName"],
                        "role": account_document["role"],
                        "organization": account_document.get("organization"),
                        "idNumber": account_document.get("idNumber"),
                    },
                }
            ),
            201,
        )

    @app.post("/api/auth/login")
    def auth_login():
        payload = request.get_json(force=True)
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password")

        if not email or not password:
            _log_login_failure(email or "<missing>", action_type="login", reason="missing_credentials")
            return jsonify({"message": "Email and password are required"}), 400

        if email == ADMIN_EMAIL:
            admin = admin_collection.find_one({"email": ADMIN_EMAIL})
            if admin and check_password_hash(admin.get("password_hash", ""), password):
                _log_login_success({**admin, "role": "admin"}, action_type="login")
                return jsonify(
                    {
                        "message": "Login successful",
                        "account": {
                            "_id": str(admin.get("_id")),
                            "email": ADMIN_EMAIL,
                            "name": admin.get("name", "BXAI Admin"),
                            "role": "admin",
                        },
                    }
                )
            _log_login_failure(email, action_type="login", reason="admin_password_mismatch")
            return jsonify({"message": "Invalid credentials"}), 401

        account = accounts_collection.find_one({"email": email})
        if not account:
            _log_login_failure(email, action_type="login", reason="account_not_found")
            return jsonify({"message": "Invalid credentials"}), 401

        if not check_password_hash(account.get("password_hash", ""), password):
            _log_login_failure(email, action_type="login", reason="password_mismatch")
            return jsonify({"message": "Invalid credentials"}), 401

        _log_login_success(account, action_type="login")
        return jsonify(
            {
                "message": "Login successful",
                "account": {
                    "_id": str(account.get("_id")),
                    "email": account.get("email"),
                    "name": f"{account.get('firstName', '')} {account.get('lastName', '')}".strip() or account.get("email"),
                    "role": account.get("role"),
                    "organization": account.get("organization"),
                },
            }
        )

    @app.post("/api/auth/logout")
    def auth_logout():
        payload = request.get_json(silent=True) or {}
        user_id, user_role = _extract_identity(payload) if ' _extract_identity' in globals() else (None, None)
        reason = payload.get("reason") or "client_logout"
        _close_session(
            "logout",
            user_id=user_id,
            user_role=user_role,
            details={"reason": reason},
        )
        return jsonify({"message": "Logout recorded"})

    # Small helper used above (make sure it's available)
    def _extract_identity(payload):
        headers = request.headers
        user_id = headers.get("X-Account-Id") or headers.get("X-User-Id") or headers.get("X-Admin-Id")
        user_role = headers.get("X-Account-Role") or headers.get("X-User-Role")
        if not user_id and isinstance(payload, dict):
            user_id = payload.get("accountId") or payload.get("userId") or payload.get("adminId")
        if not user_role and isinstance(payload, dict):
            user_role = payload.get("role") or payload.get("userRole")
        return user_id, user_role

    @app.post("/api/admin/logout")
    def admin_logout():
        payload = request.get_json(silent=True) or {}
        payload.setdefault("role", "admin")
        payload.setdefault("userRole", "admin")
        payload.setdefault("adminId", payload.get("userId") or payload.get("accountId"))
        user_id, user_role = _extract_identity(payload)
        reason = payload.get("reason") or "admin_logout"
        _close_session(
            "admin_logout",
            user_id=user_id,
            user_role=user_role or "admin",
            details={"reason": reason},
        )
        return jsonify({"message": "Admin logout recorded"})

    @app.post("/api/auth/session/expire")
    def auth_session_expire():
        payload = request.get_json(force=True)
        user_id, user_role = _extract_identity(payload)
        metadata = {
            "reason": payload.get("reason") or "server_expired",
            "source": payload.get("source") or "system",
        }
        _close_session(
            "session_expired",
            user_id=user_id,
            user_role=user_role,
            success=False,
            details=metadata,
        )
        return jsonify({"message": "Session expired"})

    @app.post("/api/auth/heartbeat")
    def auth_heartbeat():
        payload = request.get_json(force=True)
        user_id, user_role = _extract_identity(payload)
        service = _activity_service()
        timeout_seconds = payload.get("timeoutSeconds")
        result = service.record_heartbeat(user_id=user_id, timeout_seconds=timeout_seconds)
        status = result.get("status")
        if status == "timed_out":
            _log_auth_event(
                "session_timeout",
                user_id=user_id,
                user_role=user_role,
                success=False,
                details=result,
            )
        return jsonify(result)

    def _safe_object_id(account_id):
        try:
            return ObjectId(account_id)
        except Exception:
            return None

    def _recent_activity_for_actor(actor_identifier):
        cursor = (
            activity_collection.find({"actor": actor_identifier})
            .sort("timestamp", -1)
            .limit(5)
        )
        activities = []
        for item in cursor:
            activities.append(
                {
                    "description": item.get("description", "Activity recorded"),
                    "timestamp": item.get("timestamp"),
                    "actor": item.get("actor", "system"),
                }
            )
        return activities

    def _require_admin_request():
        role = (request.headers.get("X-Account-Role") or "").lower()
        if role != "admin":
            abort(403, description="Admin role required")

    def _parse_pagination():
        try:
            limit = int(request.args.get("limit", 50))
        except ValueError:
            limit = 50
        limit = max(1, min(limit, 200))
        try:
            skip = int(request.args.get("skip", 0))
        except ValueError:
            skip = 0
        skip = max(0, skip)
        return limit, skip

    def _build_activity_filters():
        filters = {}
        user_id = request.args.get("userId")
        user_role = request.args.get("userRole")
        action_type = request.args.get("actionType")
        is_critical = request.args.get("isCritical")
        has_tx_hash = request.args.get("hasTxHash")
        keyword = request.args.get("q")
        date_from = request.args.get("dateFrom")
        date_to = request.args.get("dateTo")

        if user_id:
            filters["userId"] = user_id
        if user_role:
            filters["userRole"] = user_role
        if action_type:
            filters["actionType"] = action_type
        if is_critical is not None:
            if is_critical.lower() in {"true", "1", "yes"}:
                filters["isCritical"] = True
            elif is_critical.lower() in {"false", "0", "no"}:
                filters["isCritical"] = False
        if has_tx_hash:
            if has_tx_hash.lower() in {"true", "1", "yes"}:
                filters["txHash"] = {"$exists": True, "$ne": None}
            elif has_tx_hash.lower() in {"false", "0", "no"}:
                filters["txHash"] = {"$in": [None, ""]}
        if keyword:
            regex = re.compile(re.escape(keyword), re.IGNORECASE)
            filters["$or"] = [
                {"actionType": regex},
                {"userId": regex},
                {"userRole": regex},
                {"actionDetails": {"$regex": regex}},
            ]
        if date_from or date_to:
            range_filter = {}
            if date_from:
                try:
                    start_dt = datetime.fromisoformat(date_from)
                    range_filter["$gte"] = start_dt
                except ValueError:
                    pass
            if date_to:
                try:
                    end_dt = datetime.fromisoformat(date_to)
                    range_filter["$lte"] = end_dt
                except ValueError:
                    pass
            if range_filter:
                filters["timestampStart"] = range_filter

        return filters

    def _can_view_sensitive():
        privilege = (request.headers.get("X-Admin-Privilege") or "").lower()
        return privilege in {"superadmin", "auditor"}

    def _mask_ip(record):
        if not record:
            return record
        if _can_view_sensitive():
            return record
        ip_value = record.get("ipAddress")
        if not ip_value:
            return record
        parts = ip_value.split(".")
        if len(parts) == 4:
            record["ipAddress"] = ".".join(parts[:2] + ["*"] * 2)
        else:
            record["ipAddress"] = "***"
        return record

    def _serialize_log(document):
        serialized = activity_log_service.serialize(document)
        if not serialized:
            return None
        return _mask_ip(serialized)

    def _format_datetime(value):
        if value is None:
            return None
        if isinstance(value, (int, float)):
            try:
                return datetime.utcfromtimestamp(value).isoformat()
            except Exception:
                return value
        if isinstance(value, datetime):
            return value.isoformat()
        return value

    def _clean_for_json(value):
        if value is None:
            return None
        if isinstance(value, ObjectId):
            return str(value)
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, (int, float, str, bool)):
            return value
        if isinstance(value, dict):
            return {key: _clean_for_json(val) for key, val in value.items()}
        if isinstance(value, (list, tuple, set)):
            return [_clean_for_json(item) for item in value]
        return value

    def _serialize_chain_entry(document):
        details = document.get("details", {}) or {}
        evidence_id = document.get("evidence_id") or details.get("evidence_id")
        evidence_id = str(evidence_id) if isinstance(evidence_id, ObjectId) else evidence_id
        action = document.get("action") or details.get("action") or details.get("verification_status")
        network = document.get("network") or document.get("details", {}).get("network")
        block_number = document.get("block_number") or document.get("details", {}).get("block_number")
        transaction_hash = document.get("transaction_hash") or document.get("details", {}).get("transaction_hash")
        uploader = details.get("uploader_address") or details.get("from")
        verified = details.get("verified")
        file_hash = details.get("file_hash") or details.get("hash")
        sanitized_details = _clean_for_json(details)

        return {
            "_id": str(document.get("_id")),
            "evidenceId": evidence_id,
            "action": action,
            "network": network,
            "blockNumber": block_number,
            "transactionHash": transaction_hash,
            "uploader": uploader,
            "timestamp": _format_datetime(document.get("blockchain_timestamp") or document.get("created_at")),
            "verified": verified,
            "fileHash": file_hash,
            "details": sanitized_details,
        }

    def _build_chain_of_custody_payload(case_id: Optional[str], evidence_id: Optional[str]):
        normalized_case = (case_id or "").strip()
        normalized_evidence = (evidence_id or "").strip()

        base_payload = {
            "case": None,
            "evidence": [],
            "timeline": [],
            "filters": {
                "caseId": normalized_case or None,
                "evidenceId": normalized_evidence or None,
            },
            "count": 0,
        }

        if chain_of_custody_collection is None:
            return base_payload

        case_cache = {}
        evidence_cache = {}

        def _ensure_case(identifier):
            if not identifier:
                return None
            key = str(identifier)
            if key in case_cache:
                return case_cache[key]

            case_document = None
            object_id = _safe_object_id(identifier)
            if object_id:
                case_document = cases_collection.find_one({"_id": object_id})
            if not case_document:
                case_document = cases_collection.find_one({"caseNumber": identifier})

            if not case_document:
                case_cache[key] = None
                return None

            summary = _serialize_case(case_document)
            case_cache[key] = summary
            return summary

        def _cache_evidence(document):
            if not document:
                return None
            serialized = _serialize_evidence(document)
            evidence_cache[serialized["_id"]] = serialized
            if serialized.get("caseId"):
                _ensure_case(serialized["caseId"])
            return serialized

        def _ensure_evidence(identifier):
            if not identifier:
                return None
            key = str(identifier)
            cached = evidence_cache.get(key)
            if cached is not None:
                return cached

            document = None
            object_id = _safe_object_id(identifier)
            if object_id:
                document = evidence_collection.find_one({"_id": object_id})
            if not document:
                document = evidence_collection.find_one({"_id": identifier})

            if not document:
                evidence_cache[key] = None
                return None

            serialized = _serialize_evidence(document)
            evidence_cache[serialized["_id"]] = serialized
            if serialized.get("caseId"):
                _ensure_case(serialized["caseId"])
            return serialized

        case_summary = _ensure_case(normalized_case) if normalized_case else None
        if normalized_case and not case_summary:
            raise ValueError("Case not found")

        evidence_filter_ids = set()

        if normalized_evidence:
            evidence_summary = _ensure_evidence(normalized_evidence)
            if not evidence_summary:
                raise ValueError("Evidence not found")
            evidence_filter_ids.add(evidence_summary["_id"])
            if not case_summary and evidence_summary.get("caseId"):
                case_summary = _ensure_case(evidence_summary.get("caseId"))
        elif normalized_case:
            documents = list(evidence_collection.find({"caseId": normalized_case}))
            if not documents:
                object_id = _safe_object_id(normalized_case)
                if object_id:
                    documents = list(evidence_collection.find({"caseId": str(object_id)}))
            for document in documents:
                summary = _cache_evidence(document)
                if summary:
                    evidence_filter_ids.add(summary["_id"])
        else:
            for document in evidence_collection.find().sort("updatedAt", -1).limit(50):
                summary = _cache_evidence(document)
                if summary:
                    evidence_filter_ids.add(summary["_id"])

        query = {}
        if evidence_filter_ids:
            query["evidence_id"] = {"$in": list(evidence_filter_ids)}

        sort_spec = [("created_at", -1), ("blockchain_timestamp", -1)]
        cursor = chain_of_custody_collection.find(query).sort(sort_spec)
        if not normalized_evidence and not normalized_case:
            cursor = cursor.limit(200)
        records = list(cursor)
        records.reverse()

        timeline = []
        for document in records:
            entry = _serialize_chain_entry(document)
            evidence_identifier = entry.get("evidenceId")
            evidence_summary = None
            if evidence_identifier:
                evidence_summary = _ensure_evidence(evidence_identifier)
            if evidence_summary:
                evidence_filter_ids.add(evidence_summary["_id"])
            case_info = None
            if evidence_summary and evidence_summary.get("caseId"):
                case_info = _ensure_case(evidence_summary.get("caseId"))
                if not case_summary and case_info:
                    case_summary = case_info
            entry["evidence"] = evidence_summary
            entry["case"] = case_info
            timeline.append(entry)

        evidence_list = [value for value in evidence_cache.values() if value]
        evidence_list.sort(key=lambda item: ((item.get("caseTitle") or "") + (item.get("title") or "")))

        if not case_summary and evidence_list:
            first_case_id = next((item.get("caseId") for item in evidence_list if item.get("caseId")), None)
            if first_case_id:
                case_summary = _ensure_case(first_case_id)

        payload = {
            "case": case_summary,
            "evidence": evidence_list,
            "timeline": timeline,
            "filters": {
                "caseId": normalized_case or None,
                "evidenceId": normalized_evidence or None,
            },
            "count": len(timeline),
        }

        return payload

    def _anchorable_hash(document: dict) -> str:
        filtered = {
            key: value
            for key, value in document.items()
            if key
            not in {
                "_id",
                "createdAt",
                "updatedAt",
                "txHash",
                "anchoredAt",
                "blockchain",
            }
        }
        serialized = repr(sorted(filtered.items())).encode("utf-8")
        return hashlib.sha256(serialized).hexdigest()

    def _anchor_activity_log(document: dict) -> dict:
        if not document:
            raise ValueError("Activity log not found")
        service = _blockchain_service()
        anchor_hash = _anchorable_hash(document)
        ledger_id = "0x" + anchor_hash
        description = document.get("actionType") or "activity_event"
        try:
            record = service.anchor_evidence(
                ledger_id,
                "0x" + anchor_hash,
                description,
                service.admin_account.address,
                reference_id=str(document.get("_id")),
            )
        except Exception as exc:
            raise RuntimeError(f"Failed to anchor activity log: {exc}")

        tx_hash = record.get("transaction_hash")
        if tx_hash:
            activity_collection.update_one(
                {"_id": ObjectId(document["_id"]) if ObjectId.is_valid(document["_id"]) else document["_id"]},
                {
                    "$set": {
                        "txHash": tx_hash,
                        "anchoredAt": datetime.utcnow(),
                        "blockchain": record,
                    }
                },
            )
        return record

    def _serialize_case(document):
        assigned_to = document.get("assignedTo")
        if isinstance(assigned_to, ObjectId):
            assigned_to = str(assigned_to)
        elif assigned_to is not None:
            assigned_to = str(assigned_to)

        stakeholders = document.get("stakeholders") or []
        stakeholder_count = len(stakeholders) if isinstance(stakeholders, list) else 0

        return {
            "_id": str(document.get("_id")),
            "title": document.get("title"),
            "caseNumber": document.get("caseNumber"),
            "status": document.get("status"),
            "description": document.get("description"),
            "createdAt": _format_datetime(document.get("createdAt")),
            "updatedAt": _format_datetime(document.get("updatedAt")),
            "assignedTo": assigned_to,
            "assignedInvestigatorEmail": document.get("assignedInvestigatorEmail"),
            "assignedInvestigatorName": document.get("assignedInvestigatorName"),
            "stakeholderCount": stakeholder_count,
        }

    def _serialize_case_request(document):
        return {
            "_id": str(document.get("_id")),
            "accountId": str(document.get("accountId")),
            "subject": document.get("subject"),
            "details": document.get("details"),
            "urgency": document.get("urgency"),
            "status": document.get("status", "pending"),
            "createdAt": _format_datetime(document.get("createdAt")),
            "updatedAt": _format_datetime(document.get("updatedAt")),
        }

    def _serialize_file(file_document):
        if not file_document:
            return None

        return {
            "originalName": file_document.get("originalName"),
            "storedName": file_document.get("storedName"),
            "size": file_document.get("size"),
            "hash": file_document.get("hash"),
            "contentType": file_document.get("contentType"),
            "uploadedAt": _format_datetime(file_document.get("uploadedAt")),
        }

    def _blockchain_summary(document):
        if blockchain_records_collection is None:
            return None

        raw_ledger = document.get("ledgerId")
        if not raw_ledger:
            raw_id = document.get("ledgerId") or document.get("blockchain", {}).get("ledgerId")
            if not raw_id:
                raw_id = document.get("_id") or document.get("id")
            if not raw_id:
                return None
            raw_ledger = "0x" + hashlib.sha256(str(raw_id).encode("utf-8")).hexdigest()

        query = {"ledger_id": raw_ledger}
        history_count = blockchain_records_collection.count_documents(query)
        if history_count == 0:
            return None

        latest_cursor = (
            blockchain_records_collection.find(query)
            .sort([("created_at", -1), ("blockchain_timestamp", -1)])
            .limit(1)
        )
        latest_record = next(iter(latest_cursor), None)

        verification_cursor = (
            blockchain_records_collection.find({**query, "action": "verify"})
            .sort([("created_at", -1), ("blockchain_timestamp", -1)])
            .limit(1)
        )
        verification_record = next(iter(verification_cursor), None)

        summary = {
            "ledgerId": raw_ledger,
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
                    "timestamp": _format_datetime(
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
                "timestamp": _format_datetime(
                    verification_record.get("blockchain_timestamp") or verification_record.get("created_at")
                ),
            }

        return summary

    def _serialize_evidence(document):
        blockchain_info = _blockchain_summary(document)
        ledger_id = blockchain_info.get("ledgerId") if blockchain_info else document.get("ledgerId")

        return {
            "_id": str(document.get("_id")),
            "title": document.get("title"),
            "caseId": document.get("caseId"),
            "caseTitle": document.get("caseTitle"),
            "evidenceType": document.get("evidenceType"),
            "description": document.get("description"),
            "collectionDate": document.get("collectionDate"),
            "location": document.get("location"),
            "createdAt": _format_datetime(document.get("createdAt")),
            "verified": bool(document.get("verified")),
            "ledgerId": ledger_id,
            "blockchain": blockchain_info,
            "file": _serialize_file(document.get("file")),
        }

    def _serialize_account(document):
        return {
            "_id": str(document.get("_id")),
            "email": document.get("email"),
            "firstName": document.get("firstName"),
            "lastName": document.get("lastName"),
            "role": document.get("role"),
            "organization": document.get("organization"),
            "createdAt": _format_datetime(document.get("createdAt")),
        }

    def _send_assignment_email(recipient, case_document):
        if not recipient:
            return

        host = smtp_settings.get("host")
        from_email = smtp_settings.get("from_email")
        if not host or not from_email:
            app.logger.info("SMTP configuration incomplete; skipping notification for %s", recipient)
            return

        subject = "BXAI: New case assigned"
        body_lines = [
            f"Hello Investigator,",
            "",
            f"You have been assigned a new case in the BXAI Forensics Command center.",
            f"Case: {case_document.get('title')} (#{case_document.get('caseNumber')})",
            f"Status: {case_document.get('status', 'open').replace('_', ' ').title()}",
            "",
            "Please log into the investigator console to review the details and begin your workflow.",
            "",
            "— BXAI Operations",
        ]
        message = f"Subject: {subject}\nFrom: {from_email}\nTo: {recipient}\n\n" + "\n".join(body_lines)

        try:
            if smtp_settings.get("use_ssl"):
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL(host, smtp_settings.get("port", 465), context=context) as server:
                    if smtp_settings.get("username"):
                        server.login(smtp_settings["username"], smtp_settings.get("password"))
                    server.sendmail(from_email, [recipient], message.encode("utf-8"))
            else:
                with smtplib.SMTP(host, smtp_settings.get("port", 587)) as server:
                    if smtp_settings.get("use_tls"):
                        server.starttls(context=ssl.create_default_context())
                    if smtp_settings.get("username"):
                        server.login(smtp_settings["username"], smtp_settings.get("password"))
                    server.sendmail(from_email, [recipient], message.encode("utf-8"))
        except Exception as exc:  # pragma: no cover - best effort notification
            app.logger.error("Failed to send assignment email to %s: %s", recipient, exc)

    @app.get("/api/admin/summary")
    def admin_summary():
        alerts_collection = db["alerts"]

        total_cases = cases_collection.count_documents({})
        open_cases = cases_collection.count_documents({"status": "open"})
        under_investigation_cases = cases_collection.count_documents({"status": "under_investigation"})
        closed_cases = cases_collection.count_documents({"status": "closed"})

        summary = {
            "cases": total_cases,
            "openCases": open_cases,
            "underInvestigationCases": under_investigation_cases,
            "closedCases": closed_cases,
            "evidenceItems": evidence_collection.count_documents({}),
            "verifiedEvidence": evidence_collection.count_documents({"verified": True}),
            "activeAlerts": alerts_collection.count_documents({"status": "open"}),
            "totalAccounts": accounts_collection.count_documents({}),
            "totalInvestigators": accounts_collection.count_documents({"role": "investigator"}),
            "latestActivity": [],
        }

        activity_collection_local = db["activity_logs"]
        for item in activity_collection_local.find().sort("timestamp", -1).limit(5):
            summary["latestActivity"].append(
                {
                    "description": item.get("description", "Activity recorded"),
                    "timestamp": _format_datetime(item.get("timestamp")),
                    "actor": item.get("actor", "system"),
                }
            )

        recent_cases_cursor = cases_collection.find().sort("createdAt", -1).limit(5)
        summary["recentCases"] = [
            {
                "title": document.get("title"),
                "caseNumber": document.get("caseNumber"),
                "status": document.get("status"),
                "assignedInvestigatorEmail": document.get("assignedInvestigatorEmail"),
            }
            for document in recent_cases_cursor
        ]

        recent_evidence_cursor = evidence_collection.find().sort("createdAt", -1).limit(5)
        summary["recentEvidence"] = [
            {
                "title": document.get("title"),
                "caseTitle": document.get("caseTitle"),
                "evidenceType": document.get("evidenceType"),
                "verified": bool(document.get("verified")),
            }
            for document in recent_evidence_cursor
        ]

        return jsonify(summary)

    @app.route("/api/admin/chain-of-custody", methods=["GET", "OPTIONS"])
    def admin_chain_of_custody():
        if request.method == "OPTIONS":
            response = app.make_response(("", 204))
            response.headers.setdefault("Access-Control-Allow-Methods", "GET, OPTIONS")
            response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type, X-Account-Role")
            return response

        case_id = request.args.get("caseId")
        evidence_id = request.args.get("evidenceId")

        try:
            payload = _build_chain_of_custody_payload(case_id, evidence_id)
        except ValueError as exc:
            return jsonify({"message": str(exc)}), 404

        return jsonify(payload)

    @app.get("/api/admin/report/cases.pdf")
    def cases_report():
        documents = list(cases_collection.find().sort("createdAt", -1))
        lines = [f"Total cases: {len(documents)}", ""]

        if not documents:
            lines.append("No cases available.")
        else:
            lines.append("Case roster:")
            for item in documents:
                case = _serialize_case(item)
                created = case.get("createdAt") or "—"
                updated = case.get("updatedAt") or "—"
                assigned = case.get("assignedInvestigatorName") or case.get("assignedInvestigatorEmail") or "Unassigned"
                lines.append(
                    f"• {case.get('title', 'Untitled case')} (#{case.get('caseNumber', 'N/A')}) — {case.get('status', 'unknown').replace('_', ' ')}"
                )
                lines.append(f"   Owner: {assigned}")
                lines.append(f"   Created: {created} • Updated: {updated}")
                if case.get("description"):
                    lines.append(f"   Summary: {case['description'][:160]}" + ("…" if len(case['description']) > 160 else ""))
                lines.append("")

        pdf_buffer = _render_pdf("Case Summary Report", lines)
        return send_file(
            pdf_buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name="cases-report.pdf",
        )

    @app.get("/api/admin/report/evidence.pdf")
    def evidence_report():
        cursor = evidence_collection.find().sort("createdAt", -1)
        documents = list(cursor)
        lines = [f"Total evidence items: {len(documents)}", ""]

        if not documents:
            lines.append("No evidence records available.")
        else:
            lines.append("Evidence inventory:")
            for item in documents:
                record = _serialize_evidence(item)
                collected = record.get("collectionDate") or "—"
                created = record.get("createdAt") or "—"
                lines.append(
                    f"• {record.get('title', 'Untitled evidence')} • Case: {record.get('caseTitle') or record.get('caseId', 'N/A')}"
                )
                lines.append(f"   Type: {record.get('evidenceType', 'unknown')} • Collected: {collected} • Logged: {created}")
                lines.append("")

        pdf_buffer = _render_pdf("Evidence Vault Report", lines)
        return send_file(
            pdf_buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name="evidence-report.pdf",
        )

    @app.get("/api/admin/metrics/weekly")
    def admin_weekly_metrics():
        today = datetime.utcnow().date()
        metrics = []
        for offset in range(6, -1, -1):
            day = today - timedelta(days=offset)
            start = datetime.combine(day, datetime.min.time())
            end = start + timedelta(days=1)

            metrics.append(
                {
                    "date": day.isoformat(),
                    "cases": cases_collection.count_documents({"createdAt": {"$gte": start, "$lt": end}}),
                    "evidence": evidence_collection.count_documents({"createdAt": {"$gte": start, "$lt": end}}),
                    "verifiedEvidence": evidence_collection.count_documents(
                        {"verified": True, "createdAt": {"$gte": start, "$lt": end}}
                    ),
                }
            )

        return jsonify({"metrics": metrics})

    @app.get("/api/admin/activity-logs")
    def admin_activity_logs():
        _require_admin_request()
        limit, skip = _parse_pagination()
        filters = _build_activity_filters()
        result = activity_log_service.query(filters=filters, limit=limit, skip=skip)
        logs = [log for log in (result.get("results") or []) if _mask_ip(log)]
        response_payload = {
            "total": result.get("total", 0),
            "limit": result.get("limit", limit),
            "skip": result.get("skip", skip),
            "logs": logs,
        }
        return jsonify(response_payload)

    @app.get("/api/admin/activity-logs/<string:log_id>")
    def admin_activity_log_detail(log_id: str):
        _require_admin_request()
        document = activity_log_service.get_document(log_id)
        if not document:
            return jsonify({"message": "Activity log not found"}), 404
        serialized = _serialize_log(document)
        return jsonify({"log": serialized})

    @app.delete("/api/admin/activity-logs")
    def admin_activity_logs_delete():
        _require_admin_request()
        privilege = (request.headers.get("X-Admin-Privilege") or "").lower()
        if privilege not in {"superadmin"}:
            abort(403, description="Superadmin privilege required")

        payload = request.get_json(force=True)
        ids = payload.get("ids") or []
        filters = payload.get("filters") or {}

        query = _build_activity_filters()
        if ids:
            object_ids = []
            for identifier in ids:
                if ObjectId.is_valid(identifier):
                    object_ids.append(ObjectId(identifier))
                else:
                    object_ids.append(identifier)
            query["_id"] = {"$in": object_ids}

        now = datetime.utcnow()
        result = activity_collection.delete_many(query)
        _log_auth_event(
            "delete_activity_logs",
            user_id=None,
            user_role="admin",
            success=True,
            details={"deletedCount": result.deleted_count, "timestamp": now.isoformat()},
            is_critical=True,
        )
        return jsonify({"message": "Activity logs deleted", "deleted": result.deleted_count})

    @app.post("/api/admin/activity-logs/<string:log_id>/anchor")
    def admin_activity_log_anchor(log_id: str):
        _require_admin_request()
        document = activity_log_service.get_document(log_id)
        if not document:
            return jsonify({"message": "Activity log not found"}), 404
        try:
            record = _anchor_activity_log(document)
        except Exception as exc:
            return jsonify({"message": str(exc)}), 502
        return jsonify({"message": "Activity log anchored", "record": record})

    def _write_csv(logs):
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "id",
                "timestampStart",
                "userId",
                "userRole",
                "actionType",
                "isCritical",
                "statusCode",
                "ipAddress",
                "txHash",
            ]
        )
        for item in logs:
            writer.writerow(
                [
                    item.get("_id"),
                    item.get("timestampStart"),
                    item.get("userId"),
                    item.get("userRole"),
                    item.get("actionType"),
                    item.get("isCritical"),
                    item.get("statusCode"),
                    item.get("ipAddress"),
                    item.get("txHash"),
                ]
            )
        output.seek(0)
        return output

    def _write_activity_pdf(logs):
        lines = [f"Total activity logs: {len(logs)}", ""]
        for item in logs:
            lines.append(
                f"• {item.get('timestampStart')} — {item.get('actionType')} by {item.get('userId')} ({item.get('userRole')})"
            )
            if item.get("isCritical"):
                lines.append("   • Critical action")
            if item.get("statusCode") is not None:
                lines.append(f"   • Response: {item.get('statusCode')}")
            if item.get("txHash"):
                lines.append(f"   • Anchored: {item.get('txHash')}")
            lines.append("")
        return _render_pdf("Activity Log Export", lines)

    @app.get("/api/admin/activity-logs/export.csv")
    def admin_activity_logs_export_csv():
        _require_admin_request()
        filters = _build_activity_filters()
        result = activity_log_service.query(filters=filters, limit=500, skip=0)
        logs = [log for log in (result.get("results") or []) if _mask_ip(log)]
        csv_buffer = _write_csv(logs)
        return Response(
            csv_buffer.getvalue(),
            mimetype="text/csv",
            headers={
                "Content-Disposition": "attachment; filename=activity-logs.csv",
            },
        )

    @app.get("/api/admin/activity-logs/export.pdf")
    def admin_activity_logs_export_pdf():
        _require_admin_request()
        filters = _build_activity_filters()
        result = activity_log_service.query(filters=filters, limit=200, skip=0)
        logs = [log for log in (result.get("results") or []) if _mask_ip(log)]
        pdf_buffer = _write_activity_pdf(logs)
        return send_file(
            pdf_buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name="activity-logs.pdf",
        )

    @app.get("/api/admin/cases")
    def list_cases():
        cursor = cases_collection.find().sort("createdAt", -1)
        cases = [_serialize_case(item) for item in cursor]
        return jsonify({"cases": cases})

    @app.get("/api/admin/case-requests")
    def admin_list_case_requests():
        cursor = case_requests_collection.find().sort("createdAt", -1)
        requests = [_serialize_case_request(item) for item in cursor]
        return jsonify({"caseRequests": requests})

    @app.post("/api/admin/case-requests/<request_id>/status")
    def admin_update_case_request_status(request_id):
        request_object_id = _safe_object_id(request_id)
        if not request_object_id:
            return jsonify({"message": "Invalid request id"}), 400

        payload = request.get_json(force=True)
        status_value = (payload.get("status") or "pending").strip().lower()

        if status_value not in {"pending", "accepted", "rejected"}:
            return jsonify({"message": "Status must be pending, accepted, or rejected"}), 400

        document = case_requests_collection.find_one({"_id": request_object_id})
        if not document:
            return jsonify({"message": "Case request not found"}), 404

        now = datetime.utcnow()
        case_requests_collection.update_one(
            {"_id": request_object_id},
            {"$set": {"status": status_value, "updatedAt": now}},
        )

        updated_document = case_requests_collection.find_one({"_id": request_object_id})

        account_email = None
        account_id = updated_document.get("accountId")
        if account_id:
            account_doc = accounts_collection.find_one({"_id": _safe_object_id(account_id)})
            if account_doc:
                account_email = account_doc.get("email")

        activity_collection.insert_one(
            {
                "actor": "admin",
                "description": f"Case request '{updated_document.get('subject')}': {status_value}",
                "timestamp": now,
            }
        )

        if account_email:
            activity_collection.insert_one(
                {
                    "actor": account_email,
                    "description": f"Your case request '{updated_document.get('subject')}' marked as {status_value}.",
                    "timestamp": now,
                }
            )

        return jsonify({"caseRequest": _serialize_case_request(updated_document)})

    @app.post("/api/admin/cases")
    def create_case():
        payload = request.get_json(force=True)
        title = (payload.get("title") or "").strip()
        case_number = (payload.get("caseNumber") or "").strip()
        status = (payload.get("status") or "open").strip().lower().replace(" ", "_")
        description = (payload.get("description") or "").strip()
        investigator_email = (payload.get("assignedInvestigatorEmail") or "").strip().lower()

        if not title or not case_number:
            return jsonify({"message": "Title and case number are required"}), 400

        document = {
            "title": title,
            "caseNumber": case_number,
            "status": status,
            "description": description,
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
        }

        assigned_investigator = None
        if investigator_email:
            assigned_investigator = accounts_collection.find_one({"email": investigator_email, "role": "investigator"})
            if not assigned_investigator:
                return jsonify({"message": "Investigator email not found"}), 404
            document["assignedTo"] = assigned_investigator.get("_id")
            document["assignedInvestigatorEmail"] = investigator_email
            document["assignedInvestigatorName"] = (
                f"{assigned_investigator.get('firstName', '')} {assigned_investigator.get('lastName', '')}"
            ).strip()

        result = cases_collection.insert_one(document)
        document["_id"] = result.inserted_id

        if investigator_email:
            _send_assignment_email(investigator_email, document)

        return jsonify({"case": _serialize_case(document)}), 201

    @app.get("/api/admin/evidence")
    def list_evidence():
        case_id = request.args.get("caseId")
        query = {}
        if case_id:
            query["caseId"] = case_id

        cursor = evidence_collection.find(query).sort("createdAt", -1)
        items = [_serialize_evidence(item) for item in cursor]
        return jsonify({"evidence": items})

    @app.post("/api/admin/evidence")
    def create_evidence():
        is_multipart = request.content_type and request.content_type.startswith("multipart/form-data")
        uploaded_file = None

        if is_multipart:
            form_payload = request.form or {}
            payload = {key: value for key, value in form_payload.items()}
            uploaded_file = request.files.get("file")
        else:
            payload = request.get_json(force=True)

        title = (payload.get("title") or "").strip()
        case_id = (payload.get("caseId") or "").strip()
        evidence_type = (payload.get("evidenceType") or "").strip().lower().replace(" ", "_")
        description = (payload.get("description") or "").strip()
        collection_date = (payload.get("collectionDate") or "").strip()
        location = (payload.get("location") or "").strip()
        verified = bool(payload.get("verified"))

        if not title or not case_id:
            return jsonify({"message": "Title and case selection are required"}), 400

        case_object_id = _safe_object_id(case_id)
        if not case_object_id:
            return jsonify({"message": "Invalid case id"}), 400

        case_document = cases_collection.find_one({"_id": case_object_id})
        if not case_document:
            return jsonify({"message": "Case not found"}), 404

        collection_date_iso = None
        if collection_date:
            try:
                parsed_collection_date = datetime.strptime(collection_date, "%Y-%m-%d").date()
            except ValueError:
                return jsonify({"message": "collectionDate must be in YYYY-MM-DD format"}), 400

            if parsed_collection_date > datetime.utcnow().date():
                return jsonify({"message": "Collection date cannot be in the future"}), 400

            collection_date_iso = parsed_collection_date.isoformat()

        document = {
            "title": title,
            "caseId": case_id,
            "caseTitle": case_document.get("title"),
            "evidenceType": evidence_type or "digital",
            "description": description,
            "collectionDate": collection_date_iso,
            "location": location,
            "createdAt": datetime.utcnow(),
            "verified": verified,
        }

        if uploaded_file and uploaded_file.filename:
            upload_dir = app.config.get("EVIDENCE_UPLOAD_DIR")
            os.makedirs(upload_dir, exist_ok=True)

            original_name = uploaded_file.filename
            safe_name = secure_filename(original_name) or f"evidence_{uuid4().hex}"
            stored_name = f"{uuid4().hex}_{safe_name}"
            storage_path = os.path.join(upload_dir, stored_name)

            hasher = hashlib.sha256()
            uploaded_file.stream.seek(0)
            file_size = 0
            with open(storage_path, "wb") as handle:
                while True:
                    chunk = uploaded_file.stream.read(8192)
                    if not chunk:
                        break
                    handle.write(chunk)
                    hasher.update(chunk)
                    file_size += len(chunk)

            document["file"] = {
                "originalName": original_name,
                "storedName": stored_name,
                "size": file_size,
                "hash": f"0x{hasher.hexdigest()}",
                "contentType": uploaded_file.mimetype,
                "uploadedAt": datetime.utcnow(),
                "path": stored_name,
            }

        result = evidence_collection.insert_one(document)
        document["_id"] = result.inserted_id
        return jsonify({"evidence": _serialize_evidence(document)}), 201

    @app.get("/api/admin/accounts")
    def list_accounts():
        cursor = accounts_collection.find({}, {"password_hash": 0}).sort("createdAt", -1)
        accounts = [_serialize_account(item) for item in cursor]
        return jsonify({"accounts": accounts})

    @app.get("/api/dashboard/investigator/<account_id>")
    def investigator_dashboard(account_id):
        object_id = _safe_object_id(account_id)
        if not object_id:
            return jsonify({"message": "Invalid account id"}), 400

        account = accounts_collection.find_one({"_id": object_id, "role": "investigator"})
        if not account:
            return jsonify({"message": "Investigator not found"}), 404

        investigator_match = {"$in": [object_id, str(object_id)]}

        alerts_collection = db["alerts"]

        summary = {
            "assignedCases": cases_collection.count_documents({"assignedTo": investigator_match}),
            "evidenceQueue": evidence_collection.count_documents({"ownerId": str(object_id)}),
            "openAlerts": alerts_collection.count_documents({"assignee": str(object_id), "status": "open"}),
            "recentActivity": _recent_activity_for_actor(account.get("email")),
            "assignedCasesList": [
                _serialize_case(document)
                for document in cases_collection.find({"assignedTo": investigator_match}).sort("createdAt", -1).limit(5)
            ],
        }

        return jsonify(summary)

    def _user_following_cases(user_id: ObjectId):
        cursor = cases_collection.find({"stakeholders": str(user_id)}).sort("updatedAt", -1)
        return [_serialize_case(item) for item in cursor]

    def _user_available_cases(user_id: ObjectId):
        cursor = cases_collection.find({"stakeholders": {"$ne": str(user_id)}}).sort("updatedAt", -1)
        return [_serialize_case(item) for item in cursor]

    def _user_case_requests(user_id: ObjectId):
        cursor = case_requests_collection.find({"accountId": str(user_id)}).sort("createdAt", -1)
        return [_serialize_case_request(item) for item in cursor]

    @app.get("/api/dashboard/user/<account_id>")
    def user_dashboard(account_id):
        object_id = _safe_object_id(account_id)
        if not object_id:
            return jsonify({"message": "Invalid account id"}), 400

        account = accounts_collection.find_one({"_id": object_id, "role": "user"})
        if not account:
            return jsonify({"message": "User not found"}), 404

        summary = {
            "casesFollowing": cases_collection.count_documents({"stakeholders": str(object_id)}),
            "sharedEvidence": evidence_collection.count_documents({"sharedWith": str(object_id)}),
            "recentActivity": _recent_activity_for_actor(account.get("email")),
            "followingCases": _user_following_cases(object_id),
            "availableCases": _user_available_cases(object_id),
            "caseRequests": _user_case_requests(object_id),
        }

        return jsonify(summary)

    @app.post("/api/dashboard/user/follow")
    def user_follow_case():
        payload = request.get_json(force=True)
        account_id = payload.get("accountId")
        case_id = payload.get("caseId")
        action = (payload.get("action") or "follow").strip().lower()

        account_object_id = _safe_object_id(account_id)
        case_object_id = _safe_object_id(case_id)

        if not account_object_id or not case_object_id:
            return jsonify({"message": "Invalid account or case id"}), 400

        account = accounts_collection.find_one({"_id": account_object_id, "role": "user"})
        if not account:
            return jsonify({"message": "User not found"}), 404

        case_document = cases_collection.find_one({"_id": case_object_id})
        if not case_document:
            return jsonify({"message": "Case not found"}), 404

        stakeholders = case_document.get("stakeholders") or []
        stakeholders = [str(value) for value in stakeholders]
        user_id_str = str(account_object_id)

        if action == "unfollow":
            if user_id_str in stakeholders:
                stakeholders.remove(user_id_str)
                cases_collection.update_one({"_id": case_object_id}, {"$set": {"stakeholders": stakeholders, "updatedAt": datetime.utcnow()}})
        else:
            if user_id_str not in stakeholders:
                stakeholders.append(user_id_str)
                cases_collection.update_one({"_id": case_object_id}, {"$set": {"stakeholders": stakeholders, "updatedAt": datetime.utcnow()}})
            action = "follow"

        updated_case = cases_collection.find_one({"_id": case_object_id})

        return jsonify({
            "message": "Case follow state updated",
            "action": action,
            "case": _serialize_case(updated_case),
        })

    @app.post("/api/dashboard/user/request")
    def user_create_case_request():
        payload = request.get_json(force=True)
        account_id = payload.get("accountId")

        account_object_id = _safe_object_id(account_id)
        if not account_object_id:
            return jsonify({"message": "Invalid account id"}), 400

        account = accounts_collection.find_one({"_id": account_object_id, "role": "user"})
        if not account:
            return jsonify({"message": "User not found"}), 404

        subject = (payload.get("subject") or "").strip()
        details = (payload.get("details") or "").strip()
        urgency = (payload.get("urgency") or "standard").strip().lower()

        if not subject or not details:
            return jsonify({"message": "Subject and details are required"}), 400

        if urgency not in {"standard", "high", "critical"}:
            urgency = "standard"

        now = datetime.utcnow()
        document = {
            "accountId": str(account_object_id),
            "subject": subject,
            "details": details,
            "urgency": urgency,
            "status": "pending",
            "createdAt": now,
            "updatedAt": now,
        }

        result = case_requests_collection.insert_one(document)
        document["_id"] = result.inserted_id

        activity_collection.insert_one(
            {
                "actor": account.get("email"),
                "description": f"Requested new case: {subject}",
                "timestamp": now,
            }
        )

        return jsonify({"caseRequest": _serialize_case_request(document)}), 201

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
