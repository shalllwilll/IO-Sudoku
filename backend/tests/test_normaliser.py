from collections import Counter

import pytest

from app.core.ingest.mapper import map_columns
from app.core.ingest.normaliser import (
    ValueMapOverrides,
    normalise,
    parse_formation,
    parse_pair,
)
from app.core.ingest.reader import FileSummary, RawRow, ReadResult
from app.core.model.pack import Pack

HDR = ["Tag No", "IO Type", "Cable No", "Pair No", "Segregation"]


@pytest.fixture
def pack(pack_dir):
    return Pack.load(pack_dir)


def run(pack, rows, overrides=None):
    raw = [
        RawRow(values=dict(zip(HDR, r, strict=True)), source_file="t.xlsx", source_row=i + 2)
        for i, r in enumerate(rows)
    ]
    res = ReadResult(summary=FileSummary(source_file="t.xlsx"), rows=raw)
    return normalise(res, map_columns(HDR, [r.values for r in raw], pack), pack, overrides)


def row(io, seg="-", cable="C1", pair=1):
    return ["T1", io, cable, f"Pair {pair}", seg]


def test_basic_map(pack):
    r = run(pack, [row("AI"), row("AO"), row("DI"), row("DO")])
    assert [s.io_type for s in r.signals] == ["AIR", "AOR", "DIR", "DOR"]


def test_composite_duty(pack):
    (s,) = run(pack, [row("DO-SOV")]).signals
    assert (s.io_type, s.duty, s.duty_class) == ("DOR", "SOV", "high_current")


def test_case_and_spacing(pack):
    assert [s.io_type for s in run(pack, [row(" ai "), row("Ai")]).signals] == ["AIR", "AIR"]


def test_unknown_io_type_held_out(pack):
    r = run(pack, [row("XYZ"), row("AI")])
    assert len(r.signals) == 1 and len(r.held_out) == 1
    assert r.held_out[0].issues[0].code == "TQ-VALUE"
    assert r.unknown_values[0].value == "XYZ"


def test_unknown_segregation_own_cioc(pack):
    r = run(pack, [row("AI", seg="Q")])
    (s,) = r.signals
    assert s.segregation_family == "UNKNOWN:Q"
    assert [i.code for i in r.issues] == ["TQ-SEG"]


def test_known_segregation_family(pack):
    (s,) = run(pack, [row("AI", seg="A-CONTROL")]).signals
    assert s.segregation == "A-CONTROL" and s.segregation_family == "A"


def test_unknown_duty_defaults_with_tq(pack):
    r = run(pack, [row("DO-Klaxon")])
    assert r.signals[0].duty_class == "standard"
    assert any(i.code == "TQ-VALUE" for i in r.issues)


def test_new_duty_word_via_value_map(pack):
    ov = ValueMapOverrides(duty_classes={"Klaxon": "high_current"})
    r = run(pack, [row("DO-Klaxon")], ov)
    assert r.signals[0].duty_class == "high_current" and not r.issues


def test_formation_and_pair_parsing():
    assert parse_formation("24PX1MM2/FR/IND&OS/ARM/NIS") == (24, True)
    assert parse_formation("06PX2.5MM2/FR/ARM/NIS") == (6, True)
    assert parse_formation("1TX1.3MM2/FR/OS/NIS") == (1, True)
    assert parse_formation("ABC") == (None, False)
    assert parse_formation("-") == (None, True)
    assert parse_pair("Pair 12") == 12 and parse_pair("Triad 1") == 1 and parse_pair(7) == 7
    assert parse_pair("-") is None


def test_sample_counts(pack, sample_mdb_path):
    from app.core.ingest.reader import read_workbook

    (res,) = read_workbook(sample_mdb_path)
    m = map_columns(res.summary.columns, [r.values for r in res.rows], pack)
    out = normalise(res, m, pack)
    assert len(out.signals) + len(out.held_out) == res.summary.rows == 190
    assert not out.held_out and not out.unknown_values
    c = Counter(s.io_type for s in out.signals)
    assert c == {"AIR": 76, "DIR": 49, "DOR": 41, "AOR": 24}
    assert sum(1 for s in out.signals if s.group is None) == 190
    assert Counter(s.segregation for s in out.signals if s.segregation)["A-CONTROL"] == 5
    assert all(s.cable_pairs for s in out.signals if s.cable and s.cable.startswith("320-C"))
