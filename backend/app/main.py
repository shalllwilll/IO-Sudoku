from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings

VERSION = "0.1.0"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    app = FastAPI(title="IO Signal Sudoku", version=VERSION)
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok", "version": VERSION, "ai_available": settings.ai_available}

    return app


app = create_app()
