import json
import shutil

import pytest

from app.core.model.pack import Pack, PackError
from app.core.naming.engine import Namer, render


@pytest.fixture
def pack(pack_dir):
    return Pack.load(pack_dir)


def test_ps_examples(pack):
    n = Namer(pack.naming)
    got = [
        n.name_for("system_cabinet", "AR1", "100", seq=1).name,
        n.name_for("controller", "AR1", "100", seq=1).name,
        n.name_for("marshalling_cabinet", "AR1", "100", seq=1).name,
        n.name_for("cioc", "AR1", "100", cioc_no=1).name,
        n.name_for("baseplate", cioc_no=1, n=1).name,
    ]
    assert got == [
        "AR1-DCS-100-01",
        "AR1CTL10001",
        "AR1-DCM-100-01",
        "AR1CIOC100001",
        "001-CBP-1",
    ]


def test_padding_and_large_numbers(pack):
    n = Namer(pack.naming)
    assert n.name_for("system_cabinet", "AR1", "100", seq=7).name == "AR1-DCS-100-07"
    assert n.name_for("system_cabinet", "AR1", "100", seq=100).name == "AR1-DCS-100-100"


def test_unknown_placeholder_is_pack_error(pack_dir, tmp_path):
    shutil.copytree(pack_dir, tmp_path / "p")
    f = tmp_path / "p" / "naming.json"
    d = json.loads(f.read_text())
    d["cioc"]["template"] = "{Area}-{Zone}"
    f.write_text(json.dumps(d))
    with pytest.raises(PackError, match="Zone"):
        Pack.load(tmp_path / "p")


def test_duplicate_names_reported(pack):
    n = Namer(pack.naming)
    n.name_for("controller", "AR1", "100", seq=1)
    dup = n.name_for("controller", "AR1", "100", seq=1)
    assert any(i.code == "TQ-NAME" and "already used" in i.message for i in dup.issues)


def test_missing_value_gives_tq_name_not_crash(pack):
    item = Namer(pack.naming).name_for("baseplate", n=3)
    assert item.name == "?-CBP-3"
    assert any("CIOC no" in i.message for i in item.issues)


def test_defaults_raise_tq_name(pack):
    item = Namer(pack.naming).name_for("system_cabinet", seq=1)
    assert item.name == "AR1-DCS-100-01" and len(item.issues) == 2


def test_template_change_only_changes_names(pack):
    other = pack.naming.model_copy(
        update={
            "controller": pack.naming.controller.model_copy(update={"template": "{Area}-C{Seq}"})
        }
    )
    assert render(other, other.controller.template, Area="X", Seq=3)[0] == "X-C03"
    assert Namer(pack.naming).name_for("cioc", "AR1", "100", cioc_no=1).name == "AR1CIOC100001"
