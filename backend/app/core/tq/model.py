import hashlib
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.core.model.issue import Issue

CODES = (
    "TQ-DATA", "TQ-MAP", "TQ-VALUE", "TQ-HW", "TQ-CAP", "TQ-SEG",
    "TQ-SPARE", "TQ-ALM", "TQ-RULE", "TQ-NAME", "TQ-REV",
)  # fmt: skip

# the three PS categories
CATEGORY = {
    "TQ-DATA": "missing data", "TQ-MAP": "missing data", "TQ-VALUE": "missing data",
    "TQ-HW": "missing data", "TQ-NAME": "missing data",
    "TQ-SEG": "rule conflicts", "TQ-RULE": "rule conflicts", "TQ-REV": "rule conflicts",
    "TQ-CAP": "capacity issues", "TQ-SPARE": "capacity issues", "TQ-ALM": "capacity issues",
}  # fmt: skip

SEVERITY = {"blocking": "blocking", "warning": "assumed", "assumed": "assumed", "info": "info"}

OPTIONS: dict[str, list[tuple[str, str]]] = {
    "TQ-DATA": [("Correct the source data", "signal is allocated on the next run"),
                ("Leave as is", "signal stays held out or the default stays")],
    "TQ-MAP": [("Confirm the suggested column", "mapping is saved for the next upload"),
               ("Pick another column", "signals are re-read with the new mapping")],
    "TQ-VALUE": [("Map to a known value", "signal follows that value's rules"),
                 ("Keep the default policy", "unknown value keeps its safe default")],
    "TQ-HW": [("Supply the part number", "signal is allocated with that hardware"),
              ("Leave held out", "signal stays in the TQ list")],
    "TQ-CAP": [("Allow more cabinets", "signals are placed in added capacity"),
               ("Split the cable", "smaller blocks may fit")],
    "TQ-SEG": [("Confirm the segregation", "signals are separated into compatible CIOCs"),
               ("Correct the cable data", "cable no longer mixes families")],
    "TQ-SPARE": [("Accept the shortfall", "spare allowance stays below the rule"),
                 ("Add capacity", "more spares are provided")],
    "TQ-ALM": [("Add a cabinet", "more alarm baseplates exist"),
               ("Leave held out", "alarm signal stays in the TQ list")],
    "TQ-RULE": [("Revise the rule", "rule is re-evaluated"), ("Waive the rule", "rule is not enforced")],
    "TQ-NAME": [("Supply the value", "names are regenerated"), ("Keep the default", "default name part stays")],
    "TQ-REV": [("Keep the previous slot", "signal does not move"), ("Allow the move", "signal is re-placed")],
}  # fmt: skip


class TqOption(BaseModel):
    label: str
    consequence: str


class TQ(BaseModel):
    id: str
    code: str
    severity: Literal["blocking", "assumed", "info"]
    category: str
    subject: str
    message: str
    options: list[TqOption] = Field(default_factory=list)
    default_applied: str = ""
    scope: str = "signal"  # signal | cable | project: how far an answer reaches
    signal_keys: list[str] = Field(default_factory=list)
    source_file: str | None = None
    source_row: int | None = None
    status: str = "open"
    answer: str | None = None

    @field_validator("code")
    @classmethod
    def _known_code(cls, v: str) -> str:
        if v not in CODES:
            raise ValueError(f"unknown TQ code '{v}'")
        return v


def tq_id(code: str, *subject_keys: object) -> str:
    """The same issue always gets the same id: a hash of the code and its subject keys."""
    raw = "|".join([code, *map(str, subject_keys)])
    return "TQ-" + hashlib.sha256(raw.encode()).hexdigest()[:10]


def signal_key(source_file: str | None, source_row: int | None) -> str:
    return f"{source_file or '?'}:{source_row if source_row is not None else '?'}"


def tq_from_issue(issue: Issue, default_applied: str = "") -> TQ:
    code = issue.code
    keys = [signal_key(issue.source_file, issue.source_row)] if issue.source_row else []
    subject = keys[0] if keys else issue.message
    return TQ(
        id=tq_id(code, issue.source_file, issue.source_row, issue.message),
        code=code,
        severity=SEVERITY[issue.severity],
        category=CATEGORY[code],
        subject=subject,
        message=issue.message,
        options=[TqOption(label=a, consequence=b) for a, b in OPTIONS[code]],
        default_applied=default_applied,
        signal_keys=keys,
        source_file=issue.source_file,
        source_row=issue.source_row,
    )
