from pathlib import Path

from tests.api_helpers import make_client, new_project, simple_rows, upload, xlsx_bytes


def assert_error(r, status, code):
    assert r.status_code == status, r.text
    body = r.json()
    assert set(body) == {"code", "message", "details"} and body["code"] == code


def test_wrong_extension(tmp_path):  # T9.1.3
    c = make_client(tmp_path)
    pid = new_project(c)
    assert_error(upload(c, pid, b"MZ\x90\x00", "tool.exe", "application/octet-stream"), 415,
                 "unsupported_media_type")  # fmt: skip


def test_renamed_non_xlsx_is_rejected(tmp_path):
    c = make_client(tmp_path)
    pid = new_project(c)
    assert_error(upload(c, pid, b"just text, not a zip", "fake.xlsx"), 415, "not_xlsx")
    assert not list((tmp_path / "uploads" / pid).iterdir())


def test_oversized_file(tmp_path):  # T9.1.4
    c = make_client(tmp_path, max_upload_bytes=2048)
    pid = new_project(c)
    assert_error(upload(c, pid, b"PK\x03\x04" + b"0" * 5000), 413, "file_too_large")
    assert not list((tmp_path / "uploads" / pid).iterdir())


def test_empty_upload(tmp_path):  # T9.1.8
    c = make_client(tmp_path)
    pid = new_project(c)
    assert_error(upload(c, pid, b""), 400, "empty_file")


def test_corrupt_workbook(tmp_path):
    c = make_client(tmp_path)
    pid = new_project(c)
    assert_error(upload(c, pid, b"PK\x03\x04 broken zip"), 400, "unreadable_workbook")
    assert not list((tmp_path / "uploads" / pid).iterdir())


def test_path_traversal_name_is_only_a_label(tmp_path):  # T9.1.5
    c = make_client(tmp_path)
    pid = new_project(c)
    data = xlsx_bytes(tmp_path, simple_rows())
    r = upload(c, pid, data, "../../x.xlsx")
    assert r.status_code == 201, r.text
    assert r.json()["name"] == "x.xlsx"
    stored = list((tmp_path / "uploads" / pid).iterdir())
    assert len(stored) == 1 and stored[0].name != "x.xlsx"
    assert stored[0].resolve().is_relative_to((tmp_path / "uploads").resolve())
    assert not (tmp_path.parent / "x.xlsx").exists() and not (tmp_path / "x.xlsx").exists()
    r2 = upload(c, pid, data, "..\\..\\evil.xlsx")
    assert r2.json()["name"] == "evil.xlsx"


def test_duplicate_names_get_distinct_labels(tmp_path):
    c = make_client(tmp_path)
    pid = new_project(c)
    data = xlsx_bytes(tmp_path, simple_rows())
    names = [upload(c, pid, data, "a.xlsx").json()["name"] for _ in range(3)]
    assert names == ["a.xlsx", "a (2).xlsx", "a (3).xlsx"]
    assert len({p.name for p in Path(tmp_path / "uploads" / pid).iterdir()}) == 3


def test_upload_to_unknown_project(tmp_path):
    c = make_client(tmp_path)
    assert_error(upload(c, "nope", xlsx_bytes(tmp_path, simple_rows())), 404, "not_found")


def test_upload_reports_sheets(tmp_path):
    c = make_client(tmp_path)
    pid = new_project(c)
    r = upload(c, pid, xlsx_bytes(tmp_path, simple_rows())).json()
    assert r["sheets"][0]["rows"] == 19 and "Cable No" in r["sheets"][0]["columns"]
    assert len(r["sha256"]) == 64
