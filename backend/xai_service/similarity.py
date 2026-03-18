"""DeepSeek similarity helpers."""

from __future__ import annotations

import heapq
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Sequence

from .loaders import load_deepseek_client


@dataclass
class SimilarityResult:
    evidence_id: str
    score: float
    metadata: Dict[str, Any]


def compute_embeddings(texts: Sequence[str]) -> Sequence[Sequence[float]]:
    """Compute embedding vectors for a batch of texts."""

    client = load_deepseek_client()
    return client.embed(texts)


def _top_k(items: Iterable[SimilarityResult], k: int) -> List[SimilarityResult]:
    return heapq.nlargest(k, items, key=lambda item: item.score)


def compare_with_existing_evidence(
    *,
    query_text: str,
    candidate_records: Iterable[Dict[str, Any]],
    top_k_results: int = 5,
) -> List[SimilarityResult]:
    """Compare ``query_text`` with candidate evidence metadata."""

    candidates = list(candidate_records)
    if not candidates:
        return []

    documents = [query_text]
    id_lookup: List[str] = []
    metadata_lookup: List[Dict[str, Any]] = []
    for doc in candidates:
        combined_text = " ".join(
            str(doc.get(field, ""))
            for field in ("title", "description", "content", "tags", "notes")
        )
        documents.append(combined_text)
        evidence_id = str(doc.get("_id") or doc.get("id") or "unknown")
        id_lookup.append(evidence_id)
        metadata_lookup.append(doc)

    embeddings = compute_embeddings(documents)
    query_vector, candidate_vectors = embeddings[0], embeddings[1:]

    scored: List[SimilarityResult] = []
    for evidence_id, vector, metadata in zip(id_lookup, candidate_vectors, metadata_lookup):
        score = _cosine_similarity(query_vector, vector)
        scored.append(
            SimilarityResult(
                evidence_id=evidence_id,
                score=score,
                metadata={"title": metadata.get("title"), "description": metadata.get("description")},
            )
        )

    return _top_k(scored, top_k_results)


def _cosine_similarity(vec_a: Sequence[float], vec_b: Sequence[float]) -> float:
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    mag_a = sum(a * a for a in vec_a) ** 0.5
    mag_b = sum(b * b for b in vec_b) ** 0.5
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)
