"""Hashing utilities for XAI artefacts."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, Tuple

from .artifacts import ArtifactPaths


@dataclass
class ArtifactHash:
    name: str
    path: Path
    sha256: str


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8192), b""):
            digest.update(chunk)
    return digest.hexdigest()


def hash_artifacts(paths: ArtifactPaths) -> Dict[str, ArtifactHash]:
    """Compute SHA-256 hashes for generated artefacts."""

    mapping: Dict[str, ArtifactHash] = {}
    for name, path in paths.__dict__.items():
        if path is None:
            continue
        resolved = Path(path)
        if not resolved.exists():
            continue
        mapping[name] = ArtifactHash(name=name, path=resolved, sha256=_hash_file(resolved))
    return mapping


def consolidate_hashes(hashes: Iterable[ArtifactHash]) -> str:
    """Produce a single SHA-256 hash from multiple artefact hashes."""

    digest = hashlib.sha256()
    for item in sorted(hashes, key=lambda entry: entry.name):
        digest.update(item.name.encode("utf-8"))
        digest.update(item.sha256.encode("utf-8"))
    return digest.hexdigest()
