"""What may leave the machine. Everything else is blocked, loudly.

The free tier may use prompts to improve the provider's products, so this whitelist is a
security control: column names, a few masked sample values, single unfamiliar values, TQ
records and the engineer's own rule sentence. Raw MDB rows never pass.
"""

import re

MAX_SAMPLES = 3
MAX_COLUMNS = 80
MAX_TEXT = 600
MAX_VALUE = 60


class RedactionError(ValueError):
    """The payload would have leaked something outside the whitelist."""


def mask(value: object) -> str:
    """Keep the shape of a value, drop its identity: digits become '9', length is capped."""
    return re.sub(r"\d", "9", str(value).strip())[:24]


def _text(v: object, limit: int, where: str) -> str:
    if not isinstance(v, str):
        raise RedactionError(f"{where}: expected text, got {type(v).__name__}")
    if len(v) > limit:
        raise RedactionError(f"{where}: {len(v)} characters is more than the {limit} allowed")
    return v


def _columns(p: dict) -> dict:
    cols = p.get("columns")
    if not isinstance(cols, list) or len(cols) > MAX_COLUMNS:
        raise RedactionError(f"columns: a list of at most {MAX_COLUMNS} names")
    out = []
    for c in cols:
        if set(c) - {"name", "samples"}:
            raise RedactionError(f"columns: unexpected keys {sorted(set(c) - {'name', 'samples'})}")
        samples = c.get("samples", [])
        if len(samples) > MAX_SAMPLES:
            raise RedactionError(f"columns: more than {MAX_SAMPLES} samples for '{c.get('name')}'")
        out.append(
            {
                "name": _text(c["name"], MAX_VALUE, "column name"),
                "samples": [mask(s) for s in samples],
            }
        )
    fields = [_text(f, MAX_VALUE, "field") for f in p.get("candidate_fields", [])]
    return {"columns": out, "candidate_fields": fields}


def _value(p: dict) -> dict:
    return {
        "field": _text(p["field"], MAX_VALUE, "field"),
        "value": _text(p["value"], MAX_VALUE, "value"),
        "categories": [_text(c, MAX_VALUE, "category") for c in p.get("categories", [])],
    }


def _tq(p: dict) -> dict:
    t = p.get("tq")
    allowed = {"code", "message", "options", "default_applied", "subject"}
    if not isinstance(t, dict) or set(t) - allowed:
        raise RedactionError(f"tq: only {sorted(allowed)} may be sent")
    return {
        "tq": {
            "code": _text(t["code"], 20, "tq.code"),
            "message": _text(t["message"], MAX_TEXT, "tq.message"),
            "options": [_text(o, MAX_TEXT, "tq.option") for o in t.get("options", [])],
            "default_applied": _text(t.get("default_applied", ""), MAX_TEXT, "tq.default"),
        }
    }


def _rule(p: dict) -> dict:
    return {
        "request": _text(p["request"], MAX_TEXT, "request"),
        "fields": [_text(f, MAX_VALUE, "field") for f in p.get("fields", [])],
        "primitives": [_text(f, MAX_VALUE, "primitive") for f in p.get("primitives", [])],
    }


WHITELIST = {"mapping": _columns, "value": _value, "tq": _tq, "rule": _rule}


def redact(task: str, payload: dict) -> dict:
    """Return the sanitised payload for a task, or raise RedactionError."""
    if task not in WHITELIST:
        raise RedactionError(f"unknown AI task '{task}'")
    try:
        return WHITELIST[task](payload)
    except (KeyError, TypeError, AttributeError) as e:
        raise RedactionError(f"{task}: malformed payload ({type(e).__name__}: {e})") from e
