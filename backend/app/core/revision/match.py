"""Match a revised signal set to a baseline and classify every row."""

import re
from collections import Counter, defaultdict
from typing import Literal

from pydantic import BaseModel, Field

from app.core.model.issue import Issue
from app.core.model.signal import Signal
from app.core.revision.baseline import SLOT, Baseline, skey

Kind = Literal["unchanged", "modified", "added", "deleted"]

# fields whose change makes a matched row "modified", grouped by what they can affect
PLACEMENT_FIELDS = (
    "cable", "pair", "cable_pairs", "cable_formation", "segregation", "segregation_family",
    "logic_number", "group",
)  # fmt: skip
HARDWARE_FIELDS = (
    "io_type", "io_type_2", "duty", "duty_class", "signal_type", "signal_level", "execution",
    "external_power", "contact_type",
)  # fmt: skip
INFO_FIELDS = (
    "tag", "service", "service_short", "instrument_type", "instrument_description", "loop_name",
    "equipment_name", "area", "operating_area", "technical_room",
)  # fmt: skip
COMPARED = (*PLACEMENT_FIELDS, *HARDWARE_FIELDS, *INFO_FIELDS)
IMPACT = {"placement": PLACEMENT_FIELDS, "hardware": HARDWARE_FIELDS, "info": INFO_FIELDS}


# -- revision labels -----------------------------------------------------------------------------
def normalise_label(label: object) -> str:
    """'1' -> '01', '05a' -> '05A', '05b+' -> '05B+'. Empty means the base issue '00'."""
    t = str(label if label is not None else "").strip().upper()
    if t in ("", "0", "00", "-"):
        return "00"
    m = re.fullmatch(r"(\d+)([A-Z]*)(\+*)", t)
    if not m:
        return t
    return f"{int(m.group(1)):02d}{m.group(2)}{m.group(3)}"


def label_order(label: str) -> tuple:
    """01 < 02 < 04 < 05A < 05B < 05B+ (numeric part, then letters, then plus signs)."""
    m = re.fullmatch(r"(\d+)([A-Z]*)(\+*)", normalise_label(label))
    return (int(m.group(1)), m.group(2), len(m.group(3))) if m else (10**6, label, 0)


def revision_labels(signals: list[Signal]) -> list[str]:
    return sorted({normalise_label(s.revision) for s in signals}, key=label_order)


def filter_revision(signals: list[Signal], label: str) -> list[Signal]:
    """The rows of one revision, from a file that holds several."""
    want = normalise_label(label)
    return [s for s in signals if normalise_label(s.revision) == want]


# -- matching ------------------------------------------------------------------------------------
class Change(BaseModel):
    kind: Kind
    match: Literal["cable_pair", "tag", "tag_only"] | None = None
    new: Signal | None = None
    old: Signal | None = None
    changed_fields: list[str] = Field(default_factory=list)
    impact: list[str] = Field(default_factory=list)  # placement | hardware | info
    slot: SLOT | None = None  # where the old signal sits in the baseline
    block_id: str | None = None  # baseline cable block of the old signal
    explicit_delete: bool = False  # the revised file carries the row flagged as deleted
    issues: list[Issue] = Field(default_factory=list)

    @property
    def signal(self) -> Signal:
        s = self.new or self.old
        assert s is not None
        return s


class MatchResult(BaseModel):
    changes: list[Change] = Field(default_factory=list)
    issues: list[Issue] = Field(default_factory=list)

    def counts(self) -> dict[str, int]:
        c = Counter(ch.kind for ch in self.changes)
        return {k: c.get(k, 0) for k in ("unchanged", "modified", "added", "deleted")}

    def of(self, kind: Kind) -> list[Change]:
        return [c for c in self.changes if c.kind == kind]


def _text(v: object) -> str:
    return "" if v is None else str(v).strip()


def _cp(s: Signal) -> tuple[str, int] | None:
    return (_text(s.cable).upper(), s.pair) if _text(s.cable) and s.pair is not None else None


def _same(a: object, b: object) -> bool:
    fold = lambda v: re.sub(r"\s+", " ", _text(v)).upper()
    return fold(a) == fold(b)


def _differences(old: Signal, new: Signal, known: list[str] | None = None) -> list[str]:
    return [
        f
        for f in COMPARED
        if (known is None or f in known) and not _same(getattr(old, f), getattr(new, f))
    ]


def _impact(fields: list[str]) -> list[str]:
    return [k for k, names in IMPACT.items() if any(f in names for f in fields)]


def _issue(message: str, s: Signal) -> Issue:
    return Issue(
        code="TQ-REV", severity="warning", message=message,
        source_file=s.source_file, source_row=s.source_row,
    )  # fmt: skip


def match_revision(baseline: Baseline, revised: list[Signal]) -> MatchResult:
    """Match on cable+pair first, then on tag (TQ-REV, keep the slot); classify every row."""
    slots = baseline.slots()
    old_all = baseline.signals or [p.signal for p in slots.values() if p.signal]
    by_cp: dict[tuple, list[Signal]] = defaultdict(list)
    by_tag: dict[str, list[Signal]] = defaultdict(list)
    for s in old_all:
        if cp := _cp(s):
            by_cp[cp].append(s)
        if _text(s.tag):
            by_tag[_text(s.tag)].append(s)

    def slot_key(s: Signal) -> tuple:
        p = slots.get(skey(s))
        return (p is None, (p.cioc_no, p.baseplate, p.channel) if p else (0, 0, 0), _text(s.tag))

    claimed: set[tuple] = set()
    found: dict[int, tuple[Signal, str, list[Issue]]] = {}

    def pick(cands: list[Signal], new: Signal, how: str) -> tuple[Signal | None, list[Issue]]:
        cands = [c for c in cands if skey(c) not in claimed]
        if not cands:
            return None, []
        if len(cands) == 1:
            return cands[0], []
        same_tag = [c for c in cands if _text(c.tag) == _text(new.tag)]
        if len(same_tag) == 1 and how == "cable_pair":
            return same_tag[0], []
        choice = min(cands, key=slot_key)
        msg = (
            f"{len(cands)} baseline signals match {_text(new.tag) or 'this row'} by {how}; "
            f"kept the slot of {_text(choice.tag)}"
        )
        return choice, [_issue(msg, new)]

    for i, new in enumerate(revised):  # pass 1: cable + pair
        cp = _cp(new)
        if cp and cp in by_cp:
            old, iss = pick(by_cp[cp], new, "cable_pair")
            if old:
                claimed.add(skey(old))
                found[i] = (old, "cable_pair", iss)
    for i, new in enumerate(revised):  # pass 2: tag fallback
        if i in found or not _text(new.tag) or _text(new.tag) not in by_tag:
            continue
        old, iss = pick(by_tag[_text(new.tag)], new, "tag")
        if not old:
            continue
        claimed.add(skey(old))
        keyed = _cp(new) or _cp(old)
        how = "tag" if keyed else "tag_only"
        if keyed and _cp(new) != _cp(old):
            iss = [
                *iss,
                _issue(
                    f"{_text(new.tag)}: cable/pair changed from {_cp(old)} to {_cp(new)}; "
                    "matched by tag and kept in its slot",
                    new,
                ),
            ]
        found[i] = (old, how, iss)

    out = MatchResult()
    for i, new in enumerate(revised):
        old, how, iss = found.get(i, (None, None, []))
        if old is None:
            kind: Kind = "deleted" if new.deleted else "added"
            out.changes.append(Change(kind=kind, new=new, explicit_delete=new.deleted))
            continue
        p = slots.get(skey(old))
        diff = _differences(old, new, baseline.known_fields)
        if how == "tag" and _cp(new) != _cp(old):
            diff = sorted({*diff, "cable", "pair"}, key=lambda f: COMPARED.index(f))
        kind = "deleted" if new.deleted else ("modified" if diff else "unchanged")
        out.changes.append(
            Change(
                kind=kind,
                match=how,
                new=new,
                old=old,
                changed_fields=diff,
                impact=_impact(diff),
                slot=(p.cioc_no, p.baseplate, p.channel) if p else None,
                block_id=p.block_id if p else None,
                explicit_delete=new.deleted,
                issues=iss,
            )
        )
        out.issues.extend(iss)
    for old in old_all:
        if skey(old) not in claimed:
            p = slots.get(skey(old))
            out.changes.append(
                Change(
                    kind="deleted",
                    old=old,
                    slot=(p.cioc_no, p.baseplate, p.channel) if p else None,
                    block_id=p.block_id if p else None,
                )
            )
    return out
