from collections import defaultdict
from pathlib import Path

from pydantic import BaseModel, Field

from app.core.ingest.mapper import Mapping, map_columns
from app.core.ingest.normaliser import HeldOut, UnknownValue, ValueMapOverrides, normalise
from app.core.ingest.reader import read_workbook
from app.core.ingest.validate import validate
from app.core.model.issue import Issue
from app.core.model.pack import Pack
from app.core.model.signal import Signal


class FileCounts(BaseModel):
    source_file: str
    sheet: str | None = None
    rows: int = 0
    allocatable: int = 0
    held_out: int = 0
    deleted: int = 0
    out_of_scope: int = 0
    superseded: int = 0


class SignalSet(BaseModel):
    signals: list[Signal] = Field(default_factory=list)
    held_out: list[HeldOut] = Field(default_factory=list)
    deleted: list[Signal] = Field(default_factory=list)
    out_of_scope: list[Signal] = Field(default_factory=list)
    superseded: list[Signal] = Field(default_factory=list)
    issues: list[Issue] = Field(default_factory=list)
    unknown_values: list[UnknownValue] = Field(default_factory=list)
    mappings: dict[str, Mapping] = Field(default_factory=dict)
    files: list[FileCounts] = Field(default_factory=list)

    @property
    def total_rows(self) -> int:
        return sum(f.rows for f in self.files)

    @property
    def accounted(self) -> int:
        return (
            len(self.signals)
            + len(self.held_out)
            + len(self.deleted)
            + len(self.out_of_scope)
            + len(self.superseded)
        )

    @property
    def blocking(self) -> bool:
        return any(i.severity == "blocking" for i in self.issues)


def merge_files(
    paths: list[str | Path],
    pack: Pack,
    confirmed: dict[str, dict[str, str]] | None = None,
    overrides: ValueMapOverrides | None = None,
) -> SignalSet:
    """Read, map, normalise, de-duplicate and validate several MDB files (name order)."""
    out = SignalSet()
    live: list[Signal] = []
    for path in sorted(Path(p) for p in paths):
        for res in read_workbook(path):
            counts = FileCounts(
                source_file=path.name, sheet=res.summary.sheet, rows=res.summary.rows
            )
            out.files.append(counts)
            out.issues.extend(res.issues)
            if not res.rows:
                continue
            mapping = map_columns(
                res.summary.columns,
                [r.values for r in res.rows],
                pack,
                (confirmed or {}).get(path.name),
            )
            out.mappings[f"{path.name}:{res.summary.sheet}"] = mapping
            out.issues.extend(
                i.model_copy(update={"source_file": path.name}) for i in mapping.issues
            )
            norm = normalise(res, mapping, pack, overrides)
            out.issues.extend(norm.issues)
            out.unknown_values.extend(norm.unknown_values)
            out.held_out.extend(norm.held_out)
            counts.held_out += len(norm.held_out)
            for s in norm.signals:
                if s.deleted:
                    out.deleted.append(s)
                    counts.deleted += 1
                elif s.out_of_scope:
                    out.out_of_scope.append(s)
                    counts.out_of_scope += 1
                else:
                    live.append(s)

    # identity is cable + pair; the later row (files in name order) wins
    seen: dict[tuple[str, int], Signal] = {}
    for s in live:
        if s.cable is None or s.pair is None:
            continue
        key = (s.cable, s.pair)
        if key in seen:
            old = seen[key]
            out.superseded.append(old)
            out.issues.append(
                Issue(
                    code="TQ-DATA",
                    severity="warning",
                    message=f"cable {s.cable} pair {s.pair} appears in {old.source_file} row "
                    f"{old.source_row} ('{old.tag}') and {s.source_file} row {s.source_row} "
                    f"('{s.tag}'); the later one is used",
                    source_file=s.source_file,
                    source_row=s.source_row,
                )
            )
        seen[key] = s
    dropped = {id(s) for s in out.superseded}
    live = [s for s in live if id(s) not in dropped]
    sup_by_file: dict[str, int] = defaultdict(int)
    for s in out.superseded:
        sup_by_file[s.source_file or ""] += 1

    out.signals, held, vissues = validate(live, pack)
    out.held_out.extend(held)
    out.issues.extend(vissues)

    for fc in out.files:
        fc.superseded = sup_by_file.get(fc.source_file, 0)
        fc.held_out += sum(1 for h in held if h.source_file == fc.source_file)  # validation holds
        fc.allocatable = sum(1 for s in out.signals if s.source_file == fc.source_file)
    return out
