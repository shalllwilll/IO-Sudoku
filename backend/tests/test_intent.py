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


def test_article_a_is_not_family_a():
    from app.core.ai.intent import _local

    for text in (
        "keep cables C1 and C2 together on a baseplate",
        "never put these in the same cabinet as a spare",
        "keep all pumps in a single CIOC together",
    ):
        assert _local(text) != "conflict", text


def test_ab_sharing_variants_are_conflicts():
    from app.core.ai.intent import _local

    for text in (
        "let A and B share a CIOC",
        "put A and B in the same CIOC",
        "mix family a with family b",
    ):
        assert _local(text) == "conflict", text
    assert _local("A and B signals must not mix") != "conflict"
