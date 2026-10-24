from fastapi import Request

from app.api.errors import not_found
from app.api.service import Service
from app.api.store import ApiStore


def service(request: Request) -> Service:
    return request.app.state.service


def store(request: Request) -> ApiStore:
    return request.app.state.service.store


def project_of(request: Request, pid: str) -> dict:
    p = store(request).project(pid)
    if p is None:
        raise not_found("project")
    return p


def run_of(request: Request, pid: str, rid: str) -> dict:
    project_of(request, pid)
    r = store(request).run(pid, rid)  # scoped by project: another project's run is a 404
    if r is None:
        raise not_found("run")
    return r
