import pytest

from app.core.layout.blocks import build_blocks
from app.core.model.pack import Pack
from app.core.revision.solve import solve_revision
from app.core.rules.schema import load_rules
from app.core.solve import chain as chain_mod
from app.core.solve import cpsat
from app.core.solve.chain import run_chain
from app.core.solve.greedy import pack_blocks, solve_greedy
from app.core.solve.qiga import fitness, solve_qiga
from app.core.solve.validator import validate_allocation
from tests.test_greedy import cable
from tests.test_revision_solve import baseline_of, plant

FAST = {"deterministic_time": 2.0}


@pytest.fixture
def pack(pack_dir):
    return Pack.load(pack_dir)


def many(prefix, n, size):
    return [s for i in range(1, n + 1) for s in cable(f"{prefix}{i}", size)]


def small_rule():
    """The smalls must sit in CIOC 1, which first-fit-decreasing has already filled with bigs."""
    return load_rules(
        [{"id": "R-S", "primitive": "assign", "scope": "cable in [S1,S2,S3]",
          "parameters": {"cioc": 1}}]
    )  # fmt: skip


def hard(pack):
    signals = many("B", 4, 24) + many("S", 3, 12)
    return signals, build_blocks(signals, pack), small_rule()


def gate_for(blocks, pack, rules):
    return lambda a: cpsat.gate(a, blocks, pack, rules)


def chain(blocks, pack, rules, **kw):
    return run_chain(blocks, pack, "AR1", "100", rules, **{**FAST, "cpsat_enabled": False, **kw})


def stages(res):
    return [(e.stage, e.status) for e in res.events]


def cells(alloc):
    return sorted(
        (p.signal.tag, p.cioc_no, p.baseplate, p.channel) for p in alloc.placements if p.signal
    )


def test_solves_a_case_greedy_leaves_on_the_tq_list(pack):  # T11.2.1
    _, blocks, rules = hard(pack)
    g = solve_greedy(blocks, pack, "AR1", "100", rules)
    assert g.unplaced and {i.code for u in g.unplaced for i in u.issues} == {"TQ-RULE"}
    r = solve_qiga(blocks, g.layout, pack, rules, g, gate=gate_for(blocks, pack, rules))
    assert r.status == "improved" and r.allocation is not None and not r.allocation.unplaced
    assert r.allocation.solver == "qiga"
    assert validate_allocation(r.allocation, pack, *cpsat.solver_inputs(blocks), rules) == []
    assert fitness(r.allocation)[0] < fitness(g)[0]


def test_same_seed_gives_the_same_allocation(pack):  # T11.2.2
    _, blocks, rules = hard(pack)
    g = solve_greedy(blocks, pack, "AR1", "100", rules)
    gate = gate_for(blocks, pack, rules)
    a = solve_qiga(blocks, g.layout, pack, rules, g, gate=gate, seed=7)
    b = solve_qiga(blocks, g.layout, pack, rules, g, gate=gate, seed=7)
    assert cells(a.allocation) == cells(b.allocation)
    assert (a.evaluated, a.log) == (b.evaluated, b.log)


def test_infeasible_instance_stays_on_the_tq_list(pack):  # T11.2.3
    rules = load_rules(
        [
            {"id": "R-ONE", "primitive": "assign", "parameters": {"cabinet": 1}},
            {"id": "R-TWO", "primitive": "assign", "parameters": {"cabinet": 2}},
        ]
    )
    signals = cable("C1", 4)
    blocks = build_blocks(signals, pack)
    res = chain(blocks, pack, rules)
    assert len(res.allocation.unplaced) == 4 and not res.allocation.placements
    assert ("qiga", "kept") in stages(res)
    assert res.solver == "greedy"
    assert any(i.code == "TQ-RULE" and "R-ONE" in i.message for i in res.allocation.issues)


def test_overfull_plant_is_not_forced_into_a_fake_fit(pack):
    signals = many("B", 20, 24)
    blocks = build_blocks(signals, pack)
    capped = pack.model_copy(
        update={"capacity": pack.capacity.model_copy(update={"max_cabinets": 1})}
    )
    res = chain(blocks, capped, None)
    assert res.allocation.unplaced
    placed = {p.signal.tag for p in res.allocation.placements if p.signal}
    assert placed | {u.signal.tag for u in res.allocation.unplaced} == {s.tag for s in signals}
    assert validate_allocation(res.allocation, capped, signals) == []


def test_an_invalid_candidate_is_rejected_by_the_gate(pack):  # T11.2.4
    _, blocks, rules = hard(pack)
    g = solve_greedy(blocks, pack, "AR1", "100", rules)

    def liar(blocks_, layout, pack_, rules_, pinned, prefs, fixed, order, prefer):
        alloc = pack_blocks(blocks_, layout, pack_, rules_, pinned, prefs, fixed, order, prefer)
        alloc.unplaced = []  # claim success: the unplaced signals simply vanish
        return alloc

    r = solve_qiga(
        blocks, g.layout, pack, rules, g, gate=gate_for(blocks, pack, rules), decode=liar
    )
    assert r.status == "rejected" and r.allocation is None and "validator" in r.message


def test_chain_keeps_greedy_when_the_gate_rejects_qiga(pack, monkeypatch):  # T11.2.4
    _, blocks, rules = hard(pack)
    real = chain_mod.solve_qiga

    def liar(blocks_, layout, pack_, rules_, seed_alloc, **kw):
        def decode(*a):
            alloc = pack_blocks(*a)
            alloc.unplaced = []
            return alloc

        return real(blocks_, layout, pack_, rules_, seed_alloc, **{**kw, "decode": decode})

    monkeypatch.setattr(chain_mod, "solve_qiga", liar)
    res = chain(blocks, pack, rules)
    assert res.solver == "greedy" and ("qiga", "fallback") in stages(res)
    assert res.fell_back and res.allocation.unplaced


@pytest.mark.parametrize("seed", [1, 2, 3, 11])
def test_another_seed_still_validates(pack, seed):  # T11.2.5
    _, blocks, rules = hard(pack)
    g = solve_greedy(blocks, pack, "AR1", "100", rules)
    r = solve_qiga(blocks, g.layout, pack, rules, g, gate=gate_for(blocks, pack, rules), seed=seed)
    assert r.status in ("improved", "no_gain")
    if r.allocation is not None:
        assert validate_allocation(r.allocation, pack, *cpsat.solver_inputs(blocks), rules) == []


def test_chain_order_is_cpsat_greedy_qiga(pack, monkeypatch):  # T11.2.6
    signals, blocks, rules = hard(pack)
    monkeypatch.setattr(
        cpsat, "solve_cpsat", lambda *a, **k: (_ for _ in ()).throw(cpsat.CpsatError("boom"))
    )
    res = run_chain(blocks, pack, "AR1", "100", rules, cpsat_enabled=True, **FAST)
    assert stages(res) == [("cpsat", "fallback"), ("greedy", "used"), ("qiga", "used")]
    assert res.solver == "qiga" and res.fell_back and not res.allocation.unplaced
    assert validate_allocation(res.allocation, pack, signals, None, rules) == []


def test_greedy_failing_the_gate_skips_qiga_and_lists_everything(pack, monkeypatch):  # T11.2.6
    _, blocks, rules = hard(pack)
    monkeypatch.setattr(cpsat, "gate", lambda *a, **k: [type("V", (), {"message": "bad"})()])
    res = chain(blocks, pack, rules)
    assert res.solver == "tq" and "qiga" not in [s for s, _ in stages(res)]


def test_disabled_stage_leaves_the_greedy_path_unchanged(pack):  # T11.2.R
    _, blocks, rules = hard(pack)
    off = chain(blocks, pack, rules, qiga_enabled=False)
    plain = solve_greedy(blocks, pack, "AR1", "100", rules)
    assert off.solver == "greedy" and stages(off)[:2] == [("cpsat", "skipped"), ("greedy", "used")]
    assert ("qiga", "skipped") in stages(off)
    assert cells(off.allocation) == cells(plain)
    assert [u.signal.tag for u in off.allocation.unplaced] == [u.signal.tag for u in plain.unplaced]


def test_nothing_to_improve_means_no_qiga_event(pack):  # T11.2.R
    blocks = build_blocks(cable("C1", 5) + cable("C2", 7), pack)
    res = chain(blocks, pack, None)
    assert stages(res) == [("cpsat", "skipped"), ("greedy", "used")]
    cp = run_chain(blocks, pack, "AR1", "100", None, cpsat_enabled=True, **FAST)
    assert stages(cp) == [("cpsat", "used")] and cp.solver == "cpsat"


def test_a_cpsat_answer_is_never_touched(pack):  # T11.2.R
    _, blocks, rules = hard(pack)
    res = run_chain(blocks, pack, "AR1", "100", rules, cpsat_enabled=True, **FAST)
    assert res.solver == "cpsat" and stages(res) == [("cpsat", "used")]


def test_setting_switches_the_stage_off(pack, monkeypatch):
    _, blocks, rules = hard(pack)
    monkeypatch.setenv("SUDOKU_QIGA", "0")
    assert ("qiga", "skipped") in stages(chain(blocks, pack, rules))
    monkeypatch.setenv("SUDOKU_QIGA", "1")
    assert ("qiga", "used") in stages(chain(blocks, pack, rules))


def test_cache_key_separates_the_stage_setting(pack):
    from app.core.solve.cache import ResultCache

    _, blocks, rules = hard(pack)
    cache = ResultCache()
    on = chain(blocks, pack, rules, qiga_enabled=True, cache=cache)
    off = chain(blocks, pack, rules, qiga_enabled=False, cache=cache)
    assert on.key != off.key and on.solver == "qiga" and off.solver == "greedy"
    again = chain(blocks, pack, rules, qiga_enabled=True, cache=cache)
    assert again.cached and cells(again.allocation) == cells(on.allocation)


def test_large_instances_skip_the_search(pack):
    signals = many("K", 6, 3)
    blocks = build_blocks(signals, pack)
    g = solve_greedy(blocks, pack, "AR1", "100")
    small = pack.model_copy(
        update={"capacity": pack.capacity.model_copy(update={"qiga_max_blocks": 3})}
    )
    r = solve_qiga(blocks, g.layout, small, None, g, gate=gate_for(blocks, small, None))
    assert r.status == "skipped" and "limit" in r.message


def test_revision_overflow_goes_to_qiga_around_the_pins(pack):
    base, _ = baseline_of(plant(), pack)
    new = many("B", 3, 24) + many("S", 3, 12)
    revised = plant() + new
    off = solve_revision(base, revised, pack, small_rule(), use_cpsat=False, use_qiga=False, **FAST)
    on = solve_revision(base, revised, pack, small_rule(), use_cpsat=False, use_qiga=True, **FAST)
    assert off.solver == "greedy-pin" and off.allocation.unplaced
    assert on.solver == "qiga" and not on.allocation.unplaced and on.violations == []
    assert on.pinned_blocks == off.pinned_blocks
    kept = {(t, c, b, ch) for t, c, b, ch in cells(base.allocation)}
    assert kept <= set(cells(on.allocation))  # pinned blocks did not move
