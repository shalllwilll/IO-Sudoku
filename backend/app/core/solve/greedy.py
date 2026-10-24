from collections import Counter

from app.core.layout.blocks import BlockSet
from app.core.layout.derive import cabinets_needed, derive_layout
from app.core.model.allocation import Allocation, Placement, Unplaced
from app.core.model.issue import Issue
from app.core.model.layout import Block, Layout
from app.core.model.pack import Pack

MAX_EXTRA_CABINETS = 200


def conflicting(a: str, b: str, pack: Pack) -> bool:
    return any({a, b} == set(pair) for pair in pack.segregation.conflicts)


def block_ok(block: Block, pack: Pack) -> str | None:
    """Why a block can never be placed, or None."""
    fams = block.families
    unknown = [f for f in fams if f.startswith("UNKNOWN:")]
    if unknown and len(fams) > 1:
        return f"cable {block.id} mixes unknown segregation {unknown} with other codes"
    for i, a in enumerate(fams):
        for b in fams[i + 1 :]:
            if conflicting(a, b, pack):
                return f"cable {block.id} carries conflicting segregation families {a} and {b}"
    return None


def compatible(families: set[str], occupied: bool, block: Block, pack: Pack) -> bool:
    """May this block join a CIOC holding `families`? A/B never mix; an unknown code is exclusive."""
    bf = set(block.families)
    held_unknown = {f for f in families if f.startswith("UNKNOWN:")}
    if held_unknown:
        return bf == held_unknown
    if any(f.startswith("UNKNOWN:") for f in bf):
        return not occupied
    return not any(conflicting(a, b, pack) for a in families for b in bf)


def cioc_label(families: set[str], groups: set[str]) -> str:
    return f"{'/'.join(sorted(families)) or '-'} [{', '.join(sorted(groups))}]"


class _Grid:
    def __init__(self, layout: Layout, pack: Pack):
        self.ch = pack.capacity.channels_per_baseplate
        self.occ: dict[tuple[int, int], list[bool]] = {}
        self.usable: dict[int, list[int]] = {}
        for c in layout.ciocs:
            self.usable[c.no] = [b.n for b in c.baseplates if b.reserved is None]
            for b in c.baseplates:
                self.occ[(c.no, b.n)] = [False] * self.ch

    def _run(self, cno: int, n: int, size: int) -> int | None:
        row = self.occ[(cno, n)]
        run = 0
        for i, taken in enumerate(row):
            run = 0 if taken else run + 1
            if run == size:
                return i - size + 1
        return None

    def find(self, cno: int, size: int) -> list[tuple[int, int]] | None:
        """Positions (baseplate, channel) for a block in this CIOC, or None."""
        usable = self.usable[cno]
        if size <= self.ch:
            for n in usable:
                start = self._run(cno, n, size)
                if start is not None:
                    return [(n, start + 1 + i) for i in range(size)]
            return None
        k = -(-size // self.ch)
        for i in range(len(usable) - k + 1):
            span = usable[i : i + k]
            if span[-1] - span[0] != k - 1:
                continue
            rest = size - self.ch * (k - 1)
            if all(not any(self.occ[(cno, n)]) for n in span[:-1]) and not any(
                self.occ[(cno, span[-1])][:rest]
            ):
                return [(n, ch) for n in span[:-1] for ch in range(1, self.ch + 1)] + [
                    (span[-1], ch) for ch in range(1, rest + 1)
                ]
        return None

    def take(self, cno: int, cells: list[tuple[int, int]]) -> None:
        for n, ch in cells:
            self.occ[(cno, n)][ch - 1] = True


def _majority(values: list[str | None]) -> str | None:
    c = Counter(v for v in values if v)
    return min(c, key=lambda k: (-c[k], k)) if c else None


def pack_blocks(blocks: BlockSet, layout: Layout, pack: Pack) -> Allocation:
    """First-fit-decreasing into a fixed layout. Never mutates its inputs."""
    alloc = Allocation(layout=layout.model_copy(deep=True), solver="greedy")
    alloc.issues.extend(layout.issues)
    grid = _Grid(layout, pack)
    families: dict[int, set[str]] = {c.no: set() for c in layout.ciocs}
    groups: dict[int, set[str]] = {c.no: set() for c in layout.ciocs}

    # cabinet alarms go into each cabinet's reserved baseplate, in cabinet order
    slots = [
        (cab.ciocs[0], bp.n)
        for cab in layout.cabinets
        for bp in layout.cioc(cab.ciocs[0]).baseplates
        if bp.reserved == "alarm"
    ]
    alarms = sorted(blocks.alarm_signals, key=lambda s: (s.service or "", s.tag or ""))
    cells = [(c, n, ch) for c, n in slots for ch in range(1, grid.ch + 1)]
    for i, s in enumerate(alarms):
        if i < len(cells):
            c, n, ch = cells[i]
            alloc.placements.append(
                Placement(cioc_no=c, baseplate=n, channel=ch, kind="cabinet_alarm", signal=s)
            )
        else:
            alloc.unplaced.append(
                Unplaced(
                    signal=s,
                    issues=[
                        Issue(
                            code="TQ-ALM",
                            severity="blocking",
                            message="no reserved alarm baseplate left for this cabinet alarm",
                        )
                    ],
                )
            )

    for h in blocks.held_out:
        if h.signal:
            alloc.unplaced.append(Unplaced(signal=h.signal, issues=h.issues))

    for block in sorted(blocks.blocks, key=lambda b: (-b.size, b.id)):
        bad = block_ok(block, pack)
        if bad:
            _unplace(alloc, block, "TQ-SEG", bad)
            continue
        hosts = [c.no for c in layout.ciocs if block.group in groups[c.no]]
        order = hosts + [c.no for c in layout.ciocs if c.no not in hosts]
        for cno in order:
            if not compatible(families[cno], bool(groups[cno]), block, pack):
                continue
            cells2 = grid.find(cno, block.size)
            if cells2 is None:
                continue
            grid.take(cno, cells2)
            families[cno] |= set(block.families)
            groups[cno].add(block.group or block.id)
            io = _majority([s.io_type for s in block.signals])
            same = [s for s in block.signals if s.io_type == io]
            duty = _majority([s.duty_class for s in same])
            st = _majority([s.signal_type for s in same])
            lvl = _majority([s.signal_level for s in same])
            for pos, (n, ch) in zip(block.positions, cells2, strict=True):
                alloc.placements.append(
                    Placement(
                        cioc_no=cno,
                        baseplate=n,
                        channel=ch,
                        kind=pos.kind,
                        signal=pos.signal,
                        block_id=block.id,
                        pair=pos.pair,
                        io_type=pos.signal.io_type if pos.signal else io,
                        duty_class=pos.signal.duty_class if pos.signal else duty,
                        signal_type=pos.signal.signal_type if pos.signal else st,
                        signal_level=pos.signal.signal_level if pos.signal else lvl,
                    )
                )
            break
        else:
            _unplace(
                alloc, block, "TQ-CAP", f"cable {block.id} ({block.size} positions) does not fit"
            )
    alloc.cioc_labels = {
        c: cioc_label(families[c], groups[c]) for c in sorted(families) if groups[c]
    }
    return alloc


def _unplace(alloc: Allocation, block: Block, code: str, message: str) -> None:
    iss = Issue(code=code, severity="blocking", message=message)
    alloc.issues.append(iss)
    for s in block.signals:
        alloc.unplaced.append(Unplaced(signal=s, issues=[iss]))


def solve_greedy(
    blocks: BlockSet, pack: Pack, area: str | None = None, unit: str | None = None
) -> Allocation:
    """Open more cabinets until everything fits (or the pack's cabinet cap is reached)."""
    n = cabinets_needed(blocks, pack)
    cap = pack.capacity.max_cabinets
    for extra in range(MAX_EXTRA_CABINETS):
        layout = derive_layout(blocks, pack, area, unit, cabinets=n + extra)
        alloc = pack_blocks(blocks, layout, pack)
        capacity_failures = [
            i for i in alloc.issues if i.code == "TQ-CAP" and "does not fit" in i.message
        ]
        if not capacity_failures or (cap is not None and len(layout.cabinets) >= cap):
            return alloc
    return alloc
