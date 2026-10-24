import random

import pytest

from app.core.layout.blocks import build_blocks
from app.core.model.pack import Pack
from app.core.reports.rule_check import rule_check
from app.core.revision.baseline import baseline_from_workbook
from app.core.rules.lint import lint
from app.core.rules.miner import mine
from app.core.solve.greedy import solve_greedy
from tests.api_helpers import make_client, new_project, run_now, upload, xlsx_bytes
from tests.test_greedy import cable
from tests.test_tq_answers import cable_rows


@pytest.fixture
def pack(pack_dir):
    return Pack.load(pack_dir)


def reference(pack):
    """A packed plant with 120 A signals and 120 B signals, like a real issued allocation."""
    s = [x for i in range(10) for x in cable(f"A{i:02d}", 12, fam="A")]
    s += [x for i in range(10) for x in cable(f"B{i:02d}", 12, fam="B")]
    s += [x for i in range(4) for x in cable(f"C{i:02d}", 7, io="DIR")]
    return solve_greedy(build_blocks(s, pack), pack, "AR1", "100"), s


def by_kind(res, kind):
    return [c for c in res.candidates if c.kind == kind]


def test_rediscovers_separation_and_contiguity_on_a_packed_plant(pack):
    alloc, _ = reference(pack)
    res = mine(alloc, pack)
    sep = next(c for c in res.candidates if c.id == "MINED-SEP-segregation_family-A-B")
    assert sep.rule.primitive == "separate" and sep.confidence == 1.0
    assert sep.evidence["ciocs_in_common"] == 0 and sep.evidence["signals"] == [120, 120]
    con = by_kind(res, "contiguity")[0]
    assert con.confidence == 1.0 and con.already_enforced and con.rule.builtin == "R-BLOCK"
    assert con.evidence["cables_tested"] == 24


def test_sample_rediscovery(pack, sample_alloc_path):  # T11.1.1
    res = mine(baseline_from_workbook(sample_alloc_path, pack).allocation, pack)
    ids = {c.id for c in res.candidates}
    assert "MINED-SEP-segregation_family-A-B" in ids and "MINED-CONTIGUITY" in ids
    assert not any(c.low_confidence for c in res.candidates) and res.signals == 189


def test_every_candidate_shows_evidence(pack):  # T11.1.2
    res = mine(reference(pack)[0], pack)
    assert res.candidates
    for c in res.candidates:
        assert c.evidence and c.support > 0 and 0 < c.confidence <= 1 and c.id == c.rule.id


def test_a_shuffled_allocation_has_no_strong_rules(pack):  # T11.1.3
    alloc, _ = reference(pack)
    shuffled = alloc.model_copy(deep=True)
    sigs = [p.signal for p in shuffled.placements if p.kind == "field"]
    random.Random(7).shuffle(sigs)
    it = iter(sigs)
    for p in shuffled.placements:
        if p.kind == "field":
            p.signal = next(it)
    res = mine(shuffled, pack)
    assert [c.id for c in res.candidates if c.kind in ("separation", "contiguity")] == []


def test_tiny_reference_is_flagged_not_trusted(pack):  # T11.1.4
    s = cable("A1", 3, fam="A") + cable("B1", 2, fam="B")
    res = mine(solve_greedy(build_blocks(s, pack), pack, "AR1", "100"), pack)
    assert res.signals == 5 and res.notes
    assert res.candidates and all(c.low_confidence for c in res.candidates)
    assert not any(c.kind == "separation" for c in res.candidates)  # below the support threshold


def test_empty_allocation_mines_nothing(pack):  # T11.1.5
    res = mine(solve_greedy(build_blocks([], pack), pack, "AR1", "100"), pack)
    assert res.candidates == [] and res.signals == 0


def test_deterministic(pack):  # T11.1.6
    alloc, _ = reference(pack)
    assert mine(alloc, pack).model_dump_json() == mine(alloc, pack).model_dump_json()
    ids = [(-c.support, -c.confidence, c.id) for c in mine(alloc, pack).candidates]
    assert ids == sorted(ids)


def test_mined_rules_lint_and_hold_on_the_reference(pack):
    alloc, signals = reference(pack)
    rules = [c.rule for c in mine(alloc, pack).candidates if not c.already_enforced]
    assert rules and [f for f in lint(rules, signals) if f.severity == "error"] == []
    for r in rule_check(alloc, pack, signals, None, rules):
        if r.rule.startswith("MINED"):
            assert r.passed and r.violations == 0, r.rule


def grouped_allocation(pack):
    s = []
    for g in range(6):
        s += [x.model_copy(update={"logic_number": f"L{g}"}) for x in cable(f"G{g:02d}", 6)]
        s += [x.model_copy(update={"logic_number": f"L{g}"}) for x in cable(f"H{g:02d}", 6)]
    return solve_greedy(build_blocks(s, pack), pack, "AR1", "100")


def test_co_location_is_found_when_groups_sit_together(pack):
    co = by_kind(mine(grouped_allocation(pack), pack), "co_locate")
    assert co and co[0].rule.parameters["by"] == "logic_number" and co[0].confidence == 1.0
    assert co[0].evidence["groups_tested"] == 6


def test_co_location_is_refused_when_groups_are_split(pack):
    alloc = grouped_allocation(pack).model_copy(deep=True)
    for p in alloc.placements:
        if p.signal and p.signal.cable.startswith("H"):
            p.cioc_no = 2  # half of every group now sits in another CIOC
    assert by_kind(mine(alloc, pack), "co_locate") == []


def test_api_mines_a_run_and_a_reference_workbook(tmp_path, sample_alloc_path):
    c = make_client(tmp_path)
    pid = new_project(c)
    rows = [r for i in range(10) for r in cable_rows(f"320-CE-{i:04d}", 12, seg="A")]
    rows += [r for i in range(10) for r in cable_rows(f"320-CE-{i + 20:04d}", 12, seg="B")]
    upload(c, pid, xlsx_bytes(tmp_path, rows))
    run = run_now(c, pid)
    r = c.post(f"/api/projects/{pid}/rules/mine", json={"run_id": run["id"]})
    assert r.status_code == 200
    got = r.json()
    assert {x["kind"] for x in got["candidates"]} >= {"separation", "contiguity"}
    sep = next(x for x in got["candidates"] if x["kind"] == "separation")
    ok = c.post(f"/api/projects/{pid}/rules/compile/confirm", json={"rule": sep["rule"]})
    assert ok.status_code == 200 and ok.json()["rules"][-1]["id"] == sep["rule"]["id"]
    assert c.post(f"/api/projects/{pid}/rules/mine", json={"run_id": "nope"}).status_code == 404
    up = c.post(f"/api/projects/{pid}/rules/mine/upload",
                files={"file": ("ref.xlsx", sample_alloc_path.read_bytes())})  # fmt: skip
    assert up.status_code == 200 and up.json()["signals"] == 189
    bad = c.post(f"/api/projects/{pid}/rules/mine/upload", files={"file": ("x.exe", b"MZ")})
    assert bad.status_code == 415
    assert not list((tmp_path / "outputs" / pid).glob("ref_*"))
