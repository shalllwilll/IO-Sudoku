import pytest

from app.core.layout.blocks import build_blocks
from app.core.model.pack import Pack
from app.core.reports.rule_check import rule_check
from app.core.rules.schema import load_rules
from app.core.solve.greedy import solve_greedy
from app.core.solve.validator import validate_allocation
from tests.test_greedy import cable


@pytest.fixture
def pack(pack_dir):
    return Pack.load(pack_dir)


def go(signals, pack, rules):
    rs = load_rules(rules)
    a = solve_greedy(build_blocks(signals, pack), pack, "AR1", "100", rs)
    return a, rs, validate_allocation(a, pack, signals, rules=rs)


def where(a, pred):
    return [p for p in a.placements if p.signal and pred(p.signal)]


def test_co_locate(pack):
    s = [x.model_copy(update={"logic_number": "L1"}) for x in cable("C1", 12) + cable("C2", 12)]
    s += cable("C3", 12)
    rules = [
        {
            "id": "R",
            "primitive": "co_locate",
            "scope": "logic_number = L1",
            "parameters": {"by": "logic_number"},
        }
    ]
    a, _, v = go(s, pack, rules)
    assert v == []
    assert len({p.cioc_no for p in where(a, lambda x: x.logic_number == "L1")}) == 1


def test_separate(pack):
    s = cable("C1", 4, io="AIR") + cable("C2", 4, io="DIR")
    rules = [
        {
            "id": "R",
            "primitive": "separate",
            "parameters": {"a": "io_type = AIR", "b": "io_type = DIR"},
        }
    ]
    a, _, v = go(s, pack, rules)
    assert v == []
    air = {p.cioc_no for p in where(a, lambda x: x.io_type == "AIR")}
    dir_ = {p.cioc_no for p in where(a, lambda x: x.io_type == "DIR")}
    assert not air & dir_


def test_capacity_baseplates_per_cioc(pack):
    s = [x for i in range(20) for x in cable(f"C{i:02d}", 12)]
    rules = [
        {
            "id": "R",
            "primitive": "capacity",
            "parameters": {"per": "cioc", "measure": "baseplates", "max": 6},
        }
    ]
    a, _, v = go(s, pack, rules)
    assert v == [] and not a.unplaced
    per = {}
    for p in a.placements:
        if p.kind != "cabinet_alarm":
            per.setdefault(p.cioc_no, set()).add(p.baseplate)
    assert max(len(x) for x in per.values()) <= 6


def test_reserve_baseplate_two(pack):
    s = cable("C1", 12) + cable("C2", 12)
    a, _, v = go(s, pack, [{"id": "R", "primitive": "reserve", "parameters": {"baseplate": 2}}])
    assert v == [] and not any(p.baseplate == 2 and p.kind != "cabinet_alarm" for p in a.placements)


def test_quota_percent_per_baseplate(pack):
    s = cable("C1", 4) + cable("C2", 4) + cable("C3", 4)
    rules = [
        {
            "id": "R",
            "primitive": "quota",
            "scope": "io_type = AIR",
            "parameters": {"per": "baseplate", "max_percent": 50},
        }
    ]
    a, _, v = go(s, pack, rules)
    assert v == [] and not a.unplaced
    assert len({(p.cioc_no, p.baseplate) for p in a.placements}) == 3


def test_order_ascending(pack):
    s = cable("C1", 3) + cable("C2", 12) + cable("C3", 5)
    rules = [{"id": "R", "primitive": "order", "parameters": {"by": "tag"}}]
    _, _, v = go(s, pack, rules)
    assert v == []


def test_assign_to_cioc_position(pack):
    s = cable("C1", 4, io="AIR") + cable("C2", 4, io="DIR")
    rules = [
        {"id": "R", "primitive": "assign", "scope": "io_type = DIR", "parameters": {"cioc_seq": 2}}
    ]
    a, _, v = go(s, pack, rules)
    assert v == []
    assert {
        a.layout.cioc(p.cioc_no).seq_in_cabinet for p in where(a, lambda x: x.io_type == "DIR")
    } == {2}


def test_pin_exact_position(pack):
    s = cable("C1", 5)
    rules = [
        {
            "id": "R",
            "primitive": "pin",
            "scope": "tag = C1-3",
            "parameters": {"cioc": 1, "baseplate": 3, "channel": 5},
        }
    ]
    a, _, v = go(s, pack, rules)
    assert v == []
    (p,) = where(a, lambda x: x.tag == "C1-3")
    assert (p.cioc_no, p.baseplate, p.channel) == (1, 3, 5)


def test_limit_span(pack):
    s = cable("C1", 12, io="AIR") + cable("C2", 12, io="DIR") + cable("C3", 12, io="AIR")
    rules = [
        {
            "id": "R",
            "primitive": "limit_span",
            "scope": "io_type = AIR",
            "parameters": {"unit": "cioc", "max": 1},
        }
    ]
    a, _, v = go(s, pack, rules)
    assert v == []
    assert len({p.cioc_no for p in where(a, lambda x: x.io_type == "AIR")}) == 1


def test_impossible_rule_gives_tq_rule(pack):
    s = cable("C1", 12) + cable("C2", 12) + cable("C3", 12)
    rules = [{"id": "TIGHT", "primitive": "assign", "parameters": {"cioc": 1, "baseplates": [2]}}]
    a, _, v = go(s, pack, rules)
    assert v == []
    assert len(a.unplaced) == 24 and all(u.issues[0].code == "TQ-RULE" for u in a.unplaced)
    assert "TIGHT" in a.unplaced[0].issues[0].message


def test_overlapping_rules_both_honoured(pack):
    s = cable("C1", 6, io="AIR") + cable("C2", 6, io="AIR")
    rules = [
        {
            "id": "A",
            "primitive": "limit_span",
            "scope": "io_type = AIR",
            "parameters": {"unit": "cioc", "max": 1},
        },
        {"id": "B", "primitive": "assign", "scope": "io_type = AIR", "parameters": {"cioc_seq": 2}},
    ]
    a, _, v = go(s, pack, rules)
    assert v == [] and not a.unplaced
    assert {p.cioc_no for p in where(a, lambda x: x.io_type == "AIR")} == {2}


def test_violation_caught_with_count(pack):
    s = cable("C1", 4, io="AIR") + cable("C2", 4, io="DIR")
    a = solve_greedy(
        build_blocks(s, pack), pack, "AR1", "100"
    )  # no rules: AIR and DIR share a CIOC
    rules = load_rules(
        [
            {
                "id": "SEP",
                "primitive": "separate",
                "parameters": {"a": "io_type = AIR", "b": "io_type = DIR"},
            }
        ]
    )
    v = validate_allocation(a, pack, s, rules=rules)
    assert [x.code for x in v] == ["RULE:SEP"]
    res = [r for r in rule_check(a, pack, s, rules=rules) if r.rule == "SEP"]
    assert res[0].violations == 1 and not res[0].passed


def test_zero_rules_equal_phase3(pack):
    s = cable("C1", 22, 24) + cable("C2", 5) + cable("C3", 7, fam="B")
    a = solve_greedy(build_blocks(s, pack), pack, "AR1", "100")
    b = solve_greedy(build_blocks(s, pack), pack, "AR1", "100", [])
    assert a.model_dump_json() == b.model_dump_json()
