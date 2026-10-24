"""The four language helpers. AI suggests; a person confirms; AI never places a signal.

Each helper has a deterministic fallback and returns suggestions tagged `source: "ai"` with a
confidence. Anything below `LOW_CONFIDENCE` is shown as a question instead of a suggestion.
"""

from typing import Literal

from pydantic import BaseModel, Field

from app.core.ai.gateway import Gateway
from app.core.model.signal import Signal
from app.core.rules.dryrun import DryRun, dry_run
from app.core.rules.lint import Finding, lint
from app.core.rules.schema import PRIMITIVES, REQUIRED_PARAMS, Rule, RuleSetError, load_rules
from app.core.rules.scope import SCOPE_FIELDS, ScopeError, parse_scope
from app.core.tq.model import TQ

LOW_CONFIDENCE = 0.6


class Suggestion(BaseModel):
    kind: Literal["suggestion", "question"]
    value: str
    confidence: float
    source: Literal["ai"] = "ai"
    model: str = ""
    prompt_hash: str = ""


def _kind(conf: float) -> str:
    return "suggestion" if conf >= LOW_CONFIDENCE else "question"


# -- mapping hints --------------------------------------------------------------------------


class _Pick(BaseModel):
    choice: str
    confidence: float = Field(ge=0, le=1)


def mapping_hint(
    gw: Gateway, field: str, columns: list[tuple[str, list[object]]]
) -> Suggestion | None:
    """Which of the columns the mapper could not tell apart holds `field`? Never auto-applied."""
    names = {c for c, _ in columns}
    res = gw.ask(
        "mapping",
        {
            "columns": [{"name": c, "samples": s[:3]} for c, s in columns],
            "candidate_fields": [field],
        },
        _Pick,
        f"A spreadsheet column must be mapped to the canonical field '{field}'. Choose the one "
        "column name that holds it, copied exactly from the list. Samples are masked.",
        check=lambda p: p.choice in names,
    )
    if res is None:
        return None
    return Suggestion(
        kind=_kind(res.value.confidence),
        value=res.value.choice,
        confidence=res.value.confidence,
        model=res.model,
        prompt_hash=res.prompt_hash,
    )


# -- value classification -------------------------------------------------------------------


class _Category(BaseModel):
    category: str
    confidence: float = Field(ge=0, le=1)


def classify_value(gw: Gateway, field: str, value: str, categories: list[str]) -> Suggestion | None:
    res = gw.ask(
        "value",
        {"field": field, "value": value, "categories": categories},
        _Category,
        f"Classify the unfamiliar {field} value into exactly one of the given categories, copied "
        "exactly. In a plant IO list a horn, beacon, sounder, solenoid or SOV is a high-current "
        "discrete output; an indication or alarm lamp is standard.",
        check=lambda c: c.category in categories,
    )
    if res is None:
        return None
    return Suggestion(
        kind=_kind(res.value.confidence),
        value=res.value.category,
        confidence=res.value.confidence,
        model=res.model,
        prompt_hash=res.prompt_hash,
    )


# -- natural language to rule ---------------------------------------------------------------


class _AiRule(BaseModel):
    name: str = ""
    primitive: str | None = None
    scope: str = ""
    parameters: dict = Field(default_factory=dict)
    unsupported_reason: str | None = None
    confidence: float = Field(default=0.0, ge=0, le=1)


class RulePreview(BaseModel):
    status: Literal["ok", "not_enforced", "rejected", "unavailable"]
    message: str
    rule: Rule | None = None
    findings: list[Finding] = Field(default_factory=list)
    dry_run: list[DryRun] = Field(default_factory=list)
    confidence: float | None = None
    source: Literal["ai"] = "ai"
    applied: bool = False  # a preview is never applied; confirming is a separate call


def _instructions() -> str:
    prims = "; ".join(
        f"{p}({' | '.join('+'.join(g) for g in REQUIRED_PARAMS[p])})" for p in PRIMITIVES
    )
    return (
        "Translate the engineer's sentence into ONE IO-allocation rule. Allowed primitives and "
        f"their parameters: {prims}. Levels are baseplate, cioc, cabinet. `scope` is a filter "
        "expression over signal fields such as `io_type = AIR` or `group = G1 and tag = X`; it is a "
        f"filter language, never code. Signal fields: {', '.join(SCOPE_FIELDS)}. If the request "
        "cannot be expressed with these primitives, set primitive to null and explain in "
        "unsupported_reason. Canonical io_type values are AIR, AOR, DIR and DOR (analog/digital "
        "input/output); segregation_family is A, B, C, D or E. Give a confidence from 0 to 1."
    )


def compile_rule(
    gw: Gateway,
    request: str,
    existing_ids: set[str],
    signals: list[Signal] | None = None,
    blocks=None,
    groups: dict[str, str] | None = None,
) -> RulePreview:
    if not gw.available:
        return RulePreview(
            status="unavailable",
            message="AI is not configured; build the rule with the rule form instead",
        )
    res = gw.ask(
        "rule",
        {"request": request, "fields": list(SCOPE_FIELDS), "primitives": list(PRIMITIVES)},
        _AiRule,
        _instructions(),
    )
    if res is None:
        return RulePreview(
            status="unavailable", message="the AI did not return a usable answer; use the rule form"
        )
    ai = res.value
    if ai.primitive is None:
        reason = ai.unsupported_reason or "this cannot be expressed with the rule primitives"
        n = len(existing_ids) + 1
        rule = Rule(id=f"AI-{n}", name=ai.name or "unsupported request", not_enforced_reason=reason)
        return RulePreview(
            status="not_enforced", message=reason, rule=rule, confidence=ai.confidence
        )
    n = 1
    while f"AI-{n}" in existing_ids:
        n += 1
    try:
        rule = load_rules(
            [
                {
                    "id": f"AI-{n}",
                    "name": ai.name,
                    "primitive": ai.primitive,
                    "scope": ai.scope,
                    "parameters": ai.parameters,
                }
            ]
        )[0]
        parse_scope(rule.scope)  # a parser, not an evaluator: code in a scope cannot parse
    except (RuleSetError, ScopeError, ValueError) as e:
        return RulePreview(
            status="rejected",
            message=f"the suggested rule is not valid: {e}",
            confidence=ai.confidence,
        )
    findings = lint([rule], signals, groups)
    if any(f.severity == "error" for f in findings):
        bad = "; ".join(f.message for f in findings if f.severity == "error")
        return RulePreview(
            status="rejected",
            message=f"the suggested rule fails lint: {bad}",
            findings=findings,
            confidence=ai.confidence,
        )
    counts = dry_run([rule], blocks) if blocks is not None else []
    return RulePreview(
        status="ok",
        message="review the rule, then confirm to add it",
        rule=rule,
        findings=findings,
        dry_run=counts,
        confidence=ai.confidence,
    )


# -- TQ wording -----------------------------------------------------------------------------


class _Wording(BaseModel):
    explanation: str = Field(max_length=700)
    confidence: float = Field(default=0.5, ge=0, le=1)


class TqWording(BaseModel):
    text: str
    source: Literal["ai", "template"]
    confidence: float | None = None


def template_text(tq: TQ) -> str:
    opts = "; ".join(f"{o.label} ({o.consequence})" for o in tq.options)
    default = f" Default applied: {tq.default_applied}." if tq.default_applied else ""
    return f"{tq.message}.{default} Options: {opts}."


def explain_tq(gw: Gateway, tq: TQ) -> TqWording:
    res = gw.ask(
        "tq",
        {
            "tq": {
                "code": tq.code,
                "message": tq.message,
                "options": [o.label for o in tq.options],
                "default_applied": tq.default_applied,
            }
        },
        _Wording,
        "Explain this technical query from an IO allocation tool to a plant engineer in two plain "
        "sentences: what is unclear, what the tool assumed meanwhile, and what the choices mean. "
        "Do not invent tag names or numbers.",
    )
    if res is None:
        return TqWording(text=template_text(tq), source="template")
    return TqWording(text=res.value.explanation, source="ai", confidence=res.value.confidence)
