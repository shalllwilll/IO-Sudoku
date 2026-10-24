"""Events persisted with a per-run sequence number, so any client can replay or resume."""

import json
import sqlite3
import threading
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime

from app.core.events.models import EventModel


@dataclass
class StoredEvent:
    seq: int
    type: str
    data: dict
    at: str

    def sse(self) -> str:
        payload = json.dumps({"seq": self.seq, "type": self.type, "at": self.at, "data": self.data})
        return f"id: {self.seq}\nevent: {self.type}\ndata: {payload}\n\n"


class EventStore:
    def __init__(self, db: sqlite3.Connection, lock: threading.RLock):
        self.db, self.lock = db, lock
        with self.lock, self.db:
            self.db.execute(
                "CREATE TABLE IF NOT EXISTS api_events (run_id TEXT NOT NULL, seq INTEGER NOT NULL, "
                "type TEXT NOT NULL, data TEXT NOT NULL, at TEXT NOT NULL, "
                "PRIMARY KEY (run_id, seq))"
            )

    def emit(self, run_id: str, event: EventModel) -> StoredEvent:
        at = datetime.now(UTC).isoformat(timespec="milliseconds")
        data = json.loads(event.model_dump_json())
        with self.lock, self.db:
            seq = self.db.execute(
                "SELECT COALESCE(MAX(seq), 0) + 1 FROM api_events WHERE run_id=?", (run_id,)
            ).fetchone()[0]
            self.db.execute(
                "INSERT INTO api_events VALUES (?,?,?,?,?)",
                (run_id, seq, event.type, json.dumps(data), at),
            )
        return StoredEvent(seq, event.type, data, at)

    def after(self, run_id: str, last_seq: int = 0, limit: int = 500) -> list[StoredEvent]:
        with self.lock:
            rows = self.db.execute(
                "SELECT seq, type, data, at FROM api_events WHERE run_id=? AND seq>? "
                "ORDER BY seq LIMIT ?",
                (run_id, last_seq, limit),
            ).fetchall()
        return [StoredEvent(r[0], r[1], json.loads(r[2]), r[3]) for r in rows]

    def replay(self, run_id: str, last_seq: int = 0) -> Iterator[StoredEvent]:
        while batch := self.after(run_id, last_seq):
            yield from batch
            last_seq = batch[-1].seq
