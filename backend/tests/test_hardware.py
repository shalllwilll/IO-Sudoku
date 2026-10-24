import pytest

from app.core.hardware.engine import resolve_hardware, spare_slot_hardware
from app.core.model.pack import HardwareRow, Pack
from app.core.model.signal import Signal


@pytest.fixture
def pack(pack_dir):
    return Pack.load(pack_dir)


def sig(io, st=None, lvl=None, duty_class=None, alarm=False):
    return Signal(
        tag="T", io_type=io, signal_type=st, signal_level=lvl, duty_class=duty_class,
        cabinet_alarm=alarm,
    )  # fmt: skip


CASES = [
    (sig("AIR", "4-20 ma HART", "2-Wire"), "SE4303T01", "SE4501", ["1", "2", "-"]),
    (sig("AIR", "4-20 ma", "4-Wire"), "SE4303T01", "SE4501", ["-", "2", "4"]),
    (sig("AIR", "RTD", "3-Wire"), "SE4303T03", "SE4501", ["1", "2", "4"]),
    (sig("AOR", "4-20 ma HART", "2-Wire"), "SE4304T01", "SE4501", ["1", "2", "-"]),
    (sig("DIR", None, "Voltfree-contact"), "SE4301T02", "SE4501", ["1", "2", "-"]),
    (sig("DOR", duty_class="standard"), "SE4302T01", "SE4501", ["1", "2", "-"]),
    (sig("DOR", duty_class="high_current"), "SE4302T02", "SE4502", ["-", "2", "4"]),
]


@pytest.mark.parametrize("s,charm,tb,terms", CASES)
def test_each_hardware_type(pack, s, charm, tb, terms):
    r = resolve_hardware(s, pack)
    assert (r.charm, r.tb, r.tb_terminals) == (charm, tb, terms)
    assert r.rule_row_id and not r.held_out


def test_unknown_combination_held_out(pack):
    r = resolve_hardware(sig("AIR", "Weird", "2-Wire"), pack)
    assert r.held_out and r.issues[0].code == "TQ-HW"


def test_relay_row_names_missing_part(pack):
    r = resolve_hardware(sig("DOR", duty_class="relay"), pack)
    assert r.held_out and "CHARM" in r.issues[0].message and "HW-DOR-RELAY" in r.issues[0].message


def test_order_matters(pack):
    first = HardwareRow(id="FIRST", match={"io_type": "DIR"}, charm="A", tb="B")
    second = HardwareRow(id="SECOND", match={"io_type": ["DIR", "AIR"]}, charm="C", tb="D")
    p = pack.model_copy(
        update={"hardware": pack.hardware.model_copy(update={"rows": [first, second]})}
    )
    assert resolve_hardware(sig("DIR"), p).rule_row_id == "FIRST"
    assert resolve_hardware(sig("AIR"), p).rule_row_id == "SECOND"


def test_cabinet_alarm_rows_before_generic(pack):
    assert resolve_hardware(sig("DIR", alarm=True), pack).loop_typical.startswith("SA-AMI")
    assert resolve_hardware(sig("AIR", "RTD", "3-Wire", alarm=True), pack).rule_row_id == (
        "HW-ALARM-RTD"
    )


def test_spare_slot(pack):
    r = spare_slot_hardware(pack)
    assert r.charm == "SE6103" and r.charm_name == "CHARM PROTECTION COVER"


def test_deterministic(pack):
    s = sig("AIR", "4-20 ma HART", "2-Wire")
    assert resolve_hardware(s, pack) == resolve_hardware(s, pack)
