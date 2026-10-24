"""Impact report and diff sheet for one revision."""

from collections import Counter
from typing import ClassVar

from pydantic import BaseModel, Field

from app.core.model.allocation import Allocation
from app.core.model.layout import Layout
from app.core.model.pack import Pack
from app.core.reports.kpi import compute_kpi
from app.core.revision.baseline import Baseline, skey
from app.core.revision.solve import RevisionResult

Cell = tuple[int, int, int]


def slot_text(layout: Layout, cell: Cell | None) -> str:
    """'CIOC name / baseplate name / ch 5', or a dash when the signal has no slot."""
    if cell is None:
        return "-"
    cno, bp, ch = cell
    cioc = next((c for c in layout.ciocs if c.no == cno), None)
    if cioc is None:
        return f"{cno}/{bp}/{ch}"
    name = next((b.name for b in cioc.baseplates if b.n == bp), str(bp))
    return f"{cioc.name} / {name} / ch {ch}"


def used_counts(alloc: Allocation) -> dict[str, int]:
    cab_of = {c.no: c.cabinet for c in alloc.layout.ciocs}
    return {
        "cabinets": len({cab_of[p.cioc_no] for p in alloc.placements if p.cioc_no in cab_of}),
        "ciocs": len({p.cioc_no for p in alloc.placements}),
    }


class DiffRow(BaseModel):
    tag: str | None
    old_tag: str | None = None
    change: str  # Added | Modified | Moved | Deleted
    cable: str | None = None
    pair: int | None = None
    old_slot: str = "-"
    new_slot: str = "-"
    reason: str = ""
    detail: str = ""
    fields: list[str] = Field(default_factory=list)

    HEAD: ClassVar[tuple[str, ...]] = (
        "Tag",
        "Change",
        "Cable",
        "Pair",
        "Old slot",
        "New slot",
        "Reason",
        "Detail",
        "Fields",
    )

    def cells(self) -> list[object]:
        return [
            self.tag, self.change, self.cable, self.pair, self.old_slot, self.new_slot,
            self.reason, self.detail, ", ".join(self.fields),
        ]  # fmt: skip


class Impact(BaseModel):
    label: str
    baseline_label: str
    solver: str = ""
    added: int = 0
    modified: int = 0
    deleted: int = 0
    unchanged: int = 0
    moved: int = 0  # an overlay: a moved signal is also counted in modified or unchanged
    total_signals: int = 0  # every classified row; the four categories sum to this
    total_baseline: int = 0
    total_revised: int = 0
    cabinets_used_before: int = 0
    cabinets_used_after: int = 0
    ciocs_used_before: int = 0
    ciocs_used_after: int = 0
    spare_slots_before: int = 0
    spare_slots_after: int = 0
    wired_spares_before: int = 0
    wired_spares_after: int = 0
    unplaced_after: int = 0
    tq_rev: int = 0
    moves_by_reason: dict[str, int] = Field(default_factory=dict)

    @property
    def categories(self) -> int:
        return self.added + self.modified + self.deleted + self.unchanged

    def rows(self) -> list[list[object]]:
        return [["Item", "Value"], *([k, v] for k, v in self.model_dump().items() if k != "moves_by_reason"),
                *([f"moves: {k}", v] for k, v in sorted(self.moves_by_reason.items()))]  # fmt: skip


def build_diff(result: RevisionResult, baseline: Baseline) -> list[DiffRow]:
    """One row per changed signal: added, modified, deleted or moved."""
    new_at = {
        skey(p.signal): (p.cioc_no, p.baseplate, p.channel)
        for p in result.allocation.placements
        if p.signal is not None
    }
    moves = {(m.tag, m.cable, m.pair): m for m in result.moves}
    old_layout, new_layout = baseline.layout, result.allocation.layout
    rows: list[DiffRow] = []
    for c in result.match.changes:
        s = c.signal
        base = DiffRow(
            tag=s.tag, old_tag=c.old.tag if c.old and c.old.tag != s.tag else None,
            change="", cable=s.cable, pair=s.pair, fields=list(c.changed_fields),
        )  # fmt: skip
        if c.kind == "deleted":
            rows.append(
                base.model_copy(
                    update={
                        "change": "Deleted",
                        "old_slot": slot_text(old_layout, c.slot),
                        "reason": "removed from the revised file"
                        if not c.explicit_delete
                        else "flagged deleted in the revised file",
                    }
                )
            )
            continue
        new_cell = new_at.get(skey(c.new)) if c.new else None
        where = slot_text(new_layout, new_cell) if new_cell else "TQ list"
        if c.kind == "added":
            rows.append(base.model_copy(update={"change": "Added", "new_slot": where,
                                                "reason": "new signal"}))  # fmt: skip
            continue
        mv = moves.get((s.tag, s.cable, s.pair))
        if mv is not None:
            rows.append(
                base.model_copy(
                    update={
                        "change": "Moved",
                        "old_slot": slot_text(old_layout, c.slot),
                        "new_slot": where,
                        "reason": mv.reason,
                        "detail": mv.detail,
                    }
                )
            )
        elif c.kind == "modified":
            rows.append(
                base.model_copy(
                    update={
                        "change": "Modified",
                        "old_slot": slot_text(old_layout, c.slot),
                        "new_slot": where,
                        "reason": "kept its slot",
                        "detail": f"changed: {', '.join(c.changed_fields)}",
                    }
                )
            )
    return rows


def build_impact(
    result: RevisionResult, baseline: Baseline, pack: Pack, label: str | None = None
) -> Impact:
    counts = result.match.counts()
    before, after = compute_kpi(baseline.allocation, pack), compute_kpi(result.allocation, pack)
    ub, ua = used_counts(baseline.allocation), used_counts(result.allocation)
    changes = result.match.changes
    return Impact(
        label=label or result.label,
        baseline_label=baseline.label,
        solver=result.solver,
        added=counts["added"], modified=counts["modified"],
        deleted=counts["deleted"], unchanged=counts["unchanged"],
        moved=len(result.moves),
        total_signals=len(changes),
        total_baseline=sum(1 for c in changes if c.old is not None),
        total_revised=sum(1 for c in changes if c.new is not None),
        cabinets_used_before=ub["cabinets"], cabinets_used_after=ua["cabinets"],
        ciocs_used_before=ub["ciocs"], ciocs_used_after=ua["ciocs"],
        spare_slots_before=before.spare_slots, spare_slots_after=after.spare_slots,
        wired_spares_before=before.wired_spare_pairs, wired_spares_after=after.wired_spare_pairs,
        unplaced_after=len(result.allocation.unplaced),
        tq_rev=sum(1 for i in result.allocation.issues if i.code == "TQ-REV"),
        moves_by_reason=dict(Counter(m.reason for m in result.moves)),
    )  # fmt: skip


def revision_sheets(impact: Impact, diff: list[DiffRow]) -> dict[str, list[list[object]]]:
    """Extra sheets for the output workbook, built from the same objects as the JSON."""
    return {
        "Revision Impact": impact.rows(),
        "Revision Diff": [list(DiffRow.HEAD), *(r.cells() for r in diff)],
    }
