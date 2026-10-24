from app.core.rules.lint import lint
from app.core.rules.schema import load_rules
from tests.test_greedy import cable


def f(rules, signals=None):
    return lint(load_rules(rules), signals)


def test_unknown_field_is_error():
    out = f(
        [
            {
                "id": "R",
                "primitive": "co_locate",
                "scope": "colour = red",
                "parameters": {"by": "cable"},
            }
        ]
    )
    assert any(x.severity == "error" and "colour" in x.message for x in out)


def test_unparseable_scope_is_error_not_traceback():
    out = f([{"id": "R", "primitive": "pin", "scope": "__import__('os')"}])
    assert out[0].severity == "error" and "cannot be parsed" in out[0].message


def test_missing_parameter():
    out = f([{"id": "R", "primitive": "capacity", "parameters": {"per": "cioc"}}])
    assert any("missing parameter" in x.message for x in out)


def test_bad_level():
    out = f([{"id": "R", "primitive": "capacity", "parameters": {"per": "room", "max": 3}}])
    assert any("per" in x.message and x.severity == "error" for x in out)


def test_empty_scope_warning():
    out = f(
        [
            {
                "id": "R",
                "primitive": "co_locate",
                "scope": "io_type = DOR",
                "parameters": {"by": "cable"},
            }
        ],
        cable("C1", 3),
    )
    assert any(x.severity == "warning" and "no signals" in x.message for x in out)


def test_contradiction_co_locate_vs_separate():
    sigs = cable("C1", 3, fam="A") + cable("C2", 3, fam="B")
    rules = [
        {
            "id": "SEP",
            "primitive": "separate",
            "parameters": {"a": "segregation_family = A", "b": "segregation_family = B"},
        },
        {"id": "COL", "primitive": "co_locate", "parameters": {"by": "io_type"}},
    ]
    out = f(rules, sigs)
    assert any(x.rule_id == "COL" and "conflicts with rule SEP" in x.message for x in out)


def test_not_enforced_is_info_and_clean_set_has_no_errors():
    out = f([{"id": "N", "not_enforced_reason": "cannot express"}])
    assert out[0].severity == "info"
    ok = f(
        [
            {
                "id": "R",
                "primitive": "limit_span",
                "scope": "io_type = AIR",
                "parameters": {"unit": "cioc", "max": 2},
            }
        ],
        cable("C", 2),
    )
    assert ok == []
