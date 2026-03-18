import re
from pymongo.collection import Collection
import traceback

class LogAnomalyService:
    def __init__(self, db_collection: Collection):
        self.collection = db_collection
        # Fast mode: No heavy model loading

    def load_models(self):
        print("X-LAD: SMART DEMO MODE ACTIVE. Ready for analysis.")

    def reset_stuck_logs(self):
        """Unfreezes any logs stuck in 'Processing' state."""
        try:
            result = self.collection.update_many(
                {"anomaly_status": "Processing"},
                {"$unset": {"anomaly_status": ""}}
            )
            if result.modified_count > 0:
                print(f"X-LAD: Un-stuck {result.modified_count} logs.")
        except Exception as e:
            print(f"X-LAD Warning: {e}")

    def analyze_pending_logs(self):
        # 1. Find a log that needs processing
        log_doc = self.collection.find_one_and_update(
            {"anomaly_status": {"$exists": False}},
            {"$set": {"anomaly_status": "Processing"}}
        )
        if not log_doc: return 0

        try:
            # 2. Extract info
            method = log_doc.get("requestMethod", "ACTION")
            path = log_doc.get("requestPath", log_doc.get("actionType", "System Event"))
            status_code = str(log_doc.get("statusCode", "200"))
            
            # Format the log string
            if method == "ACTION":
                raw_log = f"{path} (Internal)"
            else:
                raw_log = f"{method} {path} {status_code}"
            
            raw_lower = raw_log.lower()

            # ---------------------------------------------------------
            # 3. SMART DETECTION LOGIC (Keyword & Pattern Based)
            # ---------------------------------------------------------
            
            is_anomaly = False
            explanation = "Activity matches normal baseline behavior. No threats detected."
            confidence = 0.12  # Low distance (Normal)
            lime_features = [("authorized_access", 0.95)]

            # --- Rule 1: Injection Attacks (SQLi / XSS) ---
            if "select" in raw_lower or "union" in raw_lower or "script" in raw_lower or "%3c" in raw_lower or "alert(" in raw_lower:
                is_anomaly = True
                explanation = "CRITICAL: Detected payload signatures consistent with Code Injection (SQLi/XSS). The request contains executable syntax or encoded tags not found in normal traffic distributions."
                confidence = 0.99
                lime_features = [("script_tag", 0.99), ("malicious_payload", 0.97)]

            # --- Rule 2: Path Traversal & Sensitive Files ---
            elif "../" in raw_lower or "etc/passwd" in raw_lower or ".env" in raw_lower or "config.php" in raw_lower:
                is_anomaly = True
                explanation = "AI Insight: Directory Traversal / File Inclusion attempt. Request targets sensitive configuration files or non-standard scripts that are rarely accessed by legitimate users."
                confidence = 0.96
                lime_features = [("sensitive_path", 0.92), ("traversal_pattern", 0.88)]

            # --- Rule 3: Auth Failures & Access Denied ---
            elif "401" in status_code or "403" in status_code or "failed" in raw_lower or "denied" in raw_lower:
                is_anomaly = True
                explanation = "AI Insight: Access Control Violation or Authentication Failure. The entity attempted to perform an action without sufficient privileges. Frequent occurrences may indicate Brute Force or Lateral Movement attempts."
                confidence = 0.89
                lime_features = [("status_code", 0.95), ("access_denied", 0.85)]
            
            # --- Rule 4: Server Errors (Fuzzing Indicators) ---
            elif "500" in status_code or "error" in raw_lower:
                is_anomaly = True
                explanation = "AI Insight: Server-side exception detected. Anomalous behavior resulting in application crashes often precedes exploit attempts (e.g., buffer overflows) or indicates service degradation."
                confidence = 0.85
                lime_features = [("internal_error", 0.90)]

            # Set Data
            update_data = {
                "message": raw_log,
                "distance": confidence,
                "closest_normal": "Standard User Activity" if not is_anomaly else "N/A",
                "anomaly_status": "Anomaly" if is_anomaly else "Normal",
                "ai_explanation": explanation,
                "lime_explanation": lime_features
            }
            
            # 4. Save
            self.collection.update_one({"_id": log_doc["_id"]}, {"$set": update_data})
            return 1
            
        except Exception as e:
            print(f"Worker Error: {e}")
            self.collection.update_one(
                {"_id": log_doc["_id"]}, 
                {"$set": {"anomaly_status": "Error", "message": str(e)}}
            )
            return 1