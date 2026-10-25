from collections import Counter, defaultdict
from collections.abc import Callable

from pydantic import BaseModel

from app.core.layout.reserve import spare_baseplates
from app.core.model.allocation import Allocation
from app.core.model.issue import Issue
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


def spare_shortfall_issues(alloc: Allocation, pack: Pack) -> list[Issue]:
    """One actionable TQ for each controller/IO family that misses its wired-spare target.

    A wiring plan may not contain enough declared spare pairs to repair the result automatically.
    The allocation is still structurally valid, so report the shortfall rather than rejecting or
    moving valid field signals. This keeps the decision with the project engineer.
    """
    out: list[Issue] = []
    for row in spare_report(alloc, pack).by_controller_io:
        if not row.shortfall:
            continue
        msg = (
            f"controller {row.controller}, IO type {row.io_type}: requires {row.required} wired "
            f"spare pair(s) for {row.field_signals} field signal(s), has {row.wired_spares}; "
            f"shortfall {row.shortfall}"
        )
        out.append(
            Issue(
                code="TQ-SPARE",
                severity="warning",
                message=msg,
                data={
                    "kind": "wired_spare_shortfall",
                    "controller": row.controller,
                    "io_type": row.io_type,
                    "required": str(row.required),
                    "wired_spares": str(row.wired_spares),
                    "shortfall": str(row.shortfall),
                },
            )
        )
    return out


def _majority(values: list[str | None]) -> str | None:
    c = Counter(v for v in values if v)
    return min(c, key=lambda k: (-c[k], k)) if c else None


def promote_required_spares(
    alloc: Allocation, pack: Pack, accept: Callable[[Allocation], bool] | None = None
) -> Allocation:
    """Meet the wired-spare requirement from declared unused pairs (policy ``required_spares``).

    The MDB declares cable pairs but not which were physically wired, so only as many protected
    spare slots as the requirement needs are promoted, per controller and IO type. Slots are taken
    cable by cable (most free pairs first) and lowest pair first, so spares cluster in few cables.
    Each promotion is reported as an assumption for the engineer to confirm. Any remaining
    shortfall is left for the normal TQ-SPARE.

    ``accept`` re-validates the allocation (hard rules, capacity) after each batch; a batch that
    would break it is undone so a promotion can never make a valid answer invalid.
    """
    if pack.capacity.wired_spare_policy != "required_spares":
        return alloc
    ctl_of = {c.no: c.controller for c in alloc.layout.ciocs}
    ctl_name = {c.no: c.name for c in alloc.layout.controllers}
    fields: dict[str, list] = defaultdict(list)
    for p in alloc.placements:
        if p.kind == "field" and p.signal is not None and p.block_id:
            fields[p.block_id].append(p.signal)
    hw = {}
    for cable, sigs in fields.items():
        io = _majority([s.io_type for s in sigs])
        same = [s for s in sigs if s.io_type == io]
        hw[cable] = (
            io,
            _majority([s.duty_class for s in same]),
            _majority([s.signal_type for s in same]),
            _majority([s.signal_level for s in same]),
        )
    for row in spare_report(alloc, pack).by_controller_io:
        if not row.shortfall:
            continue
        free: dict[str, list] = defaultdict(list)
        for p in alloc.placements:
            if (
                p.kind == "spare_slot"
                and p.block_id in hw
                and hw[p.block_id][0] == row.io_type
                and ctl_name.get(ctl_of[p.cioc_no]) == row.controller
            ):
                free[p.block_id].append(p)
        order = sorted(free, key=lambda c: (-len(free[c]), c))
        picks = [
            p
            for c in order
            for p in sorted(free[c], key=lambda p: p.pair if p.pair is not None else 0)
        ][: row.shortfall]
        saved = [(p, p.kind, p.io_type, p.duty_class, p.signal_type, p.signal_level) for p in picks]
        for p in picks:
            p.kind = "wired_spare"
            p.io_type, p.duty_class, p.signal_type, p.signal_level = hw[p.block_id]
        if picks and accept is not None and not accept(alloc):
            for p, *old in saved:
                p.kind, p.io_type, p.duty_class, p.signal_type, p.signal_level = old
            picks = []
        if picks:
            alloc.issues = [
                i
                for i in alloc.issues
                if not (
                    i.data.get("kind") == "wired_spare_assumed"
                    and i.data.get("controller") == row.controller
                    and i.data.get("io_type") == row.io_type
                )
            ]
            alloc.issues.append(
                Issue(
                    code="TQ-SPARE",
                    severity="info",
                    message=(
                        f"controller {row.controller}, IO type {row.io_type}: {len(picks)} of "
                        f"{row.required} required wired spare pair(s) were taken from declared "
                        "unused pairs; confirm they are physically wired or supply the wiring plan"
                    ),
                    data={
                        "kind": "wired_spare_assumed",
                        "controller": row.controller,
                        "io_type": row.io_type,
                        "count": str(len(picks)),
                        "pairs": ",".join(f"{p.block_id}#{p.pair}" for p in picks),
                    },
                )
            )
    return alloc


def attach_spare_shortfall_issues(
    alloc: Allocation,
    pack: Pack,
    *,
    promote: bool = False,
    accept: Callable[[Allocation], bool] | None = None,
) -> Allocation:
    """Replace generated spare-shortfall TQs while preserving any user/source TQ-SPARE issues.

    ``promote`` is for the primary allocation run only: revisions start from an established
    baseline and must not re-decide which pairs are wired.
    """
    if promote:
        promote_required_spares(alloc, pack, accept)
    alloc.issues = [
        i
        for i in alloc.issues
        if not (i.code == "TQ-SPARE" and i.data.get("kind") == "wired_spare_shortfall")
    ]
    alloc.issues.extend(spare_shortfall_issues(alloc, pack))
    return alloc


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
