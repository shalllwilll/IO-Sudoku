import pytest

from app.core.ingest.merge import merge_files
from app.core.layout.blocks import build_blocks
from app.core.model.pack import Pack
from app.core.solve.greedy import solve_greedy
from app.core.solve.validator import validate_allocation
from tests.test_greedy import cable


@pytest.fixture
def pack(pack_dir):
    return Pack.load(pack_dir)


@pytest.fixture
def base(pack):
    s = cable("CA", 4, 4, fam="A") + cable("CB", 4, 4, fam="B") + cable("CL", 22, 24)
    a = solve_greedy(build_blocks(s, pack), pack, "AR1", "100")
    return a, s


def codes(a, pack, s):
    return sorted({v.code for v in validate_allocation(a, pack, s)})


def test_valid_baseline(base, pack):
    a, s = base
    assert validate_allocation(a, pack, s) == []


def test_duplicate_signal(base, pack):
    a, s = base
    b = a.model_copy(deep=True)
    extra = b.placements[-1].model_copy(update={"channel": 12, "baseplate": 8, "cioc_no": 1})
    b.placements.append(extra)
    assert "DUPLICATE" in codes(b, pack, s)


def test_a_and_b_in_one_cioc(base, pack):
    a, s = base
    b = a.model_copy(deep=True)
    a_cioc = next(p.cioc_no for p in b.placements if p.block_id == "CA")
    for p in b.placements:
        if p.block_id == "CB":
            p.cioc_no = a_cioc
            p.baseplate = 8  # an unused spot of that CIOC
    assert "SEGREGATION" in codes(b, pack, s)


def test_thirteenth_charm_on_baseplate(base, pack):
    a, s = base
    b = a.model_copy(deep=True)
    victim = next(p for p in b.placements if p.block_id == "CA")
    victim.channel = 13
    assert "CAPACITY" in codes(b, pack, s)


def test_broken_contiguity(base, pack):
    a, s = base
    b = a.model_copy(deep=True)
    last = [p for p in b.placements if p.block_id == "CA"][-1]
    last.channel += 3
    assert "BLOCK" in codes(b, pack, s)


def test_big_block_must_start_at_channel_one(base, pack):
    a, s = base
    b = a.model_copy(deep=True)
    for p in b.placements:
        if p.block_id == "CL" and p.baseplate == min(
            q.baseplate for q in b.placements if q.block_id == "CL"
        ):
            p.channel = 13 - p.channel  # reverses order
    assert "BLOCK" in codes(b, pack, s)


def test_missing_signal(base, pack):
    a, s = base
    b = a.model_copy(deep=True)
    b.placements = [p for p in b.placements if not (p.signal and p.signal.tag == "CA-1")]
    assert "MISSING" in codes(b, pack, s)


def test_alarm_baseplate_misuse(base, pack):
    a, s = base
    b = a.model_copy(deep=True)
    p = next(p for p in b.placements if p.block_id == "CA")
    p.cioc_no, p.baseplate, p.channel = 1, 1, 1
    assert "RESERVED" in codes(b, pack, s)


def test_sample_validates(pack, sample_mdb_path):
    ss = merge_files([sample_mdb_path], pack)
    bs = build_blocks(ss.signals, pack)
    a = solve_greedy(bs, pack, "P30", "32001")
    assert validate_allocation(a, pack, ss.signals) == []
