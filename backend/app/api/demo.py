"""One-click sample project for demos: the supplied sample MDB, uploaded and allocated."""

import hashlib
import shutil
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Request
from pydantic import BaseModel

from app.api.errors import ApiError, ErrorBody
from app.api.models import SheetInfo
from app.api.service import Service
from app.core.ingest.reader import ReaderError, read_workbook

router = APIRouter(prefix="/api")
SAMPLE_NAME = "Sample plant"


class SampleOut(BaseModel):
    project_id: str
    run_id: str | None
    created: bool


def _sample_file(svc: Service) -> Path:
    d = svc.settings.data_dir
    if d and Path(d).is_dir():
        hits = sorted(
            p for p in Path(d).glob("*.xlsx")
            if "mdb" in p.name.lower() and "blank" not in p.name.lower()
        )  # fmt: skip
        if hits:
            return hits[0]
    raise ApiError(
        404, "sample_unavailable",
        "no sample MDB workbook was found; set SUDOKU_DATA_DIR to the folder that holds it",
    )  # fmt: skip


@router.post("/demo/sample", response_model=SampleOut, responses={404: {"model": ErrorBody}})
def load_sample(request: Request, tasks: BackgroundTasks):
    """Create (once) a project from the sample MDB and start its first run."""
    svc: Service = request.app.state.service
    for p in svc.store.projects():
        if p["name"] == SAMPLE_NAME:
            runs = svc.store.runs(p["id"])
            return SampleOut(project_id=p["id"], run_id=runs[-1]["id"] if runs else None, created=False)
    src = _sample_file(svc)
    project = svc.store.create_project(
        SAMPLE_NAME, {"area": "AR1", "unit": "100", "preset": svc.pack.rules.default_preset}
    )
    pid = project["id"]
    seq = svc.store.next_seq(pid)
    stored = f"u{seq:04d}_{hashlib.sha256(f'{pid}{seq}{src.name}'.encode()).hexdigest()[:10]}.xlsx"
    dest = svc.store.upload_dir(pid) / stored
    shutil.copyfile(src, dest)
    try:
        results = read_workbook(dest)
    except ReaderError as e:
        dest.unlink(missing_ok=True)
        raise ApiError(400, "unreadable_workbook", str(e)) from e
    sheets = [
        SheetInfo(
            sheet=r.summary.sheet, rows=r.summary.rows, header_row=r.summary.header_row,
            columns=r.summary.columns, deleted=r.summary.deleted,
            out_of_scope=r.summary.out_of_scope,
        ).model_dump()
        for r in results
    ]  # fmt: skip
    digest = hashlib.sha256(dest.read_bytes()).hexdigest()
    svc.store.add_upload(pid, src.name, dest.name, dest.stat().st_size, digest, sheets)
    rid = svc.begin(project, {})
    tasks.add_task(svc.execute, project, rid, {})
    return SampleOut(project_id=pid, run_id=rid, created=True)
