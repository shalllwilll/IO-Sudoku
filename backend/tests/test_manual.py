import pytest

from app.core.model.allocation import Unplaced
from app.core.model.issue import Issue
from app.core.model.pack import Pack
from app.core.solve.chain import ChainResult
from app.core.solve.manual import ManualError, apply_manual, candidates, place
from app.core.tq.answers import Answer, AnswerError, AnswerStore, validate_answer
from app.core.tq.model import tq_from_issue
from app.main import PACK_DIR
from tests.test_tq_answers import cable_rows, make


@pytest.fixture(scope="module")
def pack():
    return Pack.load(PACK_DIR)


def held_out(tmp_path, pack):
    """A normal allocation with the second cable taken out and reported as a held-out TQ-RULE."""
    rows = [r for i in range(3) for r in cable_rows(f"320-CE-{i:04d}", 12)]
    run = make(tmp_path, pack, rows).run()
    block = sorted(run.blocks.blocks, key=lambda b: b.id)[1]
    alloc = run.allocation.model_copy(deep=True)
    mine = {(s.source_file, s.source_row) for s in block.signals}
    original = [p for p in alloc.placements if (p.signal and (p.signal.source_file, p.signal.source_row) in mine)]
    alloc.placements = [p for p in alloc.placements if p not in original]
    issue = Issue(code="TQ-RULE", severity="blocking", message="cable cannot be placed", data={"cable": block.id})
    alloc.issues.append(issue)
    alloc.unplaced = [Unplaced(signal=s, issues=[issue]) for s in block.signals]
    return run, block, alloc, original


def test_candidates_are_legal_free_runs_and_include_the_original_slot(pack, tmp_path):
    run, block, alloc, original = held_out(tmp_path, pack)
    found, why, _ = candidates(alloc, block, run.blocks, pack, run.rules)
    assert found and why is None
    assert all(len(c.cells) == block.size for c in found)
    first = original[0]
    assert any(c.cioc_no == first.cioc_no and c.cells[0] == (first.baseplate, first.channel) for c in found)


def test_placing_a_candidate_clears_the_hold_and_the_issue(pack, tmp_path):
    run, block, alloc, _ = held_out(tmp_path, pack)
    pick = candidates(alloc, block, run.blocks, pack, run.rules)[0][0]
    out = place(alloc, block, run.blocks, pack, run.rules, pick.cioc_no, pick.cells)
    assert not out.unplaced and not [i for i in out.issues if i.code == "TQ-RULE"]
    assert len(out.placements) == len(alloc.placements) + len(pick.cells)
    assert alloc.unplaced  # the input is never mutated


def test_an_occupied_or_illegal_choice_is_refused_with_a_reason(pack, tmp_path):
    run, block, alloc, _ = held_out(tmp_path, pack)
    taken = alloc.placements[0]
    cells = [(taken.baseplate, taken.channel + i) for i in range(block.size)]
    with pytest.raises(ManualError, match="taken|valid"):
        place(alloc, block, run.blocks, pack, run.rules, taken.cioc_no, cells)


def test_apply_manual_places_what_is_legal_and_reports_the_rest(pack, tmp_path):
    run, block, alloc, _ = held_out(tmp_path, pack)
    pick = candidates(alloc, block, run.blocks, pack, run.rules)[0][0]
    res = ChainResult(alloc, "greedy", [])
    good = {block.id: {"cioc": pick.cioc_no, "cells": [list(c) for c in pick.cells]}}
    done = apply_manual(res, run.blocks, pack, run.rules, good)
    assert not done.allocation.unplaced and any(e.status == "placed" for e in done.events)
    bad = apply_manual(res, run.blocks, pack, run.rules, {block.id: {"cioc": 99, "cells": [[1, 1]]}})
    assert bad.allocation.unplaced and any(e.status == "rejected" for e in bad.events)


def test_a_placement_answer_needs_a_cable_scope_and_a_position(pack):
    tq = tq_from_issue(Issue(code="TQ-RULE", severity="blocking", message="m", source_file="f", source_row=1, data={"cable": "C1", "rules": "R1"}))
    ok = Answer(tq_id=tq.id, option="Place it in a chosen slot", scope="cable", fields={"cioc": 1, "cells": [[1, 1]]})
    assert validate_answer(tq, ok, pack) == "place"
    with pytest.raises(AnswerError, match="scope 'cable'"):
        validate_answer(tq, ok.model_copy(update={"scope": "everywhere"}), pack)
    with pytest.raises(AnswerError, match="fields.cioc"):
        validate_answer(tq, ok.model_copy(update={"fields": {}}), pack)
    store = AnswerStore()
    store.add(tq)
    store.answer(tq.id, "Place it in a chosen slot", pack=pack, scope="cable", fields={"cioc": 2, "cells": [[1, 1], [1, 2]]})
    assert store.compiled(pack).manual == {"C1": {"cioc": 2, "cells": [[1, 1], [1, 2]]}}
    assert store.compiled(pack).restart == "pack"
