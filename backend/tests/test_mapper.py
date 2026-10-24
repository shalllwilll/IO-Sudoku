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
    assert (
        map_columns(shuffled, rows, pack).confirmed() == map_columns(cols, rows, pack).confirmed()
    )


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


def _rows(**cols):
    n = len(next(iter(cols.values())))
    return [{k: v[i] for k, v in cols.items()} for i in range(n)]


def test_common_header_wordings_map_required_fields(pack_dir):
    pack = _pack(pack_dir)
    for tag, io, cable, pair in [
        ("Tag ID", "I/O", "Cable ID", "Pair No"),
        ("Tag", "IO", "Multicore Cable", "Wire Pair"),
        ("Tag", "IO Type", "Cable", "Pair"),
    ]:
        rows = _rows(**{tag: ["T1", "T2"], io: ["AIR", "DIR"], cable: ["C1", "C1"], pair: [1, 2]})
        m = map_columns([tag, io, cable, pair], rows, pack)
        assert [m.matches[f].column for f in REQ] == [tag, io, cable, pair]
        assert not [i for i in m.issues if i.severity == "blocking"]


def test_group_column_holding_segregation_codes_is_read_as_combined(pack_dir):
    pack = _pack(pack_dir)
    headers = ["Tag", "IO Type", "Cable", "Pair", "Group"]
    rows = _rows(
        Tag=["T1", "T2", "T3"],
        **{"IO Type": ["AIR", "AIR", "DIR"], "Cable": ["C1", "C1", "C2"], "Pair": [1, 2, 1]},
        Group=["A-PUMPS", "A-PUMPS", "B-VALVES"],
    )
    m = map_columns(headers, rows, pack)
    assert m.matches["io_grouping"].column == "Group" and "group" not in m.matches
    assert m.grouping_mode == "combined"
    assert any("Group" in i.message and i.code == "TQ-MAP" for i in m.issues)


def test_missing_segregation_source_is_flagged_not_silent(pack_dir):
    pack = _pack(pack_dir)
    rows = _rows(Tag=["T1"], **{"IO Type": ["AIR"], "Cable": ["C1"], "Pair": [1]})
    m = map_columns(["Tag", "IO Type", "Cable", "Pair"], rows, pack)
    assert any(i.data.get("field") == "segregation" for i in m.issues)
