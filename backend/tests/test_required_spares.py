import pytest

from app.core.layout.blocks import build_blocks
from app.core.layout.spares import spare_report
from app.core.model.pack import Pack
from app.core.rules.schema import load_rules
from app.core.solve.chain import run_chain
from app.core.solve.validator import validate_allocation
from tests.test_greedy import cable

FAST = {"deterministic_time": 2.0}


@pytest.fixture
def pack(pack_dir):
    return Pack.load(pack_dir)


def chain(signals, pack, rules=None):
    blocks = build_blocks(signals, pack)
    return blocks, run_chain(blocks, pack, "AR1", "100", rules, **FAST)


def kinds(res, kind):
    return [p for p in res.allocation.placements if p.kind == kind]


def test_default_policy_is_required_spares(pack):
    assert pack.capacity.wired_spare_policy == "required_spares"


def test_requirement_is_met_from_declared_unused_pairs(pack):
    signals = [s for n in "ABC" for s in cable(f"C{n}", 10, pairs=12)]  # 30 AIR -> 3 spares
    blocks, res = chain(signals, pack)
    assert len(kinds(res, "wired_spare")) == 3
    assert all(p.io_type == "AIR" for p in kinds(res, "wired_spare"))
    codes = {(i.code, i.data.get("kind")) for i in res.allocation.issues}
    assert ("TQ-SPARE", "wired_spare_assumed") in codes
    assert ("TQ-SPARE", "wired_spare_shortfall") not in codes
    assert not [r for r in spare_report(res.allocation, pack).by_controller_io if r.shortfall]
    assert validate_allocation(res.allocation, pack, signals, blocks.alarm_signals) == []


def test_spares_cluster_in_few_cables_lowest_pair_first(pack):
    signals = [s for n in "ABC" for s in cable(f"C{n}", 10, pairs=12)]
    _, res = chain(signals, pack)
    spares = kinds(res, "wired_spare")
    assert len({p.block_id for p in spares}) == 2  # two free pairs per cable, three needed
    for cab in {p.block_id for p in spares}:
        assert min(p.pair for p in spares if p.block_id == cab) == 11


def test_no_declared_free_pairs_leaves_a_truthful_shortfall(pack):
    signals = [s for n in "AB" for s in cable(f"C{n}", 12)]  # fully used cables
    _, res = chain(signals, pack)
    assert kinds(res, "wired_spare") == []
    assert any(i.data.get("kind") == "wired_spare_shortfall" for i in res.allocation.issues)


def test_a_promotion_that_would_break_a_hard_rule_is_undone(pack):
    signals = cable("CA", 10, pairs=12)  # needs 1 spare; the capacity rule leaves no room
    rules = load_rules(
        [{"id": "R-CAP", "primitive": "capacity", "parameters": {"per": "cioc", "max": 10}}]
    )
    _, res = chain(signals, pack, rules)
    assert kinds(res, "wired_spare") == []
    assert any(i.data.get("kind") == "wired_spare_shortfall" for i in res.allocation.issues)


def test_other_policies_do_not_promote(pack):
    signals = [s for n in "ABC" for s in cable(f"C{n}", 10, pairs=12)]
    cap = pack.capacity.model_copy(update={"wired_spare_policy": "explicit_pairs"})
    _, res = chain(signals, pack.model_copy(update={"capacity": cap}))
    assert kinds(res, "wired_spare") == []
