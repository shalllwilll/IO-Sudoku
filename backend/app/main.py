from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import ai, errors, events, projects, revisions, runs
from app.api.service import Service
from app.api.store import ApiStore
from app.config import Settings
from app.core.model.pack import Pack

PACK_DIR = Path(__file__).resolve().parent.parent / "packs" / "default"

VERSION = "0.1.0"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    app = FastAPI(title="IO Signal Sudoku", version=VERSION)
    app.state.settings = settings
    app.state.service = Service(ApiStore(settings.db_path), Pack.load(PACK_DIR), settings)
    errors.install(app)
    if settings.cors_origins:  # release: only the real frontend origin(s)
        cors = {"allow_origins": list(settings.cors_origins)}
    else:  # development: any local origin
        cors = {"allow_origin_regex": r"http://(localhost|127\.0\.0\.1)(:\d+)?"}
    app.add_middleware(CORSMiddleware, allow_methods=["*"], allow_headers=["*"], **cors)

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok", "version": VERSION, "ai_available": settings.ai_available}

    app.state.service.recover()
    app.include_router(projects.router)
    app.include_router(runs.router)
    app.include_router(revisions.router)
    app.include_router(events.router)
    app.include_router(ai.router)
    return app


app = create_app()
