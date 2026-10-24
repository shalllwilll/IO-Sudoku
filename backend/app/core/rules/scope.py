"""Scope expressions: `field = X`, `field in [A, B]`, joined by and/or/not and parentheses.

A small recursive-descent parser. Rule text is never passed to eval or exec.
"""

import re
from dataclasses import dataclass

from app.core.model.signal import Signal

# attributes a scope may test: the Signal fields (not extras) plus the affinity group
SCOPE_FIELDS = sorted(set(Signal.model_fields) - {"extras"} | {"group"})

_TOKEN = re.compile(
    r"""\s*(?:
    (?P<str>"[^"]*"|'[^']*')
  | (?P<op>!=|=|\(|\)|\[|\]|,)
  | (?P<word>[A-Za-z0-9_.\-+/#&:]+)
)""",
    re.VERBOSE,
)


class ScopeError(ValueError):
    pass


@dataclass(frozen=True)
class Cmp:
    field: str
    negate: bool
    values: tuple[str, ...]


@dataclass(frozen=True)
class Not:
    inner: object


@dataclass(frozen=True)
class And:
    parts: tuple


@dataclass(frozen=True)
class Or:
    parts: tuple


@dataclass(frozen=True)
class Everything:
    pass


def _tokens(text: str) -> list[tuple[str, str]]:
    out, pos = [], 0
    text = text.rstrip()
    while pos < len(text):
        m = _TOKEN.match(text, pos)
        if not m or m.end() == pos:
            raise ScopeError(f"unexpected character {text[pos:].strip()[:1]!r} in scope")
        kind = m.lastgroup
        val = m.group(kind)
        out.append((kind, val[1:-1] if kind == "str" else val))
        pos = m.end()
    return out


class _Parser:
    def __init__(self, toks: list[tuple[str, str]]):
        self.t, self.i = toks, 0

    def peek(self) -> tuple[str, str] | None:
        return self.t[self.i] if self.i < len(self.t) else None

    def take(self) -> tuple[str, str]:
        tok = self.peek()
        if tok is None:
            raise ScopeError("scope ends unexpectedly")
        self.i += 1
        return tok

    def kw(self, word: str) -> bool:
        tok = self.peek()
        if tok and tok[0] == "word" and tok[1].lower() == word:
            self.i += 1
            return True
        return False

    def expr(self):
        parts = [self.term()]
        while self.kw("or"):
            parts.append(self.term())
        return parts[0] if len(parts) == 1 else Or(tuple(parts))

    def term(self):
        parts = [self.factor()]
        while self.kw("and"):
            parts.append(self.factor())
        return parts[0] if len(parts) == 1 else And(tuple(parts))

    def factor(self):
        if self.kw("not"):
            return Not(self.factor())
        tok = self.peek()
        if tok == ("op", "("):
            self.i += 1
            inner = self.expr()
            if self.take() != ("op", ")"):
                raise ScopeError("missing closing parenthesis")
            return inner
        return self.comparison()

    def value(self) -> str:
        kind, val = self.take()
        if kind in ("word", "str"):
            return val
        raise ScopeError(f"expected a value, found {val!r}")

    def comparison(self):
        kind, field = self.take()
        if kind != "word" or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", field):
            raise ScopeError(f"expected a field name, found {field!r}")
        if self.kw("not"):
            if not self.kw("in"):
                raise ScopeError("expected 'in' after 'not'")
            return Cmp(field, True, self.values())
        if self.kw("in"):
            return Cmp(field, False, self.values())
        tok = self.take()
        if tok == ("op", "="):
            return Cmp(field, False, (self.value(),))
        if tok == ("op", "!="):
            return Cmp(field, True, (self.value(),))
        raise ScopeError(f"expected =, !=, in or not in after '{field}'")

    def values(self) -> tuple[str, ...]:
        if self.take() != ("op", "["):
            raise ScopeError("expected '[' to start a list")
        vals = [self.value()]
        while self.peek() == ("op", ","):
            self.i += 1
            vals.append(self.value())
        if self.take() != ("op", "]"):
            raise ScopeError("expected ']' to end a list")
        return tuple(vals)


def parse_scope(text: str | None):
    """Parse a scope expression. Empty text means every signal."""
    if text is None or not text.strip():
        return Everything()
    p = _Parser(_tokens(text))
    node = p.expr()
    if p.peek() is not None:
        raise ScopeError(f"unexpected {p.peek()[1]!r} after the end of the expression")
    return node


def fields_used(node) -> set[str]:
    if isinstance(node, Cmp):
        return {node.field}
    if isinstance(node, Not):
        return fields_used(node.inner)
    if isinstance(node, (And, Or)):
        return set().union(*(fields_used(p) for p in node.parts))
    return set()


def _norm(v: object) -> str:
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v).strip().lower()


def matches(node, signal: Signal, group: str | None = None) -> bool:
    if isinstance(node, Everything):
        return True
    if isinstance(node, Cmp):
        got = group if node.field == "group" else getattr(signal, node.field, None)
        hit = _norm(got) in {_norm(v) for v in node.values}
        return not hit if node.negate else hit
    if isinstance(node, Not):
        return not matches(node.inner, signal, group)
    if isinstance(node, And):
        return all(matches(p, signal, group) for p in node.parts)
    return any(matches(p, signal, group) for p in node.parts)
