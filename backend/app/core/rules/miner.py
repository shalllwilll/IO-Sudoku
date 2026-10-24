"""Rediscover the rules a reference allocation obeys, from statistics only (no AI).

Four generators: separation (two values never share a CIOC), co-location (a field's groups
always sit together), block contiguity, and capacity ceilings. Every candidate is a normal rule
plus the counts behind it. Nothing is applied: a person confirms a candidate before it joins a
rule set. Output order is fixed (support, confidence, id) so the same input mines identically.
"""

from collections import defaultdict
from itertools import combinations

from pydantic import BaseModel, Field

from app.core.model.allocation import Allocation, Placement
from app.core.model.pack import Pack
from app.core.rules.schema import Rule

SEPARATION_FIELDS = ("segregation_family", "io_type", "duty_class", "signal_type", "signal_level")
GROUP_FIELDS = ("logic_number", "equipment_name", "loop_name")


class Candidate(BaseModel):
    id: str
    kind: str  # separation | co_locate | contiguity | capacity
    rule: Rule
    support: int
    confidence: float
    evidence: dict = Field(default_factory=dict)
    low_confidence: bool = False
    already_enforced: bool = False  # the engine enforces it as a built-in invariant


class MineResult(BaseModel):
    signals: int
    ciocs: int
    candidates: list[Candidate]
    notes: list[str] = Field(default_factory=list)


def _signals(alloc: Allocation) -> list[Placement]:
    return [p for p in alloc.placements if p.kind in ("field", "cabinet_alarm") and p.signal]


def _value(p: Placement, field: str) -> str | None:
    v = getattr(p.signal, field, None)
    if v is None and field in ("io_type", "duty_class", "signal_type", "signal_level"):
        v = getattr(p, field, None)
    return str(v) if v not in (None, "", "-") else None


def _separation(ps: list[Placement], n_ciocs: int, pack: Pack) -> list[Candidate]:
    cap = pack.capacity
    out = []
    for field in SEPARATION_FIELDS:
        where: dict[str, set[int]] = defaultdict(set)
        count: dict[str, int] = defaultdict(int)
        for p in ps:
            if (v := _value(p, field)) is not None:
                where[v].add(p.cioc_no)
                count[v] += 1
        big = sorted(v for v, n in count.items() if n >= cap.miner_min_support)
        for a, b in combinations(big, 2):
            both = len(where[a] & where[b])
            small = min(len(where[a]), len(where[b]))
            expected = len(where[a]) * len(where[b]) / max(1, n_ciocs)
            conf = round(1 - both / small, 4)
            # two values that each sit in a single CIOC are separate by construction, not by rule
            if conf < cap.miner_min_confidence or max(len(where[a]), len(where[b])) < 2:
                continue
            out.append(
                Candidate(
                    id=f"MINED-SEP-{field}-{a}-{b}", kind="separation", support=min(count[a], count[b]),
                    confidence=conf,
                    rule=Rule(
                        id=f"MINED-SEP-{field}-{a}-{b}".replace(" ", "_"),
                        name=f"keep {field} {a} and {b} in different CIOCs",
                        primitive="separate",
                        parameters={"a": f"{field} = {a}", "b": f"{field} = {b}", "level": "cioc"},
                    ),
                    evidence={
                        "field": field, "values": [a, b], "signals": [count[a], count[b]],
                        "ciocs": [len(where[a]), len(where[b])], "ciocs_in_common": both,
                        "ciocs_total": n_ciocs, "expected_in_common": round(expected, 2),
                    },
                )
            )  # fmt: skip
    return out


def _co_locate(ps: list[Placement], pack: Pack) -> list[Candidate]:
    cap, out = pack.capacity, []
    for field in GROUP_FIELDS:
        groups: dict[str, list[int]] = defaultdict(list)
        for p in ps:
            if (v := _value(p, field)) is not None:
                groups[v].append(p.cioc_no)
        tested = {g: c for g, c in groups.items() if len(c) >= 2}
        if len(tested) < cap.miner_min_groups:
            continue
        together = [g for g, c in tested.items() if len(set(c)) == 1]
        conf = round(len(together) / len(tested), 4)
        support = sum(len(tested[g]) for g in together)
        if conf < cap.miner_min_confidence or support < cap.miner_min_support:
            continue
        out.append(
            Candidate(
                id=f"MINED-COLOC-{field}", kind="co_locate", support=support, confidence=conf,
                rule=Rule(
                    id=f"MINED-COLOC-{field}", name=f"keep each {field} in one CIOC",
                    primitive="co_locate", parameters={"by": field, "level": "cioc"},
                ),
                evidence={"groups_tested": len(tested), "groups_together": len(together),
                          "signals_in_groups": support},
            )
        )  # fmt: skip
    return out


def _contiguity(ps: list[Placement], pack: Pack) -> list[Candidate]:
    ch = pack.capacity.channels_per_baseplate
    cables: dict[str, list[Placement]] = defaultdict(list)
    for p in ps:
        if p.kind == "field" and p.signal and p.signal.cable and p.signal.pair is not None:
            cables[p.signal.cable].append(p)
    bad: list[str] = []
    for name, cells in sorted(cables.items()):
        cells.sort(key=lambda p: p.signal.pair)  # type: ignore[union-attr]
        bps = sorted({p.baseplate for p in cells})
        size = max(len(cells), max(p.signal.cable_pairs or 0 for p in cells))  # type: ignore[union-attr]
        order = [(p.baseplate, p.channel) for p in cells]
        ok = (
            len({p.cioc_no for p in cells}) == 1
            and bps[-1] - bps[0] + 1 == len(bps)
            and (size > ch or len(bps) == 1)
            and order == sorted(order)
        )
        if not ok:
            bad.append(name)
    if not cables:
        return []
    conf = round(1 - len(bad) / len(cables), 4)
    support = sum(len(c) for n, c in cables.items() if n not in bad)
    if conf < pack.capacity.miner_min_confidence:
        return []
    return [
        Candidate(
            id="MINED-CONTIGUITY", kind="contiguity", support=support, confidence=conf,
            already_enforced=True,
            rule=Rule(id="MINED-CONTIGUITY", name="each cable is laid out as one contiguous block",
                      builtin="R-BLOCK"),
            evidence={"cables_tested": len(cables), "cables_contiguous": len(cables) - len(bad),
                      "exceptions": bad[:10]},
        )
    ]  # fmt: skip


def _capacity(ps: list[Placement], alloc: Allocation, pack: Pack) -> list[Candidate]:
    cap = pack.capacity
    per: dict[int, set[int]] = defaultdict(set)
    for p in ps:
        per[p.cioc_no].add(p.baseplate)
    if len(per) < cap.miner_min_groups:
        return []
    most = max(len(v) for v in per.values())
    limit = cap.baseplates_per_cioc - 1  # the alarm baseplate is never free for signals
    if most >= limit:
        return []
    return [
        Candidate(
            id="MINED-CAP-cioc-baseplates", kind="capacity", support=sum(len(v) for v in per.values()),
            confidence=1.0,
            rule=Rule(id="MINED-CAP-cioc-baseplates",
                      name=f"at most {most} baseplates of signals per CIOC", primitive="capacity",
                      parameters={"per": "cioc", "measure": "baseplates", "max": most}),
            evidence={"ciocs": len(per), "observed_max": most, "structural_limit": limit},
        )
    ]  # fmt: skip


def mine(alloc: Allocation, pack: Pack) -> MineResult:
    ps = _signals(alloc)
    n_ciocs = len({p.cioc_no for p in ps})
    cands = [
        *_separation(ps, n_ciocs, pack),
        *_co_locate(ps, pack),
        *_contiguity(ps, pack),
        *_capacity(ps, alloc, pack),
    ]
    notes = []
    if len(ps) < pack.capacity.miner_min_signals:
        notes.append(
            f"the reference has only {len(ps)} signals (fewer than "
            f"{pack.capacity.miner_min_signals}); every candidate is low confidence"
        )
        for c in cands:
            c.low_confidence = True
    cands.sort(key=lambda c: (-c.support, -c.confidence, c.id))
    return MineResult(signals=len(ps), ciocs=n_ciocs, candidates=cands, notes=notes)
