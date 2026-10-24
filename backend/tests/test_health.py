from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_health_ok():
    r = TestClient(create_app(Settings())).get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_config_from_env(monkeypatch):
    monkeypatch.setenv("DB_PATH", "/tmp/x.db")
    assert Settings.from_env().db_path == "/tmp/x.db"


def test_missing_key_means_no_ai(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    r = TestClient(create_app(Settings.from_env())).get("/api/health")
    assert r.status_code == 200
    assert r.json()["ai_available"] is False


def test_cors_allows_localhost():
    r = TestClient(create_app(Settings())).get(
        "/api/health", headers={"Origin": "http://localhost:5173"}
    )
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
