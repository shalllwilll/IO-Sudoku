import re

from pydantic import BaseModel

from app.core.model.issue import Issue
from app.core.model.pack import KINDS, Naming

_PLACEHOLDER = re.compile(r"\{([^{}]*)\}")

# keyword argument of name_for -> placeholder in the templates
_ARGS = {
    "Area": "area",
    "Unit": "unit",
    "Seq": "seq",
    "CIOC no": "cioc_no",
    "n": "n",
    "Ch": "ch",
}


class NamedItem(BaseModel):
    name: str
    issues: list[Issue] = []


def render(naming: Naming, template: str, **values: object) -> tuple[str, list[str]]:
    """Fill a template. Returns the text and the placeholders that had no value.

    A missing placeholder renders as '?' so a run never halts on a naming gap.
    """
    missing: list[str] = []

    def fill(m: re.Match) -> str:
        key = m.group(1)
        raw = values.get(key)
        if raw is None or raw == "":
            missing.append(key)
            return "?"
        width = naming.padding.get(key, 0)
        return str(raw).zfill(width) if width and str(raw).isdigit() else str(raw)

    return _PLACEHOLDER.sub(fill, template), missing


class Namer:
    """Generates names from the pack templates and reports duplicates."""

    def __init__(self, naming: Naming):
        self.naming = naming
        self._seen: dict[str, str] = {}

    def name_for(
        self,
        kind: str,
        area: str | None = None,
        unit: str | None = None,
        seq: int | str | None = None,
        cioc_no: int | str | None = None,
        n: int | str | None = None,
        ch: int | str | None = None,
    ) -> NamedItem:
        if kind not in (*KINDS, "wired_spare_tag") or getattr(self.naming, kind) is None:
            raise ValueError(f"unknown naming kind '{kind}'")
        issues: list[Issue] = []
        if area is None:
            area = self.naming.default_area
            issues.append(_tq(f"{kind}: no area given, default '{area}' used", "area"))
        if unit is None:
            unit = self.naming.default_unit
            issues.append(_tq(f"{kind}: no unit given, default '{unit}' used", "unit"))
        given = {"area": area, "unit": unit, "seq": seq, "cioc_no": cioc_no, "n": n, "ch": ch}
        values = {ph: given[arg] for ph, arg in _ARGS.items()}
        text, missing = render(self.naming, getattr(self.naming, kind).template, **values)
        for key in missing:
            issues.append(_tq(f"{kind} template needs '{key}' but none was supplied"))
        if text in self._seen:
            issues.append(_tq(f"name '{text}' is already used by a {self._seen[text]}"))
        else:
            self._seen[text] = kind
        return NamedItem(name=text, issues=issues)


def _tq(message: str, field: str | None = None) -> Issue:
    data = {"field": field} if field else {}
    return Issue(code="TQ-NAME", severity="warning", message=message, data=data)
