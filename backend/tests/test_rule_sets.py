import json
import shutil

import pytest

from app.core.layout.blocks import build_blocks
from app.core.model.pack import Pack
from app.core.reports import build_report
from app.core.rules.schema import RuleSetError, load_rules
from app.core.rules.sets import load_preset, make_ruleset, run_hash
from app.core.solve.greedy import solve_greedy
from app.core.solve.validator import validate_allocation
from tests.test_greedy import cable


@pytest.fixture
def pack(pack_dir):
    return Pack.load(pack_dir)


def test_default_set_has_ps_rules(pack):
    rs = load_preset(pack)
    ids = {r.id for r in rs.rules}
    assert {"PS-AB-SEP", "PS-CONTIG", "PS-CAP-BP", "PS-CAP-CIOC", "PS-ALARM-BP", "PS-SPARE"} <= ids
    assert rs.name == "plant-default" and all(r.strength == "hard" for r in rs.rules)


def test_preset_switch_changes_rule_count(pack):
    assert len(load_preset(pack, "strict").rules) > len(load_preset(pack, "plant-default").rules)
    with pytest.raises(RuleSetError, match="unknown rule preset"):
        load_preset(pack, "nope")


def test_duplicate_id_in_a_set():
    with pytest.raises(RuleSetError, match="duplicate"):
        load_rules([{"id": "A", "builtin": "R-BLOCK"}, {"id": "A", "builtin": "R-BLOCK"}])


def test_soft_rule_reported_not_blocking(pack):
    s = cable("C1", 4, io="AIR") + cable("C2", 4, io="DIR")
    rules = load_rules(
        [
            {
                "id": "SOFT",
                "primitive": "separate",
                "strength": "soft",
                "parameters": {"a": "io_type = AIR", "b": "io_type = DIR"},
            }
        ]
    )
    a = solve_greedy(build_blocks(s, pack), pack, "AR1", "100", rules)
    assert not a.unplaced
    assert validate_allocation(a, pack, s, rules=rules) == []
    rep = build_report(a, pack, s, [], rules=rules)
    soft = next(r for r in rep.rules if r.rule == "SOFT")
    assert not soft.passed and soft.violations == 1 and soft.strength == "soft"


def test_all_rules_disabled_invariants_still_enforced(pack):
    rs = load_preset(pack)
    off = make_ruleset("off", [r.model_copy(update={"enabled": False}) for r in rs.rules])
    s = cable("CA", 4, fam="A") + cable("CB", 4, fam="B")
    a = solve_greedy(build_blocks(s, pack), pack, "AR1", "100", off.rules)
    assert validate_allocation(a, pack, s, rules=off.rules) == []
    cioc = {p.signal.segregation_family: p.cioc_no for p in a.placements if p.signal}
    assert cioc["A"] != cioc["B"]  # the built-in A/B invariant still holds


def test_hash_changes_when_a_rule_toggles(pack):
    rs = load_preset(pack)
    flipped = make_ruleset(
        rs.name, [rs.rules[0].model_copy(update={"enabled": False}), *rs.rules[1:]]
    )
    assert flipped.hash != rs.hash
    assert run_hash(pack.hash, rs.hash) != run_hash(pack.hash, flipped.hash)
    assert load_preset(pack).hash == rs.hash


def test_default_rules_still_validate_and_declaration_lists_set(pack):
    rs = load_preset(pack)
    s = cable("CA", 4, fam="A") + cable("CB", 4, fam="B") + cable("CL", 22, 24)
    a = solve_greedy(build_blocks(s, pack), pack, "AR1", "100", rs.rules)
    assert validate_allocation(a, pack, s, rules=rs.rules) == []
    rep = build_report(a, pack, s, [], ruleset=rs)
    assert rs.hash[:12] in rep.declaration.rule_set
    assert any("PS-AB-SEP" in x for x in rep.declaration.rules)
    assert all(r.passed for r in rep.rules if r.rule != "R-SPARE")
    assert next(r for r in rep.rules if r.rule == "R-SPARE").violations == 1


def test_not_enforced_rule_listed_in_declaration(pack):
    rs = make_ruleset(
        "x", load_rules([{"id": "N", "name": "odd", "not_enforced_reason": "cannot express"}])
    )
    rep = build_report(solve_greedy(build_blocks([], pack), pack), pack, [], [], ruleset=rs)
    assert any("cannot express" in x for x in rep.declaration.not_enforced)
    assert any(r.enforced is False for r in rep.rules)


def test_pack_hash_includes_rules(pack_dir, tmp_path):
    shutil.copytree(pack_dir, tmp_path / "p")
    f = tmp_path / "p" / "rules.json"
    d = json.loads(f.read_text())
    d["presets"]["strict"][0]["enabled"] = False
    f.write_text(json.dumps(d))
    assert Pack.load(tmp_path / "p").hash != Pack.load(pack_dir).hash
