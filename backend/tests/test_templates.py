import pytest

from app.config import Settings
from app.core.ai.gateway import Gateway
from app.core.ai.intent import propose_intent
from app.core.ai.templates import compile_template


def offline():
    return Gateway(Settings(gemini_api_key=None))


@pytest.mark.parametrize(
    ("text", "primitive", "params"),
    [
        ("Keep AIR and DOR on separate CIOCs", "separate", {"a": "io_type = AIR", "b": "io_type = DOR", "level": "cioc"}),
        ("never put analog input and digital output in the same baseplate", "separate", {"level": "baseplate"}),
        ("Keep each cable on one CIOC", "co_locate", {"by": "cable", "level": "cioc"}),
        ("keep every group together on a single baseplate", "co_locate", {"by": "group", "level": "baseplate"}),
        ("No more than 80 signals per CIOC", "capacity", {"per": "cioc", "max": 80, "measure": "signals"}),
        ("at most 4 baseplates per cabinet", "capacity", {"per": "cabinet", "max": 4, "measure": "baseplates"}),
        ("Fill each CIOC to at most 80%", "quota", {"per": "cioc", "max_percent": 80}),
        ("keep 20% spare in every CIOC", "quota", {"per": "cioc", "max_percent": 80}),
        ("Keep baseplate 8 empty", "reserve", {"baseplate": 8}),
        ("Pin PT-101 to CIOC 1, baseplate 2, channel 3", "pin", {"cioc": 1, "baseplate": 2, "channel": 3}),
    ],
)
def test_phrasings_compile_offline(text, primitive, params):
    t = compile_template(text)
    assert t is not None and t.primitive == primitive
    for k, v in params.items():
        assert t.parameters[k] == v, (text, t)


def test_unmatched_text_is_left_for_ai():
    for text in ("keep 15 percent spares", "make it nicer", "why was this held out"):
        assert compile_template(text) is None


def test_prose_do_is_not_an_io_type():
    assert compile_template("we do not want AI and DO signals together") is not None
    assert compile_template("do keep things apart") is None


def test_preview_is_a_checked_template_rule_with_ai_off():
    r = propose_intent(offline(), "Keep AIR and DOR on separate CIOCs", {"NL-1"})
    p = r.rule_preview
    assert r.state == "preview" and p and p.source == "template" and not p.applied
    assert p.rule and p.rule.id == "NL-2" and p.rule.primitive == "separate"


def test_soft_wording_sets_strength():
    r = propose_intent(offline(), "Prefer to keep each cable on one CIOC", set())
    assert r.rule_preview and r.rule_preview.rule and r.rule_preview.rule.strength == "soft"


def test_ab_conflict_still_wins():
    assert propose_intent(offline(), "put A and B in the same CIOC", set()).state == "conflict"


def test_rule_like_text_reaches_the_model_when_ai_is_on(monkeypatch):
    gw = offline()
    monkeypatch.setattr(type(gw), "available", property(lambda self: True))
    seen = []
    monkeypatch.setattr(gw, "ask", lambda *a, **k: seen.append(a[1]["request"]))
    r = propose_intent(gw, "I would like pumps spread over cabinets", set())
    assert seen and r.state == "unavailable"
