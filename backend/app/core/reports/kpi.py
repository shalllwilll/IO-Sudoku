from collections import Counter

from pydantic import BaseModel

from app.core.layout.spares import SpareReport, spare_report
from app.core.model.allocation import Allocation
from app.core.model.pack import Pack
from app.core.model.signal import Signal


class Kpi(BaseModel):
    signals_total: int
    allocated: int
    held_out: int
    cabinets: int
    ciocs: int
    baseplates: int
    baseplates_used: int
    controllers: int
    positions: int
    occupied: int
    spare_slots: int
    utilisation: float  # occupied positions over all positions, 0 when there are none
    wired_spare_pairs: int
    free_slots_on_used_baseplates: int
    empty_baseplates: int
    by_io_type: dict[str, dict[str, int]]
    spares: SpareReport


def compute_kpi(alloc: Allocation, pack: Pack, extra_held_out: list[Signal] | None = None) -> Kpi:
    """Every number comes from the Allocation object, never from the worksheet."""
    ch = pack.capacity.channels_per_baseplate
    lay = alloc.layout
    allocated = sum(1 for p in alloc.placements if p.kind in ("field", "cabinet_alarm"))
    held = len(alloc.unplaced) + len(extra_held_out or [])
    baseplates = sum(len(c.baseplates) for c in lay.ciocs)
    positions = baseplates * ch
    occupied = len(alloc.placements)
    used = {(p.cioc_no, p.baseplate) for p in alloc.placements}
    rep = spare_report(alloc, pack)
    io: dict[str, Counter] = {}
    for p in alloc.placements:
        t = p.signal.io_type if p.signal else p.io_type
        if t and p.kind in ("field", "wired_spare"):
            io.setdefault(t, Counter())[p.kind] += 1
    return Kpi(
        signals_total=allocated + held,
        allocated=allocated,
        held_out=held,
        cabinets=len(lay.cabinets),
        ciocs=len(lay.ciocs),
        baseplates=baseplates,
        baseplates_used=len(used),
        controllers=len(lay.controllers),
        positions=positions,
        occupied=occupied,
        spare_slots=positions - occupied,
        utilisation=round(occupied / positions, 4) if positions else 0.0,
        wired_spare_pairs=sum(c.wired_spare_pairs for c in rep.cabinets),
        free_slots_on_used_baseplates=sum(c.free_slots_on_used_baseplates for c in rep.cabinets),
        empty_baseplates=sum(c.empty_baseplates for c in rep.cabinets),
        by_io_type={k: dict(sorted(v.items())) for k, v in sorted(io.items())},
        spares=rep,
    )
