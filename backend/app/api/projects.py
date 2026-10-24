"""Projects, uploads, mapping, value maps and rules."""

import hashlib
import re

from fastapi import APIRouter, Depends, File, Request, UploadFile
from pydantic import BaseModel

from app.api.deps import project_of, run_of, service
from app.api.errors import ApiError, ErrorBody, not_found
from app.api.models import (
    CompileIn,
    ConfirmRuleIn,
    IntentIn,
    LintIn,
    LintOut,
    MappingIn,
    MappingOut,
    MappingSheet,
    ProjectCreate,
    ProjectOut,
    ProjectUpdate,
    RulesIn,
    RulesOut,
    SheetInfo,
    UnknownValueOut,
    UploadOut,
    ValueMaps,
    ValuesOut,
)
from app.api.service import Service
from app.api.store import new_id
from app.core.ai.features import RulePreview, classify_value, compile_rule, mapping_hint
from app.core.ai.intent import IntentPreview, propose_intent
from app.core.ingest.reader import ReaderError, read_workbook
from app.core.layout.blocks import build_blocks
from app.core.model.allocation import Allocation
from app.core.revision.baseline import BaselineError, baseline_from_workbook
from app.core.rules.dryrun import dry_run
from app.core.rules.lint import lint
from app.core.rules.miner import MineResult, mine
from app.core.rules.schema import RuleSetError, load_rules

router = APIRouter(prefix="/api")
ERRORS = {"model": ErrorBody}
CHUNK = 1024 * 1024
XLSX_MAGIC = b"PK\x03\x04"


def _out(svc: Service, p: dict) -> ProjectOut:
    s = p["settings"]
    return ProjectOut(
        id=p["id"], name=p["name"], created_at=p["created_at"], area=s.get("area"),
        unit=s.get("unit"), preset=s.get("preset") or svc.pack.rules.default_preset,
        uploads=len(svc.store.uploads(p["id"])), runs=len(svc.store.runs(p["id"])),
    )  # fmt: skip


def _check_preset(svc: Service, preset: str | None) -> None:
    if preset is not None and preset not in svc.pack.rules.presets:
        raise ApiError(
            422, "unknown_preset", f"unknown rule preset '{preset}'",
            {"presets": sorted(svc.pack.rules.presets)},
        )  # fmt: skip


# -- projects ------------------------------------------------------------------------------


@router.post("/projects", status_code=201, response_model=ProjectOut)
def create_project(body: ProjectCreate, svc: Service = Depends(service)):
    _check_preset(svc, body.preset)
    p = svc.store.create_project(
        body.name.strip(), {"area": body.area, "unit": body.unit, "preset": body.preset}
    )
    return _out(svc, p)


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(svc: Service = Depends(service)):
    return [_out(svc, p) for p in svc.store.projects()]


@router.get("/projects/{pid}", response_model=ProjectOut, responses={404: ERRORS})
def get_project(pid: str, request: Request, svc: Service = Depends(service)):
    return _out(svc, project_of(request, pid))


@router.patch("/projects/{pid}", response_model=ProjectOut, responses={404: ERRORS})
def update_project(
    pid: str, body: ProjectUpdate, request: Request, svc: Service = Depends(service)
):
    project_of(request, pid)
    _check_preset(svc, body.preset)
    sent = body.model_dump(exclude_unset=True)
    if "name" in sent and body.name:
        svc.store.rename_project(pid, body.name.strip())
    settings = {k: v for k, v in sent.items() if k in ("area", "unit", "preset")}
    if settings:
        svc.store.update_settings(pid, **settings)
    return _out(svc, svc.store.project(pid))  # type: ignore[arg-type]


# -- uploads -------------------------------------------------------------------------------


def _label(name: str | None, taken: set[str]) -> str:
    """Only ever a display name: the file itself is stored under a generated name."""
    base = re.split(r"[\\/]", name or "upload.xlsx")[-1]
    base = re.sub(r"[\x00-\x1f\x7f]", "", base).strip()[:120] or "upload.xlsx"
    label, n = base, 2
    while label in taken:
        stem, dot, ext = base.rpartition(".")
        label = f"{stem} ({n}).{ext}" if dot else f"{base} ({n})"
        n += 1
    return label


async def _receive(file: UploadFile, path, limit: int):
    """Stream an upload to `path` with every safety check; the file is removed on any failure."""
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise ApiError(415, "unsupported_media_type", "only .xlsx workbooks are accepted")
    sha, size, head = hashlib.sha256(), 0, b""
    try:
        with path.open("wb") as fh:
            while chunk := await file.read(CHUNK):
                if not head:
                    head = chunk[:4]
                size += len(chunk)
                if size > limit:
                    raise ApiError(
                        413,
                        "file_too_large",
                        f"the file is larger than {limit // (1024 * 1024)} MB",
                    )
                sha.update(chunk)
                fh.write(chunk)
        if size == 0:
            raise ApiError(400, "empty_file", "the uploaded file is empty")
        if head != XLSX_MAGIC:
            raise ApiError(415, "not_xlsx", "the file is not an Excel .xlsx workbook")
        try:
            results = read_workbook(path)
        except ReaderError as e:
            raise ApiError(400, "unreadable_workbook", str(e)) from e
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    return size, sha.hexdigest(), results


@router.post(
    "/projects/{pid}/uploads", status_code=201, response_model=UploadOut,
    responses={400: ERRORS, 404: ERRORS, 413: ERRORS, 415: ERRORS},
)  # fmt: skip
async def upload(pid: str, request: Request, file: UploadFile = File(...)):
    svc: Service = request.app.state.service
    project_of(request, pid)
    seq = svc.store.next_seq(pid)
    stored = f"u{seq:04d}_{hashlib.sha256(f'{pid}{seq}{file.filename}'.encode()).hexdigest()[:10]}"
    path = svc.store.upload_dir(pid) / f"{stored}.xlsx"
    size, sha, results = await _receive(file, path, svc.settings.max_upload_bytes)
    label = _label(file.filename, {u["name"] for u in svc.store.uploads(pid)})
    sheets = [
        SheetInfo(
            sheet=r.summary.sheet, rows=r.summary.rows, header_row=r.summary.header_row,
            columns=r.summary.columns, deleted=r.summary.deleted,
            out_of_scope=r.summary.out_of_scope,
        ).model_dump()
        for r in results
    ]  # fmt: skip
    up = svc.store.add_upload(pid, label, path.name, size, sha, sheets)
    return UploadOut(**{k: up[k] for k in ("id", "name", "size", "sha256", "created_at", "sheets")})


@router.get("/projects/{pid}/uploads", response_model=list[UploadOut], responses={404: ERRORS})
def list_uploads(pid: str, request: Request, svc: Service = Depends(service)):
    project_of(request, pid)
    return [
        UploadOut(**{k: u[k] for k in ("id", "name", "size", "sha256", "created_at", "sheets")})
        for u in svc.store.uploads(pid)
    ]


@router.delete(
    "/projects/{pid}/uploads/{uid}", status_code=204, responses={404: ERRORS}
)  # fmt: skip
def delete_upload(pid: str, uid: str, request: Request, svc: Service = Depends(service)):
    """Remove an upload from the project (finished runs keep their results)."""
    project_of(request, pid)
    stored = svc.store.remove_upload(pid, uid)
    if stored is None:
        raise not_found("upload")
    (svc.store.upload_dir(pid) / stored).unlink(missing_ok=True)


# -- mapping -------------------------------------------------------------------------------


def _mapping(svc: Service, project: dict) -> MappingOut:
    reads, maps, _ = svc.preview(project)
    sheets = [
        MappingSheet(
            file=r.summary.source_file, sheet=r.summary.sheet, columns=r.summary.columns,
            matches=maps[k].matches, grouping_mode=maps[k].grouping_mode,
            issues=[i.model_copy(update={"source_file": r.summary.source_file}) for i in maps[k].issues],
        )
        for r in reads
        if (k := f"{r.summary.source_file}:{r.summary.sheet}") in maps
    ]  # fmt: skip
    if svc.gateway.available:
        for sh, r in zip(
            sheets,
            [x for x in reads if f"{x.summary.source_file}:{x.summary.sheet}" in maps],
            strict=True,
        ):
            for i in sh.issues:
                opts = (i.data.get("options") or "").split("|")
                if i.code == "TQ-MAP" and len(opts) > 1:
                    cols = [(c, [row.values.get(c) for row in r.rows[:3]]) for c in opts]
                    hint = mapping_hint(svc.gateway, i.data["field"], cols)
                    if hint:
                        sh.ai_hints[i.data["field"]] = hint
    return MappingOut(
        sheets=sheets,
        fields=sorted(svc.pack.aliases.fields),
        required=sorted(svc.pack.schema_.required),
        confirmed=project["settings"].get("confirmed") or {},
    )


@router.get("/projects/{pid}/mapping", response_model=MappingOut, responses={404: ERRORS})
def get_mapping(pid: str, request: Request, svc: Service = Depends(service)):
    return _mapping(svc, project_of(request, pid))


@router.put(
    "/projects/{pid}/mapping", response_model=MappingOut, responses={404: ERRORS, 422: ERRORS}
)
def put_mapping(pid: str, body: MappingIn, request: Request, svc: Service = Depends(service)):
    project = project_of(request, pid)
    cols: dict[str, set[str]] = {}
    for u in svc.store.uploads(pid):
        cols[u["name"]] = {c for s in u["sheets"] for c in s["columns"]}
    for file, fields in body.confirmed.items():
        if file not in cols:
            raise ApiError(422, "invalid_mapping", f"no uploaded file named '{file}'")
        for field, col in fields.items():
            if field not in svc.pack.aliases.fields:
                raise ApiError(422, "invalid_mapping", f"unknown field '{field}'")
            if col not in cols[file]:
                raise ApiError(422, "invalid_mapping", f"'{file}' has no column '{col}'")
    project = svc.store.update_settings(pid, confirmed=body.confirmed)
    return _mapping(svc, project)


# -- value maps ----------------------------------------------------------------------------


def _allowed(svc: Service) -> dict[str, list[str]]:
    vm = svc.pack.valuemaps
    return {
        "io_type": sorted(set(vm.io_types.values())),
        "duty_class": sorted({*vm.duty_classes.values(), vm.default_duty_class}),
        "segregation": sorted({c.family for c in svc.pack.segregation.codes}),
    }


def _values(svc: Service, project: dict) -> ValuesOut:
    _, _, ss = svc.preview(project)
    ov = svc.overrides(project)
    allowed = _allowed(svc)
    cats = {
        "io_type": allowed["io_type"],
        "duty": allowed["duty_class"],
        "segregation": allowed["segregation"],
    }
    unknown = []
    for u in ss.unknown_values:
        ai = None
        if svc.gateway.available and u.field in cats:
            ai = classify_value(svc.gateway, u.field, u.value, cats[u.field])
        unknown.append(UnknownValueOut(**u.model_dump(), ai=ai))
    return ValuesOut(
        unknown=unknown,
        overrides=ValueMaps(
            io_types=ov.io_types, duty_classes=ov.duty_classes, segregation=ov.segregation
        ),
        allowed=_allowed(svc),
    )


@router.get("/projects/{pid}/values", response_model=ValuesOut, responses={404: ERRORS})
def get_values(pid: str, request: Request, svc: Service = Depends(service)):
    return _values(svc, project_of(request, pid))


@router.put(
    "/projects/{pid}/values", response_model=ValuesOut, responses={404: ERRORS, 422: ERRORS}
)
def put_values(pid: str, body: ValueMaps, request: Request, svc: Service = Depends(service)):
    project_of(request, pid)
    ok = _allowed(svc)
    maps = {
        "io_type": body.io_types,
        "duty_class": body.duty_classes,
        "segregation": body.segregation,
    }
    for field, mapping in maps.items():
        for canon in mapping.values():
            if canon not in ok[field]:
                raise ApiError(
                    422,
                    "invalid_value",
                    f"'{canon}' is not a known {field}",
                    {"allowed": ok[field]},
                )
    project = svc.store.update_settings(
        pid,
        overrides={
            "io_types": {k.upper(): v for k, v in body.io_types.items()},
            "duty_classes": {k.upper(): v for k, v in body.duty_classes.items()},
            "segregation": {k.upper(): v for k, v in body.segregation.items()},
        },
    )
    return _values(svc, project)


# -- rules ---------------------------------------------------------------------------------


@router.get("/projects/{pid}/rules", response_model=RulesOut, responses={404: ERRORS})
def get_rules(pid: str, request: Request, svc: Service = Depends(service)):
    p = project_of(request, pid)
    rs = svc.ruleset(p)
    return RulesOut(
        preset=rs.name if rs.name != "custom" else (p["settings"].get("preset") or svc.pack.rules.default_preset),
        presets=sorted(svc.pack.rules.presets), custom=rs.name == "custom",
        rules=[r.model_dump() for r in rs.rules],
    )  # fmt: skip


@router.put("/projects/{pid}/rules", response_model=RulesOut, responses={404: ERRORS, 422: ERRORS})
def put_rules(pid: str, body: RulesIn, request: Request, svc: Service = Depends(service)):
    project_of(request, pid)
    _check_preset(svc, body.preset)
    changes: dict = {"rules": None}
    if body.rules is not None:
        try:
            load_rules(body.rules)
        except (RuleSetError, ValueError) as e:
            raise ApiError(422, "invalid_rules", str(e)) from e
        changes["rules"] = body.rules
    if body.preset is not None:
        changes["preset"] = body.preset
    svc.store.update_settings(pid, **changes)
    return get_rules(pid, request, svc)


@router.post("/projects/{pid}/lint", response_model=LintOut, responses={404: ERRORS, 422: ERRORS})
def lint_rules(pid: str, body: LintIn, request: Request, svc: Service = Depends(service)):
    project = project_of(request, pid)
    try:
        rules = load_rules(body.rules) if body.rules is not None else svc.rules(project)
    except (RuleSetError, ValueError) as e:
        raise ApiError(422, "invalid_rules", str(e)) from e
    if not svc.store.uploads(pid):
        return LintOut(findings=lint(rules))
    _, _, ss = svc.preview(project)
    blocks = build_blocks(ss.signals, svc.pack)
    groups = {b.id: b.group for b in blocks.blocks if b.group}
    return LintOut(findings=lint(rules, ss.signals, groups), dry_run=dry_run(rules, blocks))


@router.post("/projects/{pid}/rules/compile", response_model=RulePreview, responses={404: ERRORS})
def compile_rules(pid: str, body: CompileIn, request: Request, svc: Service = Depends(service)):
    """Plain English to a rule. Returns a preview with lint and a dry-run count; nothing is applied."""
    project = project_of(request, pid)
    existing = {r.id for r in svc.rules(project)}
    signals = blocks = groups = None
    if svc.store.uploads(pid):
        _, _, ss = svc.preview(project)
        signals, blocks = ss.signals, build_blocks(ss.signals, svc.pack)
        groups = {b.id: b.group for b in blocks.blocks if b.group}
    return compile_rule(svc.gateway, body.request, existing, signals, blocks, groups)


@router.post("/projects/{pid}/intent", response_model=IntentPreview, responses={404: ERRORS})
def propose_project_intent(
    pid: str, body: IntentIn, request: Request, svc: Service = Depends(service)
):
    """Turn a natural-language request into a checked preview; it never applies a change."""
    project = project_of(request, pid)
    existing = {r.id for r in svc.rules(project)}
    signals = blocks = groups = None
    if svc.store.uploads(pid):
        _, _, ss = svc.preview(project)
        signals, blocks = ss.signals, build_blocks(ss.signals, svc.pack)
        groups = {b.id: b.group for b in blocks.blocks if b.group}
    return propose_intent(svc.gateway, body.request, existing, signals, blocks, groups)


@router.post(
    "/projects/{pid}/rules/compile/confirm",
    response_model=RulesOut,
    responses={404: ERRORS, 422: ERRORS},
)
def confirm_rule(pid: str, body: ConfirmRuleIn, request: Request, svc: Service = Depends(service)):
    """Add a previewed rule to the project's rule set. It is linted again first."""
    project = project_of(request, pid)
    current = [r.model_dump() for r in svc.rules(project)]
    try:
        merged = load_rules([*current, body.rule])
    except (RuleSetError, ValueError) as e:
        raise ApiError(422, "invalid_rules", str(e)) from e
    errors = [f for f in lint([merged[-1]]) if f.severity == "error"]
    if errors:
        raise ApiError(422, "invalid_rules", "; ".join(f.message for f in errors))
    svc.store.update_settings(pid, rules=[r.model_dump() for r in merged])
    return get_rules(pid, request, svc)


class MineIn(BaseModel):
    run_id: str


@router.post(
    "/projects/{pid}/rules/mine", response_model=MineResult, responses={404: ERRORS, 409: ERRORS}
)
def mine_run(pid: str, body: MineIn, request: Request):
    """Mine the rules an earlier run of this project obeys. Candidates are not applied."""
    svc: Service = request.app.state.service
    run = run_of(request, pid, body.run_id)
    if run["status"] != "finished":
        raise ApiError(409, "run_not_finished", f"the run is {run['status']}")
    return mine(Allocation.model_validate(run["data"]["allocation"]), svc.pack)


@router.post(
    "/projects/{pid}/rules/mine/upload",
    response_model=MineResult,
    responses={400: ERRORS, 404: ERRORS, 413: ERRORS, 415: ERRORS, 422: ERRORS},
)
async def mine_upload(pid: str, request: Request, file: UploadFile = File(...)):
    """Mine a reference allocation workbook. The file is read once and not kept."""
    svc: Service = request.app.state.service
    project_of(request, pid)
    path = svc.store.output_dir(pid) / f"ref_{new_id()}.xlsx"
    await _receive(file, path, svc.settings.max_upload_bytes)
    try:
        base = baseline_from_workbook(path, svc.pack)
    except BaselineError as e:
        raise ApiError(422, "not_an_allocation", str(e)) from e
    finally:
        path.unlink(missing_ok=True)
    return mine(base.allocation, svc.pack)
