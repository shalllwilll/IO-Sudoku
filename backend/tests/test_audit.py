from app.core.audit import compare_reference
from app.core.ingest.merge import merge_files
from app.core.layout.blocks import build_blocks
from app.core.model.pack import Pack
from app.core.solve.greedy import solve_greedy


def test_sample_audit_keeps_field_and_alarm_reconciliation_without_inferring_wiring_plan(
    pack_dir, sample_mdb_path, sample_alloc_path
):
    pack = Pack.load(pack_dir)
    signals = merge_files([sample_mdb_path], pack).signals
    allocation = solve_greedy(build_blocks(signals, pack), pack, "P30", "32001")
    audit = compare_reference(allocation, pack, sample_alloc_path)
    assert audit.field_reference == 177
    assert audit.field_matched >= 176
    assert audit.alarm_matched == audit.alarm_reference == 12
    # The MDB does not identify which unused cable pairs were physically wired. The engine must
    # not claim a CHARM/TB match for a protected slot merely because the reference happens to use
    # one; a confirmed spare plan is the input that enables that comparison.
    assert audit.wired_hardware_exact == audit.wired_hardware_compared == 0
