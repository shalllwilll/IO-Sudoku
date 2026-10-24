from collections import Counter

from pydantic import BaseModel, Field

from app.core.model.issue import Issue
from app.core.model.layout import Layout
from app.core.model.signal import Signal


class Placement(BaseModel):
    """One occupied CHARM position. Everything not listed here is a spare slot."""

    cioc_no: int
    baseplate: int
    channel: int
    kind: str  # field | wired_spare | cabinet_alarm
    signal: Signal | None = None
    block_id: str | None = None
    pair: int | None = None
    io_type: str | None = None  # for wired spares: the type of the CHARM installed
    duty_class: str | None = None

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

    def utilisation(self) -> dict:
        used = Counter(p.kind for p in self.placements)
        total = sum(len(c.baseplates) for c in self.layout.ciocs) * 12
        return {"positions": total, **used, "occupied": len(self.placements)}
