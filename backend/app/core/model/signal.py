from pydantic import BaseModel, Field


class Signal(BaseModel):
    """Canonical signal record. Anything the pack does not name rides along in `extras`."""

    tag: str | None = None
    io_type: str | None = None
    io_type_2: str | None = None
    duty: str | None = None
    duty_class: str | None = None
    signal_type: str | None = None
    signal_level: str | None = None
    instrument_type: str | None = None
    instrument_description: str | None = None
    cable: str | None = None
    cable_formation: str | None = None
    cable_pairs: int | None = None
    pair: int | None = None
    group: str | None = None
    segregation: str | None = None
    segregation_family: str | None = None
    logic_number: str | None = None
    area: str | None = None
    operating_area: str | None = None
    technical_room: str | None = None
    equipment_name: str | None = None
    service: str | None = None
    loop_name: str | None = None
    execution: str | None = None
    external_power: str | None = None
    contact_type: str | None = None
    old_tag: str | None = None
    revision: str | None = None
    change_type: str | None = None
    remarks: str | None = None
    status: str | None = None
    internal_wiring: bool = False
    deleted: bool = False
    out_of_scope: bool = False
    source_file: str | None = None
    source_row: int | None = None
    extras: dict[str, object] = Field(default_factory=dict)
