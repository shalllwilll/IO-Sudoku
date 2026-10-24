"""QIGA: a quantum-inspired genetic algorithm as the stage after greedy.

Each block carries a small register of Q-bits (an angle per bit; the bit reads 1 with probability
sin^2(theta)). A register decodes to two genes: a priority tier and a preferred CIOC. The decoder
is the ordinary greedy packer steered by those genes, so a candidate can only ever be a packing
the packer itself could have produced; the result still has to pass the validator gate.

Deterministic by construction: a seeded `random.Random`, a fixed population and generation
count, sorted iteration, and no clock. The stage is experimental (see docs/benchmark.md).
"""

import math
import random
from collections.abc import Callable
from dataclasses import dataclass, field

from app.core.layout.blocks import BlockSet
from app.core.model.allocation import Allocation
from app.core.model.layout import Layout
from app.core.model.pack import Pack
from app.core.rules.schema import Rule
from app.core.solve.greedy import pack_blocks

TIER_BITS = 2
ROTATION = 0.05 * math.pi  # angle step toward the best individual
MUTATION = 0.02  # chance a Q-bit is flipped (theta -> pi/2 - theta)
SEED_BIAS = 0.08 * math.pi  # how hard the seeded individual leans toward the greedy answer
PATIENCE = 8  # generations without a better individual before the search stops
POLISH = 2  # ... once every signal is placed, only the tie-break objectives are left


@dataclass
class QigaResult:
    allocation: Allocation | None
    status: str  # improved | no_gain | rejected | skipped
    message: str = ""
    evaluated: int = 0
    generations: int = 0
    fitness: tuple | None = None
    log: list[str] = field(default_factory=list)


def fitness(alloc: Allocation) -> tuple[int, int, int]:
    """Lower is better: unplaced signals, CIOCs in use, baseplates in use."""
    cells = {(p.cioc_no, p.baseplate) for p in alloc.placements}
    return len(alloc.unplaced), len({c for c, _ in cells}), len(cells)


def _bits_for(n_ciocs: int) -> int:
    return max(1, math.ceil(math.log2(n_ciocs + 1)))


def _encode(value: int, width: int) -> list[int]:
    return [(value >> i) & 1 for i in range(width)]


def _decode(bits: list[int]) -> int:
    return sum(b << i for i, b in enumerate(bits))


def solve_qiga(
    blocks: BlockSet,
    layout: Layout,
    pack: Pack,
    rules: list[Rule] | None,
    seed_alloc: Allocation,
    *,
    gate: Callable[[Allocation], list],
    seed: int | None = None,
    population: int | None = None,
    generations: int | None = None,
    pinned=None,
    prefs=None,
    fixed=None,
    decode: Callable[..., Allocation] | None = None,
) -> QigaResult:
    """Improve on `seed_alloc` (greedy, or the baseline packing in a revision).

    Returns the best validated allocation that leaves fewer signals unplaced than the seed, or one of: no_gain (nothing better
    was found), rejected (the best candidate failed the validator gate), skipped (too large).
    """
    cap = pack.capacity
    seed = cap.qiga_seed if seed is None else seed
    pop = population or cap.qiga_population
    gens = generations or cap.qiga_generations
    free = sorted(b.id for b in blocks.blocks if b.id not in (pinned or {}))
    if not free:
        return QigaResult(None, "skipped", "nothing to search")
    if len(free) > cap.qiga_max_blocks:
        return QigaResult(
            None, "skipped", f"{len(free)} blocks is over the {cap.qiga_max_blocks} limit"
        )
    decode = decode or pack_blocks
    n_ciocs = len(layout.ciocs)
    cb = _bits_for(n_ciocs)
    width = TIER_BITS + cb
    rng = random.Random(seed)

    # the greedy answer, as genes: neutral tier, preferred CIOC where it put each block
    where: dict[str, int] = {}
    for p in sorted(seed_alloc.placements, key=lambda p: (p.cioc_no, p.baseplate, p.channel)):
        if p.block_id and p.block_id not in where:
            where[p.block_id] = p.cioc_no
    neutral = 1 << (TIER_BITS - 1)
    seeded = {b: _encode(neutral, TIER_BITS) + _encode(where.get(b, 0), cb) for b in free}

    def angles(init: dict[str, list[int]] | None) -> dict[str, list[float]]:
        if init is None:
            return {b: [math.pi / 4] * width for b in free}
        return {
            b: [SEED_BIAS if bit == 0 else math.pi / 2 - SEED_BIAS for bit in init[b]] for b in free
        }

    def observe(theta: dict[str, list[float]]) -> dict[str, list[int]]:
        return {b: [1 if rng.random() < math.sin(t) ** 2 else 0 for t in theta[b]] for b in free}

    def build(genes: dict[str, list[int]]) -> Allocation:
        order, prefer = {}, {}
        for b, bits in genes.items():
            order[b] = _decode(bits[:TIER_BITS])
            c = _decode(bits[TIER_BITS:])
            if 1 <= c <= n_ciocs:
                prefer[b] = c
        return decode(blocks, layout, pack, rules, pinned, prefs, fixed, order, prefer)

    best_fit, best_alloc = fitness(seed_alloc), seed_alloc
    start_fit = best_fit
    best_genes: dict[str, list[int]] = seeded
    thetas = [angles(seeded)] + [angles(None) for _ in range(pop - 1)]
    evaluated = 0
    log = [f"seed {seed}: start {start_fit}"]
    stale, ran = 0, 0
    for gen in range(gens):
        before, ran = best_fit, gen + 1
        for i, theta in enumerate(thetas):
            genes = observe(theta)
            alloc = build(genes)
            evaluated += 1
            fit = fitness(alloc)
            if fit < best_fit:
                best_fit, best_alloc, best_genes = fit, alloc, genes
                log.append(f"generation {gen}: {fit}")
        for theta in thetas:  # rotate every register toward the best individual's bits
            for b in free:
                for k, target in enumerate(best_genes[b]):
                    t = theta[b][k]
                    goal = math.pi / 2 if target else 0.0
                    theta[b][k] = (
                        min(math.pi / 2, max(0.0, t + math.copysign(ROTATION, goal - t)))
                        if abs(goal - t) > ROTATION
                        else goal
                    )
                    if rng.random() < MUTATION:
                        theta[b][k] = math.pi / 2 - theta[b][k]
        stale = 0 if best_fit < before else stale + 1
        if stale >= (POLISH if best_fit[0] == 0 else PATIENCE):
            break
    if best_alloc is seed_alloc or best_fit[0] >= start_fit[0]:  # only fewer TQ signals count
        return QigaResult(None, "no_gain", "no better packing found", evaluated, ran, best_fit, log)
    bad = gate(best_alloc)
    if bad:
        return QigaResult(
            None, "rejected", f"validator: {bad[0].message}", evaluated, ran, best_fit, log
        )
    best_alloc.solver = "qiga"
    return QigaResult(
        best_alloc, "improved", f"{start_fit} -> {best_fit}", evaluated, ran, best_fit, log
    )
