"""Runs and everything read from them, plus TQs and their answers."""

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.responses import FileResponse

from app.api.deps import project_of, run_of, service
from app.api.errors import ApiError, ErrorBody, not_found
from app.api.models import (
    AllocationOut,
    AnswerIn,
    AnswerOut,
    GroupsOut,
    ImpactOut,
    LayoutOut,
    ReportOut,
    RunCreate,
    RunOut,
)
from app.api.service import Service
from app.core.ai.features import TqWording, explain_tq
from app.core.model.allocation import Allocation
from app.core.tq.answers import AnswerError
from app.core.tq.model import TQ

router = APIRouter(prefix="/api")
ERRORS = {"model": ErrorBody}
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _run_out(r: dict) -> RunOut:
    return RunOut(
        id=r["id"], project_id=r["project_id"], status=r["status"], created_at=r["created_at"],
        finished_at=r["finished_at"], error=r["error"], summary=r["summary"],
        download_ready=bool(r["output_name"]),
    )  # fmt: skip


def _finished(r: dict) -> dict:
    if r["status"] != "finished":
        raise ApiError(
            409, "run_not_finished", f"the run is {r['status']}", {"status": r["status"]}
        )
    return r


@router.post("/projects/{pid}/runs", status_code=201, response_model=RunOut,
             responses={404: ERRORS, 409: ERRORS})  # fmt: skip
def start_run(
    pid: str,
    request: Request,
    tasks: BackgroundTasks,
    body: RunCreate | None = None,
    svc: Service = Depends(service),
):
    project = project_of(request, pid)
    if not svc.store.uploads(pid):
        raise ApiError(409, "no_uploads", "upload at least one MDB workbook before starting a run")
    params = (body or RunCreate()).model_dump()
    rid = svc.begin(project, params)
    tasks.add_task(svc.execute, project, rid, params)  # the response does not wait for the run
    return _run_out(svc.store.run(pid, rid))  # type: ignore[arg-type]


@router.get("/projects/{pid}/runs", response_model=list[RunOut], responses={404: ERRORS})
def list_runs(pid: str, request: Request, svc: Service = Depends(service)):
    project_of(request, pid)
    return [_run_out(r) for r in svc.store.runs(pid)]


@router.get("/projects/{pid}/runs/{rid}", response_model=RunOut, responses={404: ERRORS})
def get_run(pid: str, rid: str, request: Request):
    return _run_out(run_of(request, pid, rid))


@router.get("/projects/{pid}/runs/{rid}/allocation", response_model=AllocationOut,
            responses={404: ERRORS, 409: ERRORS})  # fmt: skip
def allocation(pid: str, rid: str, request: Request):
    r = _finished(run_of(request, pid, rid))
    alloc = Allocation.model_validate(r["data"]["allocation"])
    return AllocationOut(
        run_id=rid, solver=alloc.solver, utilisation=alloc.utilisation(),
        placements=alloc.placements, unplaced=alloc.unplaced, issues=alloc.issues,
        rows=r["data"]["rows"],
    )  # fmt: skip


@router.get("/projects/{pid}/runs/{rid}/layout", response_model=LayoutOut,
            responses={404: ERRORS, 409: ERRORS})  # fmt: skip
def layout(pid: str, rid: str, request: Request):
    r = _finished(run_of(request, pid, rid))
    a = r["data"]["allocation"]
    return LayoutOut(run_id=rid, layout=a["layout"], cioc_labels=a["cioc_labels"])


@router.get("/projects/{pid}/runs/{rid}/groups", response_model=GroupsOut,
            responses={404: ERRORS, 409: ERRORS})  # fmt: skip
def groups(pid: str, rid: str, request: Request):
    r = _finished(run_of(request, pid, rid))
    return GroupsOut(run_id=rid, groups=r["data"]["groups"])


@router.get("/projects/{pid}/runs/{rid}/report", response_model=ReportOut,
            responses={404: ERRORS, 409: ERRORS})  # fmt: skip
def report(pid: str, rid: str, request: Request):
    r = _finished(run_of(request, pid, rid))
    return ReportOut(run_id=rid, report=r["data"]["report"])


@router.get("/projects/{pid}/runs/{rid}/impact", response_model=ImpactOut,
            responses={404: ERRORS, 409: ERRORS})  # fmt: skip
def impact(pid: str, rid: str, request: Request):
    _finished(run_of(request, pid, rid))
    return ImpactOut(
        run_id=rid, available=False,
        reason="this is an initial allocation; revision impact appears on revision runs",
    )  # fmt: skip


@router.get("/projects/{pid}/runs/{rid}/tqs", response_model=list[TQ],
            responses={404: ERRORS, 409: ERRORS})  # fmt: skip
def run_tqs(pid: str, rid: str, request: Request, svc: Service = Depends(service)):
    r = _finished(run_of(request, pid, rid))
    store = svc.store.tq_store(pid)
    got = [t for i in r["data"]["tq_ids"] if (t := store.get(i)) is not None]
    return sorted(got, key=lambda t: (t.category, t.code, t.id))


@router.get("/projects/{pid}/runs/{rid}/download", responses={404: ERRORS, 409: ERRORS},
            response_class=FileResponse)  # fmt: skip
def download(pid: str, rid: str, request: Request, svc: Service = Depends(service)):
    r = _finished(run_of(request, pid, rid))
    if not r["output_name"]:
        raise ApiError(
            409, "output_unavailable", r["summary"].get("output_error") or "no workbook was written"
        )
    path = svc.store.output_dir(pid) / r["output_name"]
    if not path.is_file():
        raise not_found("workbook")
    return FileResponse(path, media_type=XLSX, filename=f"io_allocation_{rid}.xlsx")


# -- TQs -----------------------------------------------------------------------------------


@router.get("/projects/{pid}/tqs", response_model=list[TQ], responses={404: ERRORS})
def project_tqs(pid: str, request: Request, svc: Service = Depends(service),
                status: str | None = None, code: str | None = None):  # fmt: skip
    project_of(request, pid)
    return [
        t for t in svc.store.tq_store(pid).all()
        if (status is None or t.status == status) and (code is None or t.code == code)
    ]  # fmt: skip


@router.post("/projects/{pid}/tqs/{tid}/answer", response_model=AnswerOut,
             responses={404: ERRORS, 422: ERRORS})  # fmt: skip
def answer(pid: str, tid: str, body: AnswerIn, request: Request, svc: Service = Depends(service)):
    project_of(request, pid)
    store = svc.store.tq_store(pid)
    if store.get(tid) is None:
        raise not_found("TQ")
    if body.scope not in ("row", "cable", "everywhere"):
        raise ApiError(422, "invalid_answer", f"unknown scope '{body.scope}'")
    try:
        with svc.store.lock:
            a = store.answer(
                tid, body.option, pack=svc.pack, value=body.value, fields=body.fields,
                scope=body.scope, target=body.target, author=body.author,  # type: ignore[arg-type]
            )  # fmt: skip
    except AnswerError as e:
        raise ApiError(422, "invalid_answer", str(e)) from e
    return AnswerOut(answer=a, tq=store.get(tid), history=store.history(tid))  # type: ignore[arg-type]


@router.get("/projects/{pid}/tqs/{tid}/explain", response_model=TqWording, responses={404: ERRORS})
def explain(pid: str, tid: str, request: Request, svc: Service = Depends(service)):
    """Plain-language wording of a TQ; the template text when AI is off."""
    project_of(request, pid)
    tq = svc.store.tq_store(pid).get(tid)
    if tq is None:
        raise not_found("TQ")
    return explain_tq(svc.gateway, tq)
