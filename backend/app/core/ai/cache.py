"""Answers cached by the hash of the redacted prompt, plus a log of every call."""

import json
import sqlite3
import threading
from datetime import UTC, datetime


class AiCache:
    def __init__(self, path: str = ":memory:"):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.lock = threading.Lock()
        with self.db:
            self.db.executescript(
                "CREATE TABLE IF NOT EXISTS ai_cache (key TEXT PRIMARY KEY, model TEXT, "
                "response TEXT, created_at TEXT);"
                "CREATE TABLE IF NOT EXISTS ai_log (id INTEGER PRIMARY KEY AUTOINCREMENT, "
                "task TEXT, prompt_hash TEXT, model TEXT, status TEXT, detail TEXT, at TEXT);"
            )

    def get(self, key: str) -> tuple[str, dict] | None:
        with self.lock:
            r = self.db.execute(
                "SELECT model, response FROM ai_cache WHERE key=?", (key,)
            ).fetchone()
        return (r[0], json.loads(r[1])) if r else None

    def put(self, key: str, model: str, response: dict) -> None:
        with self.lock, self.db:
            self.db.execute(
                "INSERT OR REPLACE INTO ai_cache VALUES (?,?,?,?)",
                (key, model, json.dumps(response), datetime.now(UTC).isoformat()),
            )

    def log(self, task: str, prompt_hash: str, model: str, status: str, detail: str = "") -> None:
        with self.lock, self.db:
            self.db.execute(
                "INSERT INTO ai_log (task, prompt_hash, model, status, detail, at) "
                "VALUES (?,?,?,?,?,?)",
                (task, prompt_hash, model, status, detail[:300], datetime.now(UTC).isoformat()),
            )

    def entries(self) -> list[dict]:
        with self.lock:
            rows = self.db.execute(
                "SELECT task, prompt_hash, model, status, detail FROM ai_log ORDER BY id"
            ).fetchall()
        return [
            dict(zip(("task", "prompt_hash", "model", "status", "detail"), r, strict=True))
            for r in rows
        ]
