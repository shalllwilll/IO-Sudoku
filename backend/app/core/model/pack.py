import hashlib
import json
import re
from pathlib import Path

from pydantic import BaseModel, ConfigDict, ValidationError, model_validator


class HardwareRow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    match: dict[str, str | bool | list[str]] = {}
    charm: str | None = None
    charm_name: str | None = None
    tb: str | None = None
    tb_name: str | None = None
    tb_terminals: str | None = None  # TB1,TB2,TB3 separated by commas; '-' means unused
    loop_typical: str | None = None


class Hardware(BaseModel):
    """Ordered decision table: the first row whose match fits wins."""

    model_config = ConfigDict(extra="forbid")
    rows: list[HardwareRow]
    spare_slot: HardwareRow


class NamingItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    template: str
    example: str | None = None


KINDS = ("system_cabinet", "controller", "marshalling_cabinet", "cioc", "baseplate")
_PLACEHOLDER = re.compile(r"\{([^{}]*)\}")


class Naming(BaseModel):
    model_config = ConfigDict(extra="forbid")
    placeholders: list[str]
    padding: dict[str, int] = {}
    default_area: str = "AR1"
    default_unit: str = "100"
    system_cabinet: NamingItem
    controller: NamingItem
    marshalling_cabinet: NamingItem
    cioc: NamingItem
    baseplate: NamingItem
    wired_spare_tag: NamingItem | None = None

    @model_validator(mode="after")
    def _templates_use_known_placeholders(self) -> "Naming":
        for kind in KINDS + ("wired_spare_tag",):
            item = getattr(self, kind)
            if item is None:
                continue
            for name in _PLACEHOLDER.findall(item.template):
                if name not in self.placeholders:
                    raise ValueError(f"{kind} template uses unknown placeholder '{{{name}}}'")
        return self


class SegregationCode(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str
    family: str


class Segregation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    codes: list[SegregationCode]
    unknown_policy: str = "own_cioc"
    conflicts: list[list[str]] = [["A", "B"]]


class Capacity(BaseModel):
    model_config = ConfigDict(extra="forbid")
    channels_per_baseplate: int
    baseplates_per_cioc: int
    ciocs_per_cabinet: int
    ciocs_per_controller: int
    alarm_baseplate_index: int
    spare_percent: int
    spare_rounding: str
    controllers_per_system_cabinet: int = 1
    max_cabinets: int | None = None
    cpsat_seed: int = 1
    cpsat_deterministic_time: float = 10.0  # primary stop: reproducible across machines
    cpsat_wall_seconds: float = 60.0  # backstop only; never the normal stop
    cpsat_max_options: int = 30000  # larger models keep the greedy answer (see docs/benchmark.md)
    # rule miner: how much evidence a candidate needs before it is shown as a rule
    miner_min_support: int = 8  # signals behind each side of a candidate
    miner_min_confidence: float = 0.95
    miner_min_signals: int = 30  # a smaller reference only yields low-confidence candidates
    miner_min_groups: int = 3  # groups that must be tested for a co-location candidate
    # QIGA third stage: a fixed budget, never a clock
    qiga_seed: int = 1
    qiga_population: int = 16
    qiga_generations: int = 40
    qiga_max_blocks: int = 400  # bigger instances skip the stage (docs/benchmark.md)


class Schema(BaseModel):
    model_config = ConfigDict(extra="forbid")
    required: list[str]
    optional: list[str]
    internal_cable_markers: list[str] = []
    cabinet_alarm_service_regex: str | None = None


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
    duty_keywords: dict[str, str] = {}


class RulePresets(BaseModel):
    model_config = ConfigDict(extra="forbid")
    default_preset: str
    presets: dict[str, list[dict]]


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
    "rules.json": ("rules", RulePresets),
}


class Pack(BaseModel):
    hardware: Hardware
    naming: Naming
    segregation: Segregation
    capacity: Capacity
    schema_: Schema
    aliases: Aliases
    valuemaps: ValueMaps
    rules: RulePresets
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
                fields = ", ".join(
                    ".".join(map(str, err["loc"])) or err["msg"].removeprefix("Value error, ")
                    for err in e.errors()
                )
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
            rules=parts["rules"],
            hash=digest,
        )


if __name__ == "__main__":
    import sys

    print(Pack.load(sys.argv[1] if len(sys.argv) > 1 else "packs/default").hash)
