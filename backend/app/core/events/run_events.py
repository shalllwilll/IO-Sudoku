"""Turn a finished pipeline run into the progress events a client replays."""

from collections import defaultdict

from app.core.events import models as m
from app.core.pipeline import PipelineRun
from app.core.reports import CompletionReport
from app.core.solve.validator import validate_allocation
from app.core.tq.model import signal_key

BATCH = 100  # placements per event
KEYS_SHOWN = 10


def run_events(run: PipelineRun, report: CompletionReport) -> list[m.EventModel]:
    alloc, out = run.allocation, []
    out += [m.GroupFormed(group=g) for g in run.blocks.groups]

    cells = sorted(alloc.placements, key=lambda p: (p.cioc_no, p.baseplate, p.channel))
    for n, i in enumerate(range(0, len(cells), BATCH), start=1):
        chunk = cells[i : i + BATCH]
        out.append(
            m.PlacementBatch(
                batch=n,
                count=len(chunk),
                placements=[
                    m.PlacementLite(
                        cioc_no=p.cioc_no, baseplate=p.baseplate, channel=p.channel, kind=p.kind,
                        tag=p.signal.tag if p.signal else None, block_id=p.block_id,
                    )
                    for p in chunk
                ],
            )
        )  # fmt: skip

    why: dict[tuple[str, str], list[str]] = defaultdict(list)
    for u in alloc.unplaced:
        for i in u.issues or []:
            why[(i.code, i.message)].append(signal_key(u.signal.source_file, u.signal.source_row))
    for h in run.held_out:
        for i in h.issues:
            why[(i.code, i.message)].append(signal_key(h.source_file, h.source_row))
    out += [
        m.Rejection(code=c, message=msg, signals=len(keys), keys=keys[:KEYS_SHOWN])
        for (c, msg), keys in sorted(why.items())
    ]

    k = report.kpi
    out.append(
        m.SpareAssigned(
            wired_spare_pairs=k.wired_spare_pairs, spare_slots=k.spare_slots,
            by_io_type=k.by_io_type,
        )
    )  # fmt: skip
    for e in run.chain.events:
        out.append(m.SolverStatus(solver=e.stage, status=e.status, detail=e.message))
        if e.status == "fallback":
            out.append(m.FallbackTriggered(solver=e.stage, reason=e.message))
    out += [
        m.TqRaised(
            id=t.id, code=t.code, severity=t.severity, category=t.category, message=t.message,
            signals=len(t.signal_keys),
        )
        for t in run.tqs
    ]  # fmt: skip
    bad = validate_allocation(alloc, run.pack, run.allocatable, rules=run.rules)
    out.append(
        m.ValidationResult(
            ok=not bad, violations=len(bad), items=[f"{v.code}: {v.message}" for v in bad[:20]]
        )
    )
    return out
