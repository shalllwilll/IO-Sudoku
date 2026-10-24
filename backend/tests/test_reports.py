from collections import Counter

import openpyxl
import pytest

from app.core.ingest.merge import merge_files
from app.core.layout.blocks import build_blocks
from app.core.model.pack import Pack
from app.core.reports import build_report
from app.core.reports.kpi import compute_kpi
from app.core.solve.greedy import solve_greedy
from app.core.writer.template import build_rows, write_allocation
from tests.test_greedy import cable


@pytest.fixture
def pack(pack_dir):
    return Pack.load(pack_dir)


def run(signals, pack):
    return solve_greedy(build_blocks(signals, pack), pack, "AR1", "100")


def test_kpi_totals_and_spare_split(pack):
    s = cable("C1", 22, 24) + cable("C2", 5)
    k = compute_kpi(run(s, pack), pack)
    assert k.allocated + k.held_out == k.signals_total == len(s)
    assert k.wired_spare_pairs == 0
    assert k.occupied == k.allocated + k.wired_spare_pairs
    assert k.spare_slots == k.positions - k.occupied
    assert k.by_io_type["AIR"] == {"field": 27}


def test_empty_allocation_has_zeros_no_division_error(pack):
    k = compute_kpi(run([], pack), pack)
    assert (k.signals_total, k.cabinets, k.positions, k.utilisation) == (0, 0, 0, 0.0)


def test_rule_check_reports_failure_with_count(pack):
    s = cable("CA", 4, 4, fam="A") + cable("CB", 4, 4, fam="B")
    a = run(s, pack)
    ok = build_report(a, pack, s, [])
    assert all(r.passed for r in ok.rules)
    bad = a.model_copy(deep=True)
    a_cioc = next(p.cioc_no for p in bad.placements if p.block_id == "CA")
    for p in bad.placements:
        if p.block_id == "CB":
            p.cioc_no, p.baseplate = a_cioc, 8
    rep = build_report(bad, pack, s, [])
    seg = next(r for r in rep.rules if r.rule == "R-SEG")
    assert not seg.passed and seg.violations == 1


def test_spare_shortfall_fails_the_rule_check_and_is_reported_as_a_tq(pack):
    signals = cable("DIR", 12, 12)
    alloc = run(signals, pack)
    report = build_report(alloc, pack, signals, alloc.issues)
    spare = next(r for r in report.rules if r.rule == "R-SPARE")
    assert not spare.passed and spare.violations == 1
    assert [i.code for i in alloc.issues] == ["TQ-SPARE"]


def test_not_enforced_listed(pack):
    s = cable("C1", 3)
    rep = build_report(run(s, pack), pack, s, [], not_enforced=["rule X: unsupported primitive"])
    assert rep.rules[-1].enforced is False and rep.declaration.not_enforced


def test_declaration_lists_defaults(pack):
    s = cable("C1", 3)
    a = solve_greedy(build_blocks(s, pack), pack)
    rep = build_report(a, pack, s, a.issues)
    assert any("TQ-NAME" in d for d in rep.declaration.defaulted)
    assert any("relay" in x.lower() or "HW-DOR-RELAY" in x for x in rep.declaration.assumed)
    assert any("boundaries are derived" in x for x in rep.declaration.assumed)


def test_kpi_matches_output_sheet_and_json(pack, blank_template_path, tmp_path):
    s = [
        x.model_copy(update={"signal_type": "4-20 ma HART", "signal_level": "2-Wire"})
        for x in cable("C1", 22, 24) + cable("C2", 5)
    ]
    a = run(s, pack)
    rep = build_report(a, pack, s, a.issues)
    out = write_allocation(a, pack, blank_template_path, tmp_path / "o.xlsx", rep.sheets())
    wb = openpyxl.load_workbook(out)
    ws = wb.worksheets[0]
    col = [c.value for c in ws[1]].index("Tag Status")
    status = Counter(r[col] for r in ws.iter_rows(min_row=2, values_only=True))
    rows = Counter(r["tagstatus"] for r in build_rows(a, pack))
    assert status == rows
    k = rep.kpi
    assert rows["Field"] + rows["Cabinet Alarm"] == k.allocated
    assert rows["Wired Spare"] == k.wired_spare_pairs and rows["Spare Slot"] == k.spare_slots
    summary = dict(wb["Run Summary"].iter_rows(min_row=2, values_only=True))
    assert summary["allocated"] == k.allocated and summary["spare_slots"] == k.spare_slots


def test_sample_report(pack, sample_mdb_path):
    ss = merge_files([sample_mdb_path], pack)
    a = solve_greedy(build_blocks(ss.signals, pack), pack, "P30", "32001")
    rep = build_report(a, pack, ss.signals, ss.issues)
    print(rep.kpi.model_dump(exclude={"spares"}))
    assert rep.kpi.allocated == 189
    assert all(r.passed for r in rep.rules if r.rule != "R-SPARE")
    spare = next(r for r in rep.rules if r.rule == "R-SPARE")
    assert not spare.passed and spare.violations > 0
