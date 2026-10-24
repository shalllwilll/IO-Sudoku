"""Synthetic plants for benchmarks and tests. Invented data only; seeded, so reproducible."""

import random

from app.core.model.signal import Signal

CABLE_SIZES = (2, 4, 6, 8, 12, 12, 16, 24)
IO_TYPES = ("AIR", "AIR", "DIR", "DIR", "AOR", "DOR")
FAMILIES = (None, None, "A", "B")


def synthetic_signals(n_signals: int, seed: int = 0) -> list[Signal]:
    rng = random.Random(seed)
    out: list[Signal] = []
    cable_no = 0
    while len(out) < n_signals:
        cable_no += 1
        declared = rng.choice(CABLE_SIZES)
        used = min(declared - rng.choice((0, 0, 0, 1, 2)), n_signals - len(out))
        used = max(used, 1)
        io, fam = rng.choice(IO_TYPES), rng.choice(FAMILIES)
        logic = f"LN{cable_no // 3:03d}" if rng.random() < 0.4 else None
        name = f"SYN-{cable_no:04d}"
        for pair in range(1, used + 1):
            out.append(
                Signal(
                    tag=f"{name}-{pair:02d}", io_type=io, cable=name, pair=pair,
                    cable_formation=f"{declared:02d}PX1MM2", cable_pairs=declared,
                    segregation_family=fam, logic_number=logic,
                    source_file="synthetic", source_row=len(out) + 1,
                )
            )  # fmt: skip
    return out[:n_signals]
