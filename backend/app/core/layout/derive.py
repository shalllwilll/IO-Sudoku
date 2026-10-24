import math

from app.core.layout.blocks import BlockSet
from app.core.layout.reserve import spare_baseplates, usable_baseplates_per_cabinet
from app.core.model.issue import Issue
from app.core.model.layout import Baseplate, Cabinet, Cioc, Controller, Layout
from app.core.model.pack import Pack
from app.core.naming.engine import Namer


def segregation_class(families: list[str], pack: Pack) -> str:
    """Class a block belongs to for CIOC planning: a conflict family, an unknown code, or '-'."""
    conflict_members = {f for pair in pack.segregation.conflicts for f in pair}
    for f in families:
        if f.startswith("UNKNOWN:") or f in conflict_members:
            return f
    return "-"


def class_plan(blocks: BlockSet, pack: Pack) -> dict[str, int]:
    """How many CIOCs each segregation class needs on its own (a planning lower bound)."""
    cap = pack.capacity
    per_cioc = cap.channels_per_baseplate * cap.baseplates_per_cioc
    pos: dict[str, int] = {}
    for b in blocks.blocks:
        k = segregation_class(b.families, pack)
        pos[k] = pos.get(k, 0) + b.size
    return {k: math.ceil(v / per_cioc) for k, v in sorted(pos.items())}


def cabinets_needed(blocks: BlockSet, pack: Pack) -> int:
    cap = pack.capacity
    if not blocks.blocks and not blocks.alarm_signals:
        return 0
    per_cab = usable_baseplates_per_cabinet(pack) * cap.channels_per_baseplate
    by_positions = math.ceil(blocks.positions / per_cab) if per_cab else 1
    by_alarms = math.ceil(len(blocks.alarm_signals) / cap.channels_per_baseplate)
    plan = class_plan(blocks, pack)
    by_classes = math.ceil(sum(v for k, v in plan.items() if k != "-") / cap.ciocs_per_cabinet)
    return max(1, by_positions, by_alarms, by_classes, len(cabinet_owner_plan(blocks, pack)))


def cabinet_owner_plan(blocks: BlockSet, pack: Pack) -> list[str | None]:
    """Minimum cabinets per known owner; unknown context keeps the legacy shared bucket."""
    cap = pack.capacity
    per_cab = usable_baseplates_per_cabinet(pack) * cap.channels_per_baseplate
    positions: dict[str | None, int] = {}
    alarms: dict[str | None, int] = {}
    for block in blocks.blocks:
        positions[block.owner] = positions.get(block.owner, 0) + block.size
    for signal in blocks.alarm_signals:
        owner = (
            " | ".join(
                (signal.technical_room or "-", signal.operating_area or "-", signal.area or "-")
            )
            if (signal.technical_room or signal.operating_area or signal.area)
            else None
        )
        alarms[owner] = alarms.get(owner, 0) + 1
    owners = sorted(
        set(positions) | set(alarms), key=lambda value: (value is not None, value or "")
    )
    out: list[str | None] = []
    for owner in owners:
        need = max(
            math.ceil(positions.get(owner, 0) / per_cab) if per_cab else 1,
            math.ceil(alarms.get(owner, 0) / cap.channels_per_baseplate),
        )
        out.extend([owner] * need)
    return out


def derive_layout(
    blocks: BlockSet,
    pack: Pack,
    area: str | None = None,
    unit: str | None = None,
    cabinets: int | None = None,
) -> Layout:
    """Derive cabinets, CIOCs, controllers and names from the data. Deterministic."""
    cap = pack.capacity
    layout = Layout(
        spare_baseplates_per_cabinet=spare_baseplates(pack), class_plan=class_plan(blocks, pack)
    )
    owners = cabinet_owner_plan(blocks, pack)
    n_cab = cabinets if cabinets is not None else max(cabinets_needed(blocks, pack), len(owners))
    if cap.max_cabinets is not None and n_cab > cap.max_cabinets:
        layout.issues.append(
            Issue(
                code="TQ-CAP",
                severity="blocking",
                message=f"{n_cab} cabinets are needed but at most {cap.max_cabinets} are allowed",
            )
        )
        n_cab = cap.max_cabinets
    if len(owners) < n_cab:
        fallback = max(
            owners,
            key=lambda owner: sum(b.size for b in blocks.blocks if b.owner == owner),
            default=None,
        )
        owners.extend([fallback] * (n_cab - len(owners)))
    owners = owners[:n_cab]
    namer = Namer(pack.naming)
    spare_from = cap.baseplates_per_cioc - layout.spare_baseplates_per_cabinet  # in last CIOC
    per_ctl = cap.ciocs_per_controller
    cioc_no = 0
    for c in range(1, n_cab + 1):
        cab_name = namer.name_for("marshalling_cabinet", area, unit, seq=c)
        layout.issues.extend(cab_name.issues if c == 1 else [])
        cab = Cabinet(no=c, name=cab_name.name, ciocs=[], owner=owners[c - 1] if owners else None)
        for k in range(1, cap.ciocs_per_cabinet + 1):
            cioc_no += 1
            ctl_no = (cioc_no - 1) // per_ctl + 1
            cname = namer.name_for("cioc", area, unit, cioc_no=cioc_no)
            bps = []
            for n in range(1, cap.baseplates_per_cioc + 1):
                reserved = None
                if k == 1 and n == cap.alarm_baseplate_index:
                    reserved = "alarm"
                elif k == cap.ciocs_per_cabinet and n > spare_from:
                    reserved = "spare"
                bps.append(
                    Baseplate(
                        name=namer.name_for("baseplate", cioc_no=cioc_no, n=n).name,
                        cioc_no=cioc_no,
                        n=n,
                        reserved=reserved,
                    )
                )
            layout.ciocs.append(
                Cioc(
                    no=cioc_no,
                    name=cname.name,
                    cabinet=c,
                    seq_in_cabinet=k,
                    controller=ctl_no,
                    baseplates=bps,
                )
            )
            cab.ciocs.append(cioc_no)
        layout.cabinets.append(cab)
    per_sys = cap.controllers_per_system_cabinet
    for t in range(1, (cioc_no - 1) // per_ctl + 2 if cioc_no else 1):
        members = [c.no for c in layout.ciocs if c.controller == t]
        if not members:
            continue
        sc = namer.name_for("system_cabinet", area, unit, seq=(t - 1) // per_sys + 1)
        ct = namer.name_for("controller", area, unit, seq=t)
        layout.controllers.append(
            Controller(no=t, name=ct.name, system_cabinet=sc.name, ciocs=members)
        )
    return layout
