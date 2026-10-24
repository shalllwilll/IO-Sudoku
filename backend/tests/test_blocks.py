import random

import pytest

from app.core.ingest.merge import merge_files
from app.core.layout.blocks import baseplates_needed, build_blocks, single_baseplate
from app.core.model.pack import Pack
from app.core.model.signal import Signal


@pytest.fixture
def pack(pack_dir):
    return Pack.load(pack_dir)


def sigs(cable, n, formation="24PX1MM2/FR", ln=None, start=1, seg=None):
    return [
        Signal(
            tag=f"{cable}-{i}", io_type="AIR", cable=cable, pair=i, cable_formation=formation,
            cable_pairs=int(formation[:2]) if formation else None, logic_number=ln,
            segregation_family=seg,
        )
        for i in range(start, start + n)
    ]  # fmt: skip


def test_24_pair_cable_22_signals_plus_2_protected_spare_slots(pack):
    bs = build_blocks(sigs("C1", 22), pack)
    (b,) = bs.blocks
    assert b.size == 24 and b.wired_spares == 0 and baseplates_needed(b, pack) == 2
    assert [p.kind for p in b.positions[-2:]] == ["spare_slot", "spare_slot"]
    assert not single_baseplate(b, pack)


def test_12_position_block_is_single_baseplate(pack):
    (b,) = build_blocks(sigs("C1", 12, "12PX1MM2"), pack).blocks
    assert b.size == 12 and single_baseplate(b, pack)


def test_oversized_cable_tq_cap(pack):
    bs = build_blocks(sigs("BIG", 100, "100PX1MM2"), pack)
    assert not bs.blocks and len(bs.held_out) == 100
    assert bs.issues[0].code == "TQ-CAP"


def test_logic_number_merges_cables(pack):
    s = sigs("C1", 3, ln="LN1") + sigs("C2", 3, ln="LN1") + sigs("C3", 3, ln="LN9")
    g = build_blocks(s, pack).groups
    assert [x.cables for x in g] == [["C1", "C2"], ["C3"]]


def test_alarms_kept_apart_from_blocks(pack):
    a = Signal(tag="A", io_type="DIR", cabinet_alarm=True, internal_wiring=True)
    bs = build_blocks(sigs("C1", 2) + [a], pack)
    assert bs.alarm_signals == [a] and len(bs.blocks) == 1


def test_shuffle_is_stable(pack):
    s = sigs("C1", 5, ln="X") + sigs("C2", 4, ln="X") + sigs("C3", 7)
    a = build_blocks(s, pack)
    random.Random(3).shuffle(s)
    b = build_blocks(s, pack)
    assert [x.id for x in a.blocks] == [x.id for x in b.blocks]
    assert a.groups == b.groups
    assert [[p.pair for p in x.positions] for x in a.blocks] == [
        [p.pair for p in x.positions] for x in b.blocks
    ]


def test_sample_blocks(pack, sample_mdb_path):
    ss = merge_files([sample_mdb_path], pack)
    bs = build_blocks(ss.signals, pack)
    assert len(bs.alarm_signals) == 12 and not bs.held_out
    assert sum(len(b.signals) for b in bs.blocks) == 177
    assert bs.positions == sum(b.size for b in bs.blocks)
    assert bs.positions == sum(b.size for b in bs.blocks)
    print(
        f"blocks={len(bs.blocks)} positions={bs.positions} groups={len(bs.groups)}",
        [(g.id, g.positions) for g in bs.groups],
    )
