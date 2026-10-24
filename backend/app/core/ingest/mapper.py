import json
import re
from pathlib import Path

from pydantic import BaseModel, Field
from rapidfuzz import fuzz

from app.core.model.issue import Issue
from app.core.model.pack import Pack

SAMPLE_SIZE = 60
FUZZY_CAP = 0.95
NORMALISED_SCORE = 0.98
SHAPE_BONUS = 0.05
SHAPE_PENALTY = 0.25

_FORMATION = re.compile(r"^\d+\s*[PTQ]?\s*X\s*\d", re.IGNORECASE)
_PAIRISH = re.compile(r"^(pair|triad|quad|core)?\s*#?\s*\d+$", re.IGNORECASE)


class ColumnMatch(BaseModel):
    field: str
    column: str
    confidence: float
    method: str  # alias | normalised | fuzzy | confirmed


class Mapping(BaseModel):
    matches: dict[str, ColumnMatch] = Field(default_factory=dict)
    grouping_mode: str = "none"  # two_column | combined | none
    issues: list[Issue] = Field(default_factory=list)

    def column(self, field: str) -> str | None:
        m = self.matches.get(field)
        return m.column if m else None

    @property
    def blocking(self) -> bool:
        return any(i.severity == "blocking" for i in self.issues)

    def confirmed(self) -> dict[str, str]:
        return {f: m.column for f, m in sorted(self.matches.items())}


def _raw(s: str) -> str:
    return " ".join(s.lower().split())


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _shape_adjust(field: str, samples: list[str]) -> float:
    vals = [v for v in samples if v and v != "-"]
    if not vals:
        return 0.0

    def frac(rx: re.Pattern) -> float:
        return sum(bool(rx.match(v)) for v in vals) / len(vals)

    if field == "pair":
        f = frac(_PAIRISH)
        return SHAPE_BONUS if f >= 0.8 else (-SHAPE_PENALTY if f < 0.3 else 0.0)
    if field == "cable_formation":
        return SHAPE_BONUS if frac(_FORMATION) >= 0.5 else -SHAPE_PENALTY
    if field == "cable":
        return -SHAPE_PENALTY if frac(_FORMATION) >= 0.5 else 0.0
    return 0.0


def _score(header: str, aliases: list[str], field: str, samples: list[str]) -> tuple[float, str]:
    h_raw, h_norm = _raw(header), _norm(header)
    best, method = 0.0, "fuzzy"
    for a in aliases:
        if h_raw == _raw(a):
            return min(1.0, 1.0 + _shape_adjust(field, samples)), "alias"
        if h_norm == _norm(a):
            best, method = max(best, NORMALISED_SCORE), "normalised"
        else:
            r = max(fuzz.ratio(h_norm, _norm(a)), fuzz.token_sort_ratio(h_raw, _raw(a))) / 100
            if r * FUZZY_CAP > best and method != "normalised":
                best, method = r * FUZZY_CAP, "fuzzy"
    return max(0.0, min(1.0, best + _shape_adjust(field, samples))), method


def map_columns(
    headers: list[str],
    sample_rows: list[dict[str, object]],
    pack: Pack,
    confirmed: dict[str, str] | None = None,
) -> Mapping:
    """Deterministically map source headers to canonical fields."""
    th = pack.aliases.thresholds
    required = set(pack.schema_.required)
    headers = [h for h in headers if h]
    samples = {
        h: [str(r.get(h)).strip() for r in sample_rows[:SAMPLE_SIZE] if r.get(h) is not None]
        for h in headers
    }
    mapping = Mapping()
    taken_cols: set[str] = set()

    for field, col in sorted((confirmed or {}).items()):
        if col in headers and field in pack.aliases.fields:
            mapping.matches[field] = ColumnMatch(
                field=field, column=col, confidence=1.0, method="confirmed"
            )
            taken_cols.add(col)

    scored: list[tuple[float, str, str, int, str]] = []
    for field, aliases in sorted(pack.aliases.fields.items()):
        if field in mapping.matches:
            continue
        for idx, h in enumerate(headers):
            if h in taken_cols:
                continue
            s, method = _score(h, aliases, field, samples[h])
            if s >= th.ask:
                scored.append((s, field, h, idx, method))
    scored.sort(key=lambda t: (-t[0], t[3], t[1]))

    candidates: dict[str, list[tuple[float, str, str]]] = {}
    for s, field, h, _idx, method in scored:
        candidates.setdefault(field, []).append((s, h, method))
        if field in mapping.matches or h in taken_cols:
            continue
        mapping.matches[field] = ColumnMatch(
            field=field, column=h, confidence=round(s, 4), method=method
        )
        taken_cols.add(h)

    holder = {m.column: m for m in mapping.matches.values()}
    for field, m in sorted(mapping.matches.items()):
        if m.method == "confirmed":
            continue
        rivals = [
            c
            for c in candidates.get(field, [])
            if c[1] != m.column
            and c[0] >= m.confidence - th.tie_margin
            and (c[1] not in holder or holder[c[1]].confidence < c[0] - th.tie_margin)
        ]
        if rivals:
            options = [m.column] + [r[1] for r in rivals]
            mapping.issues.append(
                Issue(
                    code="TQ-MAP",
                    severity="warning",
                    message=f"'{field}' is ambiguous between columns {options}; using '{m.column}'",
                    data={"field": field, "column": m.column, "options": "|".join(options)},
                )
            )
        elif m.confidence < th.accept:
            mapping.issues.append(
                Issue(
                    code="TQ-MAP",
                    severity="warning",
                    message=f"'{field}' mapped to '{m.column}' with low confidence "
                    f"{m.confidence:.2f}; please confirm",
                    data={"field": field, "column": m.column},
                )
            )

    for field in sorted(required):
        if field not in mapping.matches:
            mapping.issues.append(
                Issue(
                    code="TQ-MAP",
                    severity="blocking",
                    message=f"required field '{field}' has no matching column",
                    data={"field": field},
                )
            )

    _rescue_combined_grouping(mapping, samples, pack)
    if "group" in mapping.matches or "segregation" in mapping.matches:
        mapping.grouping_mode = "two_column"
    elif "io_grouping" in mapping.matches:
        mapping.grouping_mode = "combined"
    return mapping


def _rescue_combined_grouping(
    mapping: "Mapping", samples: dict[str, list[str]], pack: Pack
) -> None:
    """Catch a combined grouping column that was matched as a plain group, or not matched at all.

    Segregation lives in the combined "IO Grouping" cell (for example "A-PUMPS"). If the column
    was mapped as `group` only, the code inside it would be ignored and A/B signals could share a
    CIOC without any warning, so a column whose values carry known segregation codes is treated as
    combined and the engineer is asked to confirm. When no segregation source exists, say so.
    """
    if "segregation" in mapping.matches or "io_grouping" in mapping.matches:
        return
    codes = {c.code for c in pack.segregation.codes}
    grp = mapping.matches.get("group")
    if grp is not None and grp.method != "confirmed":
        vals = [v for v in samples.get(grp.column, []) if v not in ("", "-")]
        hits = sum(1 for v in vals if split_grouping(v, pack)[1] in codes)
        if vals and hits / len(vals) >= 0.5:
            mapping.matches.pop("group")
            mapping.matches["io_grouping"] = ColumnMatch(
                field="io_grouping", column=grp.column, confidence=grp.confidence, method="value"
            )
            mapping.issues.append(
                Issue(
                    code="TQ-MAP",
                    severity="warning",
                    message=f"column '{grp.column}' holds segregation codes; mapped as the "
                    "combined IO grouping column. Please confirm.",
                    data={"field": "io_grouping", "column": grp.column},
                )
            )
            return
    mapping.issues.append(
        Issue(
            code="TQ-MAP",
            severity="warning",
            message="no segregation or IO grouping column was found; segregation cannot be "
            "enforced until one is mapped",
            data={"field": "segregation"},
        )
    )


def split_grouping(value: object, pack: Pack) -> tuple[str | None, str | None]:
    """Split a combined grouping cell into (group, segregation).

    A value that is itself a segregation code is all segregation. Otherwise a known code
    prefix is the segregation and the rest is the group; anything else is returned as
    segregation so the normaliser can raise TQ-VALUE.
    """
    v = "" if value is None else str(value).strip()
    if v in ("", "-"):
        return None, None
    codes = sorted((c.code for c in pack.segregation.codes), key=len, reverse=True)
    up = v.upper()
    if up in codes:
        return None, up
    for c in codes:
        for sep in ("-", "_", " ", "/"):
            if up.startswith(c + sep) and len(v) > len(c) + 1:
                return v[len(c) + 1 :].strip(), c
    return None, up


def save_mapping(path: str | Path, mapping: Mapping) -> None:
    Path(path).write_text(json.dumps(mapping.confirmed(), indent=1, sort_keys=True))


def load_confirmed(path: str | Path) -> dict[str, str]:
    p = Path(path)
    return json.loads(p.read_text()) if p.exists() else {}
