"""Server-sent events for a run: live while it works, replayed afterwards."""

import time
from collections.abc import Iterator

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.api.deps import run_of, service
from app.api.errors import ApiError, ErrorBody
from app.api.service import Service
from app.core.events.models import TERMINAL

router = APIRouter(prefix="/api")
POLL_SECONDS = 0.05
IDLE_LIMIT_SECONDS = 600


def _last_id(request: Request, query: int | None) -> int:
    raw = request.headers.get("last-event-id")
    if raw is not None:
        try:
            return max(0, int(raw))
        except ValueError as e:
            raise ApiError(400, "bad_last_event_id", "Last-Event-ID must be an integer") from e
    return max(0, query or 0)


@router.get("/projects/{pid}/runs/{rid}/events", responses={404: {"model": ErrorBody}},
            response_class=StreamingResponse)  # fmt: skip
def events(
    pid: str,
    rid: str,
    request: Request,
    last_event_id: int | None = None,
    svc: Service = Depends(service),
):
    """text/event-stream. Resume with the Last-Event-ID header (or ?last_event_id=)."""
    run_of(request, pid, rid)
    last = _last_id(request, last_event_id)

    def stream() -> Iterator[str]:
        seq, idle = last, 0.0
        while True:
            batch = svc.events.after(rid, seq)
            for e in batch:
                seq = e.seq
                yield e.sse()
                if e.type in TERMINAL:
                    return
            if batch:
                idle = 0.0
                continue
            status = svc.store.run(pid, rid)
            if status is None or (status["status"] != "running" and not svc.events.after(rid, seq)):
                return  # finished without a terminal event (should not happen): do not hang
            time.sleep(POLL_SECONDS)
            idle += POLL_SECONDS
            if idle > IDLE_LIMIT_SECONDS:
                return

    return StreamingResponse(
        stream(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )  # fmt: skip
