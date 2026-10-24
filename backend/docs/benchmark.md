# Solver benchmark

ortools 9.15.6755, Python 3.14.7, arm64.
num_workers=1, fixed seed, stop on deterministic time. Synthetic plants are invented and seeded; the sample row (if present) reports aggregate numbers only.

| instance | signals | solver | det. limit | wall s | cabinets | CIOCs | baseplates | unplaced | status | stage-1 objective |
|---|---|---|---|---|---|---|---|---|---|---|
| synthetic-500 | 500 | greedy | - | 0.06 | 2 | 8 | 46 | 0 | - | - |
| synthetic-500 | 500 | cp-sat | 1.0 | 0.78 | 2 | 8 | 46 | 0 | FEASIBLE | 26 |
| synthetic-500 | 500 | cp-sat | 2.0 | 1.46 | 2 | 6 | 46 | 0 | FEASIBLE | 24 |
| synthetic-500 | 500 | cp-sat | 5.0 | 2.63 | 2 | 6 | 46 | 0 | FEASIBLE | 24 |
| synthetic-500 | 500 | cp-sat | 10.0 | 5.00 | 2 | 6 | 46 | 0 | FEASIBLE | 24 |
| synthetic-500 | 500 | cp-sat | 20.0 | 9.65 | 2 | 6 | 46 | 0 | FEASIBLE | 24 |
| synthetic-2000 | 2000 | greedy | - | 0.82 | 7 | 27 | 180 | 0 | - | - |
| synthetic-2000 | 2000 | cp-sat | 1.0 | 3.18 | - | - | - | - | UNKNOWN | None |
| synthetic-2000 | 2000 | cp-sat | 2.0 | 3.37 | - | - | - | - | UNKNOWN | None |
| synthetic-2000 | 2000 | cp-sat | 5.0 | 3.80 | - | - | - | - | UNKNOWN | None |
| synthetic-2000 | 2000 | cp-sat | 10.0 | 4.97 | - | - | - | - | UNKNOWN | None |
| synthetic-2000 | 2000 | cp-sat | 20.0 | 13.14 | 7 | 27 | 180 | 0 | FEASIBLE | 230 |
| sample | 177 | greedy | - | 0.01 | 1 | 4 | 23 | 0 | - | - |
| sample | 177 | cp-sat | 1.0 | 0.66 | 1 | 3 | 23 | 0 | FEASIBLE | 8 |
| sample | 177 | cp-sat | 2.0 | 1.21 | 1 | 3 | 23 | 0 | FEASIBLE | 8 |
| sample | 177 | cp-sat | 5.0 | 2.80 | 1 | 3 | 23 | 0 | FEASIBLE | 8 |
| sample | 177 | cp-sat | 10.0 | 5.01 | 1 | 3 | 23 | 0 | FEASIBLE | 8 |
| sample | 177 | cp-sat | 20.0 | 9.20 | 1 | 3 | 23 | 0 | FEASIBLE | 8 |

## Reading the table

- synthetic-500: fewest CIOCs 6, first reached at a 2.0 s deterministic limit.
- synthetic-2000: fewest CIOCs 27, first reached at a 20.0 s deterministic limit.
- sample: fewest CIOCs 3, first reached at a 1.0 s deterministic limit.

Chosen default: `cpsat_deterministic_time = 10` (stage 1 may use half, stage 2 the rest). Small
plants reach their proven optimum well inside it; the rest buys fragmentation and tie-break
improvement. Models above `cpsat_max_options` (30000 placement options) skip CP-SAT and keep
the greedy answer, because the table shows no gain there for the time spent.

<!-- qiga:start -->

## QIGA third stage

Python 3.14.7, arm64. Population 16, up to 40 generations, stops after 8 generations without a better individual (2 once everything is placed); seeds 1-5. The instances are invented: small cables are pinned to a CIOC by a hard rule that first-fit-decreasing has already filled with big cables, so greedy leaves signals on the TQ list although a valid packing exists.

| instance | signals | blocks | greedy unplaced | decode ms | CP-SAT (2 s) solves | solver | seeds solved | mean decodes | mean wall s |
|---|---|---|---|---|---|---|---|---|---|
| 4 big + 3 small | 132 | 7 | 24 | 20.8 | yes (0.1 s) | QIGA | 5/5 | 51 | 0.27 |
| 4 big + 3 small | 132 | 7 | 24 | 20.8 | yes (0.1 s) | QPSO | 5/5 | 54 | 0.16 |
| 8 big + 6 small | 264 | 14 | 60 | 72.2 | yes (0.3 s) | QIGA | 5/5 | 147 | 4.95 |
| 8 big + 6 small | 264 | 14 | 60 | 72.2 | yes (0.3 s) | QPSO | 5/5 | 64 | 1.35 |
| 12 big + 3 small + 3 medium | 378 | 18 | 78 | 194.7 | yes (2.5 s) | QIGA | 5/5 | 80 | 6.03 |
| 12 big + 3 small + 3 medium | 378 | 18 | 78 | 194.7 | yes (2.5 s) | QPSO | 5/5 | 58 | 1.85 |
| 24 big + 6 small | 648 | 30 | 60 | 175.5 | yes (1.9 s) | QIGA | 5/5 | 227 | 22.20 |
| 24 big + 6 small | 648 | 30 | 60 | 175.5 | yes (1.9 s) | QPSO | 5/5 | 48 | 4.05 |

QIGA solved 20/20 runs, the QPSO variant 20/20; total wall 167.2 s against 37.0 s.

**Decision:** QPSO is not adopted: it does not solve more runs than the QIGA at the same budget, so the app keeps one metaheuristic (`app/core/solve/qiga.py`).

The stage runs only when the greedy answer left signals on the TQ list for want of room or a rule, never when CP-SAT produced the answer, and skips instances above `qiga_max_blocks` blocks. A QIGA answer is accepted only if it passes the validator and leaves fewer signals unplaced; otherwise the greedy answer stands.

<!-- qiga:end -->
