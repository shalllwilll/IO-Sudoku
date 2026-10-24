"""Reference-guided allocation for an approved project allocation workbook.

The reference file is an explicit project input.  It is never copied into a pack or committed:
we extract only the facts required to reproduce its approved layout (topology and confirmed wired
spares), then use the normal revision solver to match the current MDB against those facts.
"""

from dataclasses import dataclass
from pathlib import Path

import openpyxl

from app.core.hardware.engine import attach_wired_spare_hardware_issues
from app.core.layout.blocks import build_blocks
from app.core.layout.spares import attach_spare_shortfall_issues
from app.core.model.pack import Pack, WiredSpareHardware
from app.core.model.signal import Signal
from app.core.revision.baseline import (
    Baseline,
    _int_at_end,
    _norm,
    _text,
    baseline_from_workbook,
)
from app.core.revision.match import match_revision
from app.core.revision.solve import Event, RevisionResult, solve_revision
from app.core.rules.schema import Rule
from app.core.solve.validator import validate_allocation


@dataclass(frozen=True)
class ReferenceProfile:
    baseline: Baseline
    pack: Pack
    wired_pairs: int


def _match_value(value: object, wanted: str | None) -> bool:
    if wanted is None:
        return True
    values = value if isinstance(value, list) else [value]
    return any(str(item).strip().lower() == wanted.strip().lower() for item in values)


def _wired_spares(
    path: Path, pack: Pack
) -> tuple[dict[str, list[int]], dict[str, dict[int, WiredSpareHardware]]]:
    """Read confirmed wired pairs and their available electrical descriptors from a workbook."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    values = ws.iter_rows(values_only=True)
    headers = [_norm(h) for h in next(values, ())]
    rows = (dict(zip(headers, row, strict=False)) for row in values)
    pairs: dict[str, list[int]] = {}
    hardware: dict[str, dict[int, WiredSpareHardware]] = {}
    for row in rows:
        if _text(row.get("tagstatus")) != "Wired Spare":
            continue
        cable = _text(row.get("fieldcableno"))
        pair = _int_at_end(_text(row.get("fieldcablepair")))
        io_type = _text(row.get("iotype"))
        if cable is None or pair is None or io_type is None:
            continue
        charm, tb = _text(row.get("charmtype")), _text(row.get("charmtbpartno"))
        matched = next(
            (
                rule
                for rule in pack.hardware.rows
                if rule.charm == charm
                and rule.tb == tb
                and _match_value(rule.match.get("io_type"), io_type)
            ),
            None,
        )

        qualifiers = matched.match if matched else {}
        duty_class = qualifiers.get("duty_class")
        match_signal_type = qualifiers.get("signal_type")
        match_signal_level = qualifiers.get("signal_level")

        pairs.setdefault(cable, []).append(pair)
        hardware.setdefault(cable, {})[pair] = WiredSpareHardware(
            io_type=io_type,
            duty_class=duty_class if isinstance(duty_class, str) else None,
            signal_type=_text(row.get("signaltype"))
            or (match_signal_type if isinstance(match_signal_type, str) else None),
            signal_level=_text(row.get("signallevel"))
            or (match_signal_level if isinstance(match_signal_level, str) else None),
        )
    wb.close()
    return (
        {cable: sorted(set(items)) for cable, items in sorted(pairs.items())},
        {cable: dict(sorted(items.items())) for cable, items in sorted(hardware.items())},
    )


def load_reference_profile(path: str | Path, pack: Pack, *, label: str = "REF") -> ReferenceProfile:
    """Load an approved allocation workbook into a baseline plus a fact-augmented pack."""
    source = Path(path)
    baseline = baseline_from_workbook(source, pack, label=label)
    pairs, hardware = _wired_spares(source, pack)
    capacity = pack.capacity.model_copy(
        update={
            "wired_spare_policy": "explicit_pairs",
            "wired_spare_pairs": pairs,
            "wired_spare_hardware": hardware,
        }
    )
    return ReferenceProfile(
        baseline=baseline,
        pack=pack.model_copy(update={"capacity": capacity}),
        wired_pairs=sum(len(items) for items in pairs.values()),
    )


def solve_reference_guided(
    signals: list[Signal],
    pack: Pack,
    reference_path: str | Path,
    rules: list[Rule] | None = None,
    **overrides,
) -> RevisionResult:
    """Allocate `signals` against the approved reference layout with normal revision safeguards."""
    profile = load_reference_profile(reference_path, pack)
    match = match_revision(profile.baseline, signals)
    if not rules and all(
        change.new is not None and change.slot is not None for change in match.changes
    ):
        # The workbook is an explicit approved layout, not an optimisation hint. Preserve every
        # matched field/alarm cell exactly; this permits legitimate legacy shapes that the normal
        # contiguous-cable solver would otherwise re-pack. Added/deleted signals use the revision
        # solver below instead.
        allocation = profile.baseline.allocation.model_copy(deep=True)
        by_slot = {
            change.slot: change.new for change in match.changes if change.new and change.slot
        }
        for placement in allocation.placements:
            signal = by_slot.get((placement.cioc_no, placement.baseplate, placement.channel))
            if signal is None or placement.kind not in {"field", "cabinet_alarm"}:
                continue
            placement.signal = signal
            placement.block_id = None if placement.kind == "cabinet_alarm" else signal.cable
            placement.pair = None if placement.kind == "cabinet_alarm" else signal.pair
            placement.io_type = signal.io_type
        blocks = build_blocks(signals, profile.pack)
        attach_spare_shortfall_issues(allocation, profile.pack)
        attach_wired_spare_hardware_issues(allocation, profile.pack)
        return RevisionResult(
            allocation=allocation,
            match=match,
            solver="reference",
            events=[Event("reference", "used", "preserved approved reference positions")],
            # Copied placements are checked like any other answer. A legacy shape in the approved
            # workbook shows up here as a reported violation instead of being hidden.
            violations=validate_allocation(allocation, profile.pack, signals, blocks.alarm_signals),
            label="REF",
            pinned_blocks=len(blocks.blocks),
        )
    return solve_revision(profile.baseline, signals, profile.pack, rules, label="REF", **overrides)
