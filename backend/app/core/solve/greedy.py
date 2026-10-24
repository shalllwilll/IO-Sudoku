from collections import Counter, defaultdict

from app.core.layout.blocks import BlockSet
from app.core.layout.derive import cabinets_needed, derive_layout
from app.core.model.allocation import Allocation, Placement, Unplaced
from app.core.model.issue import Issue
from app.core.model.layout import Block, Layout
from app.core.model.pack import Pack
from app.core.rules.primitives import Ctx, check_rule
from app.core.rules.schema import Rule

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

    def candidates(self, cno: int, size: int):
        """Every feasible set of positions (baseplate, channel) in this CIOC, first-fit order."""
        usable = self.usable[cno]
        if size <= self.ch:
            for n in usable:
                row = self.occ[(cno, n)]
                for start in range(self.ch - size + 1):
                    if not any(row[start : start + size]):
                        yield [(n, start + 1 + i) for i in range(size)]
            return
        k = -(-size // self.ch)
        for i in range(len(usable) - k + 1):
            span = usable[i : i + k]
            if span[-1] - span[0] != k - 1:
                continue
            rest = size - self.ch * (k - 1)
            if all(not any(self.occ[(cno, n)]) for n in span[:-1]) and not any(
                self.occ[(cno, span[-1])][:rest]
            ):
                yield [(n, ch) for n in span[:-1] for ch in range(1, self.ch + 1)] + [
                    (span[-1], ch) for ch in range(1, rest + 1)
                ]

    def find(self, cno: int, size: int) -> list[tuple[int, int]] | None:
        return next(self.candidates(cno, size), None)

    def take(self, cno: int, cells: list[tuple[int, int]]) -> None:
        for n, ch in cells:
            self.occ[(cno, n)][ch - 1] = True


def _majority(values: list[str | None]) -> str | None:
    c = Counter(v for v in values if v)
    return min(c, key=lambda k: (-c[k], k)) if c else None


def block_hw(block: Block) -> tuple:
    """Majority (io_type, duty, signal_type, signal_level) a block's wired spares inherit."""
    io = _majority([s.io_type for s in block.signals])
    same = [s for s in block.signals if s.io_type == io]
    return (
        io,
        _majority([s.duty_class for s in same]),
        _majority([s.signal_type for s in same]),
        _majority([s.signal_level for s in same]),
    )


def place_fixed(alloc: Allocation, blocks: BlockSet, layout: Layout, pack: Pack) -> None:
    """Cabinet alarms (reserved baseplates, cabinet order) and held-out signals: no choices."""
    width = pack.capacity.channels_per_baseplate
    # cabinet alarms go into each cabinet's reserved baseplate, in cabinet order
    slots = [
        (cab.ciocs[0], bp.n)
        for cab in layout.cabinets
        for bp in layout.cioc(cab.ciocs[0]).baseplates
        if bp.reserved == "alarm"
    ]
    alarms = sorted(blocks.alarm_signals, key=lambda s: (s.service or "", s.tag or ""))
    cells = [(c, n, k) for c, n in slots for k in range(1, width + 1)]
    for i, s in enumerate(alarms):
        if i < len(cells):
            c, n, k = cells[i]
            alloc.placements.append(
                Placement(cioc_no=c, baseplate=n, channel=k, kind="cabinet_alarm", signal=s)
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


Cell = tuple[int, int, int]  # (cioc, baseplate, channel)


def valid_shape(size: int, cells: list[tuple[int, int]], width: int) -> bool:
    """Do these (baseplate, channel) cells, in pair order, satisfy the block rules?"""
    if size <= width:
        return len({n for n, _ in cells}) == 1 and [c for _, c in cells] == list(
            range(cells[0][1], cells[0][1] + size)
        )
    bps = sorted({n for n, _ in cells})
    if bps != list(range(bps[0], bps[0] + len(bps))):
        return False
    want = [(n, c) for n in bps[:-1] for c in range(1, width + 1)]
    want += [(bps[-1], c) for c in range(1, size - width * (len(bps) - 1) + 1)]
    return cells == want


def pack_blocks(
    blocks: BlockSet,
    layout: Layout,
    pack: Pack,
    rules: list[Rule] | None = None,
    pinned: dict[str, list[Cell]] | None = None,
    prefs: dict[str, list[Cell | None]] | None = None,
    fixed=None,
    order: dict[str, int] | None = None,
    cioc_pref: dict[str, int] | None = None,
) -> Allocation:
    """First-fit-decreasing into a fixed layout. Never mutates its inputs.

    `order` (block -> priority, higher first) and `cioc_pref` (block -> the CIOC tried first) let
    the QIGA stage steer the same packer; without them the behaviour is unchanged.

    Revisions pass `pinned` (block -> cells it keeps), `prefs` (cells a block tries first) and
    `fixed` (a function that seeds the cabinet alarms and held-out signals instead of the
    default placement).
    """
    alloc = Allocation(layout=layout.model_copy(deep=True), solver="greedy")
    alloc.issues.extend(layout.issues)
    grid = _Grid(layout, pack)
    active = [r for r in rules or [] if r.enabled and r.enforced and r.strength == "hard"]
    ctx = Ctx(layout, pack)
    families: dict[int, set[str]] = {c.no: set() for c in layout.ciocs}
    groups: dict[int, set[str]] = {c.no: set() for c in layout.ciocs}

    (fixed or (lambda a: place_fixed(a, blocks, layout, pack)))(alloc)
    pinned = pinned or {}
    for block in sorted(blocks.blocks, key=lambda b: b.id):
        if block.id in pinned:
            cno = pinned[block.id][0][0]
            cells = [(n, ch) for _, n, ch in pinned[block.id]]
            grid.take(cno, cells)
            families[cno] |= set(block.families)
            groups[cno].add(block.group or block.id)
            alloc.placements.extend(_make_placements(block, cno, cells, block_hw(block)))

    placed = Placed(alloc.placements, ctx)
    rank = order or {}
    for block in sorted(blocks.blocks, key=lambda b: (-rank.get(b.id, 0), -b.size, b.id)):
        if block.id in pinned:
            continue
        bad = block_ok(block, pack)
        if bad:
            _unplace(alloc, block, "TQ-SEG", bad)
            continue
        hosts = [c.no for c in layout.ciocs if block.group in groups[c.no]]
        tries = hosts + [c.no for c in layout.ciocs if c.no not in hosts]
        first = (cioc_pref or {}).get(block.id)
        if first in tries:
            tries = [first, *[c for c in tries if c != first]]
        hw = block_hw(block)

        rejected_by: set[str] = set()
        seen: dict[str, int] = {}  # per-rule violations of what is placed so far
        chosen: tuple[int, list[Placement], list[tuple[int, int]]] | None = None
        want = (prefs or {}).get(block.id)
        if want and all(w is not None for w in want) and len({w[0] for w in want}) == 1:
            cno, cells2 = want[0][0], [(n, ch) for _, n, ch in want]
            if (
                valid_shape(block.size, cells2, grid.ch)
                and not any(grid.occ[(cno, n)][ch - 1] for n, ch in cells2)
                and all(n in grid.usable[cno] for n, _ in cells2)
                and compatible(families[cno], bool(groups[cno]), block, pack)
            ):
                new_ps = _make_placements(block, cno, cells2, hw)
                if not _rule_rejections(active, ctx, placed, new_ps, seen):
                    chosen = (cno, new_ps, cells2)
        for cno in [] if chosen else tries:
            if not compatible(families[cno], bool(groups[cno]), block, pack):
                continue
            for cells2 in grid.candidates(cno, block.size):
                new_ps = _make_placements(block, cno, cells2, hw)
                bad = _rule_rejections(active, ctx, placed, new_ps, seen)
                if bad:
                    rejected_by |= bad
                    continue
                chosen = (cno, new_ps, cells2)
                break
            if chosen:
                break
        if chosen:
            cno, new_ps, cells2 = chosen
            grid.take(cno, cells2)
            families[cno] |= set(block.families)
            groups[cno].add(block.group or block.id)
            alloc.placements.extend(new_ps)
            placed.add(new_ps)
            continue
        if rejected_by:
            _unplace(
                alloc,
                block,
                "TQ-RULE",
                f"cable {block.id} cannot be placed without breaking rule(s) "
                f"{', '.join(sorted(rejected_by))}",
            )
            continue
        _unplace(alloc, block, "TQ-CAP", f"cable {block.id} ({block.size} positions) does not fit")
    alloc.cioc_labels = {
        c: cioc_label(families[c], groups[c]) for c in sorted(families) if groups[c]
    }
    return alloc


def _make_placements(
    block: Block, cno: int, cells: list[tuple[int, int]], hw: tuple
) -> list[Placement]:
    io, duty, st, lvl = hw
    return [
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
            group=block.group,
        )
        for pos, (n, ch) in zip(block.positions, cells, strict=True)
    ]


class Placed:
    """The placements made so far, indexed so a rule check reads only what a candidate can affect.

    A violation a candidate adds can only appear in the units it touches (capacity, quota,
    separation: its CIOC or cabinet; order: its CIOC; co-location: the values it carries; assign
    and reserve: nowhere else). Rules that look at the whole plant (pin, limit_span) still see it.
    """

    def __init__(self, placements: list[Placement], ctx: Ctx):
        self.all = placements
        self.ctx = ctx
        self.by_cioc: dict[int, list[Placement]] = defaultdict(list)
        self.by_value: dict[str, dict[object, list[Placement]]] = {}
        self.by_cabinet: dict[int, set[int]] = defaultdict(set)
        for c, cab in ctx.cab_of.items():
            self.by_cabinet[cab].add(c)
        for p in placements:
            self.by_cioc[p.cioc_no].append(p)

    def add(self, new: list[Placement]) -> None:
        """Record placements the caller has just appended to `all`."""
        for p in new:
            self.by_cioc[p.cioc_no].append(p)
            for by, index in self.by_value.items():
                v = _value(p, by)
                if v is not None:
                    index.setdefault(v, []).append(p)

    def _ciocs(self, level: str, new: list[Placement]) -> list[Placement]:
        touched = {p.cioc_no for p in new}
        if level == "cabinet":
            touched = {c for cno in touched for c in self.by_cabinet[self.ctx.cab_of[cno]]}
        return [p for c in sorted(touched) for p in self.by_cioc.get(c, [])]

    def _values(self, by: str, new: list[Placement]) -> list[Placement]:
        if by not in self.by_value:
            index: dict[object, list[Placement]] = {}
            for p in self.all:
                v = _value(p, by)
                if v is not None:
                    index.setdefault(v, []).append(p)
            self.by_value[by] = index
        wanted = {v for p in new if (v := _value(p, by)) is not None}
        return [p for v in sorted(wanted, key=str) for p in self.by_value[by].get(v, [])]

    def around(self, rule: Rule, new: list[Placement]) -> list[Placement] | None:
        """The placements that decide whether `new` adds a violation; None means all of them."""
        prm = rule.parameters
        match rule.primitive:
            case "capacity" | "quota":
                return self._ciocs(str(prm["per"]), new)
            case "separate":
                return self._ciocs(str(prm.get("level", "cioc")), new)
            case "order":
                return self._ciocs("cioc", new)
            case "co_locate":
                return self._values(str(prm["by"]), new)
            case "assign" | "reserve":
                return []
        return None


def _value(p: Placement, field: str) -> object:
    v = p.group if field == "group" else getattr(p.signal, field, None)
    return None if v is None or v == "" else v


def rule_rejections_full(
    rules: list[Rule], ctx: Ctx, placed: list[Placement], new: list[Placement]
) -> set[str]:
    """Reference implementation: every rule over every placement, before and after."""
    out = set()
    for r in rules:
        if len(check_rule(r, [*placed, *new], ctx)) > len(check_rule(r, placed, ctx)):
            out.add(r.id)
    return out


def _rule_rejections(
    rules: list[Rule],
    ctx: Ctx,
    placed: "Placed | list[Placement]",
    new: list[Placement],
    seen: dict[str, int] | None = None,
) -> set[str]:
    """Ids of the hard rules a hypothetical placement would break (new violations only).

    Same answer as `rule_rejections_full`. `seen` holds the whole-plant violation count of
    `placed` for the rules that need it; the caller keeps it only while `placed` does not change.
    """
    if not isinstance(placed, Placed):
        placed = Placed(placed, ctx)
    seen = {} if seen is None else seen
    out = set()
    for r in rules:
        near = placed.around(r, new)
        if near is None:
            if r.id not in seen:
                seen[r.id] = len(check_rule(r, placed.all, ctx))
            before, after = seen[r.id], len(check_rule(r, [*placed.all, *new], ctx))
        else:
            before, after = len(check_rule(r, near, ctx)), len(check_rule(r, [*near, *new], ctx))
        if after > before:
            out.add(r.id)
    return out


def _unplace(alloc: Allocation, block: Block, code: str, message: str) -> None:
    iss = Issue(code=code, severity="blocking", message=message, data={"cable": block.id})
    alloc.issues.append(iss)
    for s in block.signals:
        alloc.unplaced.append(Unplaced(signal=s, issues=[iss]))


RULE_RETRY_CABINETS = 3


def solve_greedy(
    blocks: BlockSet,
    pack: Pack,
    area: str | None = None,
    unit: str | None = None,
    rules: list[Rule] | None = None,
) -> Allocation:
    """Open more cabinets until everything fits (or the pack's cabinet cap is reached)."""
    n = cabinets_needed(blocks, pack)
    cap = pack.capacity.max_cabinets
    for extra in range(MAX_EXTRA_CABINETS):
        layout = derive_layout(blocks, pack, area, unit, cabinets=n + extra)
        alloc = pack_blocks(blocks, layout, pack, rules)
        no_room = [i for i in alloc.issues if i.code == "TQ-CAP" and "does not fit" in i.message]
        by_rule = [i for i in alloc.issues if i.code == "TQ-RULE"]
        if not no_room and not (by_rule and extra < RULE_RETRY_CABINETS):
            return alloc
        if cap is not None and len(layout.cabinets) >= cap:
            return alloc
        if not no_room and extra >= RULE_RETRY_CABINETS:
            return alloc
    return alloc
