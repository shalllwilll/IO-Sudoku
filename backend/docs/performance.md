# Performance

Python 3.14.7, arm64, Darwin. Default settings (CP-SAT on, preset rules). Invented seeded plants; numbers only. Each size runs in its own process, so peak RSS is that size's own.

Targets: 1k signals in 15 s, 10k in 60 s, peak RSS under 1 GB.

| signals | read + map + normalise s | hardware + layout s | pack s | whole run s | solver | validate s | report s | workbook s | workbook KB | peak RSS MB |
|---|---|---|---|---|---|---|---|---|---|---|
| 1000 | 0.06 | 0.01 | 5.71 | 5.77 | cpsat | 0.00 | 0.01 | 0.67 | 408 | 285 |
| 5000 | 0.28 | 0.03 | 0.56 | 0.88 | greedy | 0.04 | 0.05 | 2.94 | 1745 | 409 |
| 10000 | 0.60 | 0.07 | 2.14 | 2.82 | greedy | 0.11 | 0.15 | 6.05 | 3399 | 650 |

Every run placed all of its signals with no validator violations (1000 placed, 5000 placed, 10000 placed; 0 violations).

## CP-SAT time limits

Above `cpsat_max_options` (30000 placement options) CP-SAT is skipped before its model is built (the build stops as soon as the count passes the limit), so the 5k and 10k rows are greedy runs: events 5000: cpsat:skipped, greedy:used; 10000: cpsat:skipped, greedy:used.

Forced onto a 1500-signal plant (`max_options` raised so it is attempted), with tight deterministic-time limits:

| limit (det. s) | wall s | answer from | events | unplaced |
|---|---|---|---|---|
| 0.05 | 0.63 | greedy | cpsat:fallback, greedy:used | 0 |
| 0.5 | 0.82 | greedy | cpsat:fallback, greedy:used | 0 |
| 2.0 | 1.17 | greedy | cpsat:fallback, greedy:used | 0 |

## What was fixed

Before this milestone the pack stage was the slowest and grew quadratically: the greedy packer re-checked every rule against every placement for every candidate cell (about 5.8 s at 5k signals and 43 s at 10k). It now looks only at the placements a candidate can affect (its CIOC or cabinet, or the values it carries), which gives the same answers (tests/test_scale.py compares it with the full check) and a greedy pass takes about 1 s at 10k. The CP-SAT size guard used to build the whole option set before declining (about 5 s and 1 GB at 10k); it now stops at the limit.

## Limits

- QIGA (the stage after greedy) skips plants of more than `qiga_max_blocks` blocks.
- Revision solves and the rule miner were not measured at 10k.
