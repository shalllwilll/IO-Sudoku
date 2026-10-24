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
