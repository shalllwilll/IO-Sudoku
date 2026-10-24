"""Generators of MDB-like workbooks with awkward features. Invented data only; fully seeded.

`MdbSpec` describes a plant; `write_mdb` turns it into one or more .xlsx files. The same spec
rendered with a different header style, row order or file split must allocate identically,
which is what test_metamorphic.py checks.
"""

import json
import random
from dataclasses import asdict, dataclass
from pathlib import Path

from hypothesis import strategies as st
from openpyxl import Workbook

FIXTURES = Path(__file__).parent / "fixtures"

# column header per field, two spellings the default alias list accepts
HEADERS = {
    "default": {
        "tag": "Tag No", "io": "IO Type", "cable": "Cable No", "pair": "Pair No",
        "seg": "Segregation", "group": "Group", "logic": "Logic Number",
        "signal_type": "Signal Type", "level": "Signal Level", "status": "Status",
        "formation": "Cable Formation", "combined": "IO Grouping",
    },
    "alt": {
        "tag": "Tag Number", "io": "I/O Type Name", "cable": "Multipair Cable No.",
        "pair": "Pair Number", "seg": "Segregation Code", "group": "IO Group",
        "logic": "Logic No", "signal_type": "Signal Type", "level": "Signal Level",
        "status": "Tag Status", "formation": "Cable Size", "combined": "I/O Grouping",
    },
}  # fmt: skip
OPTIONAL = ("group", "logic", "formation", "status", "level", "signal_type")


@dataclass(frozen=True)
class CableSpec:
    name: str
    used: int
    declared: int
    io: str = "DI"  # DI | DO | AI | AO (the value maps turn them into DIR/DOR/AIR/AOR)
    seg: str | None = None
    group: str | None = None
    logic: str | None = None
    duty: str | None = None  # appended to a DO type when composite_io is on (DO-SOV)


@dataclass(frozen=True)
class MdbSpec:
    cables: tuple[CableSpec, ...]
    header_style: str = "default"
    composite_io: bool = False  # "DO-SOV" instead of a separate duty
    combined_grouping: bool = False  # one "IO Grouping" column instead of Group + Segregation
    drop: tuple[str, ...] = ()  # optional fields left out of the sheet
    extra_columns: int = 0  # unknown columns with junk in them
    files: int = 1
    shuffle_seed: int | None = None
    blank_rows: int = 0

    def tags(self) -> list[str]:
        return [tag_of(c, p) for c in self.cables for p in range(1, c.used + 1)]


def tag_of(c: CableSpec, pair: int) -> str:
    return f"{c.name}-{pair:02d}"


def _io_cell(spec: MdbSpec, c: CableSpec) -> str:
    if spec.composite_io and c.io == "DO" and c.duty:
        return f"DO-{c.duty}"
    return c.io


def columns(spec: MdbSpec) -> list[str]:
    h = HEADERS[spec.header_style]
    cols = ["tag", "io", "cable", "pair"]
    if spec.combined_grouping:
        cols.append("combined")
    else:
        cols += ["seg", "group"]
    cols += ["logic", "signal_type", "level", "status", "formation"]
    return [c for c in cols if c not in spec.drop and c in h]


def rows_of(spec: MdbSpec) -> list[dict[str, object]]:
    out = []
    for c in spec.cables:
        needs_signal = c.io in ("AI", "AO")
        for p in range(1, c.used + 1):
            seg = c.seg or "-"
            grouping = seg
            if c.group and c.seg:
                grouping = f"{c.seg}-{c.group}"
            out.append(
                {
                    "tag": tag_of(c, p), "io": _io_cell(spec, c), "cable": c.name, "pair": p,
                    "seg": seg, "group": c.group, "combined": grouping, "logic": c.logic,
                    "signal_type": "4-20 ma" if needs_signal else None,
                    "level": "2-Wire" if needs_signal else None, "status": "New",
                    "formation": f"{c.declared:02d}PX1MM2",
                }
            )  # fmt: skip
    return out


def write_mdb(spec: MdbSpec, folder: Path, stem: str = "mdb") -> list[Path]:
    """Write the plant as `spec.files` workbooks; row order and blank rows follow the spec."""
    folder.mkdir(parents=True, exist_ok=True)
    h = HEADERS[spec.header_style]
    cols = columns(spec)
    rows = rows_of(spec)
    if spec.shuffle_seed is not None:
        random.Random(spec.shuffle_seed).shuffle(rows)
    paths = []
    n = max(1, spec.files)
    for f in range(n):
        wb = Workbook()
        ws = wb.active
        extra = [f"Vendor Note {i + 1}" for i in range(spec.extra_columns)]
        header = [h[c] for c in cols] + extra
        ws.append(header)
        for i, r in enumerate(rows[f::n]):
            cells = [r[c] for c in cols]
            ws.append(cells + [f"n{i}" for _ in extra])
        for _ in range(spec.blank_rows):
            ws.append([None] * len(header))
        path = folder / f"{stem}{f + 1}.xlsx"
        wb.save(path)
        paths.append(path)
    return paths


# -- Hypothesis strategies --------------------------------------------------------------------

io_st = st.sampled_from(["DI", "DI", "DO", "AI", "AO"])
seg_st = st.sampled_from([None, None, "A", "B", "C", "A-CONTROL"])
group_st = st.sampled_from([None, None, "G1", "G2", "G3"])
logic_st = st.sampled_from([None, None, "L1", "L2"])
duty_st = st.sampled_from([None, "SOV", "RELAY", "ALARM"])


@st.composite
def cable_specs(draw, index: int = 0):
    used = draw(st.integers(1, 26))
    declared = used + draw(st.integers(0, 4))
    io = draw(io_st)
    return CableSpec(
        name=f"CBL-{index:03d}", used=used, declared=declared, io=io, seg=draw(seg_st),
        group=draw(group_st), logic=draw(logic_st), duty=draw(duty_st) if io == "DO" else None,
    )  # fmt: skip


@st.composite
def mdb_specs(draw, max_cables: int = 7, awkward: bool = True):
    n = draw(st.integers(1, max_cables))
    cables = tuple(draw(cable_specs(i)) for i in range(n))
    if not awkward:
        return MdbSpec(cables)
    return MdbSpec(
        cables,
        header_style=draw(st.sampled_from(["default", "alt"])),
        composite_io=draw(st.booleans()),
        combined_grouping=draw(st.booleans()),
        drop=tuple(draw(st.lists(st.sampled_from(OPTIONAL), unique=True, max_size=3))),
        extra_columns=draw(st.integers(0, 2)),
        files=draw(st.integers(1, 3)),
        shuffle_seed=draw(st.one_of(st.none(), st.integers(0, 10**6))),
        blank_rows=draw(st.integers(0, 2)),
    )  # fmt: skip


# -- the fixture set --------------------------------------------------------------------------


def save_fixture(name: str, spec: MdbSpec) -> Path:
    FIXTURES.mkdir(exist_ok=True)
    path = FIXTURES / f"{name}.json"
    path.write_text(json.dumps(asdict(spec), indent=1, sort_keys=True) + "\n")
    return path


def load_fixture(name: str) -> MdbSpec:
    d = json.loads((FIXTURES / f"{name}.json").read_text())
    d["cables"] = tuple(CableSpec(**c) for c in d["cables"])
    d["drop"] = tuple(d.get("drop", ()))
    return MdbSpec(**d)
