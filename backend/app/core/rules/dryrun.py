from pydantic import BaseModel

from app.core.layout.blocks import BlockSet
from app.core.rules.schema import Rule
from app.core.rules.scope import ScopeError, matches, parse_scope


class DryRun(BaseModel):
    rule_id: str
    enforced: bool
    matched_signals: int
    affected_blocks: int
    error: str | None = None


def dry_run(rules: list[Rule], blocks: BlockSet) -> list[DryRun]:
    """How many signals and blocks each rule's scope touches, without solving."""
    out = []
    for r in rules:
        if not r.enforced:
            out.append(DryRun(rule_id=r.id, enforced=False, matched_signals=0, affected_blocks=0))
            continue
        try:
            node = parse_scope(r.scope)
        except ScopeError as e:
            out.append(
                DryRun(
                    rule_id=r.id, enforced=True, matched_signals=0, affected_blocks=0, error=str(e)
                )
            )
            continue
        sigs = bl = 0
        for b in blocks.blocks:
            n = sum(1 for s in b.signals if matches(node, s, b.group))
            sigs += n
            bl += bool(n)
        for s in blocks.alarm_signals:
            sigs += matches(node, s, None)
        out.append(DryRun(rule_id=r.id, enforced=True, matched_signals=sigs, affected_blocks=bl))
    return out
