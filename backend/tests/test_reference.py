from app.core.audit import compare_reference
from app.core.ingest.merge import merge_files
from app.core.model.pack import Pack
from app.core.reference import load_reference_profile, solve_reference_guided


def test_reference_profile_extracts_confirmed_project_facts(pack_dir, sample_alloc_path):
    profile = load_reference_profile(sample_alloc_path, Pack.load(pack_dir))
    assert len(profile.baseline.layout.cabinets) == 3
    assert len(profile.baseline.layout.ciocs) == 12
    assert profile.wired_pairs == 22
    assert sum(len(v) for v in profile.pack.capacity.wired_spare_pairs.values()) == 22


def test_reference_guided_run_preserves_the_approved_sample_placement(
    pack_dir, sample_mdb_path, sample_alloc_path
):
    pack = Pack.load(pack_dir)
    signals = merge_files([sample_mdb_path], pack).signals
    profile = load_reference_profile(sample_alloc_path, pack)
    result = solve_reference_guided(signals, pack, sample_alloc_path, use_cpsat=False)
    audit = compare_reference(result.allocation, profile.pack, sample_alloc_path)
    # The approved workbook uses cable shapes our contiguous-block rule rejects (legacy layout).
    # They are reported, not hidden; any other kind of violation would be a real defect.
    assert {v.code for v in result.violations} <= {"BLOCK"}
    assert audit.field_matched >= 176
    assert audit.field_placement_exact >= 175
    # Every approved spare position is retained. Some worksheet CHARM/TB variants are not yet
    # represented in the pack's decision table, so their exact part match remains auditable.
    assert audit.wired_hardware_compared == 22 and audit.wired_hardware_exact >= 6
