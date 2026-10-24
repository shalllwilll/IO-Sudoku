import random

from app.core.ingest.mapper import (
    load_confirmed,
    map_columns,
    save_mapping,
    split_grouping,
)
from app.core.ingest.reader import read_workbook
from app.core.model.pack import Pack

REQ = ["tag", "io_type", "cable", "pair"]


def _pack(pack_dir):
    return Pack.load(pack_dir)


def _sample(sample_mdb_path):
    (res,) = read_workbook(sample_mdb_path)
    return res.summary.columns, [r.values for r in res.rows]


def test_sample_maps(pack_dir, sample_mdb_path):
    cols, rows = _sample(sample_mdb_path)
    m = map_columns(cols, rows, _pack(pack_dir))
    for f in REQ:
        assert m.matches[f].confidence >= 0.90, f
    assert m.column("tag") == "Tag Number"
    assert m.column("io_type") == "I/O Type Name"
    assert m.column("cable") == "Multipair Cable No."
    assert m.column("cable_formation") == "Multi-cable / Cable"
    assert m.column("pair") == "Pair Number"
    assert m.grouping_mode == "combined" and m.column("io_grouping") == "IO Grouping"
    assert not m.blocking


def test_renamed_columns_same_mapping(pack_dir, sample_mdb_path):
    cols, rows = _sample(sample_mdb_path)
    pack = _pack(pack_dir)
    base = map_columns(cols, rows, pack)
    ren = {
        "Tag Number": "Instrument Tag",
        "I/O Type Name": "IO Type",
        "Multipair Cable No.": "Field Cable No",
        "Pair Number": "Cable Pair",
    }
    cols2 = [ren.get(c, c) for c in cols]
    rows2 = [{ren.get(k, k): v for k, v in r.items()} for r in rows]
    m = map_columns(cols2, rows2, pack)
    for f in REQ:
        assert m.column(f) == ren[base.column(f)]


def test_reordered_columns(pack_dir, sample_mdb_path):
    cols, rows = _sample(sample_mdb_path)
    pack = _pack(pack_dir)
    shuffled = cols[:]
    random.Random(1).shuffle(shuffled)
    assert map_columns(shuffled, rows, pack).confirmed() == map_columns(cols, rows, pack).confirmed()


def test_deterministic(pack_dir, sample_mdb_path):
    cols, rows = _sample(sample_mdb_path)
    a = map_columns(cols, rows, _pack(pack_dir))
    b = map_columns(cols, rows, _pack(pack_dir))
    assert a.model_dump() == b.model_dump()


def test_two_column_shape(pack_dir):
    hdr = ["Tag No", "IO Type", "Cable No", "Pair No", "Group", "Segregation"]
    m = map_columns(hdr, [], _pack(pack_dir))
    assert m.grouping_mode == "two_column"
    assert m.column("group") == "Group" and m.column("segregation") == "Segregation"


def test_ambiguous_io_type(pack_dir):
    hdr = ["Tag No", "IO Type", "I/O Type Name", "Cable No", "Pair No"]
    m = map_columns(hdr, [], _pack(pack_dir))
    assert any(i.code == "TQ-MAP" and "io_type" in i.message for i in m.issues)
    assert m.column("io_type") == "IO Type"
    assert not m.blocking


def test_missing_required_is_blocking(pack_dir):
    m = map_columns(["Tag No", "IO Type", "Pair No"], [], _pack(pack_dir))
    assert m.blocking
    assert any("cable" in i.message and i.severity == "blocking" for i in m.issues)


def test_confirmed_mapping_roundtrip(pack_dir, tmp_path):
    pack = _pack(pack_dir)
    hdr = ["Tag No", "IO Type", "Cable No", "Pair No", "Weird"]
    m = map_columns(hdr, [], pack, confirmed={"service": "Weird"})
    assert m.column("service") == "Weird"
    p = tmp_path / "map.json"
    save_mapping(p, m)
    assert map_columns(hdr, [], pack, confirmed=load_confirmed(p)).confirmed() == m.confirmed()


def test_split_grouping(pack_dir):
    pack = _pack(pack_dir)
    assert split_grouping("A-CONTROL", pack) == (None, "A-CONTROL")
    assert split_grouping("B", pack) == (None, "B")
    assert split_grouping("-", pack) == (None, None)
    assert split_grouping("A-FEED1", pack) == ("FEED1", "A")
    assert split_grouping("Q", pack) == (None, "Q")
