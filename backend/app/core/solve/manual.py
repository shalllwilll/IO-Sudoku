"""Operator-chosen placements: list the slots a held-out cable could legally take, and apply one.

A candidate has to satisfy exactly what the packer would have required: free contiguous cells in
one CIOC, a compatible segregation mix, the cable's owning cabinet and every hard rule. Applying it
re-checks all of that, so a stale or hand-edited choice cannot put a signal somewhere illegal.
"""

from dataclasses import dataclass, replace

from pydantic import BaseModel

from app.core.layout.blocks import BlockSet
from app.core.model.allocation import Allocation
from app.core.model.layout import Block
from app.core.model.pack import Pack
from app.core.model.signal import Signal
from app.core.rules.primitives import Ctx
from app.core.rules.schema import Rule
from app.core.solve.chain import ChainResult, Event
from app.core.solve.greedy import (
    Placed,
    _Grid,
    _make_placements,
    _rule_rejections,
    block_hw,
    block_ok,
    compatible,
    valid_shape,
)
from app.core.tq.model import signal_key

Cell = tuple[int, int]


def key_of(s: Signal) -> str:
    return signal_key(s.source_file, s.source_row)


UNPLACE_CODES = ("TQ-RULE", "TQ-CAP", "TQ-SEG")


class ManualError(ValueError):
    pass


class Candidate(BaseModel):
    cioc_no: int
    cioc_name: str
    cells: list[Cell]
    summary: str
    same_group: bool = False


@dataclass
class _State:
    grid: _Grid
    families: dict[int, set[str]]
    groups: dict[int, set[str]]
    ctx: Ctx
    placed: Placed
    owners: dict[int, str | None]
    active: list[Rule]


def _state(alloc: Allocation, blocks: BlockSet, pack: Pack, rules: list[Rule]) -> _State:
    layout = alloc.layout
    grid = _Grid(layout, pack)
    by_id = {b.id: b for b in blocks.blocks}
    families: dict[int, set[str]] = {c.no: set() for c in layout.ciocs}
    groups: dict[int, set[str]] = {c.no: set() for c in layout.ciocs}
    for p in alloc.placements:
        grid.take(p.cioc_no, [(p.baseplate, p.channel)])
        b = by_id.get(p.block_id or "")
        if b is not None:
            families[p.cioc_no] |= set(b.families)
            groups[p.cioc_no].add(b.group or b.id)
    ctx = Ctx(layout, pack)
    owners = {cab.no: cab.owner for cab in layout.cabinets}
    active = [r for r in rules if r.enabled and r.enforced and r.strength == "hard"]
    return _State(grid, families, groups, ctx, Placed(alloc.placements, ctx), owners, active)


def _check(st: _State, alloc: Allocation, block: Block, pack: Pack, cno: int, cells: list[Cell]):
    """Why this exact choice is not allowed, or None; returns the new placements when it is."""
    if (bad := block_ok(block, pack)) is not None:
        return bad, None
    layout = alloc.layout
    if block.owner is not None and st.owners[layout.cioc(cno).cabinet] != block.owner:
        return "that CIOC belongs to a different owner than this cable", None
    if not valid_shape(block.size, cells, st.grid.ch):
        return "the positions are not a valid contiguous run for this cable", None
    if any(n not in st.grid.usable[cno] for n, _ in cells):
        return "a chosen baseplate is reserved", None
    if any(st.grid.occ[(cno, n)][ch - 1] for n, ch in cells):
        return "a chosen position is already taken", None
    if not compatible(st.families[cno], bool(st.groups[cno]), block, pack):
        return "its segregation family cannot share that CIOC", None
    new = _make_placements(block, cno, cells, block_hw(block))
    broken = _rule_rejections(st.active, st.ctx, st.placed, new)
    if broken:
        return f"it would break {', '.join(sorted(broken))}", None
    return None, new


def _blockers(why: str) -> list[str]:
    return [r.strip() for r in why.removeprefix("it would break ").split(",")] if why.startswith("it would break") else []


def candidates(
    alloc: Allocation, block: Block, blocks: BlockSet, pack: Pack, rules: list[Rule], limit: int = 6
) -> tuple[list[Candidate], str | None, dict[str, int]]:
    """Up to `limit` legal positions, CIOCs already holding the cable's group first.

    Also counts which hard rules rejected the free positions, so "nothing fits" can say why.
    """
    if (bad := block_ok(block, pack)) is not None:
        return [], bad, {}
    blockers: dict[str, int] = {}
    st = _state(alloc, blocks, pack, rules)
    layout = alloc.layout
    order = sorted(layout.ciocs, key=lambda c: (block.group not in st.groups[c.no], c.no))
    out: list[Candidate] = []
    for c in order:
        taken = 0
        for cells in st.grid.candidates(c.no, block.size):
            why, _ = _check(st, alloc, block, pack, c.no, cells)
            if why is not None:
                for r in _blockers(why):
                    blockers[r] = blockers.get(r, 0) + 1
                continue
            cab = layout.cabinets[[x.no for x in layout.cabinets].index(c.cabinet)]
            first, last = cells[0], cells[-1]
            out.append(
                Candidate(
                    cioc_no=c.no, cioc_name=c.name, cells=cells,
                    same_group=block.group in st.groups[c.no],
                    summary=f"{cab.name} · {c.name} · baseplate {first[0]} ch {first[1]}"
                    + (f" to baseplate {last[0]} ch {last[1]}" if len(cells) > 1 else ""),
                )
            )  # fmt: skip
            taken += 1
            if taken >= 2 or len(out) >= limit:
                break
        if len(out) >= limit:
            break
    return (
        out,
        None if out else "no free position in any CIOC satisfies the rules for this cable",
        blockers,
    )


def place(
    alloc: Allocation, block: Block, blocks: BlockSet, pack: Pack, rules: list[Rule],
    cno: int, cells: list[Cell],
) -> Allocation:
    """A copy of `alloc` with the held-out cable placed at `cells`, or ManualError."""
    st = _state(alloc, blocks, pack, rules)
    why, new = _check(st, alloc, block, pack, cno, cells)
    if why is not None or new is None:
        raise ManualError(why or "not allowed")
    out = alloc.model_copy(deep=True)
    mine = {key_of(s) for s in block.signals}
    out.unplaced = [u for u in out.unplaced if key_of(u.signal) not in mine]
    out.issues = [
        i for i in out.issues
        if not (i.code in UNPLACE_CODES and i.data.get("cable") == block.id)
    ]  # fmt: skip
    out.placements.extend(new)
    return out


def apply_manual(
    res: ChainResult, blocks: BlockSet, pack: Pack, rules: list[Rule], manual: dict[str, dict]
) -> ChainResult:
    """Honour every verified placement that is still legal; say why for any that no longer is."""
    alloc = res.allocation
    events = list(res.events)
    by_cable = {b.id: b for b in blocks.blocks}
    for cable, want in sorted(manual.items()):
        block = by_cable.get(cable)
        if block is None:
            events.append(Event("manual", "skipped", f"{cable}: no longer in the signal list"))
            continue
        if not any(key_of(u.signal) in {key_of(s) for s in block.signals} for u in alloc.unplaced):
            events.append(Event("manual", "skipped", f"{cable}: already placed by the solver"))
            continue
        try:
            cells = [(int(n), int(ch)) for n, ch in want["cells"]]
            alloc = place(alloc, block, blocks, pack, rules, int(want["cioc"]), cells)
            events.append(Event("manual", "placed", f"{cable} at CIOC {want['cioc']}"))
        except (ManualError, KeyError, ValueError) as e:
            events.append(Event("manual", "rejected", f"{cable}: {e}"))
    return replace(res, allocation=alloc, events=events, solver=res.solver)
