from app.core.audit import compare_reference
from app.core.ingest.merge import merge_files
from app.core.layout.blocks import build_blocks
from app.core.model.pack import Pack
from app.core.solve.greedy import solve_greedy


def test_sample_audit_preserves_current_or_better_reconciliation(
    pack_dir, sample_mdb_path, sample_alloc_path
):
    pack = Pack.load(pack_dir)
    signals = merge_files([sample_mdb_path], pack).signals
    allocation = solve_greedy(build_blocks(signals, pack), pack, "P30", "32001")
    audit = compare_reference(allocation, pack, sample_alloc_path)
    assert audit.field_reference == 177
    assert audit.field_matched >= 176
    assert audit.alarm_matched == audit.alarm_reference == 12
    assert audit.wired_hardware_exact >= 19
    assert audit.wired_hardware_exact <= audit.wired_hardware_compared
