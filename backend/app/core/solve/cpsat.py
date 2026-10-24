"""CP-SAT allocation model.

The packing unit is the cable block. A block takes one *option*: a baseplate (blocks of up to a
baseplate) or a run of consecutive baseplates starting at channel 1 (larger blocks). Positions
inside a baseplate are then laid out in a fixed order (a large block's tail first, then the small
blocks by id), so contiguity holds by construction and the model only decides baseplates.

Rules the model enforces natively: separate, co_locate, capacity, reserve, quota, assign and
limit_span (exact per position). `pin` and `order` are not modelled; they are checked by the
validator gate, which rejects a result that breaks them (the chain then falls back to greedy).
"""

import math
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from app.core.layout.blocks import BlockSet
from app.core.layout.derive import derive_layout
from app.core.model.allocation import Allocation, Unplaced
from app.core.model.issue import Issue
from app.core.model.layout import Block, Layout
from app.core.model.pack import Pack
from app.core.rules.primitives import Ctx
from app.core.rules.schema import Rule
from app.core.rules.scope import matches, parse_scope
from app.core.solve.greedy import (
    _make_placements,
    block_hw,
    block_ok,
    cioc_label,
    place_fixed,
    solve_greedy,
)
from app.core.solve.validator import Violation, validate_allocation

NATIVE = {"separate", "co_locate", "capacity", "reserve", "quota", "assign", "limit_span"}
SOLVER_PARAMS = ("num_workers", "random_seed", "max_deterministic_time", "max_time_in_seconds")


class CpsatError(RuntimeError):
    pass


@dataclass
class CpsatResult:
    status: str  # OPTIMAL | FEASIBLE | INFEASIBLE | UNKNOWN | REJECTED | ERROR
    allocation: Allocation | None = None
    objective: int | None = None
    proven_optimal: bool = False
    primary_optimal: bool = False  # unallocated, cabinets and CIOCs proven minimal
    primary_objective: int | None = None
    wall_seconds: float = 0.0
    deterministic_time: float = 0.0
    violations: list[Violation] = field(default_factory=list)
    gate_only_rules: list[str] = field(default_factory=list)  # hard rules not modelled natively
    message: str = ""

    @property
    def ok(self) -> bool:
        return self.allocation is not None and not self.violations

    def log(self) -> str:
        return (
            f"cpsat status={self.status} objective={self.objective} "
            f"optimal={self.proven_optimal} primary_optimal={self.primary_optimal} wall={self.wall_seconds:.2f}s "
            f"det={self.deterministic_time:.2f} {self.message}".strip()
        )


def make_solver(pack: Pack, **overrides) -> cp_model.CpSolver:
    """One worker, fixed seed, deterministic-time stop plus a wall-clock backstop."""
    cap = pack.capacity
    values = {
        "num_workers": 1,
        "random_seed": overrides.get("seed", cap.cpsat_seed),
        "max_deterministic_time": overrides.get("deterministic_time", cap.cpsat_deterministic_time),
        "max_time_in_seconds": overrides.get("wall_seconds", cap.cpsat_wall_seconds),
    }
    solver = cp_model.CpSolver()
    for name in SOLVER_PARAMS:
        if not hasattr(solver.parameters, name):
            raise CpsatError(f"installed ortools has no solver parameter '{name}'")
        setattr(solver.parameters, name, values[name])
    return solver


@dataclass
class _Option:
    block: Block
    var: object
    units: list[tuple[int, int]]  # (cioc, baseplate) of each position, in pair order
    load: dict[tuple[int, int], int]
    large: bool
    index: int  # tie-break order
    cells: list[tuple[int, int, int]] | None = None  # (cioc, baseplate, channel); revisions only
    moves: int = 0  # signals sitting away from their baseline cell (revisions only)

    @property
    def start(self) -> tuple[int, int]:
        return self.units[0]


@dataclass
class RevisionSpec:
    """Channel-level mode for revisions: some blocks are fixed, the rest pay to move."""

    pinned: dict[str, list[tuple[int, int, int]]] = field(default_factory=dict)
    prefs: dict[str, list[tuple[int, int, int] | None]] = field(default_factory=dict)


def _active(rules: list[Rule] | None) -> list[Rule]:
    return [r for r in rules or [] if r.enabled and r.enforced and r.strength == "hard"]


class _Build:
    def __init__(
        self,
        blocks: BlockSet,
        layout: Layout,
        pack: Pack,
        rules: list[Rule] | None,
        spec: RevisionSpec | None = None,
    ):
        self.blocks, self.layout, self.pack, self.spec = blocks, layout, pack, spec
        self.ch = pack.capacity.channels_per_baseplate
        self.rules = _active(rules)
        self.ctx = Ctx(layout, pack)
        self.model = cp_model.CpModel()
        self.usable = {
            c.no: [b.n for b in c.baseplates if b.reserved is None] for c in layout.ciocs
        }
        order = [(c, n) for c in sorted(self.usable) for n in self.usable[c]]
        self.bp_index = {u: i for i, u in enumerate(order)}
        self.options: dict[str, list[_Option]] = {}
        self.unplaced_var: dict[str, object] = {}
        self.hinted = False
        self.rejected: dict[str, str] = {}
        self.rule_blocked: dict[str, set[str]] = defaultdict(set)
        self.nodes = {r.id: parse_scope(r.scope) for r in self.rules}

    # -- options ---------------------------------------------------------------------------
    def _spans(self, size: int):
        ch = self.ch
        for c, usable in self.usable.items():
            if size <= ch:
                for n in usable:
                    yield c, [(n, size)]
                continue
            k = -(-size // ch)
            for i in range(len(usable) - k + 1):
                span = usable[i : i + k]
                if span[-1] - span[0] == k - 1:
                    rest = size - ch * (k - 1)
                    yield c, [(n, ch) for n in span[:-1]] + [(span[-1], rest)]

    def _violates_placement_rules(self, block: Block, units: list[tuple[int, int]]) -> set[str]:
        """Rules (assign, reserve) that forbid this option outright."""
        bad: set[str] = set()
        for r in self.rules:
            prm = r.parameters
            if r.primitive == "reserve":
                seq = prm.get("cioc_seq")
                if any(
                    n == int(prm["baseplate"]) and (seq is None or self.ctx.seq_of[c] == int(seq))
                    for c, n in units
                ):
                    bad.add(r.id)
            elif r.primitive == "assign":
                for pos, (c, n) in zip(block.positions, units, strict=True):
                    s = pos.signal
                    if s is None or not matches(self.nodes[r.id], s, block.group):
                        continue
                    if (
                        ("cabinet" in prm and self.ctx.cab_of[c] != int(prm["cabinet"]))
                        or ("cioc" in prm and c != int(prm["cioc"]))
                        or ("cioc_seq" in prm and self.ctx.seq_of[c] != int(prm["cioc_seq"]))
                        or ("baseplates" in prm and n not in [int(x) for x in prm["baseplates"]])
                    ):
                        bad.add(r.id)
        return bad

    def _cell_candidates(self, block: Block):
        """Every cell set a block may take, channel by channel (first-fit order)."""
        ch, size = self.ch, block.size
        for c, usable in self.usable.items():
            if size <= ch:
                for n in usable:
                    for start in range(1, ch - size + 2):
                        yield [(c, n, start + i) for i in range(size)]
                continue
            for cc, span in self._spans(size):
                if cc == c:
                    yield [(c, n, k) for n, cnt in span for k in range(1, cnt + 1)]

    def _add_cell_options(self, block: Block, strict: bool) -> None:
        m, spec = self.model, self.spec
        pinned = spec.pinned.get(block.id)
        prefs = spec.prefs.get(block.id, [])
        cands = [pinned] if pinned else self._cell_candidates(block)
        opts: list[_Option] = []
        for cells in cands:
            units = [(c, n) for c, n, _ in cells]
            bad = self._violates_placement_rules(block, units)
            if bad:
                self.rule_blocked[block.id] |= bad
                continue
            load: dict[tuple[int, int], int] = defaultdict(int)
            for u in units:
                load[u] += 1
            moves = sum(
                1
                for pos, cell, want in zip(block.positions, cells, prefs or cells, strict=True)
                if pos.signal is not None and want is not None and cell != want
            )
            v = m.NewBoolVar(f"x_{block.id}_{cells[0]}")
            index = self.bp_index.get(units[0], 0) * self.ch + cells[0][2]
            opts.append(
                _Option(
                    block, v, units, dict(load), block.size > self.ch, index, list(cells), moves
                )
            )
        self.options[block.id] = opts
        if pinned and opts:
            m.Add(opts[0].var == 1)  # a fixed block is not a decision
            return
        if strict:
            m.AddExactlyOne([o.var for o in opts])
        else:
            u = m.NewBoolVar(f"u_{block.id}")
            self.unplaced_var[block.id] = u
            m.AddExactlyOne([*(o.var for o in opts), u])

    def add_options(self, strict: bool) -> None:
        m = self.model
        for block in self.blocks.blocks:
            why = block_ok(block, self.pack)
            if why:
                self.rejected[block.id] = why
                continue
            if self.spec is not None:
                self._add_cell_options(block, strict)
                continue
            opts: list[_Option] = []
            for c, span in self._spans(block.size):
                units: list[tuple[int, int]] = []
                for n, cnt in span:
                    units += [(c, n)] * cnt
                bad = self._violates_placement_rules(block, units)
                if bad:
                    self.rule_blocked[block.id] |= bad
                    continue
                load = {(c, n): cnt for n, cnt in span}
                v = m.NewBoolVar(f"x_{block.id}_{c}_{span[0][0]}")
                opts.append(
                    _Option(
                        block, v, units, load, block.size > self.ch,
                        self.bp_index[(c, span[0][0])],
                    )
                )  # fmt: skip
            self.options[block.id] = opts
            if strict:
                m.AddExactlyOne([o.var for o in opts])  # no options: infeasible by construction
            else:
                u = m.NewBoolVar(f"u_{block.id}")
                self.unplaced_var[block.id] = u
                m.AddExactlyOne([*(o.var for o in opts), u])

    # -- structure -------------------------------------------------------------------------
    def add_capacity(self) -> None:
        m = self.model
        if self.spec is not None:  # one block per cell
            at: dict[tuple[int, int, int], list] = defaultdict(list)
            for opts in self.options.values():
                for o in opts:
                    for cell in o.cells or ():
                        at[cell].append(o.var)
            for vs in at.values():
                if len(vs) > 1:
                    m.AddAtMostOne(vs)
            return
        by_bp: dict[tuple[int, int], list[tuple[object, int]]] = defaultdict(list)
        tails: dict[tuple[int, int], list[object]] = defaultdict(list)
        for opts in self.options.values():
            for o in opts:
                for u, cnt in o.load.items():
                    by_bp[u].append((o.var, cnt))
                    if o.large:
                        tails[u].append(o.var)
        for u, items in by_bp.items():
            m.Add(sum(v * cnt for v, cnt in items) <= self.ch)
        for (
            u,
            vs,
        ) in tails.items():  # two large blocks cannot both start at channel 1 of a baseplate
            if len(vs) > 1:
                m.AddAtMostOne(vs)

    def expr_in(self, block_id: str, pred) -> list:
        """Option variables of a block whose first baseplate satisfies pred(cioc)."""
        return [o.var for o in self.options.get(block_id, []) if pred(o.start[0])]

    def add_segregation(self) -> None:
        m, pack = self.model, self.pack
        fams = sorted({f for b in self.blocks.blocks for f in b.families})
        z = {(c.no, f): m.NewBoolVar(f"z_{c.no}_{f}") for c in self.layout.ciocs for f in fams}
        for b in self.blocks.blocks:
            if b.id in self.rejected:
                continue
            for c in self.layout.ciocs:
                vs = self.expr_in(b.id, lambda cc, c=c: cc == c.no)
                if vs:
                    for f in b.families:
                        m.Add(z[c.no, f] >= sum(vs))
        for c in self.layout.ciocs:
            for pair in pack.segregation.conflicts:
                a, b = pair[0], pair[1]
                if (c.no, a) in z and (c.no, b) in z:
                    m.Add(z[c.no, a] + z[c.no, b] <= 1)
            for u in [f for f in fams if f.startswith("UNKNOWN:")]:
                others = [
                    v
                    for b in self.blocks.blocks
                    if b.id not in self.rejected and b.families != [u]
                    for v in self.expr_in(b.id, lambda cc, c=c: cc == c.no)
                ]
                if others:
                    m.Add(sum(others) == 0).OnlyEnforceIf(z[c.no, u])

    # -- rule primitives -------------------------------------------------------------------
    def _members(self, o: _Option, rule: Rule, pred) -> list[tuple[tuple[int, int], object]]:
        node = self.nodes[rule.id]
        out = []
        for pos, u in zip(o.block.positions, o.units, strict=True):
            if pos.signal is not None and not matches(node, pos.signal, o.block.group):
                continue
            if pred(pos):
                out.append((u, pos))
        return out

    def _unit(self, level: str, u: tuple[int, int]):
        return u if level == "baseplate" else (u[0] if level == "cioc" else self.ctx.cab_of[u[0]])

    def _flags(self, name: str, hits: dict) -> dict:
        """flag[unit] >= var for every option that touches the unit."""
        m, flag = self.model, {}
        for unit, vs in hits.items():
            flag[unit] = m.NewBoolVar(f"{name}_{unit}")
            for v in vs:
                m.AddImplication(v, flag[unit])
        return flag

    def _add_count_rule(self, r: Rule, opts: list[_Option]) -> None:
        """capacity and quota: bound a count per unit (exact: positions are known per option)."""
        m, prm = self.model, r.parameters
        per = str(prm["per"])
        scoped = bool(r.scope.strip())
        if r.primitive == "capacity":
            measure, limit = str(prm.get("measure", "signals")), int(prm["max"])
            kinds = ("field", "wired_spare")
        else:
            measure, kinds = "signals", ("field",)
            limit = math.floor(self.ctx.unit_size(per) * float(prm["max_percent"]) / 100 + 1e-9)

        def counted(pos) -> bool:
            if pos.kind not in kinds:
                return False
            return pos.signal is not None or (r.primitive == "capacity" and not scoped)

        if measure == "baseplates":
            var = {o.var.Index(): o.var for o in opts}
            hit: dict = defaultdict(set)
            for o in opts:
                for u, _ in self._members(o, r, counted):
                    hit[u].add(o.var.Index())
            flags = self._flags(r.id, {k: [var[i] for i in v] for k, v in hit.items()})
            grouped: dict = defaultdict(list)
            for u, f in flags.items():
                grouped[self._unit(per, u)].append(f)
            for fl in grouped.values():
                if len(fl) > limit:
                    m.Add(sum(fl) <= limit)
            return
        terms: dict = defaultdict(list)
        for o in opts:
            cnt = Counter(self._unit(per, u) for u, _ in self._members(o, r, counted))
            for u, k in cnt.items():
                terms[u].append(o.var * k)
        for ts in terms.values():
            m.Add(sum(ts) <= limit)

    def add_rules(self) -> list[str]:
        m = self.model
        gate_only = []
        for r in self.rules:
            prm = r.parameters
            if r.primitive not in NATIVE:
                gate_only.append(r.id)
                continue
            opts = [o for os_ in self.options.values() for o in os_]
            if r.primitive in ("reserve", "assign"):
                continue  # applied when options were built
            if r.primitive == "separate":
                lvl = str(prm.get("level", "cioc"))
                node_a, node_b = parse_scope(str(prm["a"])), parse_scope(str(prm["b"]))
                hit_a, hit_b = defaultdict(set), defaultdict(set)
                for o in opts:
                    for u, pos in self._members(o, r, lambda p: p.signal is not None):
                        if matches(node_a, pos.signal, o.block.group):
                            hit_a[self._unit(lvl, u)].add(o.var.Index())
                        if matches(node_b, pos.signal, o.block.group):
                            hit_b[self._unit(lvl, u)].add(o.var.Index())
                var = {o.var.Index(): o.var for o in opts}
                fa = self._flags(f"{r.id}_a", {k: [var[i] for i in v] for k, v in hit_a.items()})
                fb = self._flags(f"{r.id}_b", {k: [var[i] for i in v] for k, v in hit_b.items()})
                for u in fa.keys() & fb.keys():
                    m.Add(fa[u] + fb[u] <= 1)
            elif r.primitive == "co_locate":
                lvl = str(prm.get("level", "cioc"))
                by = str(prm["by"])
                hit: dict = defaultdict(lambda: defaultdict(set))
                var = {o.var.Index(): o.var for o in opts}
                for o in opts:
                    for u, pos in self._members(o, r, lambda p: p.signal is not None):
                        val = o.block.group if by == "group" else getattr(pos.signal, by, None)
                        if val is None or val == "":
                            continue
                        hit[val][self._unit(lvl, u)].add(o.var.Index())
                for val, per_unit in hit.items():
                    flags = self._flags(
                        f"{r.id}_{val}", {k: [var[i] for i in v] for k, v in per_unit.items()}
                    )
                    if len(flags) > 1:
                        m.Add(sum(flags.values()) <= 1)
            elif r.primitive == "limit_span":
                var = {o.var.Index(): o.var for o in opts}
                hit_s: dict = defaultdict(set)
                for o in opts:
                    for u, _ in self._members(o, r, lambda p: p.signal is not None):
                        hit_s[self._unit(str(prm["unit"]), u)].add(o.var.Index())
                flags = self._flags(r.id, {k: [var[i] for i in v] for k, v in hit_s.items()})
                if len(flags) > int(prm["max"]):
                    m.Add(sum(flags.values()) <= int(prm["max"]))
            elif r.primitive in ("capacity", "quota"):
                self._add_count_rule(r, opts)
        return gate_only

    # -- objective -------------------------------------------------------------------------
    def add_objective(self) -> None:
        m, lay = self.model, self.layout
        cioc_used = {c.no: m.NewBoolVar(f"cu_{c.no}") for c in lay.ciocs}
        cab_used = {k.no: m.NewBoolVar(f"ku_{k.no}") for k in lay.cabinets}
        alarm_cabs = {
            cab.no
            for cab in lay.cabinets
            if any(bp.reserved == "alarm" for bp in lay.cioc(cab.ciocs[0]).baseplates)
            and self.blocks.alarm_signals
        }
        n_alarm = -(-len(self.blocks.alarm_signals) // self.ch) if self.blocks.alarm_signals else 0
        for cab in lay.cabinets[:n_alarm]:
            m.Add(cab_used[cab.no] == 1)
            m.Add(cioc_used[cab.ciocs[0]] == 1)
        del alarm_cabs
        for b in self.blocks.blocks:
            for c in lay.ciocs:
                vs = self.expr_in(b.id, lambda cc, c=c: cc == c.no)
                if vs:
                    m.Add(cioc_used[c.no] >= sum(vs))
        for c in lay.ciocs:  # aggregate load: the strong bound on how many CIOCs are needed
            load = [
                o.var * o.load[u]
                for opts in self.options.values()
                for o in opts
                for u in o.load
                if u[0] == c.no
            ]
            if load:
                m.Add(sum(load) <= len(self.usable[c.no]) * self.ch * cioc_used[c.no])
        for cab in lay.cabinets:
            for cno in cab.ciocs:
                m.AddImplication(cioc_used[cno], cab_used[cab.no])
        if self.spec is None:
            for a, b in zip(lay.cabinets, lay.cabinets[1:], strict=False):
                m.AddImplication(cab_used[b.no], cab_used[a.no])  # symmetry: fill cabinets in order

        bp_used = {}
        for opts in self.options.values():
            for o in opts:
                for u in o.load:
                    if u not in bp_used:
                        bp_used[u] = m.NewBoolVar(f"bu_{u}")
                    m.AddImplication(o.var, bp_used[u])
        spread = {}
        for b in self.blocks.blocks:
            g = b.group or b.id
            for c in lay.ciocs:
                vs = self.expr_in(b.id, lambda cc, c=c: cc == c.no)
                if vs:
                    if (g, c.no) not in spread:
                        spread[g, c.no] = m.NewBoolVar(f"gs_{g}_{c.no}")
                    m.Add(spread[g, c.no] >= sum(vs))
        tie = sum(o.var * o.index for opts in self.options.values() for o in opts)
        t_max = sum(max((o.index for o in opts), default=0) for opts in self.options.values()) + 1
        frag = sum(bp_used.values()) + sum(spread.values())
        unalloc = sum(
            self.unplaced_var[b.id] * max(1, len(b.signals))
            for b in self.blocks.blocks
            if b.id in self.unplaced_var
        )
        w_cioc = 1
        w_cab = w_cioc * (len(cioc_used) + 1)
        w_un = w_cab * (len(cab_used) + 1)
        # stage 1: unallocated, cabinets, CIOCs; stage 2 (bounded by stage 1): fragmentation, tie
        moved = sum(o.var * o.moves for opts in self.options.values() for o in opts if o.moves)
        if self.spec is not None:  # revisions: unallocated, moved signals, cabinets, ...
            w_mv = w_cab * (len(cab_used) + 1)
            w_un = w_mv * (sum(o.moves for os_ in self.options.values() for o in os_) + 1)
        else:
            w_mv = 0
        self.stage1 = (
            w_un * unalloc
            + w_mv * moved
            + w_cab * sum(cab_used.values())
            + w_cioc * sum(cioc_used.values())
        )
        self.moved = moved
        self.frag, self.tie = frag, tie
        self.stage2 = t_max * frag + tie


def _order_in_baseplate(chosen: list[_Option]) -> dict[str, list[tuple[int, int]]]:
    """Cells of every chosen block: large tails at channel 1, then small blocks by id."""
    cells: dict[str, list[tuple[int, int]]] = {}
    tail_end: dict[tuple[int, int], int] = defaultdict(int)
    for o in chosen:
        if o.large:
            seen: dict[tuple[int, int], int] = defaultdict(int)
            out = []
            for u in o.units:
                seen[u] += 1
                out.append((u[1], seen[u]))
            cells[o.block.id] = out
            for u, cnt in o.load.items():
                tail_end[u] = max(tail_end[u], cnt)
    fill = dict(tail_end)
    for o in sorted((o for o in chosen if not o.large), key=lambda o: o.block.id):
        u = o.start
        at = fill.get(u, 0)
        cells[o.block.id] = [(u[1], at + 1 + i) for i in range(o.block.size)]
        fill[u] = at + o.block.size
    return cells


def _to_allocation(
    build: _Build, solver: cp_model.CpSolver, layout: Layout, area, unit, blocks: BlockSet
) -> Allocation:
    pack = build.pack
    alloc = Allocation(layout=layout.model_copy(deep=True), solver="cpsat")
    alloc.issues.extend(layout.issues)
    place_fixed(alloc, blocks, layout, pack)
    chosen: list[_Option] = []
    for b in sorted(blocks.blocks, key=lambda b: (-b.size, b.id)):
        if b.id in build.rejected:
            _unplace(alloc, b, "TQ-SEG", build.rejected[b.id])
            continue
        pick = next((o for o in build.options[b.id] if solver.Value(o.var)), None)
        if pick is None:
            _unplace_reason(alloc, b, build)
        else:
            chosen.append(pick)
    cells = _order_in_baseplate([o for o in chosen if o.cells is None])
    cells.update({o.block.id: [(n, k) for _, n, k in o.cells] for o in chosen if o.cells})
    families: dict[int, set[str]] = {c.no: set() for c in layout.ciocs}
    groups: dict[int, set[str]] = {c.no: set() for c in layout.ciocs}
    for o in sorted(chosen, key=lambda o: (-o.block.size, o.block.id)):
        b, cno = o.block, o.start[0]
        alloc.placements.extend(_make_placements(b, cno, cells[b.id], block_hw(b)))
        families[cno] |= set(b.families)
        groups[cno].add(b.group or b.id)
    alloc.cioc_labels = {
        c: cioc_label(families[c], groups[c]) for c in sorted(families) if groups[c]
    }
    return alloc


def _unplace(alloc: Allocation, block: Block, code: str, message: str) -> None:
    iss = Issue(code=code, severity="blocking", message=message)
    alloc.issues.append(iss)
    for s in block.signals:
        alloc.unplaced.append(Unplaced(signal=s, issues=[iss]))


def _unplace_reason(alloc: Allocation, block: Block, build: _Build) -> None:
    touched = set(build.rule_blocked.get(block.id, set()))
    for r in build.rules:
        if any(
            p.signal is not None and matches(build.nodes[r.id], p.signal, block.group)
            for p in block.positions
        ):
            touched.add(r.id)
    if build.rule_blocked.get(block.id) or (touched and build.options.get(block.id)):
        ids = ", ".join(sorted(touched))
        _unplace(
            alloc,
            block,
            "TQ-RULE",
            f"cable {block.id} cannot be placed within capacity and rule(s) {ids}",
        )
    else:
        _unplace(alloc, block, "TQ-CAP", f"cable {block.id} ({block.size} positions) does not fit")


def solver_inputs(blocks: BlockSet) -> tuple[list, list]:
    """(signals, alarm_signals) the validator expects for these blocks."""
    sigs = [s for b in blocks.blocks for s in b.signals]
    sigs += [h.signal for h in blocks.held_out if h.signal]
    return sigs, list(blocks.alarm_signals)


def gate(
    alloc: Allocation, blocks: BlockSet, pack: Pack, rules: list[Rule] | None = None
) -> list[Violation]:
    sigs, alarms = solver_inputs(blocks)
    return validate_allocation(alloc, pack, sigs, alarms, rules)


def _hint(build: _Build, base: Allocation | None) -> None:
    """Warm start from a placed allocation (one value per option variable)."""
    if base is None:
        return
    build.hinted = True
    where: dict[str, tuple[int, int]] = {}
    exact: dict[str, list[tuple[int, int, int]]] = defaultdict(list)
    for p in sorted(base.placements, key=lambda p: (p.cioc_no, p.baseplate, p.channel)):
        if p.block_id and p.block_id not in where:
            where[p.block_id] = (p.cioc_no, p.baseplate)
    for p in sorted(base.placements, key=lambda p: p.pair or 0):
        if p.block_id:
            exact[p.block_id].append((p.cioc_no, p.baseplate, p.channel))
    for bid, opts in build.options.items():
        want = where.get(bid)
        for o in opts:
            hit = o.cells == exact.get(bid) if o.cells is not None else o.start == want
            build.model.AddHint(o.var, 1 if hit else 0)
        if bid in build.unplaced_var:
            build.model.AddHint(build.unplaced_var[bid], 0 if want else 1)


def _complete_hint(build: _Build, pack: Pack) -> None:
    """Turn the greedy option hint into a hint for every variable.

    A partial hint is often not followed (the solver can fail to rebuild a feasible start in its
    budget). Solving once with the option variables fixed is nearly free and yields values for the
    auxiliary variables; the full solution then seeds the real solve.
    """
    m = build.model
    m.Minimize(build.stage1)
    s0 = make_solver(pack, deterministic_time=5.0, wall_seconds=10.0)
    s0.parameters.fix_variables_to_their_hinted_value = True
    if s0.Solve(m) not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return  # the warm start does not satisfy the model (e.g. a rule it cannot see): go cold
    m.ClearHints()
    hint = m.Proto().solution_hint
    values = list(s0.response_proto.solution)
    hint.vars.extend(range(len(values)))
    hint.values.extend(values)


def _staged_solve(build: _Build, pack: Pack, overrides: dict):
    """Stage 1 minimises unallocated/cabinets/CIOCs; stage 2 (held to stage 1's value) the rest.

    Splitting the lexicographic objective keeps the important levels provable; fragmentation and
    the stable tie-break then use whatever deterministic-time budget is left.
    Returns (status, solver, deterministic time used, primary_value, primary_optimal, final).
    `final` is the stage-2 objective, or None when stage 2 found nothing better than stage 1.
    """
    m = build.model
    total = float(overrides.get("deterministic_time", pack.capacity.cpsat_deterministic_time))
    wall = float(overrides.get("wall_seconds", pack.capacity.cpsat_wall_seconds))
    if build.hinted:
        _complete_hint(build, pack)
    m.Minimize(build.stage1)
    s1 = make_solver(
        pack, **{**overrides, "deterministic_time": total / 2, "wall_seconds": wall / 2}
    )
    st1 = s1.Solve(m)
    det = s1.deterministic_time
    if st1 not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return st1, s1, det, None, False, None
    best = round(s1.ObjectiveValue())
    m.Add(build.stage1 <= best)
    m.ClearHints()
    for opts in build.options.values():
        for o in opts:
            m.AddHint(o.var, s1.Value(o.var))
    for v in build.unplaced_var.values():
        m.AddHint(v, s1.Value(v))
    m.Minimize(build.stage2)
    s2 = make_solver(
        pack,
        **{**overrides, "deterministic_time": max(total - det, 0.01), "wall_seconds": wall / 2},
    )
    st2 = s2.Solve(m)
    det += s2.deterministic_time
    primary = st1 == cp_model.OPTIMAL
    if st2 not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return st1, s1, det, best, primary, None  # keep the stage-1 solution
    both = st1 == cp_model.OPTIMAL and st2 == cp_model.OPTIMAL
    status = cp_model.OPTIMAL if both else cp_model.FEASIBLE
    return status, s2, det, best, primary, round(s2.ObjectiveValue())


def solve_cpsat(
    blocks: BlockSet,
    pack: Pack,
    area: str | None = None,
    unit: str | None = None,
    rules: list[Rule] | None = None,
    *,
    strict: bool = False,
    hint: bool = True,
    **overrides,
) -> CpsatResult:
    """Solve with CP-SAT and gate the result with the validator.

    `strict` demands every block be placed (INFEASIBLE if impossible); otherwise a block that
    cannot be placed goes to the TQ list and costs the objective's top priority.
    """
    t0 = time.perf_counter()
    base = solve_greedy(blocks, pack, area, unit, rules) if hint else None
    layout = base.layout if base else derive_layout(blocks, pack, area, unit)
    build = _Build(blocks, layout, pack, rules)
    try:
        build.add_options(strict)
        n_options = sum(len(v) for v in build.options.values())
        if n_options > overrides.get("max_options", pack.capacity.cpsat_max_options):
            return CpsatResult(
                status="SKIPPED",
                wall_seconds=time.perf_counter() - t0,
                message=f"model too large ({n_options} placement options)",
            )
        build.add_capacity()
        build.add_segregation()
        gate_only = build.add_rules()
        build.add_objective()
        if not strict:
            _hint(build, base)
        status, solver, det, primary_value, primary, final = _staged_solve(build, pack, overrides)
    except CpsatError:
        raise
    except Exception as e:  # noqa: BLE001 - the chain must not crash on a solver failure
        return CpsatResult(status="ERROR", message=f"{type(e).__name__}: {e}")
    name = solver.StatusName(status)
    res = CpsatResult(
        status=name,
        wall_seconds=time.perf_counter() - t0,
        deterministic_time=det,
        gate_only_rules=gate_only,
    )
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return res
    res.objective = final
    res.proven_optimal = status == cp_model.OPTIMAL
    res.primary_optimal, res.primary_objective = primary, primary_value
    # trim empty trailing cabinets; numbering stays valid because cabinets fill in order
    placed_cabs = [
        build.ctx.cab_of[o.start[0]]
        for opts in build.options.values()
        for o in opts
        if solver.Value(o.var)
    ]
    alarm_cabs = -(-len(blocks.alarm_signals) // build.ch)
    used = max([*placed_cabs, alarm_cabs, 0])
    final_layout = layout
    if 0 < used < len(layout.cabinets):
        final_layout = derive_layout(blocks, pack, area, unit, cabinets=used)
    alloc = _to_allocation(build, solver, final_layout, area, unit, blocks)
    res.violations = gate(alloc, blocks, pack, rules)
    if res.violations:
        res.status, res.message = "REJECTED", f"{len(res.violations)} validator violations"
        res.allocation = None
        return res
    res.allocation = alloc
    if not res.proven_optimal:
        res.message = "not proven optimal"
    return res
