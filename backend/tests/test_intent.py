from app.config import Settings
from app.core.ai.gateway import Gateway
from app.core.ai.intent import propose_intent


def offline_gateway():
    return Gateway(Settings(gemini_api_key=None))


def test_ab_mix_is_a_locked_conflict():
    result = propose_intent(offline_gateway(), "put A and B in the same CIOC", set())
    assert result.state == "conflict" and result.locked_rules == ["R-SEG"]


def test_vague_grouping_requests_clarification():
    result = propose_intent(offline_gateway(), "make grouping more flexible", set())
    assert result.state == "clarify" and result.questions


def test_offline_rule_request_is_never_applied():
    result = propose_intent(offline_gateway(), "keep 15 percent spares", set())
    assert result.state == "unavailable" and result.rule_preview and not result.rule_preview.applied
