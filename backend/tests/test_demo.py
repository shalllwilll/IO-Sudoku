import os

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app, load_dotenv
from tests.test_tq_answers import cable_rows, sheet


def _client(tmp_path, data_dir):
    settings = Settings(db_path=str(tmp_path / "api.db"), data_dir=str(data_dir), cpsat_enabled=False)
    return TestClient(create_app(settings))


def test_sample_missing_gives_clear_error(tmp_path):
    empty = tmp_path / "empty"
    empty.mkdir()
    r = _client(tmp_path, empty).post("/api/demo/sample")
    assert r.status_code == 404
    assert r.json()["code"] == "sample_unavailable"


def test_sample_project_is_created_once_and_runs(tmp_path):
    data = tmp_path / "data"
    data.mkdir()
    sheet(data, cable_rows("C1", 4), "Sample_IO_MDB_x.xlsx")
    c = _client(tmp_path, data)
    first = c.post("/api/demo/sample").json()
    assert first["created"] is True and first["run_id"]
    again = c.post("/api/demo/sample").json()
    assert again == {"project_id": first["project_id"], "run_id": first["run_id"], "created": False}
    project = c.get(f"/api/projects/{first['project_id']}").json()
    assert project["name"] == "Sample plant" and project["uploads"] == 1
    assert c.get(f"/api/projects/{first['project_id']}/runs/{first['run_id']}").json()["status"] == "finished"


def test_dotenv_fills_missing_values_only(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("# comment\nGEMINI_MODEL=\"m1\"\nDEMO_KEEP=from-file\nbad line\n")
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    monkeypatch.setenv("DEMO_KEEP", "from-env")
    load_dotenv(env)
    assert os.environ["GEMINI_MODEL"] == "m1"
    assert os.environ["DEMO_KEEP"] == "from-env"
    monkeypatch.delenv("GEMINI_MODEL")
