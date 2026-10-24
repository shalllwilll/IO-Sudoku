import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from tests.test_tq_answers import cable_rows, sheet

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def make_client(tmp_path: Path, **kw) -> TestClient:
    settings = Settings(
        db_path=str(tmp_path / "api.db"), data_dir=os.environ.get("SUDOKU_DATA_DIR"),
        cpsat_enabled=False, **kw,
    )  # fmt: skip
    return TestClient(create_app(settings))


def xlsx_bytes(tmp_path: Path, rows, name="up.xlsx", **kw) -> bytes:
    (tmp_path / "src").mkdir(exist_ok=True)
    return sheet(tmp_path / "src", rows, name, **kw).read_bytes()


def upload(client, pid, content: bytes, filename="mdb.xlsx", ctype=XLSX):
    return client.post(f"/api/projects/{pid}/uploads", files={"file": (filename, content, ctype)})


def new_project(client, **body):
    r = client.post(
        "/api/projects", json={"name": "Plant 30", "area": "AR1", "unit": "100", **body}
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def simple_rows():
    return cable_rows("320-CE-0001", 14) + cable_rows("320-CE-0002", 5, seg="B")


def sample_template_or_skip() -> None:
    if Settings(data_dir=os.environ.get("SUDOKU_DATA_DIR")).resolve_template() is None:
        pytest.skip("no allocation template available")


def run_now(client, pid, body=None):
    """Start a run and return it finished (the POST itself answers before the work is done)."""
    r = client.post(f"/api/projects/{pid}/runs", json=body or {})
    assert r.status_code == 201, r.text
    got = client.get(f"/api/projects/{pid}/runs/{r.json()['id']}")
    assert got.status_code == 200
    return got.json()
