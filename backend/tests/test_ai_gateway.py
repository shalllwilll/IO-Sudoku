import time

import pytest
from pydantic import BaseModel

from app.config import Settings
from app.core.ai import Gateway
from app.core.ai.cache import AiCache
from app.core.ai.redact import RedactionError, mask, redact


class Hint(BaseModel):
    column: str
    confidence: float


def settings(**kw):
    base = {"gemini_api_key": "k", "gemini_model": "main", "gemini_fallback_model": "backup"}
    return Settings(**{**base, **kw})


def reply(obj):
    import json

    text = obj if isinstance(obj, str) else json.dumps(obj)
    return 200, {"candidates": [{"content": {"parts": [{"text": text}]}}]}


class Fake:
    def __init__(self, *answers):
        self.answers, self.seen = list(answers), []

    def __call__(self, model, body, timeout):
        self.seen.append((model, body))
        a = self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]
        return a() if callable(a) else a


PAYLOAD = {
    "columns": [{"name": "Cable No", "samples": ["320-CE-0001"]}],
    "candidate_fields": ["cable"],
}


def gw(*answers, **kw):
    return Gateway(settings(), transport=Fake(*answers), sleep=lambda _: None, **kw)


def ask(g, check=None, payload=PAYLOAD):
    return g.ask("mapping", payload, Hint, "pick the column", check)


def test_typed_result_with_explainability():  # T10.1.1, T10.1.9
    g = gw(reply({"column": "Cable No", "confidence": 0.9}))
    r = ask(g)
    assert r.value == Hint(column="Cable No", confidence=0.9)
    assert (r.source, r.model, r.confidence) == ("ai", "main", 0.9) and len(r.prompt_hash) == 64
    assert g.cache.entries()[-1]["status"] == "accepted"


def test_cache_means_one_call():  # T10.1.2
    g = gw(reply({"column": "Cable No", "confidence": 0.9}))
    a, b = ask(g), ask(g)
    assert g.calls == 1 and b.cached and a.value == b.value
    assert ask(g, payload={**PAYLOAD, "candidate_fields": ["tag"]}).cached is False


def test_no_key_returns_none_without_a_call():  # T10.1.3
    g = Gateway(Settings(), cache=AiCache())
    assert ask(g) is None and g.calls == 0 and not g.available


def test_garbage_and_wrong_shape_are_rejected():  # T10.1.4, T10.1.5
    assert ask(gw(reply("this is not json"))) is None
    assert ask(gw(reply({"column": 5}))) is None
    assert ask(gw(reply({"column": "Cable No", "confidence": "high"}))) is None
    assert ask(gw((200, {}))) is None


def test_timeout_then_none():  # T10.1.6
    g = Gateway(settings(), transport=lambda m, b, t: time.sleep(1) or reply({}), timeout=0.05,
                sleep=lambda _: None)  # fmt: skip
    t0 = time.perf_counter()
    assert ask(g) is None
    assert time.perf_counter() - t0 < 0.5


def test_raw_row_is_blocked_loudly():  # T10.1.7
    row = {"Tag No": "320-LT-1001", "IO Type": "AI", "Cable No": "320-CE-0001", "Pair No": 3}
    g = gw(reply({"column": "x", "confidence": 1}))
    with pytest.raises(RedactionError):
        ask(g, payload={"columns": [{"name": "a", "samples": ["1"], "row": row}]})
    with pytest.raises(RedactionError):
        ask(g, payload={"rows": [row]})
    with pytest.raises(RedactionError):
        g.ask("mapping", {"columns": [{"name": "a", "samples": list("abcd")}]}, Hint, "x")
    with pytest.raises(RedactionError):
        g.ask("whatever", {}, Hint, "x")
    assert g.calls == 0


def test_hallucinated_column_is_rejected():  # T10.1.8
    g = gw(reply({"column": "Nonexistent", "confidence": 0.99}))
    known = {"Cable No"}
    assert ask(g, check=lambda h: h.column in known) is None
    assert g.cache.entries()[-1]["status"] == "rejected"


def test_fallback_model_is_used_when_main_fails():
    g = gw((503, {}), (503, {}), (503, {}), reply({"column": "Cable No", "confidence": 0.5}))
    r = ask(g)
    assert r.model == "backup" and [m for m, _ in g.transport.seen][-1] == "backup"


def test_retry_with_backoff_on_rate_limit():
    waits = []
    g = Gateway(settings(), transport=Fake((429, {}), reply({"column": "Cable No", "confidence": 1})),
                sleep=waits.append)  # fmt: skip
    assert ask(g).model == "main" and waits == [0.5] and g.calls == 2


def test_request_asks_for_json_schema_and_sends_only_redacted_text():
    g = gw(reply({"column": "Cable No", "confidence": 1}))
    ask(g)
    _model, body = g.transport.seen[0]
    cfg = body["generationConfig"]
    assert cfg["responseMimeType"] == "application/json" and cfg["responseJsonSchema"]["properties"]
    sent = body["contents"][0]["parts"][0]["text"]
    assert "320-CE-0001" not in sent and "999-CE-9999" in sent


def test_mask_keeps_shape_not_identity():
    assert mask("320-LT-1001") == "999-LT-9999" and len(mask("x" * 100)) == 24


def test_tq_value_and_rule_payloads_pass_and_extras_do_not():
    ok = {"tq": {"code": "TQ-VALUE", "message": "unknown duty 'Klaxon'", "options": ["a"]}}
    assert redact("tq", ok)["tq"]["code"] == "TQ-VALUE"
    with pytest.raises(RedactionError):
        redact("tq", {"tq": {**ok["tq"], "signal_keys": ["f:1"]}})
    assert redact("value", {"field": "duty", "value": "Klaxon"})["categories"] == []
    assert redact("rule", {"request": "keep AI and DI apart"})["fields"] == []
    with pytest.raises(RedactionError):
        redact("rule", {"request": "x" * 5000})


def test_status_endpoint_without_key(tmp_path):
    from tests.api_helpers import make_client

    r = make_client(tmp_path).get("/api/ai/status", params={"probe": "true"})
    assert r.json() == {"ai_available": False, "models": [], "verified": None}
