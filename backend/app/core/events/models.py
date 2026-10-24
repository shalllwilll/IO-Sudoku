"""One pydantic model per event type; the `type` literal is the SSE event name."""

from typing import ClassVar, Literal

from pydantic import BaseModel, Field

from app.core.model.layout import Group


class EventModel(BaseModel):
    type: ClassVar[str]


class RunStarted(EventModel):
    type: ClassVar[str] = "run.started"
    project_id: str
    uploads: int
    params: dict = Field(default_factory=dict)


class StageStarted(EventModel):
    type: ClassVar[str] = "stage.started"
    stage: str


class StageFinished(EventModel):
    type: ClassVar[str] = "stage.finished"
    stage: str
    reused: bool
    seconds: float = 0.0


class GroupFormed(EventModel):
    type: ClassVar[str] = "group.formed"
    group: Group


class PlacementLite(BaseModel):
    cioc_no: int
    baseplate: int
    channel: int
    kind: str
    tag: str | None = None
    block_id: str | None = None


class PlacementBatch(EventModel):
    """Placements are sent in batches so a 2,000-signal run is a few dozen events."""

    type: ClassVar[str] = "placement"
    batch: int
    count: int
    placements: list[PlacementLite]


class Rejection(EventModel):
    type: ClassVar[str] = "rejection"
    code: str
    message: str
    signals: int
    keys: list[str] = Field(default_factory=list)  # first few signal keys


class SpareAssigned(EventModel):
    type: ClassVar[str] = "spare.assigned"
    wired_spare_pairs: int
    spare_slots: int
    by_io_type: dict[str, dict[str, int]] = Field(default_factory=dict)


class SolverStatus(EventModel):
    type: ClassVar[str] = "solver.status"
    solver: str  # cpsat | greedy | tq | rules | cache
    status: str
    detail: str = ""


class FallbackTriggered(EventModel):
    type: ClassVar[str] = "fallback.triggered"
    solver: str
    reason: str


class TqRaised(EventModel):
    type: ClassVar[str] = "tq.raised"
    id: str
    code: str
    severity: Literal["blocking", "assumed", "info"]
    category: str
    message: str
    signals: int


class ValidationResult(EventModel):
    type: ClassVar[str] = "validation.result"
    ok: bool
    violations: int
    items: list[str] = Field(default_factory=list)


class RunFinished(EventModel):
    type: ClassVar[str] = "run.finished"
    status: Literal["finished"] = "finished"
    allocated: int = 0
    held_out: int = 0
    tqs: int = 0
    solver: str = ""


class ErrorEvent(EventModel):
    type: ClassVar[str] = "error"
    code: str
    message: str


EVENT_MODELS: dict[str, type[EventModel]] = {
    m.type: m
    for m in (
        RunStarted, StageStarted, StageFinished, GroupFormed, PlacementBatch, Rejection,
        SpareAssigned, SolverStatus, FallbackTriggered, TqRaised, ValidationResult,
        RunFinished, ErrorEvent,
    )
}  # fmt: skip
TERMINAL = {RunFinished.type, ErrorEvent.type}


def parse_event(type_: str, data: dict) -> EventModel:
    if type_ not in EVENT_MODELS:
        raise ValueError(f"unknown event type '{type_}'")
    return EVENT_MODELS[type_].model_validate(data)
