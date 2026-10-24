from pydantic import BaseModel, Field

from app.core.ingest.normaliser import HeldOut
from app.core.layout.affinity import build_groups
from app.core.model.issue import Issue
from app.core.model.layout import Block, Group, Position
from app.core.model.pack import Pack
from app.core.model.signal import Signal

_FAMILY_NEUTRAL = (None,)


def owner_key(signals: list[Signal]) -> str | None:
    """Return one stable ownership context, or None when the MDB does not establish one."""
    values = {
        (s.technical_room or "-", s.operating_area or "-", s.area or "-")
        for s in signals
        if s.technical_room or s.operating_area or s.area
    }
    if len(values) != 1:
        return None
    return " | ".join(next(iter(values)))


class BlockSet(BaseModel):
    blocks: list[Block] = Field(default_factory=list)
    groups: list[Group] = Field(default_factory=list)
    alarm_signals: list[Signal] = Field(default_factory=list)
    held_out: list[HeldOut] = Field(default_factory=list)
    issues: list[Issue] = Field(default_factory=list)

    @property
    def positions(self) -> int:
        return sum(b.size for b in self.blocks)


def single_baseplate(block: Block, pack: Pack) -> bool:
    return block.size <= pack.capacity.channels_per_baseplate


def baseplates_needed(block: Block, pack: Pack) -> int:
    ch = pack.capacity.channels_per_baseplate
    return -(-block.size // ch)


def _usable_pairs(cable: str, sigs: list[Signal], out: BlockSet) -> list[Signal]:
    """Keep one signal per pair number >= 1; hold the rest out with a TQ-DATA, never drop them."""
    kept: list[Signal] = []
    seen: set[int] = set()
    for s in sigs:
        why = None
        if s.pair is None or s.pair < 1:
            why = f"pair number {s.pair} is not valid"
        elif s.pair in seen:
            why = f"pair {s.pair} is used by more than one signal"
        if why is None:
            seen.add(s.pair)
            kept.append(s)
            continue
        iss = Issue(
            code="TQ-DATA",
            severity="blocking",
            message=f"cable {cable}: {why}; signal {s.tag} is held out",
            data={"cable": cable},
        )
        out.issues.append(iss)
        out.held_out.append(
            HeldOut(
                source_file=s.source_file or "",
                source_row=s.source_row or 0,
                tag=s.tag,
                issues=[iss],
                signal=s,
            )
        )
    return kept


def build_blocks(signals: list[Signal], pack: Pack) -> BlockSet:
    """One block per cable, preserving declared unused pairs as wired or protected spares."""
    out = BlockSet()
    cap = pack.capacity
    cioc_positions = cap.channels_per_baseplate * cap.baseplates_per_cioc
    by_cable: dict[str, list[Signal]] = {}
    for s in signals:
        if s.cabinet_alarm:
            out.alarm_signals.append(s)
            continue
        key = s.cable if s.cable and not s.internal_wiring and s.pair is not None else None
        by_cable.setdefault(key or f"INTERNAL:{s.tag}", []).append(s)

    for cable, sigs in sorted(by_cable.items()):
        sigs.sort(key=lambda s: (s.pair if s.pair is not None else 0, s.tag or ""))
        if not cable.startswith("INTERNAL:"):
            sigs = _usable_pairs(cable, sigs, out)
            if not sigs:
                continue
        declared = max((s.cable_pairs for s in sigs if s.cable_pairs), default=None)
        positions: list[Position] = []
        if declared and not cable.startswith("INTERNAL:"):
            by_pair = {s.pair: s for s in sigs}
            top = max(declared, max(by_pair))
            for p in range(1, top + 1):
                if p in by_pair:
                    positions.append(Position(pair=p, kind="field", signal=by_pair[p]))
                else:
                    planned = p in pack.capacity.wired_spare_pairs.get(cable, [])
                    kind = (
                        "wired_spare"
                        if pack.capacity.wired_spare_policy == "declared_pairs" or planned
                        else "spare_slot"
                    )
                    hardware = pack.capacity.wired_spare_hardware.get(cable, {}).get(p)
                    positions.append(
                        Position(
                            pair=p,
                            kind=kind,
                            io_type=hardware.io_type if hardware else None,
                            duty_class=hardware.duty_class if hardware else None,
                            signal_type=hardware.signal_type if hardware else None,
                            signal_level=hardware.signal_level if hardware else None,
                        )
                    )
        else:
            positions = [Position(pair=s.pair or 0, kind="field", signal=s) for s in sigs]
        block = Block(
            id=cable,
            cable=cable,
            declared_pairs=declared,
            positions=positions,
            families=sorted({s.segregation_family for s in sigs if s.segregation_family}),
            logic_numbers=sorted({s.logic_number for s in sigs if s.logic_number}),
            owner=owner_key(sigs),
        )
        if (
            any(s.technical_room or s.operating_area or s.area for s in sigs)
            and block.owner is None
        ):
            out.issues.append(
                Issue(
                    code="TQ-DATA",
                    severity="warning",
                    message=f"cable {cable} spans multiple ownership contexts; allocation may not infer a cabinet owner",
                    data={"cable": cable},
                )
            )
        if block.size > cioc_positions:
            iss = Issue(
                code="TQ-CAP",
                severity="blocking",
                message=f"cable {cable} needs {block.size} positions, more than one CIOC "
                f"({cioc_positions}); its signals are held out",
                data={"cable": cable},
            )
            out.issues.append(iss)
            out.held_out.extend(
                HeldOut(
                    source_file=s.source_file or "",
                    source_row=s.source_row or 0,
                    tag=s.tag,
                    issues=[iss],
                    signal=s,
                )
                for s in sigs
            )
            continue
        out.blocks.append(block)
    out.groups = build_groups(out.blocks)
    return out
