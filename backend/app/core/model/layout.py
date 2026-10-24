from pydantic import BaseModel, Field

from app.core.model.signal import Signal


class Position(BaseModel):
    """One CHARM position a block needs: a real signal or a wired spare pair."""

    pair: int
    kind: str  # field | wired_spare
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
