import json
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, model_validator

PRIMITIVES = (
    "co_locate", "separate", "capacity", "reserve", "quota", "order", "assign", "pin", "limit_span",
)  # fmt: skip

Primitive = Literal[
    "co_locate", "separate", "capacity", "reserve", "quota", "order", "assign", "pin", "limit_span"
]

# parameters each primitive needs (checked by lint, so a bad rule never crashes a load)
REQUIRED_PARAMS: dict[str, list[list[str]]] = {
    "co_locate": [["by"]],
    "separate": [["a", "b"]],
    "capacity": [["per", "max"]],
    "reserve": [["baseplate"]],
    "quota": [["per", "max_percent"]],
    "order": [["by"]],
    "assign": [["cabinet"], ["cioc"], ["cioc_seq"], ["baseplates"]],  # any one group
    "pin": [["cioc", "baseplate", "channel"]],
    "limit_span": [["unit", "max"]],
}

LEVELS = ("baseplate", "cioc", "cabinet")


class Rule(BaseModel):
    id: str
    name: str = ""
    primitive: Primitive | None = None
    scope: str = ""
    parameters: dict[str, object] = Field(default_factory=dict)
    enabled: bool = True
    strength: Literal["hard", "soft", "advisory"] = "hard"
    not_enforced_reason: str | None = None
    builtin: str | None = None  # invariant the validator always enforces (e.g. R-BLOCK)

    @model_validator(mode="after")
    def _enforceable_or_explained(self) -> "Rule":
        if self.primitive is None and not self.not_enforced_reason and not self.builtin:
            raise ValueError(
                f"rule {self.id}: needs a primitive, a builtin or a not_enforced_reason"
            )
        return self

    @property
    def enforced(self) -> bool:
        return self.primitive is not None


class RuleSetError(ValueError):
    pass


def load_rules(data: str | list | dict) -> list[Rule]:
    """Load rules from JSON text or parsed data. Raises RuleSetError naming the bad rule."""
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError as e:
            raise RuleSetError(f"rules are not valid JSON: {e}") from e
    items = data["rules"] if isinstance(data, dict) else data
    rules: list[Rule] = []
    seen: set[str] = set()
    for n, item in enumerate(items, start=1):
        try:
            rule = Rule.model_validate(item)
        except ValidationError as e:
            rid = item.get("id", f"#{n}") if isinstance(item, dict) else f"#{n}"
            msg = "; ".join(
                f"{'.'.join(map(str, err['loc'])) or 'rule'}: {err['msg']}" for err in e.errors()
            )
            raise RuleSetError(f"rule {rid}: {msg}") from e
        if rule.id in seen:
            raise RuleSetError(f"duplicate rule id '{rule.id}'")
        seen.add(rule.id)
        rules.append(rule)
    return rules
