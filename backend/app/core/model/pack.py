import hashlib
import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, ValidationError


class HardwareRow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    match: dict[str, str | list[str]]
    charm: str | None = None
    charm_name: str | None = None
    tb: str | None = None
    tb_terminals: str | None = None
    loop_typical: str | None = None


class Hardware(BaseModel):
    """Ordered decision table: the first row whose match fits wins."""

    model_config = ConfigDict(extra="forbid")
    rows: list[HardwareRow]


class NamingItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    template: str
    example: str | None = None


class Naming(BaseModel):
    model_config = ConfigDict(extra="forbid")
    placeholders: list[str]
    system_cabinet: NamingItem
    controller: NamingItem
    marshalling_cabinet: NamingItem
    cioc: NamingItem
    baseplate: NamingItem


class SegregationCode(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str
    family: str


class Segregation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    codes: list[SegregationCode]
    unknown_policy: str = "own_cioc"


class Capacity(BaseModel):
    model_config = ConfigDict(extra="forbid")
    channels_per_baseplate: int
    baseplates_per_cioc: int
    ciocs_per_cabinet: int
    ciocs_per_controller: int
    alarm_baseplate_index: int
    spare_percent: int
    spare_rounding: str


class Schema(BaseModel):
    model_config = ConfigDict(extra="forbid")
    required: list[str]
    optional: list[str]
    internal_cable_markers: list[str] = []


class Thresholds(BaseModel):
    model_config = ConfigDict(extra="forbid")
    accept: float
    ask: float
    tie_margin: float


class Aliases(BaseModel):
    model_config = ConfigDict(extra="forbid")
    thresholds: Thresholds
    fields: dict[str, list[str]]


class ValueMaps(BaseModel):
    model_config = ConfigDict(extra="forbid")
    io_types: dict[str, str]
    duty_classes: dict[str, str]
    composite_separators: list[str]
    default_duty_class: str


class PackError(ValueError):
    pass


_PARTS = {
    "hardware.json": ("hardware", Hardware),
    "naming.json": ("naming", Naming),
    "segregation.json": ("segregation", Segregation),
    "capacity.json": ("capacity", Capacity),
    "schema.json": ("schema", Schema),
    "aliases.json": ("aliases", Aliases),
    "valuemaps.json": ("valuemaps", ValueMaps),
}


class Pack(BaseModel):
    hardware: Hardware
    naming: Naming
    segregation: Segregation
    capacity: Capacity
    schema_: Schema
    aliases: Aliases
    valuemaps: ValueMaps
    hash: str

    @classmethod
    def load(cls, folder: str | Path) -> "Pack":
        folder = Path(folder)
        parts: dict[str, object] = {}
        raw: dict[str, object] = {}
        for fname, (key, model) in _PARTS.items():
            try:
                data = json.loads((folder / fname).read_text())
                parts[key] = model.model_validate(data)
            except FileNotFoundError as e:
                raise PackError(f"{fname}: file missing") from e
            except json.JSONDecodeError as e:
                raise PackError(f"{fname}: invalid JSON ({e})") from e
            except ValidationError as e:
                fields = ", ".join(".".join(map(str, err["loc"])) for err in e.errors())
                raise PackError(f"{fname}: invalid field(s) {fields}") from e
            raw[fname] = data
        canonical = json.dumps(raw, sort_keys=True, separators=(",", ":"))
        digest = hashlib.sha256(canonical.encode()).hexdigest()
        return cls(
            hardware=parts["hardware"],
            naming=parts["naming"],
            segregation=parts["segregation"],
            capacity=parts["capacity"],
            schema_=parts["schema"],
            aliases=parts["aliases"],
            valuemaps=parts["valuemaps"],
            hash=digest,
        )


if __name__ == "__main__":
    import sys

    print(Pack.load(sys.argv[1] if len(sys.argv) > 1 else "packs/default").hash)
