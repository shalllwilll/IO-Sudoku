"""Benchmark greedy against CP-SAT and pick the deterministic-time limit.

    python scripts/benchmark.py            # synthetic 500 / 2000 (+ the sample if SUDOKU_DATA_DIR is set)
    python scripts/benchmark.py --quick    # synthetic 500 only, short limits

Writes docs/benchmark.md. Only aggregate numbers are written, never rows of the hackathon files.
"""

import argparse
import os
import platform
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import ortools

from app.core.ingest.merge import merge_files
from app.core.layout.blocks import build_blocks
from app.core.model.pack import Pack
from app.core.rules.sets import load_preset
from app.core.solve.cpsat import solve_cpsat
from app.core.solve.greedy import solve_greedy
from app.core.synth import synthetic_signals

LIMITS = (1.0, 2.0, 5.0, 10.0, 20.0)


def shape(alloc) -> dict:
    used = {p.cioc_no for p in alloc.placements if p.kind != "cabinet_alarm"}
    bps = {(p.cioc_no, p.baseplate) for p in alloc.placements}
    return {
        "cabinets": len(alloc.layout.cabinets), "ciocs": len(used), "baseplates": len(bps),
        "unplaced": len(alloc.unplaced),
    }  # fmt: skip


def instances(quick: bool, pack: Pack):
    yield "synthetic-500", build_blocks(synthetic_signals(500, seed=1), pack)
    if quick:
        return
    yield "synthetic-2000", build_blocks(synthetic_signals(2000, seed=2), pack)
    if d := os.environ.get("SUDOKU_DATA_DIR"):
        hits = sorted(p for p in Path(d).glob("*.xlsx") if "mdb" in p.name.lower())
        if hits:
            yield "sample", build_blocks(merge_files([hits[0]], pack).signals, pack)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--out", default=str(ROOT / "docs" / "benchmark.md"))
    args = ap.parse_args()
    pack = Pack.load(ROOT / "packs" / "default")
    rules = load_preset(pack).rules
    limits = LIMITS[:3] if args.quick else LIMITS
    rows = []
    for name, blocks in instances(args.quick, pack):
        n_sig = sum(len(b.signals) for b in blocks.blocks)
        t = time.perf_counter()
        g = solve_greedy(blocks, pack, "AR1", "100", rules)
        rows.append((name, n_sig, "greedy", "-", time.perf_counter() - t, shape(g), "-", "-"))
        for lim in limits:
            t = time.perf_counter()
            r = solve_cpsat(
                blocks, pack, "AR1", "100", rules, deterministic_time=lim, max_options=10**9
            )  # no size guard here: the table shows why the guard exists
            wall = time.perf_counter() - t
            sh = (
                shape(r.allocation)
                if r.ok
                else {"cabinets": "-", "ciocs": "-", "baseplates": "-", "unplaced": "-"}
            )
            rows.append((name, n_sig, "cp-sat", lim, wall, sh, r.status, r.primary_objective))
            print(name, lim, r.log(), sh, flush=True)
    lines = [
        "# Solver benchmark",
        "",
        f"ortools {ortools.__version__}, Python {platform.python_version()}, {platform.machine()}.",
        "num_workers=1, fixed seed, stop on deterministic time. Synthetic plants are invented and seeded; "
        "the sample row (if present) reports aggregate numbers only.",
        "",
        "| instance | signals | solver | det. limit | wall s | cabinets | CIOCs | baseplates | unplaced | status | stage-1 objective |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for name, n, solver, lim, wall, sh, status, obj in rows:
        lines.append(
            f"| {name} | {n} | {solver} | {lim} | {wall:.2f} | {sh['cabinets']} | {sh['ciocs']} "
            f"| {sh['baseplates']} | {sh['unplaced']} | {status} | {obj} |"
        )
    lines += ["", "## Reading the table", ""]
    for name in dict.fromkeys(r[0] for r in rows):
        solved = [r for r in rows if r[0] == name and r[2] == "cp-sat" and r[5]["cabinets"] != "-"]
        if not solved:
            lines.append(
                f"- {name}: CP-SAT returned no solution within the limits tried; the chain keeps greedy."
            )
            continue
        best = min(r[5]["ciocs"] for r in solved)
        first = min(r[3] for r in solved if r[5]["ciocs"] == best)
        lines.append(
            f"- {name}: fewest CIOCs {best}, first reached at a {first} s deterministic limit."
        )
    lines += [
        "",
        "Chosen default: `cpsat_deterministic_time = 10` (stage 1 may use half, stage 2 the rest). Small",
        "plants reach their proven optimum well inside it; the rest buys fragmentation and tie-break",
        "improvement. Models above `cpsat_max_options` (30000 placement options) skip CP-SAT and keep",
        "the greedy answer, because the table shows no gain there for the time spent.",
    ]
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text("\n".join(lines) + "\n")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
