"""Activity logging helpers for capturing user actions across the platform."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
from typing import Any, Dict, Iterable, Optional, Tuple

from bson import ObjectId
from pymongo.collection import Collection


default_timezone = timezone.utc


class ActivityLogService:
    """Thin wrapper around the ``activity_logs`` collection.

    Handles index management, convenience helpers for common logging flows, and
    optional blockchain anchoring metadata.
    """

    DEFAULT_CRITICAL_ACTIONS = {
        "create_account",
        "delete_account",
        "role_change",
        "delete_case",
        "delete_evidence",
        "xai_hash_mismatch",
        "judge_signature_verification",
    }

    DEFAULT_SESSION_TIMEOUT_SECONDS = 15 * 60  # 15 minutes

    def __init__(
        self,
        collection: Collection,
        *,
        critical_actions: Optional[Iterable[str]] = None,
    ) -> None:
        self.collection = collection
        self.critical_actions = set(critical_actions or self.DEFAULT_CRITICAL_ACTIONS)
        self._ensure_indexes()

    # ------------------------------------------------------------------
    # Index management
    # ------------------------------------------------------------------
    def _ensure_indexes(self) -> None:
        self.collection.create_index("userId")
        self.collection.create_index("actionType")
        self.collection.create_index("timestampStart")
        self.collection.create_index("isCritical")
        self.collection.create_index([("userId", 1), ("timestampStart", -1)])

    # ------------------------------------------------------------------
    # Logging helpers
    # ------------------------------------------------------------------
    def _normalize_datetime(self, value: Optional[datetime]) -> Optional[datetime]:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=default_timezone)
        return value.astimezone(default_timezone)

    def _clean(self, value: Any) -> Any:
        if isinstance(value, datetime):
            return self._normalize_datetime(value)
        if isinstance(value, ObjectId):
            return str(value)
        if isinstance(value, dict):
            return {key: self._clean(val) for key, val in value.items()}
        if isinstance(value, list):
            return [self._clean(item) for item in value]
        return value

    def _is_critical(self, action_type: str, explicit_flag: Optional[bool]) -> bool:
        if explicit_flag is not None:
            return bool(explicit_flag)
        normalized = (action_type or "").strip().lower()
        return normalized in self.critical_actions

    def _compute_hash(self, payload: Dict[str, Any]) -> str:
        sanitized = {key: self._clean(value) for key, value in payload.items() if key not in {"_id", "txHash"}}
        serialized = repr(sorted(sanitized.items())).encode("utf-8")
        return hashlib.sha256(serialized).hexdigest()

    def _prepare_duration(
        self,
        start: Optional[datetime],
        end: Optional[datetime],
        duration_seconds: Optional[float],
    ) -> Tuple[Optional[datetime], Optional[datetime], Optional[float]]:
        normalized_start = self._normalize_datetime(start) if start else None
        normalized_end = self._normalize_datetime(end) if end else None
        if normalized_start is None:
            normalized_start = datetime.now(tz=default_timezone)
        if normalized_end and duration_seconds is None:
            duration_seconds = max((normalized_end - normalized_start).total_seconds(), 0.0)
        return normalized_start, normalized_end, duration_seconds

    def log(
        self,
        *,
        user_id: Optional[str],
        user_role: Optional[str],
        action_type: str,
        action_details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        timestamp_start: Optional[datetime] = None,
        timestamp_end: Optional[datetime] = None,
        duration_seconds: Optional[float] = None,
        is_critical: Optional[bool] = None,
        request_method: Optional[str] = None,
        request_path: Optional[str] = None,
        status_code: Optional[int] = None,
        client_timestamp: Optional[str] = None,
        tx_hash: Optional[str] = None,
    ) -> ObjectId:
        now = datetime.now(tz=default_timezone)
        start, end, duration_seconds = self._prepare_duration(timestamp_start, timestamp_end, duration_seconds)
        document = {
            "userId": user_id,
            "userRole": user_role,
            "actionType": action_type,
            "actionDetails": self._clean(action_details or {}),
            "ipAddress": ip_address,
            "userAgent": user_agent,
            "timestampStart": start,
            "timestampEnd": end,
            "durationSeconds": duration_seconds,
            "isCritical": self._is_critical(action_type, is_critical),
            "txHash": tx_hash,
            "requestMethod": request_method,
            "requestPath": request_path,
            "statusCode": status_code,
            "clientTimestamp": client_timestamp,
            "createdAt": now,
        }
        document["activityHash"] = self._compute_hash(document)
        inserted = self.collection.insert_one(document)
        return inserted.inserted_id

    # ------------------------------------------------------------------
    # Session helpers
    # ------------------------------------------------------------------
    def start_session(
        self,
        *,
        user_id: str,
        user_role: Optional[str],
        ip_address: Optional[str],
        user_agent: Optional[str],
        action_details: Optional[Dict[str, Any]] = None,
        action_type: str = "login",
    ) -> ObjectId:
        session_id = self.log(
            user_id=user_id,
            user_role=user_role,
            action_type=action_type,
            action_details=action_details,
            ip_address=ip_address,
            user_agent=user_agent,
            timestamp_start=datetime.now(tz=default_timezone),
            is_critical=False,
        )
        self.collection.update_one(
            {"_id": session_id},
            {"$set": {"lastHeartbeat": datetime.now(tz=default_timezone)}},
        )
        return session_id

    def end_active_session(
        self,
        *,
        user_id: Optional[str],
        timestamp_end: Optional[datetime] = None,
        termination_action: str = "logout",
        action_details: Optional[Dict[str, Any]] = None,
    ) -> Optional[ObjectId]:
        if not user_id:
            return None
        criteria = {
            "userId": user_id,
            "actionType": "login",
            "timestampEnd": None,
        }
        last_login = self.collection.find_one(criteria, sort=[("timestampStart", -1)])
        if not last_login:
            return None
        start_time = self._normalize_datetime(last_login.get("timestampStart"))
        end_time = self._normalize_datetime(timestamp_end) or datetime.now(tz=default_timezone)
        duration = None
        if start_time:
            duration = max((end_time - start_time).total_seconds(), 0.0)
        update = {
            "$set": {
                "timestampEnd": end_time,
                "durationSeconds": duration,
                "terminationAction": termination_action,
                "terminationDetails": self._clean(action_details or {}),
            }
        }
        self.collection.update_one({"_id": last_login["_id"]}, update)
        return last_login["_id"]

    def record_heartbeat(
        self,
        *,
        user_id: Optional[str],
        timeout_seconds: Optional[int] = None,
    ) -> Dict[str, Any]:
        if not user_id:
            return {"status": "missing"}

        timeout = timeout_seconds or self.DEFAULT_SESSION_TIMEOUT_SECONDS
        now = datetime.now(tz=default_timezone)

        login = self.collection.find_one(
            {
                "userId": user_id,
                "actionType": "login",
                "timestampEnd": None,
            },
            sort=[("timestampStart", -1)],
        )

        if not login:
            return {"status": "not_found"}

        last_heartbeat = login.get("lastHeartbeat") or login.get("timestampStart")
        last_heartbeat_dt = self._normalize_datetime(last_heartbeat) or now
        elapsed = (now - last_heartbeat_dt).total_seconds()
        if elapsed > timeout:
            self.end_active_session(
                user_id=user_id,
                timestamp_end=now,
                termination_action="timeout",
                action_details={"elapsedSeconds": elapsed, "timeoutSeconds": timeout},
            )
            return {"status": "timed_out", "elapsedSeconds": elapsed}

        self.collection.update_one(
            {"_id": login["_id"]},
            {"$set": {"lastHeartbeat": now}},
        )
        return {"status": "ok", "sessionId": str(login["_id"]), "elapsedSeconds": elapsed}

    # ------------------------------------------------------------------
    # Blockchain helpers
    # ------------------------------------------------------------------
    def compute_hash_for_document(self, document: Dict[str, Any]) -> str:
        return self._compute_hash(document)

    def get_document(self, identifier: str) -> Optional[Dict[str, Any]]:
        if not identifier:
            return None
        if ObjectId.is_valid(identifier):
            return self.collection.find_one({"_id": ObjectId(identifier)})
        return self.collection.find_one({"_id": identifier})

    def serialize(self, document: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not document:
            return None
        serialized = {key: self._clean(value) for key, value in document.items()}
        if "_id" in serialized:
            serialized["_id"] = str(serialized["_id"])
        return serialized

    def query(
        self,
        *,
        filters: Dict[str, Any],
        limit: int = 50,
        skip: int = 0,
        sort: Optional[list] = None,
    ) -> Dict[str, Any]:
        sort = sort or [("timestampStart", -1)]
        skip = max(skip, 0)
        limit = max(limit, 1)
        cursor = (
            self.collection.find(filters)
            .sort(sort)
            .skip(skip)
            .limit(limit)
        )
        documents = list(cursor)
        total = self.collection.count_documents(filters)
        return {
            "total": total,
            "results": [self.serialize(doc) for doc in documents],
            "limit": limit,
            "skip": skip,
        }
