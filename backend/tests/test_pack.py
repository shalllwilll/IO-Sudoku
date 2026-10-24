import json
import shutil

import pytest

from app.core.model.pack import Pack, PackError


def test_pack_loads(pack_dir):
    p = Pack.load(pack_dir)
    assert p.capacity.channels_per_baseplate == 12
    assert len(p.segregation.codes) == 9
    assert p.naming.baseplate.example == "001-CBP-1"


def test_hash_stable(pack_dir):
    assert Pack.load(pack_dir).hash == Pack.load(pack_dir).hash


def test_hash_changes(pack_dir, tmp_path):
    shutil.copytree(pack_dir, tmp_path / "p")
    f = tmp_path / "p" / "capacity.json"
    d = json.loads(f.read_text())
    d["spare_percent"] = 11
    f.write_text(json.dumps(d))
    assert Pack.load(tmp_path / "p").hash != Pack.load(pack_dir).hash


def test_invalid_pack_names_file_and_field(pack_dir, tmp_path):
    shutil.copytree(pack_dir, tmp_path / "p")
    f = tmp_path / "p" / "capacity.json"
    d = json.loads(f.read_text())
    d["channels_per_baseplate"] = "twelve"
    f.write_text(json.dumps(d))
    with pytest.raises(PackError, match=r"capacity\.json.*channels_per_baseplate"):
        Pack.load(tmp_path / "p")


def test_relay_row_present_and_empty(pack_dir):
    rows = Pack.load(pack_dir).hardware.rows
    relay = [r for r in rows if r.match.get("duty") == "RELAY"]
    assert relay and relay[0].charm is None and relay[0].tb is None


def test_fixture_skips_without_data_dir(monkeypatch, request):
    monkeypatch.delenv("SUDOKU_DATA_DIR", raising=False)
    with pytest.raises(pytest.skip.Exception):
        request.getfixturevalue("sample_mdb_path")
