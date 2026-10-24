import re
from collections import defaultdict

from app.core.ingest.normaliser import HeldOut
from app.core.model.issue import Issue
from app.core.model.pack import Pack
from app.core.model.signal import Signal

_LEAD = re.compile(r"^\s*(\d+)")


def _loc(s: Signal) -> dict:
    return {"source_file": s.source_file, "source_row": s.source_row}


def validate(signals: list[Signal], pack: Pack) -> tuple[list[Signal], list[HeldOut], list[Issue]]:
    """Check a merged signal list. Never raises: every doubt becomes a recorded issue."""
    markers = [m.lower() for m in pack.schema_.internal_cable_markers]
    kept: list[Signal] = []
    held: list[HeldOut] = []
    issues: list[Issue] = []

    for s in signals:
        probs: list[str] = []
        if not s.tag:
            probs.append("missing tag")
        if not s.io_type:
            probs.append("missing IO type")
        if not s.cable:
            probs.append("missing cable")
        else:
            s.internal_wiring = any(m in s.cable.lower() for m in markers)
            if s.pair is None and not s.internal_wiring:
                probs.append("missing or unreadable pair number")
        if s.pair is not None and s.cable_pairs is not None and s.pair > s.cable_pairs:
            probs.append(f"pair {s.pair} is beyond the {s.cable_pairs}-pair capacity of the cable")
        if probs:
            iss = [
                Issue(
                    code="TQ-DATA", severity="blocking", message=f"{p}; signal held out", **_loc(s)
                )
                for p in probs
            ]
            held.append(
                HeldOut(
                    source_file=s.source_file or "",
                    source_row=s.source_row or 0,
                    tag=s.tag,
                    issues=iss,
                    signal=s,
                )
            )
            issues.extend(iss)
        else:
            kept.append(s)

    by_tag: dict[str, list[Signal]] = defaultdict(list)
    by_cable: dict[str, list[Signal]] = defaultdict(list)
    for s in kept:
        if s.tag:
            by_tag[s.tag].append(s)
        if s.cable and not s.internal_wiring:
            by_cable[s.cable].append(s)

    for tag, group in sorted(by_tag.items()):
        places = {(g.cable, g.pair) for g in group}
        if len(group) > 1 and len(places) > 1:
            issues.append(
                Issue(
                    code="TQ-DATA",
                    severity="warning",
                    message=f"tag '{tag}' appears {len(group)} times with different cable/pair",
                    **_loc(group[1]),
                )
            )
    for cable, group in sorted(by_cable.items()):
        fams = sorted({g.segregation_family for g in group if g.segregation_family in ("A", "B")})
        if len(fams) > 1:
            issues.append(
                Issue(
                    code="TQ-SEG",
                    severity="warning",
                    message=f"cable '{cable}' carries both A and B segregation signals",
                    data={"cable": cable},
                    **_loc(group[0]),
                )
            )
    for s in kept:
        t, c = _LEAD.match(s.tag or ""), _LEAD.match(s.cable or "")
        if t and c and t.group(1) != c.group(1) and not s.internal_wiring:
            issues.append(
                Issue(
                    code="TQ-DATA",
                    severity="info",
                    message=f"tag '{s.tag}' and cable '{s.cable}' start with different area numbers",
                    **_loc(s),
                )
            )
    return kept, held, issues
