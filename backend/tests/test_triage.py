import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.core.model.pack import Pack
from app.core.tq.model import OPTIONS, TQ, TqOption, tq_id
from app.core.tq.triage import normalise, triage
from app.main import PACK_DIR, create_app


@pytest.fixture(scope="module")
def pack():
    return Pack.load(PACK_DIR)


def tq(code, message, severity="assumed", keys=(), status="open", **data):
    return TQ(
        id=tq_id(code, message), code=code, severity=severity, category="missing data",
        subject=message, message=message,
        options=[TqOption(label=a, consequence=b) for a, b in OPTIONS[code]],
        signal_keys=list(keys), data=data, status=status,
    )  # fmt: skip


def test_normalise_drops_per_signal_detail():
    a = normalise("tag '440-LI -1' and cable '500-CE-3-A' start with different area numbers")
    b = normalise("tag '440-ZZ -2' and cable '500-CE-4-B' start with different area numbers")
    assert a == b


def test_area_mismatches_collapse_into_one_info_group(pack):
    tqs = [
        tq("TQ-DATA", f"tag 'T{i}' and cable 'C{i}' start with different area numbers", "info",
           keys=[f"f.xlsx:{i}"])
        for i in range(6)
    ]  # fmt: skip
    (g,) = triage(tqs, pack)
    assert g.priority == "P3" and g.signals == 6 and len(g.tq_ids) == 6
    assert g.recommended and g.recommended.option == "Leave as is"
    assert not any(o.changes_allocation for o in g.options)


def test_blocking_groups_sort_first_and_rule_groups_name_their_rules(pack):
    rule = tq("TQ-RULE", "cable 320-CE-0001 cannot be placed within capacity and rule(s) PS-AB-SEP, PS-CAP-BP",
              "blocking", keys=["f.xlsx:1", "f.xlsx:2"])  # fmt: skip
    info = tq("TQ-DATA", "tag 'a' and cable 'b' start with different area numbers", "info", keys=["f.xlsx:9"])
    groups = triage([info, rule], pack)
    assert [g.priority for g in groups] == ["P1", "P3"]
    assert "PS-AB-SEP" in groups[0].why and groups[0].can_place
    assert groups[0].recommended is None  # a rule block is never answered automatically


def test_value_group_offers_choices_and_flags_effects(pack):
    t = tq("TQ-VALUE", "unknown IO type 'Analog In'", "blocking", keys=["f.xlsx:5"], field="io_type", value="Analog In")
    (g,) = triage([t], pack)
    mapped = g.options[0]
    assert mapped.changes_allocation and mapped.needs == ["value"] and "AIR" in mapped.choices
    assert g.recommended is None and g.title == "Unrecognised io type 'Analog In'"


def test_answered_groups_sink_below_open_ones(pack):
    done = tq("TQ-NAME", "no area", status="answered")
    todo = tq("TQ-SPARE", "spares assumed", "info")
    assert [g.code for g in triage([done, todo], pack)] == ["TQ-SPARE", "TQ-NAME"]


def test_bulk_answer_applies_to_each_and_reports_failures(tmp_path):
    client = TestClient(create_app(Settings(db_path=str(tmp_path / "t.db"), cpsat_enabled=False)))
    pid = client.post("/api/projects", json={"name": "p"}).json()["id"]
    svc = client.app.state.service
    store = svc.store.tq_store(pid)
    a, b = tq("TQ-DATA", "tag 'a' and cable 'b' start with different area numbers", "info"), tq("TQ-DATA", "other", "info")
    store.add_many([a, b])
    r = client.post(f"/api/projects/{pid}/tqs/bulk-answer",
                    json={"tq_ids": [a.id, b.id, "TQ-nope"], "option": "Leave as is"}).json()
    assert r["answered"] == [a.id, b.id]
    assert r["failed"] == [{"tq_id": "TQ-nope", "error": "no such TQ"}]
    groups = client.get(f"/api/projects/{pid}/tq-groups").json()
    assert all(g["status"] == "answered" for g in groups)
    bad = client.post(f"/api/projects/{pid}/tqs/bulk-answer", json={"tq_ids": [a.id], "option": "Nope"}).json()
    assert bad["answered"] == [] and "not an option" in bad["failed"][0]["error"]
