"""Properties that must hold for any plant, checked on generated workbooks.

Each property renders the same plant two ways (a different row order, header spelling, file
split, area name, ...) and compares what the pipeline allocates.
"""

import tempfile
from dataclasses import replace
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.core.model.pack import Pack
from app.core.pipeline import Pipeline
from app.core.revision.baseline import RunStore
from app.core.revision.solve import solve_revision
from app.core.rules.schema import load_rules
from app.core.solve import cpsat
from tests.conftest import PACK_DIR
from tests.generators import MdbSpec, mdb_specs, write_mdb
from tests.test_greedy import cable

PACK = Pack.load(PACK_DIR)
PLAIN = mdb_specs(awkward=False)
AWKWARD = mdb_specs()


def run(spec: MdbSpec, area="AR1", unit="100", rules=None, **kw):
    with tempfile.TemporaryDirectory() as d:
        paths = write_mdb(spec, Path(d))
        return Pipeline(paths, PACK, area, unit, rules, cpsat_enabled=False, **kw).run()


def cells(alloc):
    return sorted(
        (p.kind, p.signal.tag if p.signal else "", p.cioc_no, p.baseplate, p.channel)
        for p in alloc.placements
    )


def listed(r):
    return sorted(u.signal.tag for u in r.allocation.unplaced)


def check_invariant(spec, r):
    """T12.1.7: every signal is allocated or on the TQ list, and the allocation validates."""
    assert r.unaccounted() == []
    assert sorted(s.tag for s in r.signalset.signals) == sorted(spec.tags())
    assert cpsat.gate(r.allocation, r.blocks, r.pack, r.rules) == []


@given(AWKWARD)
def test_every_generated_plant_allocates_validly(spec):  # T12.1.1 / T12.1.7
    check_invariant(spec, run(spec))


@given(AWKWARD)
def test_determinism(spec):
    with tempfile.TemporaryDirectory() as d:  # one write: openpyxl stamps a creation time
        paths = write_mdb(spec, Path(d))
        a = Pipeline(paths, PACK, "AR1", "100", cpsat_enabled=False).run()
        b = Pipeline(paths, PACK, "AR1", "100", cpsat_enabled=False).run()
    assert a.allocation.model_dump_json() == b.allocation.model_dump_json()
    assert a.hashes == b.hashes


@given(AWKWARD, st.integers(0, 10**6))
def test_row_shuffle_invariance(spec, seed):
    a = run(replace(spec, shuffle_seed=None))
    b = run(replace(spec, shuffle_seed=seed))
    assert cells(a.allocation) == cells(b.allocation)
    assert listed(a) == listed(b)


@given(AWKWARD, st.integers(1, 3))
def test_file_split_invariance(spec, files):
    a = run(replace(spec, files=1, blank_rows=0))
    b = run(replace(spec, files=files))
    assert cells(a.allocation) == cells(b.allocation)


@given(AWKWARD)
def test_column_rename_invariance(spec):
    a = run(replace(spec, header_style="default"))
    b = run(replace(spec, header_style="alt"))
    assert cells(a.allocation) == cells(b.allocation)
    assert [i.code for i in a.signalset.issues] == [i.code for i in b.signalset.issues]


@given(AWKWARD)
def test_naming_independence(spec):
    a = run(spec, "AR1", "100")
    b = run(spec, "ZONE-9", "7")
    assert cells(a.allocation) == cells(b.allocation)
    names = lambda r: [c.name for c in r.allocation.layout.cabinets]
    assert len(names(a)) == len(names(b))
    assert names(a) == [] or names(a) != names(b)


RULE_POOL = [
    {"id": "R-CAP", "primitive": "capacity", "parameters": {"per": "cioc", "max": 40}},
    {"id": "R-SEP", "primitive": "separate",
     "parameters": {"a": "io_type = AIR", "b": "io_type = DIR", "level": "cioc"}},
    {"id": "R-LOGIC", "primitive": "co_locate",
     "parameters": {"by": "logic_number", "level": "cioc"}},
    {"id": "R-CAB", "primitive": "capacity", "parameters": {"per": "cabinet", "max": 150}},
]  # fmt: skip


@given(
    PLAIN, st.lists(st.sampled_from(RULE_POOL), min_size=1, max_size=3, unique_by=lambda r: r["id"])
)
def test_adding_a_rule_never_widens_the_allowed_set(spec, extra):
    """What is valid under the larger rule set is valid under every subset of it."""
    r = run(spec, rules=load_rules(extra))
    for k in range(len(extra)):
        subset = load_rules(extra[:k])
        assert cpsat.gate(r.allocation, r.blocks, r.pack, subset) == [], extra[k]["id"]


def revised_with(r, extra):
    base = RunStore()
    run_id = base.save_run("00", r.allocation, r.allocatable, PACK.hash)
    return base.load_baseline(run_id), [*r.allocatable, *extra]


@given(PLAIN)
def test_revision_with_no_change_moves_nothing(spec):
    r = run(spec)
    baseline, same = revised_with(r, [])
    res = solve_revision(baseline, [s.model_copy() for s in same], PACK, use_cpsat=False)
    assert res.moves == [] and res.violations == []
    assert cells(res.allocation) == cells(r.allocation)


@given(PLAIN, st.integers(1, 20))
def test_revision_adding_a_cable_never_moves_the_others(spec, n):
    r = run(spec)
    baseline, revised = revised_with(r, cable("ZZ-NEW", n, fam=None))
    res = solve_revision(baseline, revised, PACK, use_cpsat=False)
    assert res.violations == []
    before = {c for c in cells(r.allocation) if c[0] == "field"}
    assert before <= set(cells(res.allocation))
    placed = {c[1] for c in cells(res.allocation) if c[0] == "field"}
    listed_ = {u.signal.tag for u in res.allocation.unplaced}
    assert placed | listed_ == {s.tag for s in revised}


def replicate(spec: MdbSpec, k: int) -> MdbSpec:
    copies = []
    for i in range(k):
        for c in spec.cables:
            copies.append(
                replace(
                    c, name=f"R{i}-{c.name}",
                    group=f"{c.group}-R{i}" if c.group else None,
                    logic=f"{c.logic}-R{i}" if c.logic else None,
                )
            )  # fmt: skip
    return replace(spec, cables=tuple(copies))


@given(PLAIN, st.integers(2, 4))
def test_area_replication_scales_counts_linearly(spec, k):
    one, many = run(spec), run(replicate(spec, k))

    def count(r, kind):
        return sum(1 for p in r.allocation.placements if p.kind == kind)

    assert count(many, "field") + len(many.allocation.unplaced) == k * (
        count(one, "field") + len(one.allocation.unplaced)
    )
    # Wired spares are a per-controller 10% floor, so they need not scale exactly; the declared
    # unused pairs they are drawn from (wired plus protected) do.
    assert count(many, "wired_spare") + count(many, "spare_slot") == k * (
        count(one, "wired_spare") + count(one, "spare_slot")
    )
    assert len(many.allocation.layout.cabinets) >= len(one.allocation.layout.cabinets)
    assert len(many.allocation.layout.cabinets) <= k * len(one.allocation.layout.cabinets)
    check_invariant(replicate(spec, k), many)


@pytest.mark.nightly
@settings(max_examples=1000, deadline=None)
@given(AWKWARD, st.integers(0, 10**6))
def test_nightly_sweep(spec, seed):
    a = run(spec)
    check_invariant(spec, a)
    b = run(replace(spec, shuffle_seed=seed, header_style="alt"))
    assert cells(a.allocation) == cells(b.allocation)
