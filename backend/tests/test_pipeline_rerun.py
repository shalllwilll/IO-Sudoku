import pytest

from app.core.ingest.merge import merge_files
from app.core.layout.blocks import build_blocks
from app.core.model.pack import Pack
from app.core.pipeline import STAGES, Pipeline
from app.core.rules.schema import Rule
from app.core.solve.chain import run_chain
from app.core.tq.answers import AnswerStore
from tests.test_tq_answers import HDR, cable_rows, make, sheet


@pytest.fixture
def pack(pack_dir):
    return Pack.load(pack_dir)


def answered(pl, pack, rows_run, code, option, **kw):
    store = AnswerStore()
    store.apply_status(rows_run.tqs)
    t = next(t for t in rows_run.tqs if t.code == code)
    store.answer(t.id, option, pack=pack, **kw)
    return store.compiled(pack)


def test_cold_run_executes_every_stage_in_order_then_everything_is_reused(pack, tmp_path):
    pl = make(tmp_path, pack, cable_rows("320-CE-0001", 4))
    first = pl.run()
    assert first.executed == list(STAGES) and first.reused == []
    again = pl.run()
    assert again.executed == [] and again.reused == list(STAGES)
    assert again.hashes == first.hashes
    assert again.allocation is first.allocation


def test_hashes_do_not_depend_on_the_instance(pack, tmp_path):
    rows = cable_rows("320-CE-0001", 4)
    a = make(tmp_path, pack, rows).run()
    b = make(tmp_path, pack, rows).run()
    assert a.hashes == b.hashes


def test_no_answers_equals_the_direct_path(pack, tmp_path):  # T8.1.R
    rows = cable_rows("320-CE-0001", 14) + cable_rows("320-CE-0002", 5, seg="B")
    path = sheet(tmp_path, rows)
    run = Pipeline([path], pack, "AR1", "100", cpsat_enabled=False).run()
    ss = merge_files([path], pack)
    direct = run_chain(build_blocks(ss.signals, pack), pack, "AR1", "100", cpsat_enabled=False)
    assert run.allocation.model_dump_json() == direct.allocation.model_dump_json()


def test_changed_file_restarts_from_ingest(pack, tmp_path):
    pl = make(tmp_path, pack, cable_rows("320-CE-0001", 4))
    pl.run()
    sheet(tmp_path, cable_rows("320-CE-0001", 5))
    run = pl.run()
    assert run.executed == list(STAGES) and len(run.signalset.signals) == 5


def test_value_answer_restarts_at_normalise_and_keeps_earlier_stages(pack, tmp_path):
    pl = make(tmp_path, pack, cable_rows("320-CE-0001", 3, io="XX") + cable_rows("320-CE-0002", 2))
    run = pl.run()
    c = answered(pl, pack, run, "TQ-VALUE", "Map to a known value", value="DIR")
    run2 = pl.run(c)
    assert run2.restart_from == "normalise"
    assert run2.reused == ["ingest", "map"]
    assert run2.executed == ["normalise", "hardware", "layout", "pack"]


def test_mapping_answer_restarts_from_ingest(pack, tmp_path):
    rows = [[*r, "X"] for r in cable_rows("320-CE-0001", 2)]
    pl = Pipeline(
        [sheet(tmp_path, rows, header=[*HDR, "Cable Name"])],
        pack,
        "AR1",
        "100",
        cpsat_enabled=False,
    )
    run = pl.run()
    c = answered(pl, pack, run, "TQ-MAP", "Confirm the suggested column")
    run2 = pl.run(c)
    assert run2.restart_from == "ingest" and run2.reused == []


def test_hardware_answer_restarts_at_hardware(pack, tmp_path):
    pl = make(
        tmp_path, pack, cable_rows("320-CE-0001", 2, io="DO-RELAY") + cable_rows("320-CE-0002", 2)
    )
    run = pl.run()
    c = answered(pl, pack, run, "TQ-HW", "Supply the part number", fields={"charm": "C", "tb": "T"})
    run2 = pl.run(c)
    assert run2.reused == ["ingest", "map", "normalise"]
    assert run2.executed == ["hardware", "layout", "pack"]


def test_rule_answer_restarts_at_pack_only(pack, tmp_path):
    tight = Rule(id="TIGHT", primitive="assign", parameters={"cioc": 1, "baseplates": [2]})
    rows = [r for i in range(3) for r in cable_rows(f"320-CE-{i:04d}", 12)]
    pl = make(tmp_path, pack, rows, rules=[tight])
    run = pl.run()
    c = answered(pl, pack, run, "TQ-RULE", "Waive the rule")
    run2 = pl.run(c)
    assert run2.reused == ["ingest", "map", "normalise", "hardware", "layout"]
    assert run2.executed == ["pack"]
    assert run2.seconds.keys() == {"pack"}


def test_undoing_an_answer_returns_to_the_cached_result(pack, tmp_path):
    from app.core.tq.answers import Compiled

    pl = make(tmp_path, pack, cable_rows("320-CE-0001", 3, io="XX"))
    base = pl.run()
    c = answered(pl, pack, base, "TQ-VALUE", "Map to a known value", value="DIR")
    assert pl.run(c).executed
    back = pl.run(Compiled())
    assert back.executed == ["normalise", "hardware", "layout", "pack"]
    assert len(back.held_out) == 3


def test_late_stage_answer_reruns_less_than_a_full_run(pack, sample_mdb_path):
    from app.core.rules.sets import load_preset

    rules = load_preset(pack).rules
    pl = Pipeline([sample_mdb_path], pack, "P30", "32001", rules, cpsat_enabled=False)
    full = pl.run()
    waive = Rule(id="X-WAIVE", primitive="reserve", parameters={"baseplate": 2})
    pl.rules = [*pl.rules, waive]
    late = pl.run()
    assert late.executed == ["pack"]
    assert sum(late.seconds.values()) < sum(full.seconds.values())
    assert full.unaccounted() == [] and late.unaccounted() == []
