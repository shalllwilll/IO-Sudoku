from pydantic import BaseModel


class Signal(BaseModel):
    """Canonical signal record; every field except tag/io_type/cable/pair is optional."""

    tag: str
    io_type: str
    duty: str | None = None
    signal_type: str | None = None
    signal_level: str | None = None
    instrument_type: str | None = None
    cable: str
    pair: int
    group: str | None = None
    segregation: str | None = None
    logic_number: str | None = None
    area: str | None = None
    equipment_name: str | None = None
    service: str | None = None
    revision: str | None = None
    change_type: str | None = None
    status: str | None = None
    source_file: str | None = None
    source_row: int | None = None
