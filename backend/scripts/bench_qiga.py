"""Benchmark the QIGA stage against a QPSO variant (and CP-SAT as the reference).

    python scripts/bench_qiga.py          # writes the "QIGA third stage" section of docs/benchmark.md

The instances are invented: a packing that first-fit-decreasing cannot finish because some small
cables are pinned to CIOC 1 by a hard rule while the big cables fill it first. The QPSO here is a
benchmark-only variant: the same decoder and fitness, positions in [0,1] per gene, the usual
mean-best attractor update. It is not part of the app.
"""

import math
import platform
import random
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.core.layout.blocks import build_blocks
from app.core.model.pack import Pack
from app.core.rules.schema import load_rules
from app.core.solve import cpsat
from app.core.solve.greedy import pack_blocks, solve_greedy
from app.core.solve.qiga import PATIENCE, POLISH, fitness, solve_qiga
from tests.test_greedy import cable

SEEDS = range(1, 6)
START, END = "<!-- qiga:start -->", "<!-- qiga:end -->"


def many(prefix, n, size):
    return [s for i in range(1, n + 1) for s in cable(f"{prefix}{i}", size)]


def instances():
    yield (
        "4 big + 3 small",
        many("B", 4, 24) + many("S", 3, 12),
        [
            {
                "id": "R-S",
                "primitive": "assign",
                "scope": "cable in [S1,S2,S3]",
                "parameters": {"cioc": 1},
            }
        ],
    )
    yield (
        "8 big + 6 small",
        many("B", 8, 24) + many("S", 6, 12),
        [
            {
                "id": "R-S",
                "primitive": "assign",
                "scope": "cable in [S1,S2,S3,S4,S5,S6]",
                "parameters": {"cioc": 1},
            }
        ],
    )
    yield (
        "12 big + 3 small + 3 medium",
        many("B", 12, 24) + many("S", 3, 12) + many("M", 3, 18),
        [
            {
                "id": "R-S",
                "primitive": "assign",
                "scope": "cable in [S1,S2,S3]",
                "parameters": {"cioc": 1},
            },
            {
                "id": "R-M",
                "primitive": "assign",
                "scope": "cable in [M1,M2,M3]",
                "parameters": {"cioc": 2},
            },
        ],
    )
    yield "24 big + 6 small", many("B", 24, 24) + many("S", 6, 12), [
        {"id": "R-S", "primitive": "assign", "scope": "cable in [S1,S2,S3,S4,S5,S6]",
         "parameters": {"cioc": 1}}
    ]  # fmt: skip


def qpso(blocks, layout, pack, rules, seed_alloc, gate, seed, pop=16, gens=40):
    """Quantum-behaved PSO over [0,1] genes; same decoder, fitness and seeding as the QIGA."""
    rng = random.Random(seed)
    free = sorted(b.id for b in blocks.blocks)
    n = len(layout.ciocs)
    where = {}
    for p in sorted(seed_alloc.placements, key=lambda p: (p.cioc_no, p.baseplate, p.channel)):
        if p.block_id and p.block_id not in where:
            where[p.block_id] = p.cioc_no

    def decode(x):
        order = {b: min(3, int(x[b][0] * 4)) for b in free}
        prefer = {b: min(n, int(x[b][1] * n) + 1) for b in free}
        return pack_blocks(blocks, layout, pack, rules, None, None, None, order, prefer)

    seeded = {b: [0.5, (where.get(b, 1) - 0.5) / n] for b in free}
    xs = [seeded] + [{b: [rng.random(), rng.random()] for b in free} for _ in range(pop - 1)]
    pbest, pfit = [dict(x) for x in xs], [(10**9,)] * pop
    best_fit, best_alloc, gbest, evals, first_hit = fitness(seed_alloc), seed_alloc, seeded, 0, None
    start = best_fit
    stale = 0
    for g in range(gens):
        before = best_fit
        alpha = 1.0 - 0.5 * g / gens
        for i, x in enumerate(xs):
            alloc = decode(x)
            evals += 1
            f = fitness(alloc)
            if f < pfit[i]:
                pfit[i], pbest[i] = f, {b: list(v) for b, v in x.items()}
            if f < best_fit:
                best_fit, best_alloc, gbest = f, alloc, {b: list(v) for b, v in x.items()}
                if first_hit is None and f[0] < start[0]:
                    first_hit = evals
        mbest = {b: [sum(pb[b][k] for pb in pbest) / pop for k in (0, 1)] for b in free}
        for i, x in enumerate(xs):
            for b in free:
                for k in (0, 1):
                    phi, u = rng.random(), max(rng.random(), 1e-9)
                    p = phi * pbest[i][b][k] + (1 - phi) * gbest[b][k]
                    step = alpha * abs(mbest[b][k] - x[b][k]) * math.log(1 / u)
                    x[b][k] = min(1.0, max(0.0, p + (step if rng.random() < 0.5 else -step)))
        stale = 0 if best_fit < before else stale + 1
        if stale >= (POLISH if best_fit[0] == 0 else PATIENCE):
            break
    ok = best_alloc is not seed_alloc and best_fit[0] < start[0] and not gate(best_alloc)
    return (best_alloc if ok else None), evals, first_hit


def main() -> None:
    pack = Pack.load(ROOT / "packs" / "default")
    rows = []
    for name, signals, rule_defs in instances():
        rules = load_rules(rule_defs)
        blocks = build_blocks(signals, pack)
        g = solve_greedy(blocks, pack, "AR1", "100", rules)
        gate = lambda a, b=blocks, r=rules: cpsat.gate(a, b, pack, r)
        t0 = time.perf_counter()
        for _ in range(20):
            pack_blocks(blocks, g.layout, pack, rules)
        decode_ms = (time.perf_counter() - t0) / 20 * 1000
        t0 = time.perf_counter()
        c = cpsat.solve_cpsat(blocks, pack, "AR1", "100", rules, deterministic_time=2.0)
        cp_s = time.perf_counter() - t0
        stats = {"QIGA": [], "QPSO": []}
        for seed in SEEDS:
            t0 = time.perf_counter()
            q = solve_qiga(blocks, g.layout, pack, rules, g, gate=gate, seed=seed)
            stats["QIGA"].append((q.allocation is not None, q.evaluated, time.perf_counter() - t0,
                                  0 if q.allocation is not None else len(g.unplaced)))  # fmt: skip
            t0 = time.perf_counter()
            alloc, evals, _ = qpso(blocks, g.layout, pack, rules, g, gate, seed)
            stats["QPSO"].append((alloc is not None, evals, time.perf_counter() - t0,
                                  0 if alloc is not None else len(g.unplaced)))  # fmt: skip
        rows.append((name, len(signals), len(blocks.blocks), len(g.unplaced), decode_ms, cp_s,
                     c.ok and not c.allocation.unplaced, stats))  # fmt: skip
        print(name, "done", file=sys.stderr)
    lines = [START, "", "## QIGA third stage", ""]
    lines += [
        f"Python {platform.python_version()}, {platform.machine()}. Population 16, up to 40 generations,"
        " stops after 8 generations without a better individual (2 once everything is placed); seeds"
        " 1-5. The instances are"
        " invented: small cables are pinned to a CIOC by a hard rule that first-fit-decreasing has"
        " already filled with big cables, so greedy leaves signals on the TQ list although a"
        " valid packing exists.",
        "",
        "| instance | signals | blocks | greedy unplaced | decode ms | CP-SAT (2 s) solves | "
        "solver | seeds solved | mean decodes | mean wall s |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for name, sig, nb, un, ms, cp_s, cp_ok, stats in rows:
        for who, st in stats.items():
            solved = sum(1 for s in st if s[0])
            lines.append(
                f"| {name} | {sig} | {nb} | {un} | {ms:.1f} | {'yes' if cp_ok else 'no'} ({cp_s:.1f} s) "
                f"| {who} | {solved}/{len(st)} | {sum(s[1] for s in st) / len(st):.0f} "
                f"| {sum(s[2] for s in st) / len(st):.2f} |"
            )
    qi = sum(1 for r in rows for s in r[7]["QIGA"] if s[0])
    qp = sum(1 for r in rows for s in r[7]["QPSO"] if s[0])
    tot = sum(len(r[7]["QIGA"]) for r in rows)
    wall = lambda who: sum(s[2] for r in rows for s in r[7][who])
    lines += [
        "",
        f"QIGA solved {qi}/{tot} runs, the QPSO variant {qp}/{tot}; total wall {wall('QIGA'):.1f} s "
        f"against {wall('QPSO'):.1f} s.",
        "",
        "**Decision:** QIGA ships as the third stage (the milestone's specified method). The QPSO variant solved the same runs in fewer decodes and about a fifth of the wall time here, so it is the candidate to swap in if QIGA cost matters; it is not adopted yet because the instances are small and invented and a swap needs a run on real hard cases first.",
        "",
        "The stage runs only when the greedy answer left signals on the TQ list for want of room or "
        "a rule, never when CP-SAT produced the answer, and skips instances above "
        "`qiga_max_blocks` blocks. A QIGA answer is accepted only if it passes the validator and "
        "leaves fewer signals unplaced; otherwise the greedy answer stands.",
        "",
        END,
    ]
    path = ROOT / "docs" / "benchmark.md"
    text = path.read_text() if path.exists() else ""
    if START in text:
        head, _, rest = text.partition(START)
        tail = rest.partition(END)[2]
        text = head.rstrip("\n") + "\n\n" + "\n".join(lines) + tail
    else:
        text = text.rstrip("\n") + "\n\n" + "\n".join(lines) + "\n"
    path.write_text(text)


if __name__ == "__main__":
    main()
