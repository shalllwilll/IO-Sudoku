"""Triage: turn a flat TQ list into prioritised groups an operator can resolve in a few clicks.

Everything here is derived from fields a TQ already carries. Nothing is guessed about the
allocation: a group only offers a recommended answer where one is safe to propose, and each option
says whether answering it changes the layout or only records the decision.
"""

import re
from typing import Literal

from pydantic import BaseModel, Field

from app.core.model.pack import Pack
from app.core.tq.answers import EFFECT, VALUE_FIELDS, _allowed_values
from app.core.tq.model import OPTIONS, TQ

Priority = Literal["P1", "P2", "P3"]
PRIORITY = {"blocking": "P1", "assumed": "P2", "info": "P3"}

# what an option needs from the user besides picking it
NEEDS = {
    "map_pick": ["value"], "value": ["value"], "segregation": ["value"], "capacity": ["value"],
    "hardware": ["fields:charm", "fields:tb"], "naming": ["fields:area|unit"],
    "rule_revise": ["fields"], "rule_waive": ["fields:rule"], "place": ["placement"],
}  # fmt: skip

# (pattern, kind, title, why): refinements within a code, matched against the message
KINDS: list[tuple[str, str, str, str]] = [
    (r"different area numbers", "area-mismatch", "Tag and cable use different area numbers",
     "Usually a naming quirk in the source list. The signals are still allocated; this only asks "
     "you to confirm the mismatch is expected."),
    (r"pair", "pair-data", "Cable pair numbers are inconsistent",
     "A pair number is missing, repeated or beyond the cable's pair count, so the signal cannot "
     "be placed until the source data is corrected."),
    (r"missing|empty|no (tag|io type|cable)", "missing-field", "Required fields are empty",
     "The signal lacks a tag, IO type or cable and cannot be placed."),
]  # fmt: skip

TITLES: dict[str, tuple[str, str]] = {
    "TQ-RULE": ("Cables no rule-compliant slot can hold",
                "Every candidate position breaks a hard rule or the capacity limit, so the cable "
                "is held out instead of being placed wrongly."),
    "TQ-CAP": ("Capacity: cables that do not fit",
               "The cable is larger than the space left, or more cabinets are needed than the "
               "limit allows."),
    "TQ-SEG": ("Segregation conflicts",
               "Signals with incompatible segregation families share a cable or a CIOC."),
    "TQ-ALM": ("No alarm slot left in a cabinet",
               "Every reserved alarm baseplate in the cabinet is already in use."),
    "TQ-HW": ("No hardware part number for these signals",
              "No hardware rule gives a CHARM and terminal block for this signal type."),
    "TQ-VALUE": ("Unrecognised values",
                 "The source holds a value the rules do not know, so a safe default is used or the "
                 "signal is held out."),
    "TQ-MAP": ("Column mapping needs confirming",
               "A source column could be read in more than one way or with low confidence."),
    "TQ-NAME": ("Area or unit not set",
                "Names use default parts because the project has no area or unit."),
    "TQ-SPARE": ("Spare allowance", "Wired spares fall short of, or are assumed for, the rule."),
    "TQ-REV": ("Signals the revision wants to move",
               "The revision matched these signals by tag only, so their slots were kept."),
    "TQ-DATA": ("Data warnings", "Something in the source list is unusual."),
}


ONE_GROUP = {"TQ-RULE", "TQ-CAP", "TQ-SEG", "TQ-ALM", "TQ-NAME", "TQ-HW"}


class GroupOption(BaseModel):
    label: str
    consequence: str
    effect: str
    changes_allocation: bool
    needs: list[str] = Field(default_factory=list)
    choices: list[str] = Field(default_factory=list)


class Recommended(BaseModel):
    option: str
    scope: str = "everywhere"
    value: str | None = None
    reason: str


class CableRef(BaseModel):
    tq_id: str
    cable: str
    signals: int
    open: bool


class TqGroup(BaseModel):
    key: str
    code: str
    category: str
    priority: Priority
    title: str
    why: str
    tq_ids: list[str]
    open_ids: list[str]
    signals: int
    status: Literal["open", "answered", "mixed"]
    options: list[GroupOption]
    recommended: Recommended | None = None
    can_place: bool = False
    cables: list[CableRef] = Field(default_factory=list)  # per-cable TQs, for placement
    samples: list[str] = Field(default_factory=list)


def normalise(message: str) -> str:
    """The message with per-signal detail (quoted names, numbers) removed, for grouping."""
    m = re.sub(r"'[^']*'", "'_'", message)
    m = re.sub(r"\d+", "#", m)
    return re.sub(r"\s+", " ", m).strip().lower()


def _kind(tq: TQ) -> tuple[str, str, str]:
    if tq.code == "TQ-DATA":
        for pat, kind, title, why in KINDS:
            if re.search(pat, tq.message, re.IGNORECASE):
                return kind, title, why
    title, why = TITLES[tq.code]
    if tq.code == "TQ-VALUE" and tq.data.get("field") and tq.data.get("value"):
        title = f"Unrecognised {tq.data['field'].replace('_', ' ')} '{tq.data['value']}'"
    if tq.code == "TQ-MAP" and tq.data.get("field"):
        title = f"Confirm the column for {tq.data['field'].replace('_', ' ')}"
    if tq.code == "TQ-SPARE":
        kind = tq.data.get("kind", "")
        return kind or tq.code, title, why
    if tq.code in ONE_GROUP:
        return tq.code, title, why  # the per-cable detail differs, the cause and the fix do not
    return normalise(tq.message), title, why


def _rules_in(message: str) -> list[str]:
    m = re.search(r"rule\(s\)\s*(.+)$", message)
    return m.group(1).split(",") if m else []


def _choices(effect: str, tq: TQ, pack: Pack) -> list[str]:
    if effect not in ("value", "segregation"):
        return []
    field = VALUE_FIELDS.get(tq.data.get("field", "segregation" if effect == "segregation" else ""))
    return sorted(_allowed_values(field, pack)) if field else []


def _options(tq: TQ, pack: Pack) -> list[GroupOption]:
    out = []
    for (label, consequence), effect in zip(OPTIONS[tq.code], EFFECT[tq.code], strict=True):
        out.append(
            GroupOption(
                label=label, consequence=consequence, effect=effect,
                changes_allocation=effect != "note", needs=NEEDS.get(effect, []),
                choices=_choices(effect, tq, pack),
            )
        )  # fmt: skip
    return out


def _recommend(tq: TQ) -> Recommended | None:
    """Only answers that are safe to propose without further input from the user."""
    if tq.code == "TQ-MAP" and tq.data.get("column"):
        return Recommended(option="Confirm the suggested column",
                           reason=f"The best match is column '{tq.data['column']}'.")  # fmt: skip
    if tq.code == "TQ-NAME":
        return Recommended(option="Keep the default",
                           reason="Defaults are fine for a draft; set area and unit to name properly.")  # fmt: skip
    if tq.code == "TQ-VALUE" and tq.severity != "blocking":
        return Recommended(option="Keep the default policy",
                           reason="The pack's safe default applies to this value.")  # fmt: skip
    if tq.code == "TQ-DATA" and tq.severity != "blocking":
        return Recommended(option="Leave as is", reason="Informational; allocation continues.")
    if tq.code == "TQ-SPARE" and tq.severity == "info":
        return Recommended(option="Accept the shortfall", reason="Informational; spares are assumed.")
    if tq.code == "TQ-REV":
        return Recommended(option="Keep the previous slot", reason="The signal does not move.")
    return None


def triage(tqs: list[TQ], pack: Pack) -> list[TqGroup]:
    buckets: dict[str, list[TQ]] = {}
    meta: dict[str, tuple[str, str]] = {}
    for tq in tqs:
        kind, title, why = _kind(tq)
        key = f"{tq.code}:{kind}"
        buckets.setdefault(key, []).append(tq)
        meta.setdefault(key, (title, why))
    groups: list[TqGroup] = []
    for key, items in buckets.items():
        first = items[0]
        title, why = meta[key]
        if first.code == "TQ-RULE":
            names = sorted({r.strip() for t in items for r in _rules_in(t.message)})
            if names:
                why = f"{why} Rules involved: {', '.join(names)}."
        priority = min(PRIORITY[t.severity] for t in items)
        open_items = [t for t in items if t.status == "open"]
        options = _options(first, pack)
        rec = _recommend(first)
        if rec and rec.option not in {o.label for o in options}:
            rec = None
        groups.append(
            TqGroup(
                key=key, code=first.code, category=first.category, priority=priority,  # type: ignore[arg-type]
                title=title, why=why, tq_ids=[t.id for t in items],
                open_ids=[t.id for t in open_items],
                signals=len({k for t in items for k in t.signal_keys}) or len(items),
                status="open" if len(open_items) == len(items) else "answered" if not open_items else "mixed",
                options=options, recommended=rec,
                can_place=first.code in ("TQ-RULE", "TQ-CAP", "TQ-SEG", "TQ-ALM"),
                cables=[
                    CableRef(tq_id=t.id, cable=t.data["cable"], signals=len(t.signal_keys), open=t.status == "open")
                    for t in items if t.data.get("cable") and first.code in ("TQ-RULE", "TQ-CAP", "TQ-SEG")
                ],
                samples=[t.message for t in items[:3]],
            )
        )  # fmt: skip
    groups.sort(key=lambda g: (g.status == "answered", g.priority, -g.signals, g.key))
    return groups


__all__ = ["GroupOption", "Recommended", "TqGroup", "triage"]
