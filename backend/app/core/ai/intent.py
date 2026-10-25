"""Bounded natural-language intent layer for the real rule compiler.

It classifies only a small closed set of allocation requests.  Gemini may improve the wording of
the classification, but every actual rule still goes through ``compile_rule`` and the existing
explicit confirmation endpoint.
"""

import re
from typing import Literal

from pydantic import BaseModel, Field

from app.core.ai.features import RulePreview, compile_rule
from app.core.ai.gateway import Gateway
from app.core.ai.templates import EXAMPLES, compile_template
from app.core.model.signal import Signal

IntentName = Literal["rule", "explain", "goal", "clarify", "unknown", "conflict"]


class IntentPreview(BaseModel):
    state: Literal["preview", "conflict", "clarify", "unknown", "unavailable"]
    intent: IntentName
    message: str
    locked_rules: list[str] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)
    rule_preview: RulePreview | None = None


_UPPER_PAIR = re.compile(r"\b([AB])\b\s*(?:and|&|/|\+|with|or|,)\s*\b([AB])\b")
_NAMED_PAIR = re.compile(
    r"\b(?:family|class|segregation|type)\s+([ab])\b.*\b(?:family|class|segregation|type)\s+([ab])\b",
    re.IGNORECASE,
)
_MIXING = re.compile(r"\b(together|same|mix|mixed|share|sharing|combine|alongside)\b")
_NEGATED = re.compile(r"\b(not|never|don't|dont|no|avoid|separate|apart|keep apart)\b")


def _mixes_ab(text: str) -> bool:
    """True only when the request names both segregation families and asks to put them together.

    The bare article "a" must never count as family A, so a family is recognised as an upper-case
    letter or as "family/class/segregation/type a".
    """
    low = text.lower()
    pair = _UPPER_PAIR.search(text) or _NAMED_PAIR.search(text)
    if not pair or pair.group(1).lower() == pair.group(2).lower():
        return False
    return bool(_MIXING.search(low)) and not _NEGATED.search(low)


def _local(text: str) -> IntentName:
    value = text.lower()
    if _mixes_ab(text):
        return "conflict"
    if any(word in value for word in ("why", "explain", "reason")):
        return "explain"
    if "group" in value and any(word in value for word in ("flexible", "relax", "loose")):
        return "clarify"
    if any(
        word in value
        for word in (
            "rule",
            "separate",
            "never mix",
            "capacity",
            "reserve",
            "spare",
            "assign",
            "pin",
        )
    ):
        return "rule"
    if any(word in value for word in ("fit more", "save space", "optim", "goal")):
        return "goal"
    return "unknown"


def propose_intent(
    gateway: Gateway,
    request: str,
    existing_ids: set[str],
    signals: list[Signal] | None = None,
    blocks=None,
    groups: dict[str, str] | None = None,
) -> IntentPreview:
    """Return a non-mutating proposal using the real rule lint/dry-run pipeline.

    Rule-like text always reaches the compiler: a template answers it offline, and with AI on the
    model gets every sentence the templates and the local classifier do not settle.
    """
    intent = _local(request)
    if intent == "conflict":
        return IntentPreview(
            state="conflict",
            intent="conflict",
            message="A and B may not share a CIOC; this locked allocation invariant cannot be changed.",
            locked_rules=["R-SEG"],
            questions=["Would you like a capacity or segregation review instead?"],
        )
    templated = compile_template(request) is not None
    if not templated and intent == "clarify":
        return IntentPreview(
            state="clarify",
            intent="clarify",
            message="Grouping can be tightened with a co-location rule, but the requested scope is unclear.",
            questions=[
                "Which signals should stay together, and at which level: baseplate, CIOC, or cabinet?"
            ],
        )
    if not templated and intent == "explain":
        return IntentPreview(
            state="clarify",
            intent="explain",
            message="An explanation needs a signal tag, cable/pair, TQ ID, or run ID.",
            questions=["Which allocation result should I explain?"],
        )
    if not templated and not gateway.available and intent in {"goal", "unknown"}:
        return IntentPreview(
            state="unknown" if intent == "unknown" else "clarify",
            intent=intent,
            message=(
                "I could not map this to a rule I can build without AI."
                if intent == "unknown"
                else "Goals are advisory; choose a concrete rule before applying a change."
            ),
            questions=["Try a phrasing like: " + "; ".join(f'"{e}"' for e in EXAMPLES[:3])],
        )
    preview = compile_rule(gateway, request, existing_ids, signals, blocks, groups)
    state = (
        "preview"
        if preview.status == "ok"
        else "unavailable"
        if preview.status == "unavailable"
        else "clarify"
    )
    return IntentPreview(state=state, intent="rule", message=preview.message, rule_preview=preview)
