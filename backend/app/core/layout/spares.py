from collections import Counter, defaultdict

from pydantic import BaseModel

from app.core.layout.reserve import spare_baseplates
from app.core.model.allocation import Allocation
from app.core.model.pack import Pack


class CabinetSpares(BaseModel):
    cabinet: str
    wired_spare_pairs: int
    protected_spare_pairs: int
    free_slots_on_used_baseplates: int
    empty_baseplates: int
    required_empty_baseplates: int

    @property
    def ok(self) -> bool:
        return self.empty_baseplates >= self.required_empty_baseplates


class IoSpares(BaseModel):
    controller: str
    io_type: str
    field_signals: int
    wired_spares: int
    required: int

    @property
    def shortfall(self) -> int:
        return max(0, self.required - self.wired_spares)


class SpareReport(BaseModel):
    cabinets: list[CabinetSpares]
    by_controller_io: list[IoSpares]


def spare_report(alloc: Allocation, pack: Pack) -> SpareReport:
    """Count the three spare kinds separately, plus the 10% wired-spare rule per IO type."""
    cap = pack.capacity
    occupied: dict[tuple[int, int], int] = Counter(
        (p.cioc_no, p.baseplate) for p in alloc.placements if p.kind != "spare_slot"
    )
    protected_cells: dict[tuple[int, int], int] = Counter(
        (p.cioc_no, p.baseplate) for p in alloc.placements if p.kind == "spare_slot"
    )
    cabinets: list[CabinetSpares] = []
    required = spare_baseplates(pack)
    for cab in alloc.layout.cabinets:
        wired = protected = free = empty = 0
        for cno in cab.ciocs:
            for bp in alloc.layout.cioc(cno).baseplates:
                n = occupied.get((cno, bp.n), 0)
                protected_here = protected_cells.get((cno, bp.n), 0)
                if bp.reserved == "alarm":
                    continue
                if n == 0 and protected_here == 0:
                    empty += 1
                elif n:
                    free += cap.channels_per_baseplate - n - protected_here
        for p in alloc.placements:
            if p.kind == "wired_spare" and p.cioc_no in cab.ciocs:
                wired += 1
            if p.kind == "spare_slot" and p.cioc_no in cab.ciocs:
                protected += 1
        cabinets.append(
            CabinetSpares(
                cabinet=cab.name,
                wired_spare_pairs=wired,
                protected_spare_pairs=protected,
                free_slots_on_used_baseplates=free,
                empty_baseplates=empty,
                required_empty_baseplates=required,
            )
        )
    ctl_of = {c.no: c.controller for c in alloc.layout.ciocs}
    ctl_name = {c.no: c.name for c in alloc.layout.controllers}
    field: dict[tuple[int, str], int] = defaultdict(int)
    wired: dict[tuple[int, str], int] = defaultdict(int)
    for p in alloc.placements:
        t = p.signal.io_type if p.signal else p.io_type
        if t is None or p.kind not in {"field", "wired_spare"}:
            continue
        key = (ctl_of[p.cioc_no], t)
        (wired if p.kind == "wired_spare" else field)[key] += 1
    rows = [
        IoSpares(
            controller=ctl_name[c],
            io_type=t,
            field_signals=field[(c, t)],
            wired_spares=wired[(c, t)],
            required=field[(c, t)] * cap.spare_percent // 100,
        )
        for c, t in sorted(set(field) | set(wired))
    ]
    return SpareReport(cabinets=cabinets, by_controller_io=rows)
