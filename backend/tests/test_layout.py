import pytest

from app.core.ingest.merge import merge_files
from app.core.layout.blocks import build_blocks
from app.core.layout.derive import cabinets_needed, derive_layout
from app.core.layout.reserve import spare_baseplates, usable_baseplates_per_cabinet
from app.core.model.pack import Pack
from app.core.model.signal import Signal


@pytest.fixture
def pack(pack_dir):
    return Pack.load(pack_dir)


def cables(n_cables, per=12, fam=None):
    out = []
    for c in range(n_cables):
        out += [
            Signal(
                tag=f"T{c}-{i}", io_type="AIR", cable=f"C{c:03d}", pair=i,
                cable_formation=f"{per:02d}PX1MM2", cable_pairs=per, segregation_family=fam,
            )
            for i in range(1, per + 1)
        ]  # fmt: skip
    return out


def test_spare_and_usable(pack):
    assert spare_baseplates(pack) == 3
    assert usable_baseplates_per_cabinet(pack) == 28


def test_zero_signals_empty_layout(pack):
    lay = derive_layout(build_blocks([], pack), pack)
    assert lay.cabinets == [] and lay.ciocs == [] and lay.controllers == []


def test_exactly_full_cabinet_needs_no_extra(pack):
    bs = build_blocks(cables(28), pack)  # 28 baseplates of 12 = usable capacity
    assert cabinets_needed(bs, pack) == 1
    assert cabinets_needed(build_blocks(cables(29), pack), pack) == 2


def test_structure_and_limits(pack):
    lay = derive_layout(build_blocks(cables(60), pack), pack, "AR1", "100")
    assert len(lay.cabinets) == 3 and len(lay.ciocs) == 12
    assert all(len(c.ciocs) <= 4 for c in lay.cabinets)
    assert all(len(c.baseplates) == 8 for c in lay.ciocs)
    for cab in lay.cabinets:
        first = lay.cioc(cab.ciocs[0]).baseplates[0]
        assert first.reserved == "alarm"
        spares = [b for c in cab.ciocs for b in lay.cioc(c).baseplates if b.reserved == "spare"]
        assert len(spares) == 3
    assert [c.controller for c in lay.ciocs] == [1] * 12


def test_controllers_split_by_parameter(pack):
    cap = pack.capacity.model_copy(update={"ciocs_per_controller": 4})
    p = pack.model_copy(update={"capacity": cap})
    lay = derive_layout(build_blocks(cables(60), p), p, "AR1", "100")
    assert [len(c.ciocs) for c in lay.controllers] == [4, 4, 4]


def test_names_unique_and_default_tq(pack):
    lay = derive_layout(build_blocks(cables(60), pack), pack)
    names = [c.name for c in lay.cabinets] + [c.name for c in lay.ciocs]
    names += [b.name for c in lay.ciocs for b in c.baseplates]
    assert len(names) == len(set(names))
    assert any(i.code == "TQ-NAME" for i in lay.issues)
    assert lay.ciocs[0].name == "AR1CIOC100001" and lay.ciocs[0].baseplates[0].name == "001-CBP-1"


def test_capacity_exceeded_tq_cap(pack):
    p = pack.model_copy(update={"capacity": pack.capacity.model_copy(update={"max_cabinets": 1})})
    lay = derive_layout(build_blocks(cables(60), p), p, "AR1", "100")
    assert len(lay.cabinets) == 1 and any(i.code == "TQ-CAP" for i in lay.issues)


def test_class_plan_counts_segregation(pack):
    s = cables(8, fam="A") + [
        x.model_copy(update={"cable": "Z" + x.cable, "segregation_family": "B"}) for x in cables(1)
    ]
    lay = derive_layout(build_blocks(s, pack), pack, "AR1", "100")
    assert lay.class_plan == {"A": 1, "B": 1}


def test_sample_layout(pack, sample_mdb_path):
    ss = merge_files([sample_mdb_path], pack)
    bs = build_blocks(ss.signals, pack)
    lay = derive_layout(bs, pack, "P30", "32001")
    print(
        f"cabinets={len(lay.cabinets)} ciocs={len(lay.ciocs)} "
        f"baseplates={sum(len(c.baseplates) for c in lay.ciocs)} "
        f"controllers={len(lay.controllers)} plan={lay.class_plan}"
    )
    assert len(lay.cabinets) >= 1 and len(lay.ciocs) == 4 * len(lay.cabinets)
