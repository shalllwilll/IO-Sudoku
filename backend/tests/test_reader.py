import pytest
from openpyxl import Workbook

from app.core.ingest.reader import ReaderError, read_workbook

HDR = ["Tag", "IO Type", "Cable", "Pair", "Status", "Service"]


def make(tmp_path, rows, name="t.xlsx"):
    wb = Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    p = tmp_path / name
    wb.save(p)
    return p


def test_sample_reads(sample_mdb_path):
    (res,) = read_workbook(sample_mdb_path)
    assert len(res.summary.columns) == 143
    assert res.summary.header_row == 1
    assert res.summary.rows == 190
    assert res.rows[4].source_row == 6
    assert res.rows[4].source_file == sample_mdb_path.name
    assert res.summary.deleted == 1
    assert res.summary.out_of_scope == 0


def test_empty_workbook(tmp_path):
    (res,) = read_workbook(make(tmp_path, []))
    assert res.rows == [] and res.issues[0].code == "TQ-DATA"


def test_not_excel(tmp_path):
    p = tmp_path / "x.xlsx"
    p.write_text("hello")
    with pytest.raises(ReaderError, match="not a readable Excel"):
        read_workbook(p)


def test_header_on_row_3(tmp_path):
    p = make(tmp_path, [["Title"], [], HDR, ["a", "AI", "C1", 1, "New", "s"]])
    (res,) = read_workbook(p)
    assert res.summary.header_row == 3 and res.rows[0].source_row == 4


def test_deleted_and_out_of_scope_kept(tmp_path):
    p = make(
        tmp_path,
        [
            HDR,
            ["a", "AI", "C1", 1, "DELETED", "s"],
            ["b", "DI", "C1", 2, "New", "IRC panel feed"],
            ["c", "DI", "C1", 3, "New", "MCC feed"],
            ["d", "DI", "C1", 4, "New", "ok"],
            [None] * 6,
        ],
    )
    (res,) = read_workbook(p)
    s = res.summary
    assert s.rows == 4 and s.deleted == 1 and s.out_of_scope == 2 and s.blank_skipped == 1
    assert res.rows[0].deleted and res.rows[1].out_of_scope
    assert not res.rows[3].deleted and not res.rows[3].out_of_scope
