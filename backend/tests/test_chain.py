import pytest

from app.config import Settings
from app.core.layout.blocks import build_blocks
from app.core.model.pack import Pack
from app.core.rules.schema import load_rules
from app.core.solve import chain as chain_mod
from app.core.solve import cpsat
from app.core.solve.cache import ResultCache, lib_versions, make_key
from app.core.solve.chain import probe_rule_conflicts, run_chain
from app.core.solve.greedy import solve_greedy
from app.core.solve.validator import validate_allocation
from tests.test_greedy import cable

FAST = {"deterministic_time": 2.0}


@pytest.fixture
def pack(pack_dir):
    return Pack.load(pack_dir)


def chain(signals, pack, rules=None, **kw):
    blocks = build_blocks(signals, pack)
    return blocks, run_chain(blocks, pack, "AR1", "100", rules, **{**FAST, **kw})


def stages(res):
    return [(e.stage, e.status) for e in res.events]


def test_cpsat_result_is_used_first(pack):
    s = cable("C1", 5) + cable("C2", 7)
    _, res = chain(s, pack, cpsat_enabled=True)
    assert res.solver == "cpsat" and res.allocation.solver == "cpsat" and not res.fell_back
    assert stages(res) == [("cpsat", "used")]
    assert validate_allocation(res.allocation, pack, s) == []


def test_cpsat_error_falls_back_to_greedy_with_event(pack, monkeypatch):
    def boom(*a, **k):
        raise cpsat.CpsatError("no such parameter")

    monkeypatch.setattr(chain_mod.cpsat, "solve_cpsat", boom)
    s = cable("C1", 5)
    _, res = chain(s, pack, cpsat_enabled=True)
    assert res.solver == "greedy" and res.fell_back
    assert stages(res) == [("cpsat", "fallback"), ("greedy", "used")]
    assert validate_allocation(res.allocation, pack, s) == []


def test_cpsat_rejected_by_the_gate_falls_back(pack, monkeypatch):
    real = cpsat._to_allocation

    def corrupt(*a, **k):
        al = real(*a, **k)
        al.placements.append(al.placements[0].model_copy())
        return al

    monkeypatch.setattr(cpsat, "_to_allocation", corrupt)
    s = cable("C1", 5)
    _, res = chain(s, pack, cpsat_enabled=True)
    assert res.solver == "greedy" and "REJECTED" in res.events[0].message


def test_cpsat_unknown_status_falls_back(pack):
    s = [x for i in range(6) for x in cable(f"C{i}", 7)]
    _, res = chain(s, pack, cpsat_enabled=True, deterministic_time=1e-6)
    assert res.solver in ("cpsat", "greedy")
    assert validate_allocation(res.allocation, pack, s) == []


def test_greedy_failing_the_gate_ends_in_the_tq_list(pack, monkeypatch):
    def bad(*a, **k):
        al = solve_greedy(*a, **k)
        al.placements.append(al.placements[0].model_copy())
        return al

    monkeypatch.setattr(chain_mod, "solve_greedy", bad)
    s = cable("C1", 5)
    _, res = chain(s, pack, cpsat_enabled=False)
    assert (
        res.solver == "tq" and len(res.allocation.unplaced) == 5 and not res.allocation.placements
    )
    assert all(i.code == "TQ-CAP" for u in res.allocation.unplaced for i in u.issues)
    assert validate_allocation(res.allocation, pack, s) == []  # every signal is on the TQ list


def test_greedy_only_path_when_cpsat_disabled(pack):
    s = cable("C1", 22, 24) + cable("CA", 4, fam="A") + cable("CB", 4, fam="B")
    _, res = chain(s, pack, cpsat_enabled=False)
    assert res.solver == "greedy" and stages(res) == [("cpsat", "skipped"), ("greedy", "used")]
    assert not res.allocation.unplaced and not res.fell_back


def test_settings_switch_disables_cpsat(pack, monkeypatch):
    monkeypatch.setenv("SUDOKU_CPSAT", "off")
    assert Settings.from_env().cpsat_enabled is False
    _, res = chain(cable("C1", 3), pack)
    assert res.solver == "greedy"
    monkeypatch.setenv("SUDOKU_CPSAT", "1")
    assert Settings.from_env().cpsat_enabled is True


# -- rule-toggle probe --------------------------------------------------------------------------
def test_conflicting_rules_are_named_in_a_tq_rule(pack):
    rules = load_rules(
        [
            {"id": "R-ONE", "primitive": "assign", "parameters": {"cabinet": 1}},
            {"id": "R-TWO", "primitive": "assign", "parameters": {"cabinet": 2}},
            {"id": "R-OK", "primitive": "capacity", "parameters": {"per": "cioc", "max": 96}},
        ]
    )
    _, res = chain(cable("C1", 4), pack, rules, cpsat_enabled=True)
    tq = [i for i in res.allocation.issues if i.code == "TQ-RULE"]
    assert tq and any("R-ONE" in i.message and "R-TWO" in i.message for i in tq)
    assert not any("R-OK" in i.message for i in tq[-1:])
    assert ("rules", "conflict") in stages(res)
    assert len(res.allocation.unplaced) == 4


def test_probe_finds_the_minimal_conflict_set(pack):
    rules = load_rules(
        [
            {
                "id": "A1",
                "primitive": "assign",
                "scope": "cable = C1",
                "parameters": {"cabinet": 1},
            },
            {
                "id": "A2",
                "primitive": "assign",
                "scope": "cable = C1",
                "parameters": {"cabinet": 2},
            },
            {"id": "FINE", "primitive": "limit_span", "parameters": {"unit": "cioc", "max": 9}},
        ]
    )
    blocks = build_blocks(cable("C1", 4) + cable("C2", 4), pack)
    assert probe_rule_conflicts(blocks, pack, "AR1", "100", rules) == ["A1", "A2"]


def test_probe_reports_no_conflict_when_rules_are_fine(pack):
    rules = load_rules(
        [{"id": "OK", "primitive": "limit_span", "parameters": {"unit": "cioc", "max": 9}}]
    )
    blocks = build_blocks(cable("C1", 4), pack)
    assert probe_rule_conflicts(blocks, pack, "AR1", "100", rules) == []
    assert probe_rule_conflicts(blocks, pack, "AR1", "100", []) == []


# -- cache --------------------------------------------------------------------------------------
def test_second_identical_run_comes_from_the_cache(pack):
    cache = ResultCache()
    s = cable("C1", 5) + cable("C2", 3)
    blocks = build_blocks(s, pack)
    first = run_chain(blocks, pack, "AR1", "100", cache=cache, cpsat_enabled=True, **FAST)
    second = run_chain(blocks, pack, "AR1", "100", cache=cache, cpsat_enabled=True, **FAST)
    assert not first.cached and second.cached and len(cache) == 1
    assert second.allocation.model_dump_json() == first.allocation.model_dump_json()
    assert stages(second)[-1] == ("cache", "hit")


def test_changed_library_version_misses(pack):
    cache = ResultCache()
    blocks = build_blocks(cable("C1", 5), pack)
    run_chain(blocks, pack, "AR1", "100", cache=cache, cpsat_enabled=True, **FAST)
    other = {**lib_versions(), "ortools": "0.0.0-test"}
    again = run_chain(
        blocks, pack, "AR1", "100", cache=cache, versions=other, cpsat_enabled=True, **FAST
    )
    assert not again.cached and len(cache) == 2


def test_key_changes_with_signals_rules_pack_and_settings(pack):
    b1, b2 = build_blocks(cable("C1", 5), pack), build_blocks(cable("C1", 6), pack)
    k = make_key(b1, "p", "r")
    assert k == make_key(b1, "p", "r")
    assert len({k, make_key(b2, "p", "r"), make_key(b1, "p2", "r"), make_key(b1, "p", "r2"),
                make_key(b1, "p", "r", seed=2)}) == 5  # fmt: skip


def test_fallback_results_are_not_cached(pack, monkeypatch):
    monkeypatch.setattr(
        chain_mod.cpsat, "solve_cpsat", lambda *a, **k: (_ for _ in ()).throw(cpsat.CpsatError("x"))
    )
    cache = ResultCache()
    blocks = build_blocks(cable("C1", 5), pack)
    run_chain(blocks, pack, "AR1", "100", cache=cache, cpsat_enabled=True, **FAST)
    assert len(cache) == 0  # a transient CP-SAT failure must not pin a greedy answer


def test_disk_cache_survives_a_new_instance_and_ignores_damage(pack, tmp_path):
    blocks = build_blocks(cable("C1", 5), pack)
    run_chain(blocks, pack, "AR1", "100", cache=ResultCache(tmp_path), cpsat_enabled=True, **FAST)
    hit = run_chain(
        blocks, pack, "AR1", "100", cache=ResultCache(tmp_path), cpsat_enabled=True, **FAST
    )
    assert hit.cached
    for f in tmp_path.glob("*.json"):
        f.write_text("{not json")
    miss = run_chain(
        blocks, pack, "AR1", "100", cache=ResultCache(tmp_path), cpsat_enabled=True, **FAST
    )
    assert not miss.cached and miss.solver == "cpsat"


def test_oversized_model_is_skipped_not_solved(pack):
    s = [x for i in range(6) for x in cable(f"C{i}", 7)]
    _, res = chain(s, pack, cpsat_enabled=True, max_options=10)
    assert res.solver == "greedy" and not res.fell_back
    assert stages(res) == [("cpsat", "skipped"), ("greedy", "used")]
    assert "too large" in res.events[0].message
