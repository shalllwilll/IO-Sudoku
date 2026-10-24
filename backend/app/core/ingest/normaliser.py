import re
from collections import Counter
from pathlib import Path

from pydantic import BaseModel, Field
from rapidfuzz import process

from app.core.ingest.mapper import Mapping, split_grouping
from app.core.ingest.reader import RawRow, ReadResult
from app.core.model.issue import Issue
from app.core.model.pack import Pack
from app.core.model.signal import Signal

_FORMATION = re.compile(r"^\s*(\d+)\s*([PT])\s*X\s*\d", re.IGNORECASE)
_PAIR = re.compile(r"^\s*(?:pair|triad|quad|core)?\s*#?\s*(\d+)\s*$", re.IGNORECASE)
_BLANK = {"", "-", "--", "n/a", "na"}

# canonical fields copied as plain text from the raw row
_TEXT_FIELDS = [
    "tag", "signal_type", "signal_level", "instrument_type", "instrument_description",
    "cable", "cable_formation", "logic_number", "area", "operating_area", "technical_room",
    "equipment_name", "service", "service_short", "loop_name", "execution", "external_power", "contact_type",
    "old_tag", "revision", "change_type", "remarks", "status", "io_type_2",
]  # fmt: skip


class ValueMapOverrides(BaseModel):
    """Per-project, user-confirmed additions to the pack's value maps."""

    io_types: dict[str, str] = Field(default_factory=dict)
    duty_classes: dict[str, str] = Field(default_factory=dict)
    segregation: dict[str, str] = Field(default_factory=dict)  # code -> family

    @classmethod
    def load(cls, path: str | Path) -> "ValueMapOverrides":
        p = Path(path)
        return cls.model_validate_json(p.read_text()) if p.exists() else cls()

    def save(self, path: str | Path) -> None:
        Path(path).write_text(self.model_dump_json(indent=1))


class UnknownValue(BaseModel):
    field: str
    value: str
    count: int
    suggestion: str | None = None


class HeldOut(BaseModel):
    """A signal kept out of allocation. It is still listed so nothing is ever lost."""

    source_file: str
    source_row: int
    tag: str | None = None
    issues: list[Issue]
    signal: Signal | None = None


class NormalResult(BaseModel):
    signals: list[Signal] = Field(default_factory=list)
    held_out: list[HeldOut] = Field(default_factory=list)
    issues: list[Issue] = Field(default_factory=list)
    unknown_values: list[UnknownValue] = Field(default_factory=list)


def clean(v: object) -> str | None:
    s = "" if v is None else str(v).strip()
    return None if s.lower() in _BLANK else s


def parse_pair(v: object) -> int | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)) and float(v).is_integer():
        return int(v)
    m = _PAIR.match("" if v is None else str(v))
    return int(m.group(1)) if m else None


def parse_formation(v: object) -> tuple[int | None, bool]:
    """Return (declared pair count, ok). A blank cell is ok with no count; junk is not ok."""
    s = clean(v)
    if s is None:
        return None, True
    m = _FORMATION.match(s)
    return (int(m.group(1)), True) if m else (None, False)


def _suggest(value: str, known: list[str]) -> str | None:
    hit = process.extractOne(value.upper(), known, score_cutoff=60)
    return hit[0] if hit else None


def normalise(
    res: ReadResult,
    mapping: Mapping,
    pack: Pack,
    overrides: ValueMapOverrides | None = None,
) -> NormalResult:
    ov = overrides or ValueMapOverrides()
    vm = pack.valuemaps
    io_map = {k.upper(): v for k, v in {**vm.io_types, **ov.io_types}.items()}
    duty_map = {k.upper(): v for k, v in {**vm.duty_classes, **ov.duty_classes}.items()}
    seg_map = {c.code.upper(): c.family for c in pack.segregation.codes}
    seg_map.update({k.upper(): v for k, v in ov.segregation.items()})
    seps = vm.composite_separators
    unknown: Counter[tuple[str, str]] = Counter()
    out = NormalResult()

    def col(row: RawRow, field: str) -> object:
        c = mapping.column(field)
        return row.values.get(c) if c else None

    for row in res.rows:
        issues: list[Issue] = []
        loc = {"source_file": row.source_file, "source_row": row.source_row}
        sig = Signal(
            deleted=row.deleted,
            out_of_scope=row.out_of_scope,
            source_file=row.source_file,
            source_row=row.source_row,
        )
        for f in _TEXT_FIELDS:
            setattr(sig, f, clean(col(row, f)))
        if pack.schema_.cabinet_alarm_service_regex and sig.service:
            sig.cabinet_alarm = bool(
                re.search(pack.schema_.cabinet_alarm_service_regex, sig.service)
            )
        mapped_cols = {m.column for m in mapping.matches.values()}
        sig.extras = {k: v for k, v in row.values.items() if k not in mapped_cols and v is not None}

        # IO type: base type plus optional duty (DO-SOV)
        raw_io = clean(col(row, "io_type"))
        hold = False
        if raw_io:
            base, duty = raw_io.upper(), None
            if base not in io_map:
                for sep in seps:
                    head, found, tail = base.partition(sep)
                    if found and head in io_map:
                        base, duty = head, tail.strip() or None
                        break
            if base in io_map:
                sig.io_type, sig.duty = io_map[base], duty
                if sig.io_type == "DOR":
                    key = (duty or "").upper()
                    text = f"{sig.instrument_description or ''} {sig.instrument_type or ''}".upper()
                    keyword = next((k for k in vm.duty_keywords if not key and k in text), None)
                    if key in duty_map:
                        sig.duty_class = duty_map[key]
                    elif keyword:
                        sig.duty_class = vm.duty_keywords[keyword]
                    else:
                        sig.duty_class = vm.default_duty_class
                        if duty:
                            unknown[("duty", duty)] += 1
                            issues.append(
                                Issue(
                                    code="TQ-VALUE",
                                    severity="warning",
                                    message=f"unknown DOR duty '{duty}'; allocated as "
                                    f"{vm.default_duty_class} DOR",
                                    **loc,
                                )
                            )
            else:
                unknown[("io_type", raw_io)] += 1
                hold = True
                issues.append(
                    Issue(
                        code="TQ-VALUE",
                        severity="blocking",
                        message=f"unknown IO type '{raw_io}'; row held out",
                        **loc,
                    )
                )

        # group and segregation
        if mapping.grouping_mode == "combined":
            sig.group, seg = split_grouping(col(row, "io_grouping"), pack)
        else:
            g, seg = clean(col(row, "group")), clean(col(row, "segregation"))
            sig.group, seg = g, (seg.upper() if seg else None)
        if seg:
            sig.segregation = seg
            if seg in seg_map:
                sig.segregation_family = seg_map[seg]
            else:
                sig.segregation_family = f"UNKNOWN:{seg}"
                unknown[("segregation", seg)] += 1
                issues.append(
                    Issue(
                        code="TQ-VALUE",
                        severity="warning",
                        message=f"unknown segregation code '{seg}'; given its own CIOC",
                        **loc,
                    )
                )

        # pair and cable formation
        raw_pair = col(row, "pair")
        sig.pair = parse_pair(raw_pair)
        sig.pair_label = clean(raw_pair)
        sig.cable_pairs, ok = parse_formation(sig.cable_formation)
        if not ok:
            issues.append(
                Issue(
                    code="TQ-DATA",
                    severity="warning",
                    message=f"cannot read the pair count from cable formation "
                    f"'{sig.cable_formation}'",
                    **loc,
                )
            )

        if hold:
            out.held_out.append(
                HeldOut(
                    source_file=row.source_file,
                    source_row=row.source_row,
                    tag=clean(col(row, "tag")),
                    issues=issues,
                )
            )
        else:
            out.signals.append(sig)
        out.issues.extend(issues)

    known = {
        "io_type": sorted(io_map),
        "duty": sorted(duty_map),
        "segregation": sorted(seg_map),
    }
    out.unknown_values = [
        UnknownValue(field=f, value=v, count=n, suggestion=_suggest(v, known[f]))
        for (f, v), n in sorted(unknown.items())
    ]
    return out
