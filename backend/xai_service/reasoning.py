"""Nemotron reasoning helpers for XAI artefacts."""

from __future__ import annotations

from typing import Any, Dict, Sequence

from .loaders import load_nemotron_client


def _format_context_messages(artefacts: Dict[str, Any]) -> Sequence[Dict[str, str]]:
    summary_lines = ["The following artefacts were generated for an evidence analysis:"]
    for key, value in artefacts.items():
        summary_lines.append(f"- {key}: {value}")

    content = "\n".join(summary_lines)
    return [
        {
            "role": "system",
            "content": (
                "You are an explainable AI assistant helping investigators, judges, and technical teams understand AI findings."
            ),
        },
        {"role": "user", "content": content},
    ]


def generate_nemotron_reasoning(artefacts: Dict[str, Any]) -> Dict[str, str]:
    """Call Nemotron to produce human-friendly explanations."""

    client = load_nemotron_client()
    messages = _format_context_messages(artefacts)

    try:
        response = client.generate(messages)
    except RuntimeError as exc:  # When the client is unavailable
        return {
            "investigator_summary": "Nemotron client unavailable: run with OPENROUTER_API_KEY configured.",
            "judge_friendly_explanation": "",
            "technical_explanation": "",
            "error": str(exc),
        }

    message = response.get("message", {}) if isinstance(response, dict) else {}
    message_content = message.get("content", "")

    return {
        "investigator_summary": message_content,
        "judge_friendly_explanation": "Pending custom prompt design.",
        "technical_explanation": "Pending custom prompt design.",
    }
