from collections import Counter

from pydantic import BaseModel, Field

from app.core.model.issue import Issue
from app.core.model.layout import Layout
from app.core.model.signal import Signal


class Placement(BaseModel):
    """One allocated or explicitly protected CHARM position.

    ``spare_slot`` reserves a declared cable pair in its contiguous cable block but has no
    installed CHARM. It is tracked so another block cannot claim the same cell.
    """

    cioc_no: int
    baseplate: int
    channel: int
    kind: str  # field | wired_spare | cabinet_alarm | spare_slot
    signal: Signal | None = None
    block_id: str | None = None
    pair: int | None = None
    io_type: str | None = None  # for wired spares: the type of the CHARM installed
    duty_class: str | None = None
    signal_type: str | None = None
    signal_level: str | None = None
    group: str | None = None  # affinity group of the block
    change: str | None = None  # revisions: Added | Modified | Moved

    @property
    def charm_no(self) -> int:
        return (self.baseplate - 1) * 12 + self.channel  # re-derived by the validator, not trusted


class Unplaced(BaseModel):
    signal: Signal
    issues: list[Issue]


class Allocation(BaseModel):
    layout: Layout
    placements: list[Placement] = Field(default_factory=list)
    unplaced: list[Unplaced] = Field(default_factory=list)
    issues: list[Issue] = Field(default_factory=list)
    cioc_labels: dict[int, str] = Field(default_factory=dict)
    solver: str = "greedy"
    slot_remarks: dict[str, str] = Field(default_factory=dict)  # 'cioc/baseplate/channel' -> text

    def utilisation(self) -> dict:
        used = Counter(p.kind for p in self.placements)
        total = sum(len(c.baseplates) for c in self.layout.ciocs) * 12
        occupied = sum(p.kind != "spare_slot" for p in self.placements)
        return {"positions": total, **used, "occupied": occupied}
