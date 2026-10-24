from pydantic import BaseModel

from app.core.model.signal import Signal
from app.core.rules.schema import LEVELS, REQUIRED_PARAMS, Rule
from app.core.rules.scope import SCOPE_FIELDS, ScopeError, fields_used, matches, parse_scope


class Finding(BaseModel):
    rule_id: str
    severity: str  # error | warning | info
    message: str


def _scope_members(rule: Rule, signals: list[Signal], groups: dict[str, str]) -> set[int]:
    node = parse_scope(rule.scope)
    return {i for i, s in enumerate(signals) if matches(node, s, groups.get(s.cable or ""))}


def lint(
    rules: list[Rule],
    signals: list[Signal] | None = None,
    groups: dict[str, str] | None = None,
) -> list[Finding]:
    """Static checks; with signals given, also empty scopes and contradictory pairs."""
    out: list[Finding] = []
    groups = groups or {}
    members: dict[str, set[int]] = {}

    def add(rule: Rule, sev: str, msg: str) -> None:
        out.append(Finding(rule_id=rule.id, severity=sev, message=msg))

    for r in rules:
        if not r.enforced:
            add(r, "info", f"not enforced: {r.not_enforced_reason}")
            continue
        try:
            node = parse_scope(r.scope)
        except ScopeError as e:
            add(r, "error", f"scope cannot be parsed: {e}")
            continue
        for f in sorted(fields_used(node) - set(SCOPE_FIELDS)):
            add(r, "error", f"scope uses unknown field '{f}'")
        groups_ok = any(all(k in r.parameters for k in g) for g in REQUIRED_PARAMS[r.primitive])
        if not groups_ok:
            need = " or ".join("+".join(g) for g in REQUIRED_PARAMS[r.primitive])
            add(r, "error", f"missing parameter for {r.primitive}: needs {need}")
        for key in ("level", "per", "unit"):
            v = r.parameters.get(key)
            if v is not None and v not in LEVELS:
                add(r, "error", f"parameter {key}={v!r} must be one of {', '.join(LEVELS)}")
        for key in ("a", "b"):
            if isinstance(r.parameters.get(key), str):
                try:
                    bad = fields_used(parse_scope(r.parameters[key])) - set(SCOPE_FIELDS)
                except ScopeError as e:
                    add(r, "error", f"parameter {key} cannot be parsed: {e}")
                else:
                    for f in sorted(bad):
                        add(r, "error", f"parameter {key} uses unknown field '{f}'")
        if signals is not None and not any(
            f.rule_id == r.id and f.severity == "error" for f in out
        ):
            members[r.id] = _scope_members(r, signals, groups)
            if r.enabled and not members[r.id]:
                add(r, "warning", "scope matches no signals")

    if signals is not None:
        sep = [r for r in rules if r.enabled and r.primitive == "separate" and r.id in members]
        col = [r for r in rules if r.enabled and r.primitive == "co_locate" and r.id in members]
        for s in sep:
            a = {i for i in members[s.id] if _in(s.parameters["a"], signals[i], groups)}
            b = {i for i in members[s.id] if _in(s.parameters["b"], signals[i], groups)}
            for c in col:
                if members[c.id] & a and members[c.id] & b:
                    add(
                        c,
                        "error",
                        f"conflicts with rule {s.id}: co_locate puts signals together "
                        "that the separate rule keeps apart",
                    )
    return out


def _in(expr: object, sig: Signal, groups: dict[str, str]) -> bool:
    return matches(parse_scope(str(expr)), sig, groups.get(sig.cable or ""))
