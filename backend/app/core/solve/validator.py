from collections import Counter, defaultdict

from pydantic import BaseModel

from app.core.model.allocation import Allocation
from app.core.model.pack import Pack
from app.core.model.signal import Signal
from app.core.rules.primitives import Ctx, check_rule
from app.core.rules.schema import Rule


class Violation(BaseModel):
    code: str
    message: str


def _key(s: Signal) -> tuple:
    return (s.source_file, s.source_row, s.tag, s.cable, s.pair)


def validate_allocation(
    alloc: Allocation,
    pack: Pack,
    signals: list[Signal],
    alarm_signals: list[Signal] | None = None,
    rules: list[Rule] | None = None,
) -> list[Violation]:
    """Check an allocation against the hard invariants. Empty list means valid.

    Written from the rules; it shares only the data models with the packer.
    `signals` are every allocatable signal that entered the solver (cable blocks and
    cabinet alarms together, or pass the alarms separately).
    """
    cap = pack.capacity
    ch, bpn = cap.channels_per_baseplate, cap.baseplates_per_cioc
    out: list[Violation] = []
    v = lambda code, msg: out.append(Violation(code=code, message=msg))
    lay = alloc.layout
    expected = [*signals, *(alarm_signals or [])]

    # structure limits
    for cab in lay.cabinets:
        if len(cab.ciocs) > cap.ciocs_per_cabinet:
            v("CAPACITY", f"cabinet {cab.name} has {len(cab.ciocs)} CIOCs")
    cioc_by_no = {c.no: c for c in lay.ciocs}
    for c in lay.ciocs:
        if len(c.baseplates) > bpn:
            v("CAPACITY", f"CIOC {c.name} has {len(c.baseplates)} baseplates")

    # every signal exactly once: allocated (field/alarm) or in the TQ list
    seen: Counter = Counter()
    for p in alloc.placements:
        if p.kind in ("field", "cabinet_alarm"):
            if p.signal is None:
                v(
                    "INVARIANT",
                    f"{p.kind} position {p.cioc_no}/{p.baseplate}/{p.channel} has no signal",
                )
            else:
                seen[_key(p.signal)] += 1
    for u in alloc.unplaced:
        seen[_key(u.signal)] += 1
        if not u.issues:
            v("INVARIANT", f"unplaced signal {u.signal.tag} has no TQ")
    want = Counter(_key(s) for s in expected)
    for k in want:
        if seen[k] == 0:
            v("MISSING", f"signal {k[2]} is neither allocated nor in the TQ list")
        elif seen[k] > 1:
            v("DUPLICATE", f"signal {k[2]} appears {seen[k]} times")
    for k in seen:
        if k not in want:
            v("UNKNOWN_SIGNAL", f"signal {k[2]} was not part of the input")

    # positions: ranges, uniqueness, CHARM_No formula, wired spares carry an IO type
    cells: Counter = Counter()
    for p in alloc.placements:
        if p.kind not in {"field", "wired_spare", "cabinet_alarm", "spare_slot"}:
            v("INVARIANT", f"unknown placement kind {p.kind}")
        cioc = cioc_by_no.get(p.cioc_no)
        if cioc is None:
            v("CAPACITY", f"placement in unknown CIOC {p.cioc_no}")
            continue
        if not 1 <= p.channel <= ch:
            v(
                "CAPACITY",
                f"channel {p.channel} outside 1..{ch} (CIOC {p.cioc_no} bp {p.baseplate})",
            )
        if not 1 <= p.baseplate <= bpn:
            v("CAPACITY", f"baseplate {p.baseplate} outside 1..{bpn}")
            continue
        cells[(p.cioc_no, p.baseplate, p.channel)] += 1
        charm_no = (p.baseplate - 1) * ch + p.channel
        if not 1 <= charm_no <= ch * bpn:
            v("CHARM_NO", f"CHARM_No {charm_no} out of range")
        if p.kind == "wired_spare" and not p.io_type:
            v("INVARIANT", f"wired spare at {p.cioc_no}/{p.baseplate}/{p.channel} has no IO type")
        if p.kind == "spare_slot" and p.signal is not None:
            v(
                "INVARIANT",
                f"protected spare slot at {p.cioc_no}/{p.baseplate}/{p.channel} has a signal",
            )
    for cell, n in cells.items():
        if n > 1:
            v("CAPACITY", f"{n} signals share position CIOC {cell[0]} bp {cell[1]} ch {cell[2]}")

    # reserved baseplates
    for cab in lay.cabinets:
        first = cioc_by_no[cab.ciocs[0]]
        for p in alloc.placements:
            is_alarm_bp = p.cioc_no == first.no and p.baseplate == cap.alarm_baseplate_index
            if is_alarm_bp and p.kind != "cabinet_alarm":
                v("RESERVED", f"{p.kind} placed on the alarm baseplate of {cab.name}")
    alarm_cells = {(cab.ciocs[0], cap.alarm_baseplate_index) for cab in lay.cabinets if cab.ciocs}
    for p in alloc.placements:
        if p.kind == "cabinet_alarm" and (p.cioc_no, p.baseplate) not in alarm_cells:
            v("RESERVED", "cabinet alarm placed outside a reserved alarm baseplate")
    for c in lay.ciocs:
        for b in c.baseplates:
            if b.reserved == "spare" and any(
                p.cioc_no == c.no and p.baseplate == b.n for p in alloc.placements
            ):
                v("RESERVED", f"spare baseplate {b.name} is not empty")

    # block contiguity and starting rules
    blocks: dict[str, list] = defaultdict(list)
    for p in alloc.placements:
        if p.block_id:
            blocks[p.block_id].append(p)
    for bid, ps in sorted(blocks.items()):
        ps.sort(key=lambda p: p.pair if p.pair is not None else 0)
        if len({p.cioc_no for p in ps}) > 1:
            v("BLOCK", f"cable {bid} is split across CIOCs")
            continue
        order = [(p.baseplate, p.channel) for p in ps]
        if order != sorted(order):
            v("BLOCK", f"cable {bid} pairs are not in channel order")
        size = len(ps)
        if size <= ch:
            if len({p.baseplate for p in ps}) > 1:
                v("BLOCK", f"cable {bid} ({size} positions) spans more than one baseplate")
            chans = sorted(p.channel for p in ps)
            if chans != list(range(chans[0], chans[0] + size)):
                v("BLOCK", f"cable {bid} is not contiguous on its baseplate")
        else:
            bps = sorted({p.baseplate for p in ps})
            if bps != list(range(bps[0], bps[0] + len(bps))):
                v("BLOCK", f"cable {bid} baseplates are not consecutive")
            for i, b in enumerate(bps):
                chans = sorted(p.channel for p in ps if p.baseplate == b)
                full = ch if i < len(bps) - 1 else size - ch * (len(bps) - 1)
                if chans != list(range(1, full + 1)):
                    v("BLOCK", f"cable {bid} must start at channel 1 and fill baseplate {b}")

    # segregation per CIOC
    fams: dict[int, set[str]] = defaultdict(set)
    occupied_by_neutral: set[int] = set()
    for p in alloc.placements:
        if p.signal and p.kind == "field":
            f = p.signal.segregation_family
            if f:
                fams[p.cioc_no].add(f)
            else:
                occupied_by_neutral.add(p.cioc_no)
    for cno, fs in sorted(fams.items()):
        for pair in pack.segregation.conflicts:
            if set(pair) <= fs:
                v("SEGREGATION", f"CIOC {cioc_by_no[cno].name} mixes {' and '.join(pair)}")
        unknown = {f for f in fs if f.startswith("UNKNOWN:")}
        if unknown and (len(fs) > 1 or cno in occupied_by_neutral):
            v("SEGREGATION", f"CIOC {cioc_by_no[cno].name} shares a CIOC with unknown {unknown}")
    # Ownership is a placement constraint when the MDB gives one consistent context. CP-SAT does
    # not model it natively yet, so this gate safely routes such cases through the owner-aware
    # greedy fallback rather than accepting a mixed cabinet.
    cab_owner = {cab.no: cab.owner for cab in lay.cabinets}
    for p in alloc.placements:
        if p.kind not in ("field", "cabinet_alarm") or p.signal is None:
            continue
        s = p.signal
        owner = (
            " | ".join((s.technical_room or "-", s.operating_area or "-", s.area or "-"))
            if (s.technical_room or s.operating_area or s.area)
            else None
        )
        actual = cab_owner.get(cioc_by_no[p.cioc_no].cabinet)
        if owner is not None and actual is not None and actual != owner:
            v("OWNERSHIP", f"signal {s.tag} is in cabinet owned by {actual or '-'}, not {owner}")
    # rule primitives: hard rules are violations; soft and advisory ones are reported by rule_check
    if rules:
        ctx = Ctx(lay, pack)
        for r in rules:
            if r.enabled and r.enforced and r.strength == "hard":
                for msg in check_rule(r, alloc.placements, ctx):
                    v(f"RULE:{r.id}", msg)
    return out
