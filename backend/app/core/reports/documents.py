"""Printable report documents: one generic shape, three builders.

A document is cover metadata plus sections of text, headline figures and tables, so the same
data renders as a printable page and exports as a workbook without a second layout per report.
"""

from collections import Counter, defaultdict

from pydantic import BaseModel, Field

from app.core.model.allocation import Allocation
from app.core.revision.history import Comparison
from app.core.revision.impact import Impact
from app.core.tq.answers import Answer
from app.core.tq.model import TQ
from app.core.tq.triage import TqGroup

Cell = str | int | float | None


class Fig(BaseModel):
    label: str
    value: str
    hint: str = ""


class Table(BaseModel):
    title: str = ""
    columns: list[str]
    rows: list[list[Cell]]


class Section(BaseModel):
    heading: str
    text: list[str] = Field(default_factory=list)
    figures: list[Fig] = Field(default_factory=list)
    tables: list[Table] = Field(default_factory=list)


class ReportDoc(BaseModel):
    kind: str  # allocation | tq | revision
    title: str
    subtitle: str = ""
    meta: list[list[str]] = Field(default_factory=list)
    sections: list[Section] = Field(default_factory=list)


def _pct(x: float, digits: int = 1) -> str:
    return f"{x * 100:.{digits}f}%"


def allocation_report(project: str, run: dict, alloc: Allocation, report: dict, rows: list[dict]) -> ReportDoc:
    kpi, rules, decl = report["kpi"], report["rules"], report["declaration"]
    failing = [r for r in rules if r["enforced"] and not r["passed"]]
    cioc_info = {c.no: c for c in alloc.layout.ciocs}
    per: dict[int, Counter] = defaultdict(Counter)
    for p in alloc.placements:
        per[p.cioc_no][p.kind] += 1
    cioc_rows: list[list[Cell]] = []
    for no in sorted(cioc_info):
        c, k = cioc_info[no], per[no]
        used = k["field"] + k["wired_spare"] + k["cabinet_alarm"]
        total = len(c.baseplates) * 12
        cioc_rows.append([f"Cabinet {c.cabinet}", f"CIOC {no} ({c.name})", k["field"], k["wired_spare"],
                          k["spare_slot"], k["cabinet_alarm"], f"{used}/{total}",
                          _pct(used / total, 0) if total else "-"])  # fmt: skip
    by_pos = {(r.get("cioccslsname"), r.get("baseplate"), r.get("channelno")): r for r in rows}
    sig_rows: list[list[Cell]] = []
    for p in sorted(alloc.placements, key=lambda p: (p.cioc_no, p.baseplate, p.channel)):
        if not p.signal:
            continue
        c = cioc_info.get(p.cioc_no)
        bp = next((b for b in c.baseplates if b.n == p.baseplate), None) if c else None
        r = by_pos.get((c.name if c else None, bp.name if bp else None, p.channel), {})
        s = p.signal
        sig_rows.append([s.tag, s.cable, s.pair, p.io_type or s.io_type, r.get("charmtype"),
                         r.get("charmtbpartno"), f"Cabinet {c.cabinet}" if c else "", c.name if c else "",
                         bp.name if bp else p.baseplate, p.channel])  # fmt: skip
    held = [[u.signal.tag, u.signal.cable, u.signal.io_type, "; ".join(str(getattr(i, "message", i)) for i in u.issues)] for u in alloc.unplaced]  # fmt: skip
    io_rows = [[t, v.get("field", 0), v.get("wired_spare", 0)] for t, v in sorted(kpi["by_io_type"].items())]
    sections = [
        Section(
            heading="Summary",
            text=[f"{kpi['allocated']} of {kpi['signals_total']} signals are placed."
                  + (f" {kpi['held_out']} are held out and listed below with the reason." if kpi["held_out"] else "")],
            figures=[
                Fig(label="Placed", value=f"{kpi['allocated']} / {kpi['signals_total']}", hint=f"{kpi['held_out']} held out"),
                Fig(label="Utilisation", value=_pct(kpi["utilisation"]), hint=f"{kpi['occupied']} of {kpi['positions']} positions"),
                Fig(label="Hardware", value=f"{kpi['cabinets']} cabinets, {kpi['ciocs']} CIOCs", hint=f"{kpi['baseplates_used']} of {kpi['baseplates']} baseplates used"),
                Fig(label="Rule check", value="Pass" if not failing else f"{len(failing)} failing", hint=f"{sum(r['passed'] for r in rules)} of {len(rules)} rules hold"),
            ],
        ),
        Section(heading="Allocation by cabinet and CIOC", tables=[Table(columns=["Cabinet", "CIOC", "Field signals", "Wired spares", "Spare slots", "Alarms", "Used", "Fill"], rows=cioc_rows)]),
        Section(heading="Allocation by IO type", tables=[Table(columns=["IO type", "Field signals", "Wired spares"], rows=io_rows)]),
        Section(heading="Signal allocation", tables=[Table(columns=["Tag", "Cable", "Pair", "IO type", "CHARM type", "Terminal block", "Cabinet", "CIOC", "Baseplate", "Channel"], rows=sig_rows)]),
    ]
    if held:
        sections.append(Section(heading="Held out signals", text=["These signals have no position yet. Resolve their technical queries and run again."], tables=[Table(columns=["Tag", "Cable", "IO type", "Issue"], rows=held)]))
    sections.append(Section(heading="Rule check", tables=[Table(columns=["Rule", "Description", "Strength", "Result", "Violations"], rows=[[r["rule"], r["description"], r["strength"], "Pass" if r["passed"] else "Fail" if r["enforced"] else "Not enforced", r["violations"]] for r in rules])]))
    notes = [("Assumed", decl.get("assumed", [])), ("Defaulted", decl.get("defaulted", [])), ("Not enforced", decl.get("not_enforced", []))]
    sections.append(Section(heading="Declared assumptions", text=[f"{k}: {v}" for k, vs in notes for v in vs] or ["None declared."]))
    return ReportDoc(
        kind="allocation", title="IO allocation report", subtitle=project,
        meta=[["Project", project], ["Run", run["id"]], ["Date", str(run.get("finished_at") or run.get("created_at") or "")],
              ["Solver", alloc.solver], ["Rule set", str(decl.get("rule_set", ""))]],
        sections=sections,
    )  # fmt: skip


def tq_report(project: str, run: dict, tqs: list[TQ], groups: list[TqGroup], answers: dict[str, list[Answer]]) -> ReportDoc:
    by_id = {t.id: t for t in tqs}
    status = Counter(t.status for t in tqs)
    prio = Counter(g.priority for g in groups)
    sections = [
        Section(
            heading="Summary",
            text=[f"{len(tqs)} technical queries were raised, grouped into {len(groups)} causes. {status['open']} are open and {len(tqs) - status['open']} are answered."],
            figures=[
                Fig(label="Queries", value=str(len(tqs)), hint=f"{len(groups)} causes"),
                Fig(label="Open", value=str(status["open"]), hint="need a decision"),
                Fig(label="Answered", value=str(len(tqs) - status["open"])),
                Fig(label="Urgent (P1)", value=str(prio["P1"]), hint="stop signals being placed"),
            ],
        ),
    ]
    for g in groups:
        recommended = f"Recommended: {g.recommended.option}. {g.recommended.reason}" if g.recommended else "No safe automatic answer. Choose one."
        done = [a for tid in g.tq_ids for a in answers.get(tid, [])]
        sections.append(
            Section(
                heading=f"{g.priority}  {g.title}",
                text=[g.why, f"{g.signals} signals, {len(g.tq_ids)} queries, {len(g.open_ids)} open. {recommended}"],
                tables=[
                    Table(title="Options", columns=["Option", "What it does", "Changes the allocation"], rows=[[o.label, o.consequence, "Yes" if o.changes_allocation else "No, records a decision"] for o in g.options]),
                    *([Table(title="Answers given", columns=["Query", "Answer", "Scope", "By", "When", "Effect"], rows=[[a.tq_id, a.option + (f" ({a.value})" if a.value else ""), a.scope, a.author, a.at, a.effect] for a in done])] if done else []),
                    Table(title="Queries", columns=["ID", "Status", "Severity", "Subject", "Message"], rows=[[i, by_id[i].status, by_id[i].severity, by_id[i].subject, by_id[i].message] for i in g.tq_ids if i in by_id]),
                ],
            )
        )
    return ReportDoc(
        kind="tq", title="Technical query report", subtitle=project,
        meta=[["Project", project], ["Run", run["id"]], ["Date", str(run.get("finished_at") or run.get("created_at") or "")]],
        sections=sections,
    )  # fmt: skip


def revision_report(project: str, a: str, b: str, cmp: Comparison, impact: Impact | None) -> ReportDoc:
    total = cmp.added + cmp.removed + cmp.modified + cmp.moved + cmp.unchanged
    kept = (cmp.unchanged / (cmp.unchanged + cmp.moved)) if (cmp.unchanged + cmp.moved) else 1.0
    figs = [Fig(label="Added", value=str(cmp.added)), Fig(label="Removed", value=str(cmp.removed)), Fig(label="Modified", value=str(cmp.modified)),
            Fig(label="Moved", value=str(cmp.moved), hint=f"{_pct(kept, 0)} of existing signals kept their place"), Fig(label="Unchanged", value=str(cmp.unchanged))]  # fmt: skip
    sections = [Section(heading="Summary", text=[f"Revision {b} compared with revision {a}: {total} signals considered, {cmp.moved} moved."], figures=figs)]
    if impact:
        rows = [["Cabinets used", impact.cabinets_used_before, impact.cabinets_used_after], ["CIOCs used", impact.ciocs_used_before, impact.ciocs_used_after],
                ["Spare slots", impact.spare_slots_before, impact.spare_slots_after], ["Wired spares", impact.wired_spares_before, impact.wired_spares_after]]  # fmt: skip
        sections.append(Section(heading="Hardware impact", text=[f"{impact.unplaced_after} signals unplaced after the revision. {impact.tq_rev} technical queries raised by it."], tables=[Table(columns=["Measure", f"Rev {a}", f"Rev {b}"], rows=rows)]))
        if impact.moves_by_reason:
            sections.append(Section(heading="Why signals moved", tables=[Table(columns=["Reason", "Signals"], rows=[[k, v] for k, v in sorted(impact.moves_by_reason.items(), key=lambda kv: -kv[1])])]))
    for kind, title in (("moved", "Moved signals"), ("added", "Added signals"), ("removed", "Removed signals"), ("modified", "Modified signals")):
        rows = [[d.tag, d.cable, d.pair, d.old_slot, d.new_slot, ", ".join(d.fields)] for d in cmp.deltas if d.kind == kind]
        if rows:
            sections.append(Section(heading=title, tables=[Table(columns=["Tag", "Cable", "Pair", f"Slot in {a}", f"Slot in {b}", "Fields changed"], rows=rows)]))
    return ReportDoc(kind="revision", title=f"Revision report: {a} to {b}", subtitle=project, meta=[["Project", project], ["From", a], ["To", b]], sections=sections)  # fmt: skip
