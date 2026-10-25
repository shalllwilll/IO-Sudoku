"""Organised reports: allocation and technical queries per run, and a revision comparison.

Each is a structured document the web app prints; `?format=xlsx` returns the same content as a
workbook.
"""

from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, Response

from app.api.deps import project_of, run_of, service
from app.api.errors import ApiError, ErrorBody
from app.api.runs import XLSX, _finished
from app.api.service import Service
from app.core.model.allocation import Allocation
from app.core.reports.documents import ReportDoc, allocation_report, revision_report, tq_report
from app.core.reports.xlsx import to_xlsx
from app.core.revision.history import HistoryError
from app.core.tq.triage import triage

router = APIRouter(prefix="/api")
ERRORS = {"model": ErrorBody}
Format = Literal["json", "xlsx"]


def _deliver(doc: ReportDoc, fmt: Format, name: str):
    if fmt == "xlsx":
        return Response(to_xlsx(doc), media_type=XLSX, headers={"Content-Disposition": f'attachment; filename="{name}.xlsx"'})
    return doc


@router.get("/projects/{pid}/runs/{rid}/reports/{kind}", response_model=ReportDoc,
            responses={200: {"content": {XLSX: {}}}, 404: ERRORS, 409: ERRORS})  # fmt: skip
def run_report(pid: str, rid: str, kind: Literal["allocation", "tq"], request: Request,
               format: Format = "json", svc: Service = Depends(service)):  # fmt: skip
    project = project_of(request, pid)
    r = _finished(run_of(request, pid, rid))
    data = r["data"]
    if kind == "allocation":
        alloc = Allocation.model_validate(data["allocation"])
        doc = allocation_report(project["name"], r, alloc, data["report"], data["rows"])
    else:
        store = svc.store.tq_store(pid)
        tqs = [t for i in data["tq_ids"] if (t := store.get(i)) is not None]
        answers = {t.id: store.history(t.id) for t in tqs}
        doc = tq_report(project["name"], r, tqs, triage(tqs, svc.pack), answers)
    return _deliver(doc, format, f"{kind}_report_{rid[:8]}")


@router.get("/projects/{pid}/revisions/report", response_model=ReportDoc,
            responses={200: {"content": {XLSX: {}}}, 404: ERRORS})  # fmt: skip
def revision_doc(pid: str, request: Request, a: str = Query(alias="from"), b: str = Query(alias="to"),
                 format: Format = "json", svc: Service = Depends(service)):  # fmt: skip
    project = project_of(request, pid)
    try:
        with svc.store.lock:
            chain = svc.store.chain(pid)
            cmp = chain.compare(a, b)
            entries = {e.label: e for e in chain.summary()}
    except HistoryError as e:
        raise ApiError(404, "unknown_revision", str(e)) from e
    entry = entries.get(cmp.to_label)
    doc = revision_report(project["name"], cmp.from_label, cmp.to_label, cmp, entry.impact if entry else None)
    return _deliver(doc, format, f"revision_report_{cmp.from_label}_{cmp.to_label}")
