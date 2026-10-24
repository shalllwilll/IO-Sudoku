from collections import defaultdict
from pathlib import Path

from pydantic import BaseModel, Field

from app.core.ingest.mapper import Mapping, map_columns
from app.core.ingest.normaliser import HeldOut, UnknownValue, ValueMapOverrides, normalise
from app.core.ingest.reader import ReadResult, read_workbook
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


def read_files(paths: list[str | Path], labels: dict[str, str] | None = None) -> list[ReadResult]:
    """Stage 1: read every sheet of every file (name order).

    `labels` maps a file's stored name to the name shown in issues and TQs (uploads are stored
    under generated names, so the client's name is only ever a label).
    """
    out: list[ReadResult] = []
    for path in sorted(Path(p) for p in paths):
        for res in read_workbook(path):
            label = (labels or {}).get(path.name)
            if label:
                res.summary.source_file = label
                for row in res.rows:
                    row.source_file = label
                for iss in res.issues:
                    iss.source_file = label
            out.append(res)
    return out


def map_files(
    reads: list[ReadResult], pack: Pack, confirmed: dict[str, dict[str, str]] | None = None
) -> dict[str, Mapping]:
    """Stage 2: map each sheet's columns; the key is 'file:sheet'."""
    out: dict[str, Mapping] = {}
    for res in reads:
        if res.rows:
            name = res.summary.source_file
            out[f"{name}:{res.summary.sheet}"] = map_columns(
                res.summary.columns,
                [r.values for r in res.rows],
                pack,
                (confirmed or {}).get(name),
            )
    return out


def merge_files(
    paths: list[str | Path],
    pack: Pack,
    confirmed: dict[str, dict[str, str]] | None = None,
    overrides: ValueMapOverrides | None = None,
) -> SignalSet:
    """Read, map, normalise, de-duplicate and validate several MDB files (name order)."""
    reads = read_files(paths)
    return build_signalset(reads, map_files(reads, pack, confirmed), pack, overrides)


def build_signalset(
    reads: list[ReadResult],
    mappings: dict[str, Mapping],
    pack: Pack,
    overrides: ValueMapOverrides | None = None,
) -> SignalSet:
    """Stage 3: normalise, de-duplicate and validate (identity is cable + pair)."""
    out = SignalSet()
    live: list[Signal] = []
    for res in reads:
        name = res.summary.source_file
        counts = FileCounts(source_file=name, sheet=res.summary.sheet, rows=res.summary.rows)
        out.files.append(counts)
        out.issues.extend(res.issues)
        if not res.rows:
            continue
        mapping = mappings[f"{name}:{res.summary.sheet}"]
        out.mappings[f"{name}:{res.summary.sheet}"] = mapping
        out.issues.extend(i.model_copy(update={"source_file": name}) for i in mapping.issues)
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
