"""Model and client factory helpers for the XAI service.

The goal of these helpers is to centralise how heavyweight dependencies
(e.g. PyTorch CNNs, OpenRouter language models) are initialised so that
other modules can import lightweight callables rather than reloading
models for every request.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, Iterable, Optional, Sequence

try:  # Optional import – only required when interacting with OpenRouter models
    from openai import OpenAI  # type: ignore
except ImportError:  # pragma: no cover - library may not be installed yet
    OpenAI = None  # type: ignore


# ---------------------------------------------------------------------------
# Image tamper detection model
# ---------------------------------------------------------------------------


@dataclass
class ImageTamperModel:
    """Lightweight wrapper around the CNN tamper detection model.

    The real implementation should load the trained weights (e.g. a
    PyTorch model) and expose a ``predict`` method returning a
    ``{"label": str, "confidence": float}`` payload. For now this class
    carries configuration and leaves the heavy lifting to the developer
    implementing the actual model load.
    """

    model_path: Optional[str] = None
    device: Optional[str] = None

    def predict(self, image: Any) -> Dict[str, Any]:  # pragma: no cover - placeholder
        raise NotImplementedError(
            "ImageTamperModel.predict must be implemented with the actual CNN inference logic"
        )


@lru_cache(maxsize=1)
def load_image_tamper_model(*, model_path: Optional[str] = None, device: Optional[str] = None) -> ImageTamperModel:
    """Initialise (or retrieve a cached handle to) the tamper detection model."""

    resolved_path = model_path or os.getenv("IMAGE_TAMPER_MODEL_PATH")
    resolved_device = device or os.getenv("IMAGE_TAMPER_MODEL_DEVICE")
    return ImageTamperModel(model_path=resolved_path, device=resolved_device)


# ---------------------------------------------------------------------------
# Nemotron client (LLM reasoning)
# ---------------------------------------------------------------------------


@dataclass
class NemotronClient:
    """Thin convenience wrapper for the Nemotron reasoning model on OpenRouter."""

    client: Any
    model: str

    def generate(self, messages: Sequence[Dict[str, str]], *, reasoning: bool = True, **kwargs) -> Dict[str, Any]:
        if self.client is None:
            # Offline stub so development is not blocked when openai is missing.
            content = "\n".join(msg.get("content", "") for msg in messages)
            return {
                "message": {
                    "role": "assistant",
                    "content": f"[Stubbed Nemotron summary]\n{content[:500]}"
                    if content
                    else "Nemotron reasoning unavailable (offline stub).",
                },
                "reasoning_details": {"stub": True},
            }

        extra_body = kwargs.pop("extra_body", {})
        if reasoning:
            extra_body.setdefault("reasoning", {"enabled": True})
        response = self.client.chat.completions.create(
            model=self.model,
            messages=list(messages),
            extra_body=extra_body,
            **kwargs,
        )
        choice = response.choices[0]
        payload = {
            "message": choice.message,
        }
        if hasattr(choice, "reasoning_details"):
            payload["reasoning_details"] = choice.reasoning_details
        return payload


@lru_cache(maxsize=1)
def load_nemotron_client(*, model: Optional[str] = None) -> NemotronClient:
    """Create a singleton Nemotron client configured for OpenRouter access."""

    if OpenAI is None:
        return NemotronClient(client=None, model=model or "nvidia/nemotron-nano-12b-v2-vl:free")

    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not set. Update backend/.env with your OpenRouter key.")

    client = OpenAI(
        base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        api_key=api_key,
    )
    resolved_model = model or os.getenv("NEMOTRON_MODEL", "nvidia/nemotron-nano-12b-v2-vl:free")
    return NemotronClient(client=client, model=resolved_model)


# ---------------------------------------------------------------------------
# DeepSeek similarity client
# ---------------------------------------------------------------------------


@dataclass
class DeepSeekClient:
    """Wrapper for embedding / similarity queries using the DeepSeek R1T Chimera model."""

    client: Any
    model: str

    def embed(self, texts: Iterable[str], **kwargs) -> Sequence[Sequence[float]]:
        batched_texts = list(texts)
        if self.client is None:
            # Return deterministic dummy vectors so downstream similarity logic still works.
            return [[float(len(text) % 10), float(sum(map(ord, text)) % 100) / 100] for text in batched_texts]

        response = self.client.embeddings.create(
            model=self.model,
            input=batched_texts,
            **kwargs,
        )
        return [item.embedding for item in response.data]


@lru_cache(maxsize=1)
def load_deepseek_client(*, model: Optional[str] = None) -> DeepSeekClient:
    """Initialise the DeepSeek embedding client (cached singleton)."""

    if OpenAI is None:
        return DeepSeekClient(client=None, model=model or "tngtech/deepseek-r1t-chimera:free")

    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not set. Update backend/.env with your OpenRouter key.")

    client = OpenAI(
        base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        api_key=api_key,
    )
    resolved_model = model or os.getenv("DEEPSEEK_MODEL", "tngtech/deepseek-r1t-chimera:free")
    return DeepSeekClient(client=client, model=resolved_model)
