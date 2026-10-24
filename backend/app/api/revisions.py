"""The revision chain: set a baseline, run a revision, read the chain, compare, follow a signal."""

import tempfile
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, Request, UploadFile

from app.api.deps import project_of, run_of, service
from app.api.errors import ApiError, ErrorBody
from app.api.models import BaselineFromRun, BaselineOut, RevisionCreate, RunOut
from app.api.projects import _receive
from app.api.runs import _run_out
from app.api.service import Service
from app.core.revision.baseline import BaselineError
from app.core.revision.history import (
    ChainEntry,
    Comparison,
    CumulativeRow,
    HistoryEntry,
    HistoryError,
)
from app.core.revision.match import normalise_label

router = APIRouter(prefix="/api")
ERRORS = {"model": ErrorBody}


def _baseline_out(svc: Service, pid: str, run_id: str) -> BaselineOut:
    with svc.store.lock:
        chain = svc.store.chain(pid)
        b = chain.store.load_baseline(run_id)
    placed = sum(1 for p in b.allocation.placements if p.signal and p.kind == "field")
    return BaselineOut(label=b.label, chain_run_id=run_id, signals=len(b.signals), placed=placed)


def _no_baseline(svc: Service, pid: str) -> None:
    with svc.store.lock:
        empty = not svc.store.chain(pid).labels()
    if empty:
        raise ApiError(
            409, "no_baseline", "set a baseline first (POST /baseline or /baseline/upload)"
        )


@router.post("/projects/{pid}/baseline", status_code=201, response_model=BaselineOut,
             responses={404: ERRORS, 409: ERRORS})  # fmt: skip
def baseline_from_run(pid: str, body: BaselineFromRun, request: Request,
                      svc: Service = Depends(service)):  # fmt: skip
    """Make a finished run of this project the first issue of its revision chain."""
    project = project_of(request, pid)
    run = run_of(request, pid, body.run_id)
    if run["status"] != "finished":
        raise ApiError(409, "run_not_finished", f"the run is {run['status']}")
    if "revision" in run["data"]:
        raise ApiError(409, "not_an_initial_run", "pick an initial run, not a revision run")
    try:
        run_id = svc.baseline_from_run(project, run, body.label)
    except HistoryError as e:
        raise ApiError(409, "baseline_exists", str(e)) from e
    return _baseline_out(svc, pid, run_id)


@router.post("/projects/{pid}/baseline/upload", status_code=201, response_model=BaselineOut,
             responses={404: ERRORS, 409: ERRORS, 413: ERRORS, 415: ERRORS, 422: ERRORS})  # fmt: skip
async def baseline_from_issued(
    pid: str, request: Request, file: UploadFile = File(...), label: str = Query("00"),
    svc: Service = Depends(service),
):  # fmt: skip
    """Make an issued allocation workbook the first issue of the revision chain."""
    project = project_of(request, pid)
    with tempfile.TemporaryDirectory(dir=svc.store.output_dir(pid)) as d:
        path = Path(d) / "issued.xlsx"
        await _receive(file, path, svc.settings.max_upload_bytes)
        try:
            run_id = svc.baseline_from_issued(project, path, label)
        except BaselineError as e:
            raise ApiError(422, "not_an_allocation", str(e)) from e
        except HistoryError as e:
            raise ApiError(409, "baseline_exists", str(e)) from e
    return _baseline_out(svc, pid, run_id)


@router.post("/projects/{pid}/revisions", status_code=201, response_model=RunOut,
             responses={404: ERRORS, 409: ERRORS})  # fmt: skip
def start_revision(pid: str, request: Request, tasks: BackgroundTasks,
                   body: RevisionCreate | None = None, svc: Service = Depends(service)):  # fmt: skip
    """Allocate the project's current uploads as the next revision of the chain.

    The answer is a run like any other: poll or stream it, then read its impact at
    /runs/{id}/impact. The chain gains the revision when the run finishes.
    """
    project = project_of(request, pid)
    if not svc.store.uploads(pid):
        raise ApiError(409, "no_uploads", "upload the revised MDB workbook before starting")
    _no_baseline(svc, pid)
    params = (body or RevisionCreate()).model_dump()
    label = normalise_label(params["label"]) if params["label"] else svc.next_label(pid)
    with svc.store.lock:
        taken = label in svc.store.chain(pid).labels()
    if taken:
        raise ApiError(409, "revision_exists", f"revision '{label}' is already in the chain")
    params["label"] = label
    rid = svc.begin(project, {**params, "revision": True})
    tasks.add_task(svc.execute_revision, project, rid, params)
    return _run_out(svc.store.run(pid, rid))  # type: ignore[arg-type]


@router.get("/projects/{pid}/revisions", response_model=list[ChainEntry],
            responses={404: ERRORS})  # fmt: skip
def revisions(pid: str, request: Request, svc: Service = Depends(service)):
    """The chain, oldest first: label, parent, run and impact of every issue."""
    project_of(request, pid)
    with svc.store.lock:
        return svc.store.chain(pid).summary()


@router.get("/projects/{pid}/revisions/compare", response_model=Comparison,
            responses={404: ERRORS})  # fmt: skip
def compare(pid: str, request: Request, a: str = Query(alias="from"), b: str = Query(alias="to"),
            svc: Service = Depends(service)):  # fmt: skip
    """What differs between two issues (`from` is the older side)."""
    project_of(request, pid)
    try:
        with svc.store.lock:
            return svc.store.chain(pid).compare(a, b)
    except HistoryError as e:
        raise ApiError(404, "unknown_revision", str(e)) from e


@router.get("/projects/{pid}/revisions/cumulative", response_model=list[CumulativeRow],
            responses={404: ERRORS})  # fmt: skip
def cumulative(pid: str, request: Request, svc: Service = Depends(service)):
    """The current slot of every signal, with when it last changed and how often."""
    project_of(request, pid)
    with svc.store.lock:
        return svc.store.chain(pid).cumulative()


@router.get("/projects/{pid}/revisions/{label}", response_model=ChainEntry,
            responses={404: ERRORS})  # fmt: skip
def revision(pid: str, label: str, request: Request, svc: Service = Depends(service)):
    project_of(request, pid)
    want = normalise_label(label)
    with svc.store.lock:
        entries = svc.store.chain(pid).summary()
    for e in entries:
        if e.label == want:
            return e
    have = ", ".join(e.label for e in entries) or "none recorded"
    raise ApiError(404, "unknown_revision", f"unknown revision '{label}'; recorded: {have}")


@router.get("/projects/{pid}/signals/history", response_model=list[HistoryEntry],
            responses={404: ERRORS})  # fmt: skip
def signal_history(pid: str, request: Request, tag: str = Query(min_length=1),
                   svc: Service = Depends(service)):  # fmt: skip
    """Every recorded change of one tag, oldest first (a rename is followed)."""
    project_of(request, pid)
    with svc.store.lock:
        return svc.store.chain(pid).signal_history(tag)
