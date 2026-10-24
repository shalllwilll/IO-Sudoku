from pydantic import BaseModel

from app.core.model.allocation import Allocation
from app.core.model.pack import Pack
from app.core.model.signal import Signal
from app.core.rules.primitives import Ctx, check_rule
from app.core.rules.schema import Rule
from app.core.solve.validator import validate_allocation

# built-in invariants: rule id, description, validator codes that count as a violation of it
BUILTIN = [
    ("R-ONCE", "Every signal is allocated exactly once or is in the TQ list",
     {"MISSING", "DUPLICATE", "UNKNOWN_SIGNAL", "INVARIANT"}),
    ("R-CAP", "Capacity: 12 channels, 8 baseplates, 4 CIOCs, one signal per position",
     {"CAPACITY", "CHARM_NO"}),
    ("R-BLOCK", "Cable blocks are contiguous and start on channel 1 when larger than a baseplate",
     {"BLOCK"}),
    ("R-SEG", "Conflicting segregation families never share a CIOC", {"SEGREGATION"}),
    ("R-RESERVE", "Alarm and spare baseplates are used only as reserved", {"RESERVED"}),
]  # fmt: skip


class RuleResult(BaseModel):
    rule: str
    description: str
    passed: bool
    violations: int
    enforced: bool = True
    strength: str = "hard"


def rule_check(
    alloc: Allocation,
    pack: Pack,
    signals: list[Signal],
    not_enforced: list[str] | None = None,
    rules: list[Rule] | None = None,
) -> list[RuleResult]:
    found = validate_allocation(alloc, pack, signals, rules=rules)
    out = []
    for rid, desc, codes in BUILTIN:
        n = sum(1 for v in found if v.code in codes)
        out.append(RuleResult(rule=rid, description=desc, passed=n == 0, violations=n))
    ctx = Ctx(alloc.layout, pack)
    for r in rules or []:
        if not r.enforced:
            out.append(
                RuleResult(
                    rule=r.id,
                    description=f"{r.name or r.id}: {r.not_enforced_reason}",
                    passed=False,
                    violations=0,
                    enforced=False,
                    strength=r.strength,
                )
            )
        elif r.enabled:
            n = len(check_rule(r, alloc.placements, ctx))
            out.append(
                RuleResult(
                    rule=r.id,
                    description=r.name or r.id,
                    passed=n == 0,
                    violations=n,
                    strength=r.strength,
                )
            )
    for text in not_enforced or []:
        out.append(
            RuleResult(
                rule="NOT-ENFORCED", description=text, passed=False, violations=0, enforced=False
            )
        )
    return out
