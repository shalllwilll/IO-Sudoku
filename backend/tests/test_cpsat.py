import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from ortools.sat.python import cp_model

from app.core.ingest.merge import merge_files
from app.core.layout.blocks import build_blocks
from app.core.model.pack import Pack
from app.core.rules.schema import load_rules
from app.core.rules.sets import load_preset
from app.core.solve import cpsat
from app.core.solve.cpsat import CpsatError, make_solver, solve_cpsat
from app.core.solve.greedy import solve_greedy
from app.core.solve.validator import validate_allocation
from tests.conftest import PACK_DIR
from tests.test_greedy import cable

FAST = {"deterministic_time": 2.0}


@pytest.fixture
def pack(pack_dir):
    return Pack.load(pack_dir)


def solve(signals, pack, rules=None, **kw):
    kw = {**FAST, **kw}
    return solve_cpsat(build_blocks(signals, pack), pack, "AR1", "100", rules, **kw)


def used_ciocs(a):
    return len({p.cioc_no for p in a.placements if p.kind != "cabinet_alarm"})


def test_tiny_instance_optimal_and_valid(pack):
    s = cable("C1", 4) + cable("C2", 6)
    r = solve(s, pack)
    assert r.status == "OPTIMAL" and r.proven_optimal and r.ok
    assert validate_allocation(r.allocation, pack, s) == []
    assert not r.allocation.unplaced and r.allocation.solver == "cpsat"
    assert "status=OPTIMAL" in r.log()


def test_single_signal(pack):
    r = solve(cable("C1", 1), pack)
    assert r.ok and len(r.allocation.placements) == 1


def test_no_signals(pack):
    r = solve([], pack)
    assert r.ok and r.allocation.placements == []


def test_large_block_and_a_b_segregation(pack):
    s = cable("C1", 22, 24) + cable("CA", 4, fam="A") + cable("CB", 4, fam="B")
    r = solve(s, pack)
    assert r.ok and not r.allocation.unplaced
    pl = [p for p in r.allocation.placements if p.block_id == "C1"]
    bps = sorted({p.baseplate for p in pl})
    assert len({p.cioc_no for p in pl}) == 1 and bps == list(range(bps[0], bps[0] + 2))
    assert [p.channel for p in pl if p.baseplate == bps[0]] == list(range(1, 13))
    cioc = {p.signal.segregation_family: p.cioc_no for p in r.allocation.placements if p.signal}
    assert cioc["A"] != cioc["B"]


def test_unknown_segregation_gets_its_own_cioc(pack):
    s = cable("CU", 4, fam="UNKNOWN:Z") + cable("C1", 4)
    r = solve(s, pack)
    assert r.ok
    by = {p.block_id: p.cioc_no for p in r.allocation.placements}
    assert by["CU"] != by["C1"]


def test_mixed_conflicting_block_goes_to_tq(pack):
    mixed = cable("CM", 2, fam="A") + [
        x.model_copy(update={"segregation_family": "B", "tag": f"M-B{i}", "pair": 10 + i})
        for i, x in enumerate(cable("CM", 2))
    ]
    r = solve(mixed, pack)
    assert r.ok and len(r.allocation.unplaced) == 4
    assert {i.code for u in r.allocation.unplaced for i in u.issues} == {"TQ-SEG"}


def test_cabinet_alarms_stay_on_the_alarm_baseplate(pack):
    from app.core.model.signal import Signal

    alarms = [
        Signal(tag=f"AL-{i}", io_type="DIR", service="CABINET ALARM", cabinet_alarm=True,
               source_file="t", source_row=i)
        for i in range(3)
    ]  # fmt: skip
    blocks = build_blocks(cable("C1", 5) + alarms, pack)
    r = solve_cpsat(blocks, pack, "AR1", "100", **FAST)
    assert r.ok
    assert {p.baseplate for p in r.allocation.placements if p.kind == "cabinet_alarm"} == {1}
    assert 1 not in {p.baseplate for p in r.allocation.placements if p.kind != "cabinet_alarm"}


# -- quality ---------------------------------------------------------------------------------
def test_not_worse_than_greedy_on_a_mixed_instance(pack):
    s = [x for i in range(7) for x in cable(f"C{i}", 5 + i)] + cable("CA", 9, fam="A")
    blocks = build_blocks(s, pack)
    g = solve_greedy(blocks, pack, "AR1", "100")
    r = solve_cpsat(blocks, pack, "AR1", "100", **FAST)
    assert r.ok
    assert len(r.allocation.layout.cabinets) <= len(g.layout.cabinets)
    assert used_ciocs(r.allocation) <= used_ciocs(g)
    assert len(r.allocation.unplaced) <= len(g.unplaced)


def test_sample_valid_and_not_worse_than_greedy(pack, sample_mdb_path):
    ss = merge_files([sample_mdb_path], pack)
    blocks = build_blocks(ss.signals, pack)
    rs = load_preset(pack)
    g = solve_greedy(blocks, pack, "P30", "32001", rs.rules)
    r = solve_cpsat(blocks, pack, "P30", "32001", rs.rules, **FAST)
    assert r.ok and r.status in ("OPTIMAL", "FEASIBLE") and r.primary_optimal
    sigs, alarms = cpsat.solver_inputs(blocks)
    assert validate_allocation(r.allocation, pack, sigs, alarms, rs.rules) == []
    assert not r.allocation.unplaced
    assert len(r.allocation.layout.cabinets) <= len(g.layout.cabinets)
    assert used_ciocs(r.allocation) <= used_ciocs(g)
    assert len(r.allocation.placements) == len(g.placements)


# -- infeasible, limits, gate ----------------------------------------------------------------
CONTRADICTION = [
    {"id": "C1", "primitive": "assign", "parameters": {"cabinet": 1}},
    {"id": "C2", "primitive": "assign", "parameters": {"cabinet": 2}},
]


def test_infeasible_hard_rules_reported_not_raised(pack):
    r = solve(cable("C1", 4), pack, load_rules(CONTRADICTION), strict=True)
    assert r.status == "INFEASIBLE" and r.allocation is None and not r.ok


def test_contradictory_rules_default_mode_sends_signals_to_tq_rule(pack):
    s = cable("C1", 4)
    r = solve(s, pack, load_rules(CONTRADICTION))
    assert r.ok and len(r.allocation.unplaced) == 4
    codes = {i.code for u in r.allocation.unplaced for i in u.issues}
    assert codes == {"TQ-RULE"}
    msg = r.allocation.unplaced[0].issues[0].message
    assert "C1" in msg and "C2" in msg


def test_tiny_time_limit_is_handled(pack):
    s = [x for i in range(6) for x in cable(f"C{i}", 7)]
    r = solve(s, pack, deterministic_time=1e-6)
    assert r.status in ("OPTIMAL", "FEASIBLE", "UNKNOWN", "REJECTED")
    assert r.allocation is None or r.ok


def test_gate_rejects_a_corrupted_solution(pack, monkeypatch):
    real = cpsat._to_allocation

    def corrupt(*a, **k):
        alloc = real(*a, **k)
        alloc.placements.append(alloc.placements[0].model_copy())  # two signals on one cell
        return alloc

    monkeypatch.setattr(cpsat, "_to_allocation", corrupt)
    r = solve(cable("C1", 4), pack)
    assert r.status == "REJECTED" and r.allocation is None and r.violations and not r.ok


def test_gate_function_reports_missing_signal(pack):
    blocks = build_blocks(cable("C1", 4), pack)
    r = solve_cpsat(blocks, pack, "AR1", "100", **FAST)
    broken = r.allocation.model_copy(deep=True)
    broken.placements.pop()
    assert {v.code for v in cpsat.gate(broken, blocks, pack)} >= {"MISSING"}


def test_solver_error_is_returned_not_raised(pack, monkeypatch):
    monkeypatch.setattr(cpsat, "_staged_solve", lambda *a, **k: 1 / 0)
    r = solve(cable("C1", 3), pack)
    assert r.status == "ERROR" and r.allocation is None and "ZeroDivisionError" in r.message


# -- parameters and the OR-Tools API ----------------------------------------------------------
def test_solver_parameter_names_exist_in_installed_ortools(pack):
    s = make_solver(pack, seed=7, deterministic_time=1.5, wall_seconds=9)
    p = s.parameters
    assert (p.num_workers, p.random_seed, p.max_deterministic_time, p.max_time_in_seconds) == (
        1, 7, 1.5, 9,
    )  # fmt: skip
    m = cp_model.CpModel()
    x = m.NewBoolVar("x")
    m.Maximize(x)
    assert s.Solve(m) == cp_model.OPTIMAL


def test_missing_parameter_is_a_clear_error(pack, monkeypatch):
    monkeypatch.setattr(cpsat, "SOLVER_PARAMS", ("num_workers", "no_such_parameter"))
    with pytest.raises(CpsatError, match="no_such_parameter"):
        make_solver(pack)


def test_hint_call_is_honoured_by_the_installed_ortools():
    m = cp_model.CpModel()
    x, y = m.NewBoolVar("x"), m.NewBoolVar("y")
    m.AddExactlyOne([x, y])
    m.AddHint(y, 1)
    m.AddHint(x, 0)
    s = cp_model.CpSolver()
    s.parameters.fix_variables_to_their_hinted_value = True
    s.parameters.num_workers = 1
    assert s.Solve(m) == cp_model.OPTIMAL and (s.Value(x), s.Value(y)) == (0, 1)


# -- rule primitives in the model -------------------------------------------------------------
def rules_of(*items):
    return load_rules(list(items))


def ok_with(r, pack, signals, rules):
    assert r.ok, r.log()
    assert validate_allocation(r.allocation, pack, signals, rules=rules) == []


def test_separate_rule(pack):
    s = cable("C1", 4, io="AIR") + cable("C2", 4, io="DIR")
    rs = rules_of(
        {
            "id": "S",
            "primitive": "separate",
            "parameters": {"a": "io_type = AIR", "b": "io_type = DIR"},
        }
    )
    r = solve(s, pack, rs)
    ok_with(r, pack, s, rs)
    air = {p.cioc_no for p in r.allocation.placements if p.signal.io_type == "AIR"}
    dir_ = {p.cioc_no for p in r.allocation.placements if p.signal.io_type == "DIR"}
    assert not air & dir_


def test_co_locate_rule(pack):
    s = [x.model_copy(update={"logic_number": "L1"}) for x in cable("C1", 12) + cable("C2", 12)]
    s += cable("C3", 12)
    rs = rules_of(
        {"id": "L", "primitive": "co_locate", "scope": "logic_number = L1",
         "parameters": {"by": "logic_number"}}
    )  # fmt: skip
    r = solve(s, pack, rs)
    ok_with(r, pack, s, rs)
    assert len({p.cioc_no for p in r.allocation.placements if p.signal.logic_number == "L1"}) == 1


def test_capacity_rule_baseplates_per_cioc(pack):
    s = [x for i in range(10) for x in cable(f"C{i:02d}", 12)]
    rs = rules_of(
        {"id": "K", "primitive": "capacity",
         "parameters": {"per": "cioc", "max": 3, "measure": "baseplates"}}
    )  # fmt: skip
    r = solve(s, pack, rs)
    ok_with(r, pack, s, rs)
    per = {}
    for p in r.allocation.placements:
        per.setdefault(p.cioc_no, set()).add(p.baseplate)
    assert max(len(v) for v in per.values()) <= 3


def test_capacity_rule_signals_per_cioc(pack):
    s = [x for i in range(6) for x in cable(f"C{i}", 10)]
    rs = rules_of({"id": "K", "primitive": "capacity", "parameters": {"per": "cioc", "max": 20}})
    r = solve(s, pack, rs)
    ok_with(r, pack, s, rs)
    n = {}
    for p in r.allocation.placements:
        n[p.cioc_no] = n.get(p.cioc_no, 0) + 1
    assert max(n.values()) <= 20


def test_quota_rule(pack):
    s = [x for i in range(6) for x in cable(f"C{i}", 12)]
    rs = rules_of(
        {"id": "Q", "primitive": "quota", "scope": "io_type = AIR",
         "parameters": {"per": "cioc", "max_percent": 25}}
    )  # fmt: skip
    r = solve(s, pack, rs)
    ok_with(r, pack, s, rs)


def test_limit_span_rule(pack):
    s = cable("C1", 12) + cable("C2", 12) + cable("C3", 12)
    rs = rules_of(
        {"id": "W", "primitive": "limit_span", "scope": "cable = C1",
         "parameters": {"unit": "cioc", "max": 1}}
    )  # fmt: skip
    r = solve(s, pack, rs)
    ok_with(r, pack, s, rs)


def test_assign_rule_pins_a_cable_to_baseplates(pack):
    s = cable("C1", 6) + cable("C2", 6)
    rs = rules_of(
        {
            "id": "A",
            "primitive": "assign",
            "scope": "cable = C1",
            "parameters": {"baseplates": [5, 6]},
        }
    )
    r = solve(s, pack, rs)
    ok_with(r, pack, s, rs)
    assert {p.baseplate for p in r.allocation.placements if p.block_id == "C1"} <= {5, 6}


def test_reserve_rule_keeps_a_baseplate_empty(pack):
    s = [x for i in range(4) for x in cable(f"C{i}", 12)]
    rs = rules_of({"id": "R", "primitive": "reserve", "parameters": {"baseplate": 2}})
    r = solve(s, pack, rs)
    ok_with(r, pack, s, rs)
    assert 2 not in {p.baseplate for p in r.allocation.placements if p.kind != "cabinet_alarm"}


def test_pin_and_order_are_gate_checked_not_modelled(pack):
    s = cable("C1", 4)
    rs = rules_of(
        {
            "id": "P",
            "primitive": "pin",
            "scope": "tag = C1-1",
            "parameters": {"cioc": 1, "baseplate": 2, "channel": 1},
        },
        {"id": "O", "primitive": "order", "parameters": {"by": "pair"}},
    )
    r = solve(s, pack, rs)
    assert r.gate_only_rules == ["P", "O"]
    # whatever the model chose, the gate decides: either valid or rejected, never emitted invalid
    assert (r.allocation is None) == (r.status == "REJECTED") or r.ok


def test_soft_and_disabled_rules_do_not_constrain(pack):
    s = cable("C1", 4, io="AIR") + cable("C2", 4, io="DIR")
    sep = {"primitive": "separate", "parameters": {"a": "io_type = AIR", "b": "io_type = DIR"}}
    rs = rules_of({"id": "S", "strength": "soft", **sep}, {"id": "D", "enabled": False, **sep})
    r = solve(s, pack, rs)
    assert r.ok and r.gate_only_rules == []


def test_default_preset_rules_hold_on_a_synthetic_plant(pack):
    rs = load_preset(pack)
    s = (
        cable("CA", 6, fam="A") + cable("CB", 6, fam="B") + cable("CL", 22, 24)
        + [x for i in range(5) for x in cable(f"CX{i}", 9)]
    )  # fmt: skip
    r = solve(s, pack, rs.rules)
    ok_with(r, pack, s, rs.rules)


@settings(max_examples=15, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(
    st.lists(
        st.tuples(st.integers(1, 30), st.sampled_from([None, "A", "B", "UNKNOWN:Q"])),
        min_size=1,
        max_size=8,
    )
)
def test_property_result_is_always_valid_or_absent(spec):
    pack = Pack.load(PACK_DIR)
    s = []
    for i, (n, fam) in enumerate(spec):
        s += cable(f"P{i}", n, fam=fam)
    r = solve(s, pack, deterministic_time=0.5)
    if r.allocation is not None:
        assert validate_allocation(r.allocation, pack, s) == []
        placed = {p.signal.tag for p in r.allocation.placements if p.signal}
        listed = {u.signal.tag for u in r.allocation.unplaced}
        assert placed | listed == {x.tag for x in s} and not placed & listed
