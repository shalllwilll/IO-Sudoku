"""AI status: configured models and, on request, whether the API knows them."""

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api")


class AiStatus(BaseModel):
    ai_available: bool
    models: list[str]
    verified: dict[str, bool] | None = None


@router.get("/ai/status", response_model=AiStatus)
def ai_status(request: Request, probe: bool = False):
    gw = request.app.state.service.gateway
    return AiStatus(
        ai_available=gw.available, models=gw.models,
        verified=gw.verify_models() if probe and gw.available else None,
    )  # fmt: skip
