from pydantic import BaseModel, Field

from app.core.model.issue import Issue
from app.core.model.signal import Signal


class Position(BaseModel):
    """One channel reserved by a cable: a real signal, wired spare, or protected spare slot."""

    pair: int
    kind: str  # field | wired_spare | spare_slot
    signal: Signal | None = None
    io_type: str | None = None  # wired spares take it from the block when packed


class Block(BaseModel):
    """The packing unit: all positions of one field cable, in pair order."""

    id: str
    cable: str
    declared_pairs: int | None = None
    positions: list[Position] = Field(default_factory=list)
    families: list[str] = Field(default_factory=list)  # segregation families present, sorted
    logic_numbers: list[str] = Field(default_factory=list)
    group: str | None = None

    @property
    def size(self) -> int:
        return len(self.positions)

    @property
    def signals(self) -> list[Signal]:
        return [p.signal for p in self.positions if p.signal is not None]

    @property
    def wired_spares(self) -> int:
        return sum(1 for p in self.positions if p.kind == "wired_spare")


class Group(BaseModel):
    id: str
    cables: list[str]
    positions: int
    signals: int


class Baseplate(BaseModel):
    name: str
    cioc_no: int
    n: int
    reserved: str | None = None  # alarm | spare


class Cioc(BaseModel):
    no: int
    name: str
    cabinet: int
    seq_in_cabinet: int
    controller: int
    baseplates: list[Baseplate]


class Controller(BaseModel):
    no: int
    name: str
    system_cabinet: str
    ciocs: list[int]


class Cabinet(BaseModel):
    no: int
    name: str
    ciocs: list[int]


class Layout(BaseModel):
    """A plan of empty slots; the packer fills it, so solvers stay interchangeable."""

    cabinets: list[Cabinet] = Field(default_factory=list)
    ciocs: list[Cioc] = Field(default_factory=list)
    controllers: list[Controller] = Field(default_factory=list)
    spare_baseplates_per_cabinet: int = 0
    class_plan: dict[str, int] = Field(default_factory=dict)  # segregation class -> CIOCs needed
    issues: list[Issue] = Field(default_factory=list)

    def cioc(self, no: int) -> Cioc:
        return self.ciocs[no - 1]
