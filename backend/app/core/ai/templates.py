"""Offline plain-English rule templates.

A small, closed set of phrasings is turned into a rule without any model, so the describe-a-rule
path works with AI off and answers instantly.  A match is only a proposal: it goes through the
same parse, lint and dry-run as a model-written rule and is never applied without a confirmation.
"""

import re
from dataclasses import dataclass, field

LEVEL_WORDS = {
    "baseplate": "baseplate", "baseplates": "baseplate", "base plate": "baseplate",
    "base plates": "baseplate", "cioc": "cioc", "ciocs": "cioc", "cabinet": "cabinet",
    "cabinets": "cabinet",
}  # fmt: skip
_LEVEL = r"(base\s?plates?|ciocs?|cabinets?)"

IO_TYPES = {
    "AIR": ("analog input", "analogue input", "analog inputs", "analogue inputs", "air"),
    "AOR": ("analog output", "analogue output", "analog outputs", "analogue outputs", "aor"),
    "DIR": ("digital input", "digital inputs", "dir"),
    "DOR": ("digital output", "digital outputs", "dor"),
}
_SHORT = {"AI": "AIR", "AO": "AOR", "DI": "DIR", "DO": "DOR"}  # only when written in capitals
_TERM = re.compile(
    r"\b(?:(?:analog|analogue|digital)\s+(?:input|output)s?|(?:air|aor|dir|dor)"
    r"|(?:segregation|family|class)\s+[a-e]|ai|ao|di|do)\b",
    re.IGNORECASE,
)
_SEPARATE = re.compile(r"\b(separate|apart|different|isolat\w+)\b")
_NEVER_TOGETHER = re.compile(
    r"\b(never|not|don'?t|do not|avoid|no)\b.*\b(same|together|mix\w*|shar\w+|combine\w*)\b"
)
_TOGETHER = re.compile(r"\b(together|same|single|one)\b")
_SOFT = re.compile(r"\b(prefer|try to|if possible|ideally|where possible)\b")
_NUMBER = r"(\d+(?:\.\d+)?)"


@dataclass
class Template:
    name: str
    primitive: str
    scope: str = ""
    parameters: dict = field(default_factory=dict)
    strength: str = "hard"


def _level(text: str) -> str | None:
    m = re.search(_LEVEL, text)
    return LEVEL_WORDS.get(re.sub(r"\s+", " ", m.group(1)).strip()) if m else None


def _terms(text: str) -> list[tuple[str, str]]:
    """Signal groups named in the sentence, in order: (scope expression, label)."""
    found: list[tuple[str, str]] = []
    for m in _TERM.finditer(text):
        raw = m.group(0)
        low = raw.lower()
        if low in {"ai", "ao", "di", "do"}:
            if raw.upper() != raw:
                continue  # "do", "di" in prose are words, not IO types
            code = _SHORT[raw.upper()]
            item = (f"io_type = {code}", code)
        elif re.match(r"(segregation|family|class)\s", low):
            fam = low.split()[-1].upper()
            item = (f"segregation_family = {fam}", f"family {fam}")
        else:
            code = next((k for k, v in IO_TYPES.items() if low in v or low == k.lower()), None)
            if code is None:
                continue
            item = (f"io_type = {code}", code)
        if item not in found:
            found.append(item)
    return found


def _pretty(level: str, plural: bool = True) -> str:
    word = "CIOC" if level == "cioc" else level
    return word + ("s" if plural else "")


def _separate(text: str, low: str) -> Template | None:
    if not (_SEPARATE.search(low) or _NEVER_TOGETHER.search(low)):
        return None
    terms = _terms(text)
    if len(terms) != 2:
        return None
    level = _level(low) or "cioc"
    (a, la), (b, lb) = terms
    return Template(
        name=f"Keep {la} and {lb} on separate {_pretty(level)}",
        primitive="separate",
        parameters={"a": a, "b": b, "level": level},
    )


def _pin(text: str) -> Template | None:
    m = re.search(
        r"\b(?:pin|fix|lock)\s+(?:signal\s+|tag\s+)?(\S+?)\s+(?:to|at|on|in)\s+cioc\s*(\d+)\W+"
        r"(?:base\s?plate|bp)\s*(\d+)\W+(?:channel|ch)\s*(\d+)",
        text,
        re.IGNORECASE,
    )
    if not m:
        return None
    tag, cioc, bp, ch = m.group(1).strip(",."), int(m.group(2)), int(m.group(3)), int(m.group(4))
    return Template(
        name=f"Pin {tag} to CIOC {cioc}, baseplate {bp}, channel {ch}",
        primitive="pin",
        scope=f'tag = "{tag}"',
        parameters={"cioc": cioc, "baseplate": bp, "channel": ch},
    )


def _reserve(low: str) -> Template | None:
    m = re.search(
        r"\b(?:reserve|leave empty|keep empty|keep free|leave free|leave unused)\b.*?"
        r"base\s?plate\s*(\d+)",
        low,
    ) or re.search(r"base\s?plate\s*(\d+)\b.*\b(?:empty|free|unused|reserved)\b", low)
    if not m:
        return None
    n = int(m.group(1))
    return Template(
        name=f"Keep baseplate {n} empty", primitive="reserve", parameters={"baseplate": n}
    )


def _quota(low: str) -> Template | None:
    level = _level(low)
    if level is None:
        return None
    spare = re.search(rf"{_NUMBER}\s*(?:%|percent)\s*(?:of\s+\w+\s+)?(?:spare|free|empty|headroom)", low)
    spare = spare or re.search(rf"(?:spare|free|empty|headroom)\w*\W+{_NUMBER}\s*(?:%|percent)", low)
    cap = re.search(
        rf"(?:no more than|at most|max(?:imum)?(?: of)?|up to|limit\w*(?: to)?|fill\w*(?: to)?)\s*{_NUMBER}\s*(?:%|percent)",
        low,
    )
    if spare:
        pct = 100 - float(spare.group(1))
    elif cap:
        pct = float(cap.group(1))
    else:
        return None
    if not 0 < pct < 100:
        return None
    shown = f"{pct:g}"
    return Template(
        name=f"Fill each {_pretty(level, False)} to at most {shown}%",
        primitive="quota",
        parameters={"per": level, "max_percent": pct},
    )


def _capacity(text: str, low: str) -> Template | None:
    m = re.search(
        rf"(?:no more than|at most|max(?:imum)?(?: of)?|up to|limit\w*(?: to)?|not exceed\w*|fewer than)\s*(\d+)"
        rf"\s*(base\s?plates?|signals?|channels?)?(?:\s+\w+){{0,3}}?\s+(?:per|on|in|for|each|every|a|any)\s+(?:single\s+|one\s+)?{_LEVEL}",
        low,
    )
    if not m:
        return None
    n = int(m.group(1))
    unit = (m.group(2) or "signals").replace(" ", "")
    measure = "baseplates" if unit.startswith("baseplate") else "signals"
    per = LEVEL_WORDS[re.sub(r"\s+", " ", m.group(3)).strip()]
    before = text[: m.start(3)]
    terms = _terms(before)
    scope = terms[0][0] if len(terms) == 1 else ""
    what = terms[0][1] + " " if scope else ""
    return Template(
        name=f"At most {n} {what}{measure} per {_pretty(per, False)}",
        primitive="capacity",
        scope=scope,
        parameters={"per": per, "max": n, "measure": measure},
    )


def _co_locate(text: str, low: str) -> Template | None:
    if not _TOGETHER.search(low) or not re.search(r"\b(keep|put|place|hold|stay|group)\b", low):
        return None
    level = _level(low)
    if level is None:
        return None
    for word, by in (("cable", "cable"), ("group", "group"), ("loop", "loop_name")):
        if re.search(rf"\b{word}s?\b", low):
            terms = _terms(text)
            scope = terms[0][0] if len(terms) == 1 else ""
            label = {"cable": "each cable", "group": "each group", "loop_name": "each loop"}[by]
            return Template(
                name=f"Keep {label} on one {_pretty(level, False)}",
                primitive="co_locate",
                scope=scope,
                parameters={"by": by, "level": level},
            )
    return None


def compile_template(request: str) -> Template | None:
    """The first template that matches the sentence, or None when it needs a person or a model."""
    text = " ".join(request.split())
    low = text.lower()
    found = (
        _pin(text)
        or _reserve(low)
        or _quota(low)
        or _capacity(text, low)
        or _separate(text, low)
        or _co_locate(text, low)
    )
    if found and _SOFT.search(low):
        found.strength = "soft"
    return found


EXAMPLES = [
    "Keep AIR and DOR on separate CIOCs",
    "Keep each cable on one CIOC",
    "No more than 80 signals per CIOC",
    "Fill each CIOC to at most 80%",
    "Keep baseplate 8 empty",
    "Pin PT-101 to CIOC 1, baseplate 2, channel 3",
]
