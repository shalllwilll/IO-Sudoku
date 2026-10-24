import pytest

from app.core.ingest.merge import merge_files
from app.core.layout.blocks import build_blocks
from app.core.layout.derive import derive_layout
from app.core.layout.spares import spare_report
from app.core.model.pack import Pack
from app.core.model.signal import Signal
from app.core.solve.greedy import pack_blocks, solve_greedy


@pytest.fixture
def pack(pack_dir):
    return Pack.load(pack_dir)


def cable(name, n, pairs=None, fam=None, ln=None, io="AIR"):
    pairs = pairs or n
    return [
        Signal(
            tag=f"{name}-{i}", io_type=io, cable=name, pair=i, cable_formation=f"{pairs:02d}PX1MM2",
            cable_pairs=pairs, segregation_family=fam, logic_number=ln, source_file="t", source_row=i,
        )
        for i in range(1, n + 1)
    ]  # fmt: skip


def run(signals, pack):
    return solve_greedy(build_blocks(signals, pack), pack, "AR1", "100")


def tags(alloc):
    return sorted(
        [p.signal.tag for p in alloc.placements if p.kind == "field"]
        + [u.signal.tag for u in alloc.unplaced]
    )


def test_all_placed_or_listed(pack):
    s = cable("C1", 22, 24) + cable("C2", 5) + cable("C3", 12)
    a = run(s, pack)
    assert tags(a) == sorted(x.tag for x in s) and not a.unplaced


def test_big_block_starts_on_channel_one_consecutive(pack):
    a = run(cable("C1", 22, 24), pack)
    pl = [p for p in a.placements if p.block_id == "C1"]
    assert {p.cioc_no for p in pl} == {1}
    assert sorted({p.baseplate for p in pl}) == [2, 3]
    assert [p.channel for p in pl if p.baseplate == 2] == list(range(1, 13))
    assert sum(p.kind == "wired_spare" for p in pl) == 2


def test_a_and_b_never_share_a_cioc(pack):
    a = run(cable("CA", 4, fam="A") + cable("CB", 4, fam="B"), pack)
    fam = {}
    for p in a.placements:
        if p.signal and p.signal.segregation_family:
            fam.setdefault(p.cioc_no, set()).add(p.signal.segregation_family)
    assert all(len(v) == 1 for v in fam.values()) and len(fam) == 2


def test_mixed_ab_cable_gets_tq_seg(pack):
    s = cable("CM", 4, fam="A")
    s[0] = s[0].model_copy(update={"segregation_family": "B"})
    a = run(s, pack)
    assert len(a.unplaced) == 4 and a.unplaced[0].issues[0].code == "TQ-SEG"


def test_unknown_segregation_gets_own_cioc(pack):
    a = run(cable("CQ", 3, fam="UNKNOWN:Q") + cable("CN", 3), pack)
    q = {p.cioc_no for p in a.placements if p.block_id == "CQ"}
    n = {p.cioc_no for p in a.placements if p.block_id == "CN"}
    assert not (q & n)


def test_over_capacity_tq_cap_without_overflow(pack):
    p = pack.model_copy(update={"capacity": pack.capacity.model_copy(update={"max_cabinets": 1})})
    a = run([x for i in range(40) for x in cable(f"C{i:02d}", 12)], p)
    assert a.unplaced and all(u.issues[0].code == "TQ-CAP" for u in a.unplaced)
    assert len(a.layout.cabinets) == 1
    cells = [(q.cioc_no, q.baseplate, q.channel) for q in a.placements]
    assert len(cells) == len(set(cells))


def test_single_signal_blocks_pack_contiguously(pack):
    s = [x for i in range(12) for x in cable(f"S{i:02d}", 1)]
    a = run(s, pack)
    bps = {(p.cioc_no, p.baseplate) for p in a.placements}
    assert len(bps) == 1 and sorted(p.channel for p in a.placements) == list(range(1, 13))


def test_deterministic_byte_identical(pack):
    s = cable("C1", 22, 24) + cable("C2", 5) + cable("C3", 7, fam="B")
    assert run(s, pack).model_dump_json() == run(s, pack).model_dump_json()


def test_input_layout_not_mutated(pack):
    bs = build_blocks(cable("C1", 5), pack)
    lay = derive_layout(bs, pack, "AR1", "100")
    before = lay.model_dump_json()
    pack_blocks(bs, lay, pack)
    assert lay.model_dump_json() == before


def test_spare_report_kinds(pack):
    a = run(cable("C1", 10, 12) + cable("C2", 24, 24), pack)
    rep = spare_report(a, pack)
    cab = rep.cabinets[0]
    assert cab.wired_spare_pairs == 2
    assert cab.required_empty_baseplates == 3 and cab.ok
    row = rep.by_controller_io[0]
    assert row.field_signals == 34 and row.wired_spares == 2 and row.required == 3
    assert row.shortfall == 1


def test_sample_packs(pack, sample_mdb_path):
    ss = merge_files([sample_mdb_path], pack)
    bs = build_blocks(ss.signals, pack)
    a = solve_greedy(bs, pack, "P30", "32001")
    placed = sum(1 for p in a.placements if p.kind in ("field", "cabinet_alarm"))
    assert placed + len(a.unplaced) == 189 and not a.unplaced
    rep = spare_report(a, pack)
    print(a.utilisation(), [c.model_dump() for c in rep.cabinets], a.cioc_labels)
    assert all(c.ok for c in rep.cabinets)
