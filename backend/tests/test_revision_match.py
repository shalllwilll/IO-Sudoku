import pytest

from app.core.ingest.merge import merge_files
from app.core.layout.blocks import build_blocks
from app.core.model.pack import Pack
from app.core.model.signal import Signal
from app.core.reports import build_report
from app.core.revision.baseline import Baseline, BaselineError, RunStore, baseline_from_workbook
from app.core.revision.match import (
    filter_revision,
    label_order,
    match_revision,
    normalise_label,
    revision_labels,
)
from app.core.solve.greedy import solve_greedy
from app.core.solve.validator import validate_allocation
from app.core.writer.template import write_allocation
from tests.test_greedy import cable


@pytest.fixture
def pack(pack_dir):
    return Pack.load(pack_dir)


def base_of(signals, pack, store=None, label="00"):
    alloc = solve_greedy(build_blocks(signals, pack), pack, "AR1", "100")
    store = store or RunStore()
    rid = store.save_run(label, alloc, signals, pack.hash)
    return store.load_baseline(rid), alloc


def plant():
    return cable("C1", 8) + cable("C2", 6, io="DIR") + cable("C3", 12)


def edit(signals, tag, **kw):
    return [s.model_copy(update=kw) if s.tag == tag else s for s in signals]


def test_identical_revision_is_all_unchanged(pack):
    s = plant()
    base, _ = base_of(s, pack)
    r = match_revision(base, [x.model_copy() for x in s])
    assert r.counts() == {"unchanged": 26, "modified": 0, "added": 0, "deleted": 0}
    assert not r.issues and all(c.match == "cable_pair" and c.slot for c in r.changes)


def test_added_and_deleted_are_classified(pack):
    s = plant()
    base, _ = base_of(s, pack)
    kept = [x for x in s if x.tag not in {"C1-1", "C1-2", "C3-5"}]
    kept += cable("C9", 5)
    r = match_revision(base, kept)
    assert r.counts() == {"unchanged": 23, "modified": 0, "added": 5, "deleted": 3}
    assert {c.old.tag for c in r.of("deleted")} == {"C1-1", "C1-2", "C3-5"}
    assert all(c.slot for c in r.of("deleted"))  # a deleted row knows the slot it frees
    assert all(c.slot is None for c in r.of("added"))
    assert len(r.changes) == len(kept) + 3  # nothing counted twice or lost


def test_modified_signal_reports_what_changed(pack):
    s = plant()
    base, _ = base_of(s, pack)
    rev = edit(s, "C2-3", io_type="DOR")
    rev = edit(rev, "C1-4", service="new service text")
    rev = edit(rev, "C3-2", segregation_family="A")
    r = match_revision(base, rev)
    assert r.counts()["modified"] == 3 and r.counts()["unchanged"] == 23
    by_tag = {c.new.tag: c for c in r.of("modified")}
    assert by_tag["C2-3"].changed_fields == ["io_type"] and by_tag["C2-3"].impact == ["hardware"]
    assert by_tag["C1-4"].impact == ["info"]
    assert by_tag["C3-2"].impact == ["placement"]


def test_cable_pair_change_matches_by_tag_with_tq_rev(pack):
    s = plant()
    base, _ = base_of(s, pack)
    rev = edit(s, "C1-3", cable="C1X", pair=40)
    r = match_revision(base, rev)
    c = next(c for c in r.changes if c.new.tag == "C1-3")
    assert c.kind == "modified" and c.match == "tag" and c.slot is not None
    assert {"cable", "pair"} <= set(c.changed_fields)
    assert [i.code for i in r.issues] == ["TQ-REV"] and "kept in its slot" in r.issues[0].message
    assert r.counts()["added"] == 0 and r.counts()["deleted"] == 0


def test_ambiguous_match_keeps_a_slot_and_raises_tq_rev(pack):
    s = cable("C1", 4)
    twin = s[0].model_copy(update={"tag": "C1-TWIN", "source_row": 99})
    base, _ = base_of([*s, twin], pack)  # two baseline signals share cable C1 pair 1
    new = s[0].model_copy(update={"tag": "C1-NEW"})
    r = match_revision(base, [new])
    c = next(c for c in r.changes if c.new)
    assert c.kind == "modified" and c.slot is not None and c.issues
    assert c.issues[0].code == "TQ-REV" and "kept the slot" in c.issues[0].message
    assert r.counts()["deleted"] == 4  # the other three baseline signals are gone from this file


def test_same_tag_disambiguates_a_cable_pair_clash_without_tq(pack):
    s = cable("C1", 4)
    twin = s[0].model_copy(update={"tag": "C1-TWIN", "source_row": 99})
    base, _ = base_of([*s, twin], pack)
    r = match_revision(base, [s[0].model_copy()])
    assert next(c for c in r.changes if c.new).kind == "unchanged" and not r.issues


def test_one_baseline_row_is_claimed_once(pack):
    s = cable("C1", 3)
    base, _ = base_of(s, pack)
    r = match_revision(base, [s[0].model_copy(), s[0].model_copy(update={"source_row": 7})])
    assert r.counts()["added"] == 1 and r.counts()["unchanged"] == 1


def test_signals_without_cable_match_by_tag_silently(pack):
    alarm = Signal(tag="ALM-1", io_type="DIR", cabinet_alarm=True, source_file="t", source_row=1)
    base, _ = base_of([*cable("C1", 3), alarm], pack)
    r = match_revision(base, [*cable("C1", 3), alarm.model_copy()])
    c = next(c for c in r.changes if c.new.tag == "ALM-1")
    assert c.kind == "unchanged" and c.match == "tag_only" and not r.issues


def test_row_flagged_deleted_is_a_deletion(pack):
    s = cable("C1", 3)
    base, _ = base_of(s, pack)
    r = match_revision(base, [s[0].model_copy(update={"deleted": True}), *s[1:]])
    d = next(c for c in r.of("deleted") if c.explicit_delete)
    assert d.old.tag == "C1-1" and d.slot is not None


def test_baseline_signals_on_the_tq_list_still_match(pack):
    held = Signal(tag="HELD-1", io_type="AIR", cable="CX", pair=1, source_file="t", source_row=1)
    sigs = cable("C1", 3)
    alloc = solve_greedy(build_blocks(sigs, pack), pack, "AR1", "100")
    store = RunStore()
    base = store.load_baseline(store.save_run("00", alloc, [*sigs, held]))
    r = match_revision(base, [*sigs, held.model_copy()])
    c = next(c for c in r.changes if c.new.tag == "HELD-1")
    assert c.kind == "unchanged" and c.slot is None


# -- revision labels ----------------------------------------------------------------------------
def test_label_filter_from_one_file():
    rows = []
    for label, n in (("01", 2), ("05A", 3), ("05b", 1), (None, 1)):
        rows += [Signal(tag=f"{label}-{i}", revision=label) for i in range(n)]
    assert revision_labels(rows) == ["00", "01", "05A", "05B"]
    assert len(filter_revision(rows, "05A")) == 3 and len(filter_revision(rows, "5a")) == 3
    assert len(filter_revision(rows, "05B")) == 1 and filter_revision(rows, "09") == []


def test_label_order_and_normalising():
    labels = ["05B+", "02", "05A", "01", "05B", "04"]
    assert sorted(labels, key=label_order) == ["01", "02", "04", "05A", "05B", "05B+"]
    assert [normalise_label(x) for x in ("1", " 5a ", "05b+", None, "")] == [
        "01", "05A", "05B+", "00", "00",
    ]  # fmt: skip


# -- store ---------------------------------------------------------------------------------------
def test_schema_creation_twice_is_harmless(tmp_path):
    path = str(tmp_path / "s.db")
    a = RunStore(path)
    assert a.schema_version() == 1
    b = RunStore(path)
    assert b.schema_version() == 1
    assert b.db.execute("SELECT COUNT(*) FROM schema_version").fetchone()[0] == 1
    assert RunStore(path).list_runs() == []


def test_stored_run_round_trips_and_keeps_its_layout(pack, tmp_path):
    s = plant()
    store = RunStore(str(tmp_path / "s.db"))
    base, alloc = base_of(s, pack, store)
    again = RunStore(str(tmp_path / "s.db")).load_baseline(base.run_id)
    assert again.allocation.model_dump_json() == alloc.model_dump_json()
    assert again.layout == alloc.layout and again.label == "00" and again.source.startswith("run:")
    assert validate_allocation(again.allocation, pack, s) == []


def test_run_ids_and_parent_chain(pack):
    s = cable("C1", 3)
    alloc = solve_greedy(build_blocks(s, pack), pack, "AR1", "100")
    store = RunStore()
    a = store.save_run("00", alloc, s)
    b = store.save_run("01", alloc, s, parent_id=a)
    assert (a, b) == ("run-0001", "run-0002")
    assert [r["parent_id"] for r in store.list_runs()] == [None, a]
    with pytest.raises(BaselineError, match="does not exist"):
        store.save_run("02", alloc, s, parent_id="run-9999")
    with pytest.raises(BaselineError, match="does not exist"):
        store.load_baseline("run-9999")


# -- workbook baseline ---------------------------------------------------------------------------
def test_workbook_baseline_round_trips_a_written_allocation(pack, blank_template_path, tmp_path):
    s = [
        x.model_copy(
            update={
                "signal_type": "4-20 ma HART",
                "signal_level": "2-Wire",
                "pair_label": f"Pair {x.pair}",
                "segregation": x.segregation_family,
            }
        )
        for x in cable("C1", 8) + cable("C2", 22, 24) + cable("CA", 5, fam="A")
    ]
    a = solve_greedy(build_blocks(s, pack), pack, "AR1", "100")
    out = write_allocation(a, pack, blank_template_path, tmp_path / "o.xlsx")
    base = baseline_from_workbook(out, pack, label="01")
    assert base.label == "01" and base.source == "workbook:o.xlsx"
    want = {(p.cioc_no, p.baseplate, p.channel, p.kind) for p in a.placements}
    got = {(p.cioc_no, p.baseplate, p.channel, p.kind) for p in base.allocation.placements}
    assert got == want
    assert len(base.layout.ciocs) == len(a.layout.ciocs)
    assert len(base.layout.cabinets) == len(a.layout.cabinets)
    r = match_revision(base, s)
    assert r.counts() == {"unchanged": len(s), "modified": 0, "added": 0, "deleted": 0}


def test_workbook_baseline_from_the_issued_sample(pack, sample_alloc_path, sample_mdb_path):
    base = baseline_from_workbook(sample_alloc_path, pack)
    assert base.signals and base.layout.ciocs and base.allocation.placements
    kinds = {p.kind for p in base.allocation.placements}
    assert kinds <= {"field", "wired_spare", "cabinet_alarm"}
    mdb = merge_files([sample_mdb_path], pack).signals
    r = match_revision(base, mdb)
    counts = r.counts()
    assert sum(counts.values()) == len(r.changes)
    assert counts["unchanged"] + counts["modified"] > 100  # the issued sheet is this MDB's result
    assert counts["added"] == 0 and counts["deleted"] <= 12  # alarms and stale tags only
    print(counts)


def test_not_an_allocation_workbook(tmp_path, pack):
    import openpyxl

    wb = openpyxl.Workbook()
    wb.active.append(["a", "b"])
    wb.save(tmp_path / "x.xlsx")
    with pytest.raises(BaselineError, match="columns missing"):
        baseline_from_workbook(tmp_path / "x.xlsx", pack)


def test_report_still_builds_for_a_loaded_baseline(pack):
    s = plant()
    base, _ = base_of(s, pack)
    rep = build_report(base.allocation, pack, s, [])
    assert rep.kpi.allocated == 26
    assert isinstance(base, Baseline)
