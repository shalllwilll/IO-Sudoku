import json

from app.config import Settings
from app.core.ai import Gateway
from app.core.ai.cache import AiCache
from app.core.ai.features import classify_value, explain_tq, mapping_hint, template_text
from app.core.model.issue import Issue
from app.core.tq.model import tq_from_issue
from tests.api_helpers import make_client, new_project, simple_rows, upload, xlsx_bytes
from tests.test_api_flow import run_now
from tests.test_tq_answers import HDR, cable_rows


def fake_gateway(obj):
    text = obj if isinstance(obj, str) else json.dumps(obj)

    def transport(model, body, timeout):
        return 200, {"candidates": [{"content": {"parts": [{"text": text}]}}]}

    s = Settings(gemini_api_key="k", gemini_model="m")
    return Gateway(s, transport=transport, cache=AiCache())


def with_ai(client, obj):
    client.app.state.service.gateway = fake_gateway(obj)
    return client


SEP = {
    "name": "please keep the two kinds well away from each other", "primitive": "separate", "scope": "",
    "parameters": {"a": "io_type = AIR", "b": "io_type = DIR"}, "confidence": 0.9,
}  # fmt: skip


def project_with_data(c, tmp_path):
    pid = new_project(c)
    upload(c, pid, xlsx_bytes(tmp_path, simple_rows()))
    return pid


def test_compile_gives_a_preview_and_applies_nothing(tmp_path):  # T10.2.1
    c = with_ai(make_client(tmp_path), SEP)
    pid = project_with_data(c, tmp_path)
    before = c.get(f"/api/projects/{pid}/rules").json()["rules"]
    r = c.post(
        f"/api/projects/{pid}/rules/compile", json={"request": "please keep the two kinds well away from each other"}
    ).json()
    assert r["status"] == "ok" and r["applied"] is False and r["source"] == "ai"
    assert r["rule"]["primitive"] == "separate" and r["dry_run"][0]["rule_id"] == r["rule"]["id"]
    assert c.get(f"/api/projects/{pid}/rules").json()["rules"] == before


def test_confirm_adds_the_rule(tmp_path):  # T10.2.2
    c = with_ai(make_client(tmp_path), SEP)
    pid = project_with_data(c, tmp_path)
    prev = c.post(
        f"/api/projects/{pid}/rules/compile", json={"request": "please keep the two kinds well away from each other"}
    ).json()
    n = len(c.get(f"/api/projects/{pid}/rules").json()["rules"])
    r = c.post(f"/api/projects/{pid}/rules/compile/confirm", json={"rule": prev["rule"]})
    assert r.status_code == 200 and len(r.json()["rules"]) == n + 1 and r.json()["custom"]
    assert r.json()["rules"][-1]["id"] == prev["rule"]["id"]
    again = c.post(f"/api/projects/{pid}/rules/compile/confirm", json={"rule": prev["rule"]})
    assert again.status_code == 422 and again.json()["code"] == "invalid_rules"
    bad = c.post(f"/api/projects/{pid}/rules/compile/confirm",
                 json={"rule": {"id": "X", "primitive": "separate"}})  # fmt: skip
    assert bad.status_code == 422
    assert run_now(c, pid)["status"] == "finished"


def test_value_suggestion_awaits_confirmation():  # T10.2.3
    gw = fake_gateway({"category": "high_current", "confidence": 0.93})
    s = classify_value(gw, "duty", "Klaxon", ["high_current", "relay", "standard"])
    assert (s.kind, s.value, s.source) == ("suggestion", "high_current", "ai")


def test_unsafe_scope_is_rejected(tmp_path):  # T10.2.4
    evil = {**SEP, "scope": "__import__('os').system('x')"}
    c = with_ai(make_client(tmp_path), evil)
    pid = project_with_data(c, tmp_path)
    r = c.post(f"/api/projects/{pid}/rules/compile", json={"request": "do something odd"}).json()
    assert r["status"] == "rejected" and r["rule"] is None


def test_unknown_field_or_primitive_is_rejected(tmp_path):
    for bad in ({**SEP, "scope": "colour = red"}, {**SEP, "primitive": "teleport"},
                {**SEP, "parameters": {}}):  # fmt: skip
        c = with_ai(make_client(tmp_path), bad)
        pid = project_with_data(c, tmp_path)
        r = c.post(f"/api/projects/{pid}/rules/compile", json={"request": "anything goes"}).json()
        assert r["status"] == "rejected", bad


def test_unsupported_request_is_not_enforced_with_reason(tmp_path):  # T10.2.5
    c = with_ai(make_client(tmp_path), {"primitive": None, "unsupported_reason": "no such primitive",
                                        "confidence": 0.8})  # fmt: skip
    pid = project_with_data(c, tmp_path)
    r = c.post(
        f"/api/projects/{pid}/rules/compile", json={"request": "Make the plant faster"}
    ).json()
    assert r["status"] == "not_enforced" and r["message"] == "no such primitive"
    assert r["rule"]["not_enforced_reason"] == "no such primitive" and r["applied"] is False


def test_ai_offline_is_clear_and_the_form_still_works(tmp_path):  # T10.2.6
    c = make_client(tmp_path)
    pid = project_with_data(c, tmp_path)
    r = c.post(
        f"/api/projects/{pid}/rules/compile", json={"request": "please keep the two kinds well away from each other"}
    ).json()
    assert r["status"] == "unavailable" and "rule form" in r["message"]
    custom = [{"id": "SEP", "primitive": "separate",
               "parameters": {"a": "io_type = AIR", "b": "io_type = DIR"}}]  # fmt: skip
    assert c.put(f"/api/projects/{pid}/rules", json={"rules": custom}).status_code == 200


def test_low_confidence_is_a_question():  # T10.2.7
    gw = fake_gateway({"category": "relay", "confidence": 0.3})
    s = classify_value(gw, "duty", "Widget", ["high_current", "relay", "standard"])
    assert s.kind == "question" and s.confidence == 0.3


def test_hallucinated_category_or_column_gives_nothing():
    assert classify_value(fake_gateway({"category": "nuclear", "confidence": 1}), "duty", "x",
                          ["relay"]) is None  # fmt: skip
    gw = fake_gateway({"choice": "Invented Col", "confidence": 0.9})
    assert mapping_hint(gw, "cable", [("Cable No", ["1"]), ("Cable Name", ["2"])]) is None
    gw = fake_gateway({"choice": "Cable Name", "confidence": 0.8})
    h = mapping_hint(gw, "cable", [("Cable No", ["1"]), ("Cable Name", ["2"])])
    assert h.value == "Cable Name" and h.kind == "suggestion"


def test_mapping_and_values_endpoints_carry_ai_suggestions(tmp_path):
    c = with_ai(make_client(tmp_path), {"choice": "Cable Name", "confidence": 0.9})
    pid = new_project(c)
    rows = [[*r, f"X{r[2][-4:]}"] for r in cable_rows("320-CE-0001", 2)]
    upload(c, pid, xlsx_bytes(tmp_path, rows, header=[*HDR, "Cable Name"]))
    sheet = c.get(f"/api/projects/{pid}/mapping").json()["sheets"][0]
    assert sheet["ai_hints"]["cable"]["value"] == "Cable Name"
    assert sheet["matches"]["cable"]["column"] == "Cable No"  # never auto-applied


def test_allocation_is_identical_with_ai_on_and_off(tmp_path):  # T10.2.8
    rows = cable_rows("320-CE-0001", 14) + cable_rows("320-CE-0002", 5, seg="B")

    def allocation(ai_on):
        d = tmp_path / ("on" if ai_on else "off")
        d.mkdir()
        c = make_client(d)
        if ai_on:
            with_ai(c, SEP)
        pid = new_project(c)
        upload(c, pid, xlsx_bytes(d, rows))
        c.get(f"/api/projects/{pid}/mapping")
        c.get(f"/api/projects/{pid}/values")
        c.post(f"/api/projects/{pid}/rules/compile", json={"request": "please keep the two kinds well away from each other"})
        run = run_now(c, pid)
        a = c.get(f"/api/projects/{pid}/runs/{run['id']}/allocation").json()
        return json.dumps([a["placements"], a["unplaced"], a["rows"]], sort_keys=True)

    assert allocation(True) == allocation(False)


def test_tq_wording_ai_and_template_fallback(tmp_path):
    tq = tq_from_issue(Issue(code="TQ-VALUE", severity="warning",
                             message="unknown duty 'Klaxon'", source_row=3, source_file="a.xlsx"))  # fmt: skip
    ai = explain_tq(fake_gateway({"explanation": "The duty word is new.", "confidence": 0.7}), tq)
    assert (ai.source, ai.text) == ("ai", "The duty word is new.")
    off = explain_tq(Gateway(Settings(), cache=AiCache()), tq)
    assert off.source == "template" and off.text == template_text(tq) and "Klaxon" in off.text


def test_explain_endpoint(tmp_path):
    from tests.test_tq_answers import cable_rows as cr

    c = make_client(tmp_path)
    pid = new_project(c)
    upload(c, pid, xlsx_bytes(tmp_path, cr("320-CE-0001", 2, io="XX")))
    run = run_now(c, pid)
    tq = c.get(f"/api/projects/{pid}/runs/{run['id']}/tqs").json()[0]
    r = c.get(f"/api/projects/{pid}/tqs/{tq['id']}/explain").json()
    assert r["source"] == "template" and "unknown IO type" in r["text"]
    assert c.get(f"/api/projects/{pid}/tqs/nope/explain").status_code == 404
