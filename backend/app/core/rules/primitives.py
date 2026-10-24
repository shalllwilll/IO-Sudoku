"""Ground-truth checks for the nine rule primitives.

Each check takes the placements of an allocation and returns one message per violation. The
validator calls these; the greedy packer calls them on hypothetical placements as filters.
"""

from collections import defaultdict
from itertools import pairwise

from app.core.model.allocation import Placement
from app.core.model.layout import Layout
from app.core.model.pack import Pack
from app.core.rules.schema import Rule
from app.core.rules.scope import matches, parse_scope


class Ctx:
    def __init__(self, layout: Layout, pack: Pack):
        self.layout = layout
        self.cap = pack.capacity
        self.cab_of = {c.no: c.cabinet for c in layout.ciocs}
        self.seq_of = {c.no: c.seq_in_cabinet for c in layout.ciocs}

    def unit(self, p: Placement, level: str) -> object:
        if level == "baseplate":
            return (p.cioc_no, p.baseplate)
        if level == "cabinet":
            return self.cab_of[p.cioc_no]
        return p.cioc_no

    def unit_size(self, level: str) -> int:
        ch, bp = self.cap.channels_per_baseplate, self.cap.baseplates_per_cioc
        return {"baseplate": ch, "cioc": ch * bp, "cabinet": ch * bp * self.cap.ciocs_per_cabinet}[
            level
        ]


def _scoped(rule: Rule, placements: list[Placement], expr: str | None = None) -> list[Placement]:
    node = parse_scope(rule.scope if expr is None else expr)
    return [p for p in placements if p.signal is not None and matches(node, p.signal, p.group)]


def _field(p: Placement, name: str) -> object:
    return p.group if name == "group" else getattr(p.signal, name, None)


def _key(v: object) -> tuple:
    try:
        return (0, float(str(v)))
    except ValueError:
        return (1, str(v))


def co_locate(r: Rule, ps: list[Placement], ctx: Ctx) -> list[str]:
    level = str(r.parameters.get("level", "cioc"))
    by: dict[object, set] = defaultdict(set)
    count: dict[object, int] = defaultdict(int)
    for p in _scoped(r, ps):
        v = _field(p, str(r.parameters["by"]))
        if v is None or v == "":
            continue
        by[v].add(ctx.unit(p, level))
        count[v] += 1
    return [
        f"signals with {r.parameters['by']}={v} are spread over {len(u)} {level}s"
        for v, u in sorted(by.items(), key=lambda kv: str(kv[0]))
        if len(u) > 1
    ]


def separate(r: Rule, ps: list[Placement], ctx: Ctx) -> list[str]:
    level = str(r.parameters.get("level", "cioc"))
    mine = _scoped(r, ps)
    a = {ctx.unit(p, level) for p in _scoped(r, mine, str(r.parameters["a"]))}
    b = {ctx.unit(p, level) for p in _scoped(r, mine, str(r.parameters["b"]))}
    return [f"{level} {u} holds both sides of the separation" for u in sorted(a & b, key=str)]


def capacity(r: Rule, ps: list[Placement], ctx: Ctx) -> list[str]:
    per, mx = str(r.parameters["per"]), int(r.parameters["max"])
    measure = str(r.parameters.get("measure", "signals"))
    node = parse_scope(r.scope)
    members = [
        p
        for p in ps
        if p.kind in ("field", "wired_spare")
        and (p.signal is None or matches(node, p.signal, p.group))
        and (p.signal is not None or not r.scope.strip())
    ]
    seen: dict[object, set | int] = defaultdict(set if measure == "baseplates" else int)
    for p in members:
        u = ctx.unit(p, per)
        if measure == "baseplates":
            seen[u].add((p.cioc_no, p.baseplate))
        else:
            seen[u] += 1
    return [
        f"{per} {u} uses {len(v) if measure == 'baseplates' else v} {measure}, more than {mx}"
        for u, v in sorted(seen.items(), key=lambda kv: str(kv[0]))
        if (len(v) if measure == "baseplates" else v) > mx
    ]


def reserve(r: Rule, ps: list[Placement], ctx: Ctx) -> list[str]:
    bp = int(r.parameters["baseplate"])
    seq = r.parameters.get("cioc_seq")
    return [
        f"baseplate {bp} of CIOC {p.cioc_no} must stay empty but holds a {p.kind}"
        for p in ps
        if p.baseplate == bp
        and p.kind != "cabinet_alarm"
        and (seq is None or ctx.seq_of[p.cioc_no] == int(seq))
    ]


def quota(r: Rule, ps: list[Placement], ctx: Ctx) -> list[str]:
    per, pct = str(r.parameters["per"]), float(r.parameters["max_percent"])
    n: dict[object, int] = defaultdict(int)
    for p in _scoped(r, ps):
        if p.kind == "field":
            n[ctx.unit(p, per)] += 1
    limit = ctx.unit_size(per) * pct / 100
    return [
        f"{per} {u} holds {c} scoped signals, over {pct:g}% of its positions"
        for u, c in sorted(n.items(), key=lambda kv: str(kv[0]))
        if c > limit
    ]


def order(r: Rule, ps: list[Placement], ctx: Ctx) -> list[str]:
    by = str(r.parameters["by"])
    desc = str(r.parameters.get("direction", "asc")) == "desc"
    per_cioc: dict[int, list[Placement]] = defaultdict(list)
    for p in _scoped(r, ps):
        if p.kind == "field":
            per_cioc[p.cioc_no].append(p)
    out = []
    for cno, lst in sorted(per_cioc.items()):
        lst.sort(key=lambda p: (p.baseplate, p.channel))
        for x, y in pairwise(lst):
            kx, ky = _key(_field(x, by)), _key(_field(y, by))
            if (kx < ky) if desc else (kx > ky):
                out.append(
                    f"CIOC {cno}: {by} is out of order at baseplate {y.baseplate} ch {y.channel}"
                )
    return out


def assign(r: Rule, ps: list[Placement], ctx: Ctx) -> list[str]:
    prm = r.parameters
    out = []
    for p in _scoped(r, ps):
        bad = []
        if "cabinet" in prm and ctx.cab_of[p.cioc_no] != int(prm["cabinet"]):
            bad.append(f"cabinet {prm['cabinet']}")
        if "cioc" in prm and p.cioc_no != int(prm["cioc"]):
            bad.append(f"CIOC {prm['cioc']}")
        if "cioc_seq" in prm and ctx.seq_of[p.cioc_no] != int(prm["cioc_seq"]):
            bad.append(f"CIOC position {prm['cioc_seq']}")
        if "baseplates" in prm and p.baseplate not in [int(x) for x in prm["baseplates"]]:
            bad.append(f"baseplates {prm['baseplates']}")
        if bad:
            out.append(f"{p.signal.tag} is not in {', '.join(bad)}")
    return out


def pin(r: Rule, ps: list[Placement], ctx: Ctx) -> list[str]:
    want = (int(r.parameters["cioc"]), int(r.parameters["baseplate"]), int(r.parameters["channel"]))
    scoped = _scoped(r, ps)
    out = [
        f"{p.signal.tag} must sit at CIOC {want[0]} bp {want[1]} ch {want[2]}"
        for p in scoped
        if (p.cioc_no, p.baseplate, p.channel) != want
    ]
    if len(scoped) > 1:
        out.append(f"{len(scoped)} signals are pinned to the same position")
    return out


def limit_span(r: Rule, ps: list[Placement], ctx: Ctx) -> list[str]:
    unit, mx = str(r.parameters["unit"]), int(r.parameters["max"])
    units = {ctx.unit(p, unit) for p in _scoped(r, ps)}
    return [f"scoped signals span {len(units)} {unit}s, more than {mx}"] if len(units) > mx else []


CHECKS = {
    "co_locate": co_locate,
    "separate": separate,
    "capacity": capacity,
    "reserve": reserve,
    "quota": quota,
    "order": order,
    "assign": assign,
    "pin": pin,
    "limit_span": limit_span,
}


def check_rule(rule: Rule, placements: list[Placement], ctx: Ctx) -> list[str]:
    return CHECKS[rule.primitive](rule, placements, ctx)
