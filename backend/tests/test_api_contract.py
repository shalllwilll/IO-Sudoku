import json
from pathlib import Path

from app.api import models
from scripts.export_openapi import OUT, build
from tests.api_helpers import make_client
from tests.test_api_flow import run_project

CONTRACT = [
    ("post", "/api/projects"), ("get", "/api/projects"), ("get", "/api/projects/{pid}"),
    ("patch", "/api/projects/{pid}"),
    ("post", "/api/projects/{pid}/uploads"), ("get", "/api/projects/{pid}/uploads"),
    ("get", "/api/projects/{pid}/mapping"), ("put", "/api/projects/{pid}/mapping"),
    ("get", "/api/projects/{pid}/values"), ("put", "/api/projects/{pid}/values"),
    ("get", "/api/projects/{pid}/rules"), ("put", "/api/projects/{pid}/rules"),
    ("post", "/api/projects/{pid}/lint"),
    ("post", "/api/projects/{pid}/rules/compile"), ("post", "/api/projects/{pid}/rules/mine"),
    ("post", "/api/projects/{pid}/runs"), ("get", "/api/projects/{pid}/runs"),
    ("get", "/api/projects/{pid}/runs/{rid}"),
    ("get", "/api/projects/{pid}/runs/{rid}/layout"),
    ("get", "/api/projects/{pid}/runs/{rid}/allocation"),
    ("get", "/api/projects/{pid}/runs/{rid}/report"),
    ("get", "/api/projects/{pid}/runs/{rid}/impact"),
    ("get", "/api/projects/{pid}/runs/{rid}/groups"),
    ("get", "/api/projects/{pid}/runs/{rid}/tqs"),
    ("get", "/api/projects/{pid}/tqs"),
    ("post", "/api/projects/{pid}/tqs/{tid}/answer"),
    ("get", "/api/projects/{pid}/runs/{rid}/download"),
    ("get", "/api/health"),
]  # fmt: skip


def test_every_contract_path_exists():  # T9.1.10
    paths = json.loads(build())["paths"]
    missing = [(m, p) for m, p in CONTRACT if m not in paths.get(p, {})]
    assert missing == []


def test_committed_openapi_is_current():
    assert Path(OUT).read_text() == build(), "run: python scripts/export_openapi.py"


def test_responses_match_their_models(tmp_path):  # T9.1.9
    c = make_client(tmp_path)
    pid, run = run_project(c, tmp_path)
    base = f"/api/projects/{pid}"
    rb = f"{base}/runs/{run['id']}"
    checks = [
        (models.ProjectOut, base), (models.RunOut, rb), (models.AllocationOut, f"{rb}/allocation"),
        (models.LayoutOut, f"{rb}/layout"), (models.GroupsOut, f"{rb}/groups"),
        (models.ReportOut, f"{rb}/report"), (models.ImpactOut, f"{rb}/impact"),
        (models.MappingOut, f"{base}/mapping"), (models.ValuesOut, f"{base}/values"),
        (models.RulesOut, f"{base}/rules"),
    ]  # fmt: skip
    for model, url in checks:
        r = c.get(url)
        assert r.status_code == 200, url
        model.model_validate(r.json())
    for url in (f"{base}/uploads", f"{base}/runs", f"{base}/tqs", f"{rb}/tqs"):
        assert isinstance(c.get(url).json(), list)


def test_docs_page_and_validation_error_shape(tmp_path):
    c = make_client(tmp_path)
    assert c.get("/docs").status_code == 200
    r = c.post("/api/projects", json={"name": ""})
    assert r.status_code == 422 and r.json()["code"] == "validation_error"
    assert set(r.json()) == {"code", "message", "details"}
    r = c.get("/api/nothing")
    assert r.status_code == 404 and r.json()["code"] == "not_found"
