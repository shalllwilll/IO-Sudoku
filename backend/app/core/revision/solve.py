"""Allocate a revision against a baseline with the fewest justified moves.

Blocks whose every position can keep its baseline cell are pinned. The rest are placed by CP-SAT
(hint = the greedy-pin answer, objective: unallocated, moved signals, cabinets, fragmentation) or,
if that fails, by greedy first-fit with the pins in place. A second CP-SAT tier unpins everything
when a block does not fit around the pins. The layout is the baseline's, never re-derived.
"""

from collections import defaultdict
from dataclasses import dataclass, field

from app.config import Settings
from app.core.layout.blocks import BlockSet, build_blocks
from app.core.model.allocation import Allocation, Placement, Unplaced
from app.core.model.issue import Issue
from app.core.model.layout import Block, Layout
from app.core.model.pack import Pack
from app.core.model.signal import Signal
from app.core.revision.baseline import Baseline, skey
from app.core.revision.match import Change, MatchResult, match_revision, normalise_label
from app.core.rules.primitives import Ctx
from app.core.rules.schema import Rule
from app.core.solve import cpsat
from app.core.solve.chain import Event, _improvable, tq_only
from app.core.solve.cpsat import RevisionSpec, solver_inputs
from app.core.solve.greedy import (
    Cell,
    _make_placements,
    _rule_rejections,
    block_hw,
    block_ok,
    compatible,
    pack_blocks,
    place_fixed,
)
from app.core.solve.qiga import solve_qiga
from app.core.solve.validator import Violation, validate_allocation

REASONS = (
    "modified", "block_growth", "block_shrink", "segregation", "rule_change", "capacity",
    "constraint",
)  # fmt: skip


@dataclass
class Move:
    tag: str | None
    cable: str | None
    pair: int | None
    block_id: str | None
    from_slot: Cell
    to_slot: Cell
    reason: str
    detail: str = ""


@dataclass
class RevisionResult:
    allocation: Allocation
    match: MatchResult
    moves: list[Move] = field(default_factory=list)
    solver: str = ""  # cpsat | greedy-pin | qiga | tq
    tier: int = 0
    events: list[Event] = field(default_factory=list)
    violations: list[Violation] = field(default_factory=list)
    label: str = ""
    pinned_blocks: int = 0
    free_blocks: int = 0

    def move_report(self) -> str:
        lines = [f"{len(self.moves)} moved signals"]
        lines += [f"  {m.tag}: {m.from_slot} -> {m.to_slot} ({m.reason})" for m in self.moves]
        return "\n".join(lines)


@dataclass
class Plan:
    pinned: dict[str, list[Cell]] = field(default_factory=dict)
    prefs: dict[str, list[Cell | None]] = field(default_factory=dict)
    demoted: dict[str, str] = field(default_factory=dict)  # block -> why it lost its pin
    old_size: dict[str, int] = field(default_factory=dict)


def _cell(p: Placement) -> Cell:
    return (p.cioc_no, p.baseplate, p.channel)


def plan_pins(
    baseline: Baseline,
    match: MatchResult,
    blocks: BlockSet,
    pack: Pack,
    rules: list[Rule] | None,
) -> Plan:
    """Which blocks keep every cell they had, and where the others would like to be."""
    layout = baseline.layout
    sig_cell: dict[tuple, Cell] = {
        skey(c.new): c.slot for c in match.changes if c.new is not None and c.slot
    }
    pair_cell: dict[tuple[str, int], Cell] = {}
    plan = Plan()
    sizes: dict[str, int] = defaultdict(int)
    for p in baseline.allocation.placements:
        if p.block_id and p.pair is not None:
            pair_cell[(p.block_id.upper(), p.pair)] = _cell(p)
            sizes[p.block_id] += 1
    plan.old_size = dict(sizes)
    impact = {skey(c.new): c.impact for c in match.changes if c.new is not None}
    claimed = set(sig_cell.values())

    candidates: list[tuple[Block, list[Cell | None], bool]] = []
    for block in sorted(blocks.blocks, key=lambda b: b.id):
        prefs: list[Cell | None] = []
        placement_changed = False
        for pos in block.positions:
            cell = None
            if pos.signal is not None and skey(pos.signal) in sig_cell:
                cell = sig_cell[skey(pos.signal)]
                placement_changed |= "placement" in impact.get(skey(pos.signal), [])
            else:
                want = pair_cell.get((block.id.upper(), pos.pair))
                if want is not None and want not in claimed:
                    cell = want
                    claimed.add(want)
            prefs.append(cell)
        if any(prefs):
            plan.prefs[block.id] = prefs
        whole = all(prefs) and len({c[0] for c in prefs if c}) == 1
        if whole and len(set(prefs)) == len(prefs) and not placement_changed:
            candidates.append((block, prefs, True))  # type: ignore[arg-type]

    # pin one by one; a block that would now break a rule or segregation loses its pin
    active = [r for r in rules or [] if r.enabled and r.enforced and r.strength == "hard"]
    ctx = Ctx(layout, pack)
    taken: set[Cell] = set()
    families: dict[int, set[str]] = defaultdict(set)
    groups: dict[int, set[str]] = defaultdict(set)
    placed: list[Placement] = []
    reserved = {(c.no, b.n) for c in layout.ciocs for b in c.baseplates if b.reserved is not None}
    for block, cells, _ in candidates:
        cno = cells[0][0]
        if block_ok(block, pack):
            plan.demoted[block.id] = "segregation"
            continue
        if any((c[0], c[1]) in reserved for c in cells):
            plan.demoted[block.id] = "rule_change"
            continue
        if taken & set(cells):
            plan.demoted[block.id] = "block_growth"
            continue
        if not compatible(families[cno], bool(groups[cno]), block, pack):
            plan.demoted[block.id] = "segregation"
            continue
        ps = _make_placements(block, cno, [(n, ch) for _, n, ch in cells], block_hw(block))
        if _rule_rejections(active, ctx, placed, ps):
            plan.demoted[block.id] = "rule_change"
            continue
        plan.pinned[block.id] = list(cells)
        taken |= set(cells)
        families[cno] |= set(block.families)
        groups[cno].add(block.group or block.id)
        placed.extend(ps)
    return plan


def _alarm_seed(match: MatchResult, blocks: BlockSet, layout: Layout, pack: Pack):
    """Cabinet alarms keep their cells; new ones take free cells on the alarm baseplates."""
    keep = {skey(c.new): c.slot for c in match.changes if c.new is not None and c.new.cabinet_alarm}
    cells = [
        (cab.ciocs[0], bp.n, ch)
        for cab in layout.cabinets
        for bp in layout.cioc(cab.ciocs[0]).baseplates
        if bp.reserved == "alarm"
        for ch in range(1, pack.capacity.channels_per_baseplate + 1)
    ]

    def seed(alloc: Allocation) -> None:
        used = {c for c in keep.values() if c}
        free = [c for c in cells if c not in used]
        for s in sorted(blocks.alarm_signals, key=lambda s: (s.service or "", s.tag or "")):
            at = keep.get(skey(s))
            if at is None:
                at = free.pop(0) if free else None
            if at is None:
                iss = Issue(
                    code="TQ-ALM",
                    severity="blocking",
                    message="no reserved alarm baseplate cell left for this cabinet alarm",
                )
                alloc.unplaced.append(Unplaced(signal=s, issues=[iss]))
                continue
            alloc.placements.append(
                Placement(
                    cioc_no=at[0], baseplate=at[1], channel=at[2], kind="cabinet_alarm", signal=s
                )
            )

    return seed


def gate_revision(
    alloc: Allocation,
    blocks: BlockSet,
    baseline: Baseline,
    pack: Pack,
    rules: list[Rule] | None,
) -> list[Violation]:
    """Validator gate that blames the revision only for what it introduced.

    An issued sheet can carry irregularities of its own (a cable not starting on channel 1);
    those are inherited, so only violations the baseline did not already have are reported.
    """
    sigs, alarms = solver_inputs(blocks)
    inherited = {
        (v.code, v.message)
        for v in validate_allocation(baseline.allocation, pack, baseline.signals, None, rules)
    }
    return [
        v
        for v in validate_allocation(alloc, pack, sigs, alarms, rules)
        if (v.code, v.message) not in inherited
    ]


def _tq_cap_count(alloc: Allocation) -> int:
    return sum(1 for u in alloc.unplaced if any(i.code == "TQ-CAP" for i in u.issues))


def _cpsat_tier(
    blocks: BlockSet,
    layout: Layout,
    pack: Pack,
    rules: list[Rule] | None,
    spec: RevisionSpec,
    hint: Allocation,
    seed,
    overrides: dict,
) -> tuple[Allocation | None, str]:
    build = cpsat._Build(blocks, layout, pack, rules, spec)
    build.add_options(strict=False)
    n = sum(len(v) for v in build.options.values())
    if n > overrides.get("max_options", pack.capacity.cpsat_max_options):
        return None, f"model too large ({n} placement options)"
    build.add_capacity()
    build.add_segregation()
    build.add_rules()
    build.add_objective()
    cpsat._hint(build, hint)
    status, solver, _, _, primary, _ = cpsat._staged_solve(build, pack, overrides)
    name = solver.StatusName(status)
    if name not in ("OPTIMAL", "FEASIBLE"):
        return None, name
    alloc = cpsat._to_allocation(build, solver, layout, None, None, blocks)
    seed(alloc)
    alloc.solver = "cpsat"
    return alloc, f"{name}{' (primary optimal)' if primary else ''}"


def solve_revision(
    baseline: Baseline,
    revised: list[Signal],
    pack: Pack,
    rules: list[Rule] | None = None,
    *,
    label: str | None = None,
    rules_changed: bool = False,
    use_cpsat: bool = True,
    use_qiga: bool | None = None,
    match: MatchResult | None = None,
    **overrides,
) -> RevisionResult:
    m = match or match_revision(baseline, revised)
    live = [c.new for c in m.changes if c.new is not None and c.kind != "deleted"]
    blocks = build_blocks(live, pack)
    layout = baseline.layout
    events: list[Event] = []
    plan = plan_pins(baseline, m, blocks, pack, rules)
    no_alarm = blocks.model_copy(update={"alarm_signals": []})
    seed_alarms = _alarm_seed(m, blocks, layout, pack)

    def seed_all(alloc: Allocation) -> None:
        seed_alarms(alloc)

    def fixed(alloc: Allocation) -> None:
        place_fixed(alloc, no_alarm, layout, pack)
        seed_alarms(alloc)

    result = RevisionResult(
        allocation=Allocation(layout=layout),
        match=m,
        label=normalise_label(label) if label else "",
        pinned_blocks=len(plan.pinned),
        free_blocks=len(blocks.blocks) - len(plan.pinned),
    )
    for bid, why in sorted(plan.demoted.items()):
        events.append(Event("pins", "demoted", f"{bid}: {why}"))

    greedy = pack_blocks(no_alarm, layout, pack, rules, plan.pinned, plan.prefs, fixed)
    greedy.solver = "greedy-pin"
    chosen, solver, tier = greedy, "greedy-pin", 0
    if use_cpsat:
        spec = RevisionSpec(plan.pinned, plan.prefs)
        try:
            alloc, note = _cpsat_tier(
                no_alarm, layout, pack, rules, spec, greedy, seed_all, overrides
            )
        except cpsat.CpsatError as e:
            alloc, note = None, f"unusable: {e}"
        except Exception as e:  # noqa: BLE001 - a solver failure must fall back, not crash
            alloc, note = None, f"{type(e).__name__}: {e}"
        if alloc is not None:
            events.append(Event("cpsat", "used", f"tier 1: {note}"))
            chosen, solver, tier = alloc, "cpsat", 1
            if _tq_cap_count(alloc) and plan.pinned:  # no room around the pins: let them move
                spec2 = RevisionSpec({}, plan.prefs)
                try:
                    alloc2, note2 = _cpsat_tier(
                        no_alarm, layout, pack, rules, spec2, alloc, seed_all, overrides
                    )
                except Exception as e:  # noqa: BLE001
                    alloc2, note2 = None, f"{type(e).__name__}: {e}"
                if alloc2 is not None and len(alloc2.unplaced) < len(alloc.unplaced):
                    events.append(Event("cpsat", "used", f"tier 2 (pins released): {note2}"))
                    chosen, tier = alloc2, 2
                else:
                    events.append(Event("cpsat", "kept", f"tier 2 no better: {note2}"))
        else:
            events.append(Event("cpsat", "fallback", note))
    else:
        events.append(Event("cpsat", "skipped", "disabled"))

    bad = gate_revision(chosen, blocks, baseline, pack, rules)
    if bad and solver == "cpsat":
        events.append(Event("cpsat", "fallback", f"validator rejected: {bad[0].message}"))
        chosen, solver, tier = greedy, "greedy-pin", 0
        bad = gate_revision(chosen, blocks, baseline, pack, rules)
    if not bad and _improvable(chosen):
        chosen, solver = _qiga_overflow(
            chosen, solver, no_alarm, blocks, baseline, pack, rules, plan, fixed, events, use_qiga
        )
    if bad:
        events.append(Event("tq", "used", f"no valid revision allocation: {bad[0].message}"))
        chosen = tq_only(blocks, f"revision could not be validated ({bad[0].message})")
        solver = "tq"
    else:
        events.append(Event(solver, "used", f"{len(chosen.placements)} positions"))
    result.violations = bad
    chosen.issues.extend(m.issues)
    _annotate(chosen, m, plan, result, tier, rules_changed)
    result.allocation, result.solver, result.tier, result.events = chosen, solver, tier, events
    return result


def _qiga_overflow(
    chosen, solver, no_alarm, blocks, baseline, pack, rules, plan, fixed, events, use_qiga
) -> tuple[Allocation, str]:
    """Revision overflow: seed QIGA from the answer so far, around the same pins."""
    on = Settings.from_env().qiga_enabled if use_qiga is None else use_qiga
    if not on:
        events.append(Event("qiga", "skipped", "disabled in settings"))
        return chosen, solver
    try:
        r = solve_qiga(
            no_alarm, baseline.layout, pack, rules, chosen,
            gate=lambda a: gate_revision(a, blocks, baseline, pack, rules),
            pinned=plan.pinned, prefs=plan.prefs, fixed=fixed,
        )  # fmt: skip
    except Exception as e:  # noqa: BLE001 - a failed search keeps the earlier answer
        events.append(Event("qiga", "fallback", f"{type(e).__name__}: {e}"))
        return chosen, solver
    if r.allocation is None:
        status = "fallback" if r.status == "rejected" else r.status.replace("no_gain", "kept")
        events.append(Event("qiga", status, r.message))
        return chosen, solver
    events.append(Event("qiga", "used", f"{r.message} in {r.evaluated} decodes"))
    return r.allocation, "qiga"


def _annotate(
    alloc: Allocation,
    m: MatchResult,
    plan: Plan,
    result: RevisionResult,
    tier: int,
    rules_changed: bool,
) -> None:
    """Moves with reasons, change marks on the placements, remarks on the freed slots."""
    at = {skey(p.signal): p for p in alloc.placements if p.signal is not None}
    new_size: dict[str, int] = defaultdict(int)
    for p in alloc.placements:
        if p.block_id:
            new_size[p.block_id] += 1
    occupied = {_cell(p) for p in alloc.placements}
    for c in m.changes:
        if c.kind in ("added", "modified", "unchanged") and c.new is not None:
            p = at.get(skey(c.new))
            if p is None:
                continue
            moved = c.slot is not None and _cell(p) != c.slot
            if c.kind == "added":
                p.change = "Added"
            elif moved:
                p.change = "Moved"
                result.moves.append(_move(c, p, plan, new_size, tier, rules_changed))
            elif c.kind == "modified":
                p.change = "Modified"
        elif c.kind == "deleted" and c.slot is not None and c.slot not in occupied:
            who = c.old.tag if c.old else c.signal.tag
            tag = f"Deleted in revision {result.label or 'next'}"
            alloc.slot_remarks[f"{c.slot[0]}/{c.slot[1]}/{c.slot[2]}"] = f"{tag}: was {who}"


def _move(
    c: Change, p: Placement, plan: Plan, new_size: dict[str, int], tier: int, rules_changed: bool
) -> Move:
    bid = c.block_id or p.block_id or ""
    old, new = plan.old_size.get(bid, 0), new_size.get(p.block_id or bid, 0)
    if bid in plan.demoted and plan.demoted[bid] in ("segregation", "rule_change"):
        reason, detail = plan.demoted[bid], "the old slot would now break a rule"
    elif new > old > 0:
        reason, detail = "block_growth", f"cable {bid} grew from {old} to {new} positions"
    elif 0 < new < old:
        reason, detail = "block_shrink", f"cable {bid} shrank from {old} to {new} positions"
    elif c.kind == "modified" and c.impact:
        reason, detail = "modified", f"changed: {', '.join(c.changed_fields)}"
    elif bid in plan.demoted:
        reason, detail = "block_growth", "its cells clash with another cable's"
    elif tier == 2:
        reason, detail = "capacity", "moved to make room for other signals"
    elif rules_changed:
        reason, detail = "rule_change", "the rule set changed"
    else:
        reason, detail = "constraint", "forced by capacity or segregation around it"
    assert reason in REASONS
    return Move(
        tag=c.signal.tag,
        cable=c.signal.cable,
        pair=c.signal.pair,
        block_id=bid or None,
        from_slot=c.slot,
        to_slot=_cell(p),
        reason=reason,
        detail=detail,
    )  # type: ignore[arg-type]
