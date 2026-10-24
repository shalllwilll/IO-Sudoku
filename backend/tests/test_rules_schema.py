import pytest

from app.core.layout.blocks import build_blocks
from app.core.model.pack import Pack
from app.core.model.signal import Signal
from app.core.rules.dryrun import dry_run
from app.core.rules.schema import RuleSetError, load_rules
from app.core.rules.scope import ScopeError, matches, parse_scope
from tests.test_greedy import cable


@pytest.fixture
def pack(pack_dir):
    return Pack.load(pack_dir)


def test_valid_rule_loads():
    (r,) = load_rules([{"id": "R1", "primitive": "co_locate", "scope": "io_type = AIR",
                        "parameters": {"by": "logic_number"}}])  # fmt: skip
    assert r.primitive == "co_locate" and r.strength == "hard" and r.enabled


def test_unknown_primitive_rejected():
    with pytest.raises(RuleSetError, match="R1"):
        load_rules([{"id": "R1", "primitive": "teleport"}])


def test_duplicate_id():
    with pytest.raises(RuleSetError, match="duplicate"):
        load_rules([{"id": "R1", "primitive": "pin"}, {"id": "R1", "primitive": "pin"}])


def test_not_enforced_stored_with_reason():
    (r,) = load_rules([{"id": "N1", "name": "weird", "not_enforced_reason": "cannot express"}])
    assert not r.enforced and r.not_enforced_reason == "cannot express"


def test_bad_json():
    with pytest.raises(RuleSetError):
        load_rules("{not json")


@pytest.mark.parametrize(
    "text",
    ["__import__('os')", "io_type = ", "io_type in AIR", "(io_type = AIR", "io_type = AIR )",
     "a = b; rm -rf", "io_type ~ AIR", "x.__class__ = 1"],
)  # fmt: skip
def test_malformed_and_injection_rejected(text):
    with pytest.raises(ScopeError):
        parse_scope(text)


def test_scope_semantics():
    s = Signal(tag="T", io_type="AIR", segregation_family="A", signal_level="2-Wire")
    assert matches(parse_scope("io_type = AIR and segregation_family in [A, B]"), s)
    assert matches(parse_scope("io_type = DIR or signal_level = '2-Wire'"), s)
    assert matches(parse_scope("not (io_type in [DIR, DOR])"), s)
    assert matches(parse_scope("io_type not in [DIR]"), s)
    assert not matches(parse_scope("io_type != AIR"), s)
    assert matches(parse_scope(""), s)
    assert matches(parse_scope("group = G1"), s, group="G1")


def test_dry_run_counts(pack):
    sigs = cable("C1", 5, io="AIR") + cable("C2", 3, io="DIR")
    bs = build_blocks(sigs, pack)
    rules = load_rules([
        {"id": "R1", "primitive": "co_locate", "scope": "io_type = AIR", "parameters": {"by": "cable"}},
        {"id": "R2", "primitive": "pin", "scope": "tag = nothing"},
        {"id": "N", "not_enforced_reason": "x"},
    ])  # fmt: skip
    d = {x.rule_id: x for x in dry_run(rules, bs)}
    assert (d["R1"].matched_signals, d["R1"].affected_blocks) == (5, 1)
    assert d["R2"].matched_signals == 0 and not d["N"].enforced
