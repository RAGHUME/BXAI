"""Evidence loading helpers for the XAI service."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict

from PIL import Image
from bson import ObjectId
from pymongo.collection import Collection


class EvidenceNotFoundError(RuntimeError):
    """Raised when evidence metadata cannot be located in MongoDB."""


class EvidenceAccessError(RuntimeError):
    """Raised when evidence files are missing or inaccessible."""


def _ensure_path(path: str | os.PathLike[str]) -> Path:
    candidate = Path(path)
    if not candidate.exists():
        raise EvidenceAccessError(f"Evidence path not found: {candidate}")
    if not candidate.is_file():
        raise EvidenceAccessError(f"Evidence path is not a file: {candidate}")
    return candidate


def load_image(path: str | os.PathLike[str]) -> Image.Image:
    """Load an evidence image into memory."""

    target = _ensure_path(path)
    try:
        return Image.open(target).convert("RGB")
    except Exception as exc:  # pragma: no cover - depends on Pillow backend
        raise EvidenceAccessError(f"Failed to load image {target}: {exc}") from exc


def load_text(path: str | os.PathLike[str]) -> str:
    """Load text evidence from disk."""

    target = _ensure_path(path)
    try:
        return target.read_text(encoding="utf-8")
    except Exception as exc:  # pragma: no cover - depends on encoding
        raise EvidenceAccessError(f"Failed to read text file {target}: {exc}") from exc


def load_metadata_from_mongo(collection: Collection, evidence_id: str) -> Dict[str, Any]:
    """Retrieve evidence metadata from MongoDB."""

    query: Dict[str, Any] = {"_id": evidence_id}
    if ObjectId.is_valid(evidence_id):
        query = {"_id": ObjectId(evidence_id)}

    document = collection.find_one(query)
    if not document:
        raise EvidenceNotFoundError(f"Evidence {evidence_id} not found")

    for field in ("metadata", "extraMetadata"):
        if field in document and isinstance(document[field], str):
            try:
                document[field] = json.loads(document[field])
            except json.JSONDecodeError:
                # Keep original string if it is not valid JSON
                pass

    return document
