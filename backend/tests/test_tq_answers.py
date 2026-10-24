import pytest
from openpyxl import Workbook

from app.core.ingest.normaliser import ValueMapOverrides
from app.core.model.issue import Issue
from app.core.model.pack import Pack
from app.core.pipeline import Pipeline
from app.core.rules.schema import Rule
from app.core.tq.answers import (
    EFFECT,
    PROJECT_WIDE,
    AnswerError,
    AnswerStore,
)
from app.core.tq.model import CODES, OPTIONS, tq_from_issue

HDR = ["Tag No", "IO Type", "Cable No", "Pair No", "Segregation", "Status"]


@pytest.fixture
def pack(pack_dir):
    return Pack.load(pack_dir)


def sheet(tmp_path, rows, name="mdb.xlsx", header=HDR):
    wb = Workbook()
    ws = wb.active
    ws.append(header)
    for r in rows:
        ws.append(r)
    path = tmp_path / name
    wb.save(path)
    return path


def cable_rows(cable, n, io="DI", seg="-", start=1):
    return [
        [f"320-{io[:2]}-{cable[-4:]}{i:02d}", io, cable, f"Pair {i}", seg, "New"]
        for i in range(start, start + n)
    ]


def make(tmp_path, pack, rows, **kw):
    kw.setdefault("cpsat_enabled", False)
    return Pipeline([sheet(tmp_path, rows)], pack, "AR1", "100", **kw)


def tq_of(run, code, **where):
    hits = [
        t for t in run.tqs if t.code == code and all(t.data.get(k) == v for k, v in where.items())
    ]
    assert hits, f"no {code} {where} in {[(t.code, t.data) for t in run.tqs]}"
    return hits[0]


def row_of(tq):
    return tq.signal_keys[0]


def allocated_rows(run):
    return {
        f"{p.signal.source_file}:{p.signal.source_row}"
        for p in run.allocation.placements
        if p.signal is not None
    }


def test_row_answer_changes_only_that_row(pack, tmp_path):  # T8.1.1
    store = AnswerStore()
    pl = make(tmp_path, pack, cable_rows("320-CE-0001", 3, io="XX") + cable_rows("320-CE-0002", 2))
    run = pl.run()
    xx = [t for t in run.tqs if t.code == "TQ-VALUE"]
    assert len(xx) == 3 and len(run.held_out) == 3
    store.apply_status(run.tqs)
    first = xx[0]
    store.answer(first.id, "Map to a known value", pack=pack, value="DIR", scope="row")
    run2 = pl.run(store.compiled(pack))
    got = allocated_rows(run2)
    assert row_of(first) in got
    assert not {row_of(t) for t in xx[1:]} & got
    assert len(run2.held_out) == 2 and run2.unaccounted() == []


def test_everywhere_answer_updates_value_map_and_reprocesses_all(pack, tmp_path):  # T8.1.2
    store = AnswerStore()
    rows = cable_rows("320-CE-0001", 2, io="XX") + cable_rows("320-CE-0003", 2, io="XX")
    pl = make(tmp_path, pack, rows)
    run = pl.run()
    store.apply_status(run.tqs)
    t = tq_of(run, "TQ-VALUE")
    store.answer(t.id, "Map to a known value", pack=pack, value="DIR", scope="everywhere")
    c = store.compiled(pack)
    assert c.overrides.io_types == {"XX": "DIR"}
    run2 = pl.run(c)
    assert not run2.held_out and len(allocated_rows(run2)) == 4
    path = tmp_path / "overrides.json"
    c.overrides.save(path)
    assert ValueMapOverrides.load(path).io_types == {"XX": "DIR"}


def test_cable_answer_covers_the_cable_only(pack, tmp_path):
    store = AnswerStore()
    rows = cable_rows("320-CE-0001", 2, io="XX") + cable_rows("320-CE-0003", 2, io="XX")
    pl = make(tmp_path, pack, rows)
    run = pl.run()
    store.apply_status(run.tqs)
    t = tq_of(run, "TQ-VALUE", cable="320-CE-0001")
    store.answer(t.id, "Map to a known value", pack=pack, value="DIR", scope="cable")
    run2 = pl.run(store.compiled(pack))
    assert len(allocated_rows(run2)) == 2
    assert {s.cable for s in run2.signalset.signals} == {"320-CE-0001"}


def test_narrower_scope_wins_in_either_order(pack, tmp_path):  # T8.1.6
    rows = cable_rows("320-CE-0001", 3, io="XX")
    for order in ("row-first", "everywhere-first"):
        store = AnswerStore()
        pl = make(tmp_path, pack, rows)
        run = pl.run()
        store.apply_status(run.tqs)
        ts = [t for t in run.tqs if t.code == "TQ-VALUE"]
        steps = [
            (ts[0], "row", "DOR"),
            (ts[1], "everywhere", "DIR"),
        ]
        for t, scope, value in steps if order == "row-first" else steps[::-1]:
            store.answer(t.id, "Map to a known value", pack=pack, value=value, scope=scope)
        run2 = pl.run(store.compiled(pack))
        by_row = {f"{s.source_file}:{s.source_row}": s.io_type for s in run2.signalset.signals}
        assert by_row[row_of(ts[0])] == "DOR", order
        assert by_row[row_of(ts[1])] == by_row[row_of(ts[2])] == "DIR", order


def test_later_answer_wins_at_equal_scope(pack, tmp_path):
    store = AnswerStore()
    pl = make(tmp_path, pack, cable_rows("320-CE-0001", 2, io="XX"))
    run = pl.run()
    store.apply_status(run.tqs)
    t = tq_of(run, "TQ-VALUE")
    store.answer(t.id, "Map to a known value", pack=pack, value="DIR")
    store.answer(t.id, "Map to a known value", pack=pack, value="AIR")
    assert store.compiled(pack).overrides.io_types == {"XX": "AIR"}


def test_invalid_answers_are_rejected(pack, tmp_path):  # T8.1.4
    store = AnswerStore()
    run = make(tmp_path, pack, cable_rows("320-CE-0001", 1, io="XX")).run()
    store.apply_status(run.tqs)
    t = run.tqs[0]
    with pytest.raises(AnswerError, match="not an option"):
        store.answer(t.id, "Make it so", pack=pack)
    with pytest.raises(AnswerError, match="not a known io_type"):
        store.answer(t.id, "Map to a known value", pack=pack, value="NOPE")
    with pytest.raises(AnswerError, match="unknown TQ"):
        store.answer("TQ-0000000000", "Map to a known value", pack=pack, value="DIR")
    assert store.history(t.id) == [] and store.get(t.id).status == "open"


def test_scope_rules(pack):
    store = AnswerStore()
    t = tq_from_issue(
        Issue(code="TQ-MAP", severity="warning", message="m", source_file="f.xlsx",
              data={"field": "cable", "column": "Cable No"}),
    )  # fmt: skip
    store.add(t)
    with pytest.raises(AnswerError, match="project-wide"):
        store.answer(t.id, "Confirm the suggested column", pack=pack, scope="row")
    seg = tq_from_issue(Issue(code="TQ-SEG", severity="blocking", message="mixed"))
    store.add(seg)
    with pytest.raises(AnswerError, match="cable scope needs a cable"):
        store.answer(seg.id, "Confirm the segregation", pack=pack, value="A", scope="cable")
    with pytest.raises(AnswerError, match="no single value"):
        store.answer(seg.id, "Confirm the segregation", pack=pack, value="A")


def test_answering_a_closed_tq_keeps_history(pack, tmp_path):  # T8.1.5
    store = AnswerStore()
    run = make(tmp_path, pack, cable_rows("320-CE-0001", 1, io="XX")).run()
    store.apply_status(run.tqs)
    t = run.tqs[0]
    store.answer(t.id, "Keep the default policy", pack=pack, author="ana")
    assert store.get(t.id).status == "answered"
    store.answer(t.id, "Map to a known value", pack=pack, value="AIR", author="raj")
    hist = store.history(t.id)
    assert [(h.option, h.author) for h in hist] == [
        ("Keep the default policy", "ana"),
        ("Map to a known value", "raj"),
    ]
    assert store.get(t.id).answer == "Map to a known value: AIR"
    assert [a.seq for a in store.current()] == [hist[1].seq]


def test_mapping_answer_changes_the_cable_column(pack, tmp_path):  # T8.1.3 (effect)
    hdr = [*HDR, "Cable Name"]
    rows = [[*r, f"X{r[2][-4:]}"] for r in cable_rows("320-CE-0001", 2)]
    pl = Pipeline([sheet(tmp_path, rows, header=hdr)], pack, "AR1", "100", cpsat_enabled=False)
    run = pl.run()
    t = tq_of(run, "TQ-MAP", field="cable")
    assert {s.cable for s in run.signalset.signals} == {"320-CE-0001"}
    store = AnswerStore()
    store.apply_status(run.tqs)
    store.answer(t.id, "Pick another column", pack=pack, value="Cable Name")
    run2 = pl.run(store.compiled(pack))
    assert run2.restart_from == "ingest"
    assert {s.cable for s in run2.signalset.signals} == {"X0001"}


def test_hardware_answer_scopes(pack, tmp_path):
    rows = cable_rows("320-CE-0001", 3, io="DO-RELAY") + cable_rows("320-CE-0002", 2, io="DO-RELAY")
    fields = {"charm": "SE4302T09", "tb": "SE4501R"}

    def go(scope):
        store = AnswerStore()
        pl = make(tmp_path, pack, rows)
        run = pl.run()
        assert len(run.held_out) == 5 and {t.code for t in run.tqs} == {"TQ-HW"}
        store.apply_status(run.tqs)
        t = tq_of(run, "TQ-HW", cable="320-CE-0001")
        store.answer(t.id, "Supply the part number", pack=pack, fields=fields, scope=scope)
        return pl.run(store.compiled(pack))

    assert len(go("row").held_out) == 4
    assert len(go("cable").held_out) == 2
    run = go("everywhere")
    assert run.held_out == [] and run.unaccounted() == []
    from app.core.hardware.engine import resolve_hardware

    res = resolve_hardware(run.signalset.signals[0], run.pack)
    assert (res.charm, res.tb) == ("SE4302T09", "SE4501R")
    with pytest.raises(AnswerError, match="part numbers"):
        store = AnswerStore()
        store.add_many(run.tqs)
        tq = tq_from_issue(Issue(code="TQ-HW", severity="blocking", message="x"))
        store.add(tq)
        store.answer(tq.id, "Supply the part number", pack=pack, fields={"charm": "A"})


def test_segregation_answer_on_a_mixed_cable(pack, tmp_path):
    rows = cable_rows("320-CE-0001", 2, seg="A") + cable_rows("320-CE-0001", 2, seg="B", start=3)
    pl = make(tmp_path, pack, rows)
    run = pl.run()
    t = tq_of(run, "TQ-SEG", cable="320-CE-0001")
    assert len(run.allocation.unplaced) == 4
    store = AnswerStore()
    store.apply_status(run.tqs)
    store.answer(t.id, "Confirm the segregation", pack=pack, value="A", scope="cable")
    run2 = pl.run(store.compiled(pack))
    assert not run2.allocation.unplaced and run2.restart_from == "normalise"
    assert {s.segregation_family for s in run2.signalset.signals} == {"A"}


def test_capacity_answer_lifts_the_cabinet_limit(pack, tmp_path):
    small = pack.model_copy(
        update={"capacity": pack.capacity.model_copy(update={"max_cabinets": 1})}
    )
    rows = [r for i in range(40) for r in cable_rows(f"320-CE-{i:04d}", 12)]
    pl = make(tmp_path, small, rows)
    run = pl.run()
    t = next(t for t in run.tqs if t.code == "TQ-CAP")
    assert run.allocation.unplaced
    store = AnswerStore()
    store.apply_status(run.tqs)
    store.answer(t.id, "Allow more cabinets", pack=pack, value="3")
    run2 = pl.run(store.compiled(pack))
    assert not run2.allocation.unplaced and len(run2.allocation.layout.cabinets) == 2
    assert run2.executed == ["pack"]


def test_naming_answer_supplies_area_and_unit(pack, tmp_path):
    pl = Pipeline(
        [sheet(tmp_path, cable_rows("320-CE-0001", 2))], pack, None, None, cpsat_enabled=False
    )
    run = pl.run()
    t = next(t for t in run.tqs if t.code == "TQ-NAME" and t.data.get("field") == "area")
    store = AnswerStore()
    store.apply_status(run.tqs)
    store.answer(t.id, "Supply the value", pack=pack, fields={"area": "P30", "unit": "32001"})
    run2 = pl.run(store.compiled(pack))
    assert not [x for x in run2.tqs if x.code == "TQ-NAME"]
    assert "P30" in run2.allocation.layout.cabinets[0].name or "32001" in str(
        run2.allocation.layout.cabinets[0].name
    )


TIGHT = Rule(id="TIGHT", primitive="assign", parameters={"cioc": 1, "baseplates": [2]})


def test_rule_answers_waive_or_revise(pack, tmp_path):
    rows = [r for i in range(3) for r in cable_rows(f"320-CE-{i:04d}", 12)]
    for option, fields in (
        ("Waive the rule", {}),
        ("Revise the rule", {"baseplates": [2, 3, 4, 5]}),
    ):
        pl = make(tmp_path, pack, rows, rules=[TIGHT])
        run = pl.run()
        t = next(t for t in run.tqs if t.code == "TQ-RULE" and t.data.get("rules"))
        assert run.allocation.unplaced
        store = AnswerStore()
        store.apply_status(run.tqs)
        store.answer(t.id, option, pack=pack, fields=fields)
        run2 = pl.run(store.compiled(pack))
        assert not run2.allocation.unplaced, option
        assert run2.restart_from == "pack"
        assert bool(run2.not_enforced) == (option == "Waive the rule")


def _minimal(tq, effect, pack):
    if effect == "map_pick":
        return {"value": "Some Column"}
    if effect in ("value", "segregation"):
        field = tq.data.get("field", "segregation")
        return {"value": {"io_type": "AIR", "duty_class": "standard"}.get(field, "A")}
    if effect == "hardware":
        return {"fields": {"charm": "C1", "tb": "T1"}}
    if effect == "capacity":
        return {"value": "2"}
    if effect == "naming":
        return {"fields": {"area": "A1"}}
    if effect == "rule_revise":
        return {"fields": {"rule": "R1", "max": 2}}
    if effect == "rule_waive":
        return {"fields": {"rule": "R1"}}
    return {}


FACTS = {
    "TQ-MAP": {"field": "cable", "column": "Cable No"},
    "TQ-VALUE": {"field": "io_type", "value": "XX", "cable": "C1"},
    "TQ-SEG": {"cable": "C1"},
    "TQ-NAME": {"field": "area"},
    "TQ-RULE": {"rules": "R1"},
}


def test_every_code_is_raised_and_answerable(pack):
    assert set(EFFECT) == set(CODES)
    store = AnswerStore()
    for code in CODES:
        assert len(EFFECT[code]) == len(OPTIONS[code])
        issue = Issue(
            code=code, severity="warning", message=f"{code} injected",
            source_file="f.xlsx", source_row=7, data=FACTS.get(code, {}),
        )  # fmt: skip
        tq = tq_from_issue(issue)
        store.add(tq)
        for label, _ in OPTIONS[code]:
            effect = EFFECT[code][[o for o, _ in OPTIONS[code]].index(label)]
            scope = "everywhere"
            if effect not in PROJECT_WIDE and code != "TQ-VALUE" and code != "TQ-SEG":
                scope = "row"
            if code in ("TQ-VALUE", "TQ-SEG"):
                scope = "row"
            a = store.answer(tq.id, label, pack=pack, scope=scope, **_minimal(tq, effect, pack))
            assert a.effect == effect
        assert store.get(tq.id).status == "answered"
        assert len(store.history(tq.id)) == len(OPTIONS[code])
    compiled = store.compiled(pack)
    assert compiled.restart is not None


def test_invariant_before_and_after_answering_everything(pack, tmp_path):  # T8.1.7
    rows = (
        cable_rows("320-CE-0001", 3, io="XX")
        + cable_rows("320-CE-0002", 2, io="DO-RELAY")
        + cable_rows("320-CE-0003", 2, seg="A")
        + cable_rows("320-CE-0003", 2, seg="B", start=3)
        + cable_rows("320-CE-0004", 4)
    )
    pl = make(tmp_path, pack, rows)
    run = pl.run()
    assert run.unaccounted() == []
    assert {t.code for t in run.tqs} >= {"TQ-VALUE", "TQ-HW", "TQ-SEG"}
    store = AnswerStore()
    store.apply_status(run.tqs)
    for t in run.tqs:
        if t.code == "TQ-VALUE":
            store.answer(t.id, "Map to a known value", pack=pack, value="DIR", scope="cable")
        elif t.code == "TQ-HW":
            store.answer(t.id, "Supply the part number", pack=pack,
                         fields={"charm": "X", "tb": "Y"})  # fmt: skip
        elif t.code == "TQ-SEG":
            store.answer(t.id, "Confirm the segregation", pack=pack, value="A", scope="cable")
    run2 = pl.run(store.compiled(pack))
    assert run2.unaccounted() == []
    assert not run2.held_out and not run2.allocation.unplaced
    placed = {p.signal.tag for p in run2.allocation.placements if p.signal}
    assert len(placed) == 3 + 2 + 4 + 4
