from pydantic import BaseModel

from app.core.model.allocation import Allocation
from app.core.model.issue import Issue
from app.core.model.pack import Pack
from app.core.model.signal import Signal
from app.core.reports.declaration import Declaration, build_declaration
from app.core.reports.kpi import Kpi, compute_kpi
from app.core.reports.rule_check import RuleResult, rule_check
from app.core.rules.schema import Rule
from app.core.rules.sets import RuleSet


class CompletionReport(BaseModel):
    kpi: Kpi
    rules: list[RuleResult]
    declaration: Declaration

    def sheets(self) -> dict[str, list[list[object]]]:
        """The same numbers as JSON, laid out as sheets for the output workbook."""
        k = self.kpi
        summary = [["Metric", "Value"]] + [
            [name, getattr(k, name)]
            for name in (
                "signals_total", "allocated", "held_out", "cabinets", "ciocs", "baseplates",
                "baseplates_used", "controllers", "positions", "occupied", "spare_slots",
                "utilisation", "wired_spare_pairs", "protected_spare_pairs",
                "free_slots_on_used_baseplates",
                "empty_baseplates",
            )
        ]  # fmt: skip
        for t, v in k.by_io_type.items():
            summary.append([f"{t} field", v.get("field", 0)])
            summary.append([f"{t} wired spare", v.get("wired_spare", 0)])
        rules = [["Rule", "Description", "Result", "Violations"]] + [
            [
                r.rule,
                r.description,
                "Pass" if r.passed else ("Not enforced" if not r.enforced else "Fail"),
                r.violations,
            ]
            for r in self.rules
        ]
        decl = [["Kind", "Statement"]]
        if self.declaration.rule_set:
            decl.append(["Rule set", self.declaration.rule_set])
        decl += [["Rule", x] for x in self.declaration.rules]
        decl += [["Assumed", s] for s in self.declaration.assumed]
        decl += [["Defaulted", s] for s in self.declaration.defaulted]
        decl += [["Not enforced", s] for s in self.declaration.not_enforced]
        return {"Run Summary": summary, "Rule Check": rules, "Declaration": decl}


def build_report(
    alloc: Allocation,
    pack: Pack,
    signals: list[Signal],
    issues: list[Issue],
    extra_held_out: list[Signal] | None = None,
    not_enforced: list[str] | None = None,
    rules: list[Rule] | None = None,
    ruleset: RuleSet | None = None,
) -> CompletionReport:
    if ruleset is not None and rules is None:
        rules = ruleset.rules
    return CompletionReport(
        kpi=compute_kpi(alloc, pack, extra_held_out),
        rules=rule_check(alloc, pack, signals, not_enforced, rules),
        declaration=build_declaration(pack, issues, not_enforced, ruleset),
    )
