from pydantic import BaseModel

from app.core.model.issue import Issue
from app.core.model.pack import HardwareRow, Pack
from app.core.model.signal import Signal


class HardwareResult(BaseModel):
    charm: str | None = None
    charm_name: str | None = None
    tb: str | None = None
    tb_name: str | None = None
    tb_terminals: list[str] = []
    loop_typical: str | None = None
    rule_row_id: str | None = None
    held_out: bool = False
    issues: list[Issue] = []


def _value(signal: Signal, key: str) -> object:
    if key == "hart":
        return "hart" in (signal.signal_type or "").lower()
    return getattr(signal, key, None)


def _matches(signal: Signal, match: dict) -> bool:
    for key, want in match.items():
        got = _value(signal, key)
        if isinstance(want, bool):
            if bool(got) is not want:
                return False
            continue
        wants = {w.strip().lower() for w in (want if isinstance(want, list) else [want])}
        if got is None or str(got).strip().lower() not in wants:
            return False
    return True


def _issue(signal: Signal, message: str, **data: str) -> Issue:
    return Issue(
        code="TQ-HW",
        severity="blocking",
        message=message,
        source_file=signal.source_file,
        source_row=signal.source_row,
        data={**data, "cable": signal.cable or ""},
    )


def _result(row: HardwareRow) -> HardwareResult:
    return HardwareResult(
        charm=row.charm,
        charm_name=row.charm_name,
        tb=row.tb,
        tb_name=row.tb_name,
        tb_terminals=row.tb_terminals.split(",") if row.tb_terminals else [],
        loop_typical=row.loop_typical,
        rule_row_id=row.id,
    )


def resolve_hardware(signal: Signal, pack: Pack) -> HardwareResult:
    """First matching row of the ordered table wins. Pure function, no I/O."""
    for row in pack.hardware.rows:
        if not _matches(signal, row.match):
            continue
        res = _result(row)
        missing = [n for n, v in (("CHARM", row.charm), ("terminal block", row.tb)) if not v]
        if missing:
            res.held_out = True
            res.issues = [
                _issue(
                    signal,
                    f"hardware rule {row.id} matched but its {' and '.join(missing)} part "
                    f"number is not defined in the pack; signal held out",
                    rule=row.id,
                )
            ]
        return res
    facts = {
        k: str(getattr(signal, k))
        for k in ("io_type", "signal_type", "signal_level", "duty_class")
        if getattr(signal, k)
    }
    desc = ", ".join(
        f"{k}={getattr(signal, k)!r}"
        for k in ("io_type", "signal_type", "signal_level", "duty_class")
    )
    return HardwareResult(
        held_out=True,
        issues=[_issue(signal, f"no hardware rule matches ({desc}); signal held out", **facts)],
    )


def spare_slot_hardware(pack: Pack) -> HardwareResult:
    return _result(pack.hardware.spare_slot)
