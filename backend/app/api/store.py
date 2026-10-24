"""SQLite storage for projects, uploads and runs. One lock serialises all access."""

import json
import sqlite3
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

from app.core.revision.baseline import RunStore
from app.core.revision.history import RevisionChain
from app.core.tq.answers import AnswerStore


def new_id() -> str:
    return uuid.uuid4().hex[:16]


def now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


class ApiStore:
    def __init__(self, db_path: str):
        self.root = Path(db_path).resolve().parent
        self.lock = threading.RLock()
        self.db = sqlite3.connect(db_path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS api_projects (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT, settings TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS api_uploads (
                id TEXT PRIMARY KEY, project_id TEXT NOT NULL, seq INTEGER NOT NULL,
                label TEXT NOT NULL, stored_name TEXT NOT NULL, size INTEGER, sha256 TEXT,
                created_at TEXT, info TEXT
            );
            CREATE TABLE IF NOT EXISTS api_runs (
                id TEXT PRIMARY KEY, project_id TEXT NOT NULL, status TEXT NOT NULL,
                created_at TEXT, finished_at TEXT, params TEXT, summary TEXT, error TEXT,
                output_name TEXT, data TEXT
            );
            """
        )
        self._tq: dict[str, AnswerStore] = {}
        self._chains: dict[str, RevisionChain] = {}

    # -- folders ---------------------------------------------------------------------------

    def upload_dir(self, pid: str) -> Path:
        d = self.root / "uploads" / pid
        d.mkdir(parents=True, exist_ok=True)
        return d

    def output_dir(self, pid: str) -> Path:
        d = self.root / "outputs" / pid
        d.mkdir(parents=True, exist_ok=True)
        return d

    def tq_store(self, pid: str) -> AnswerStore:
        with self.lock:
            if pid not in self._tq:
                d = self.root / "projects" / pid
                d.mkdir(parents=True, exist_ok=True)
                self._tq[pid] = AnswerStore(str(d / "tq.db"))
            return self._tq[pid]

    def chain(self, pid: str) -> RevisionChain:
        """The project's revision chain; callers hold `self.lock` while they use it."""
        with self.lock:
            if pid not in self._chains:
                d = self.root / "projects" / pid
                d.mkdir(parents=True, exist_ok=True)
                self._chains[pid] = RevisionChain(RunStore(str(d / "revisions.db"), shared=True))
            return self._chains[pid]

    # -- projects --------------------------------------------------------------------------

    def create_project(self, name: str, settings: dict) -> dict:
        pid = new_id()
        with self.lock, self.db:
            self.db.execute(
                "INSERT INTO api_projects VALUES (?,?,?,?)",
                (pid, name, now(), json.dumps(settings)),
            )
        return self.project(pid)  # type: ignore[return-value]

    def project(self, pid: str) -> dict | None:
        with self.lock:
            r = self.db.execute("SELECT * FROM api_projects WHERE id=?", (pid,)).fetchone()
        if r is None:
            return None
        return {
            "id": r["id"], "name": r["name"], "created_at": r["created_at"],
            "settings": json.loads(r["settings"]),
        }  # fmt: skip

    def projects(self) -> list[dict]:
        with self.lock:
            ids = [r["id"] for r in self.db.execute("SELECT id FROM api_projects ORDER BY rowid")]
        return [p for i in ids if (p := self.project(i))]

    def update_settings(self, pid: str, **changes) -> dict:
        p = self.project(pid)
        assert p is not None
        settings = {**p["settings"], **changes}
        with self.lock, self.db:
            self.db.execute(
                "UPDATE api_projects SET settings=? WHERE id=?", (json.dumps(settings), pid)
            )
        return self.project(pid)  # type: ignore[return-value]

    def rename_project(self, pid: str, name: str) -> None:
        with self.lock, self.db:
            self.db.execute("UPDATE api_projects SET name=? WHERE id=?", (name, pid))

    # -- uploads ---------------------------------------------------------------------------

    def add_upload(
        self, pid: str, label: str, stored: str, size: int, sha: str, info: list
    ) -> dict:
        uid = new_id()
        with self.lock, self.db:
            seq = self.db.execute(
                "SELECT COALESCE(MAX(seq), 0) + 1 FROM api_uploads WHERE project_id=?", (pid,)
            ).fetchone()[0]
            self.db.execute(
                "INSERT INTO api_uploads VALUES (?,?,?,?,?,?,?,?,?)",
                (uid, pid, seq, label, stored, size, sha, now(), json.dumps(info)),
            )
        return self.upload(pid, uid)  # type: ignore[return-value]

    def remove_upload(self, pid: str, uid: str) -> str | None:
        """Forget an upload; returns its stored file name (None if there is no such upload)."""
        up = self.upload(pid, uid)
        if up is None:
            return None
        with self.lock, self.db:
            self.db.execute("DELETE FROM api_uploads WHERE id=? AND project_id=?", (uid, pid))
        return up["stored_name"]

    def next_seq(self, pid: str) -> int:
        with self.lock:
            return self.db.execute(
                "SELECT COALESCE(MAX(seq), 0) + 1 FROM api_uploads WHERE project_id=?", (pid,)
            ).fetchone()[0]

    @staticmethod
    def _upload(r: sqlite3.Row) -> dict:
        return {
            "id": r["id"], "name": r["label"], "stored_name": r["stored_name"],
            "size": r["size"], "sha256": r["sha256"], "created_at": r["created_at"],
            "sheets": json.loads(r["info"] or "[]"),
        }  # fmt: skip

    def upload(self, pid: str, uid: str) -> dict | None:
        with self.lock:
            r = self.db.execute(
                "SELECT * FROM api_uploads WHERE id=? AND project_id=?", (uid, pid)
            ).fetchone()
        return self._upload(r) if r else None

    def uploads(self, pid: str) -> list[dict]:
        with self.lock:
            rows = self.db.execute(
                "SELECT * FROM api_uploads WHERE project_id=? ORDER BY seq", (pid,)
            ).fetchall()
        return [self._upload(r) for r in rows]

    # -- runs ------------------------------------------------------------------------------

    def create_run(self, pid: str, params: dict) -> str:
        rid = new_id()
        with self.lock, self.db:
            self.db.execute(
                "INSERT INTO api_runs (id, project_id, status, created_at, params) "
                "VALUES (?,?,?,?,?)",
                (rid, pid, "running", now(), json.dumps(params)),
            )
        return rid

    def finish_run(
        self,
        rid: str,
        status: str,
        summary: dict,
        data: dict,
        output: str | None,
        error: str | None,
    ) -> None:
        with self.lock, self.db:
            self.db.execute(
                "UPDATE api_runs SET status=?, finished_at=?, summary=?, data=?, output_name=?, "
                "error=? WHERE id=?",
                (status, now(), json.dumps(summary), json.dumps(data), output, error, rid),
            )

    def run(self, pid: str, rid: str) -> dict | None:
        with self.lock:
            r = self.db.execute(
                "SELECT * FROM api_runs WHERE id=? AND project_id=?", (rid, pid)
            ).fetchone()
        if r is None:
            return None
        return {
            "id": r["id"], "project_id": r["project_id"], "status": r["status"],
            "created_at": r["created_at"], "finished_at": r["finished_at"],
            "params": json.loads(r["params"] or "{}"), "summary": json.loads(r["summary"] or "{}"),
            "error": r["error"], "output_name": r["output_name"],
            "data": json.loads(r["data"] or "{}"),
        }  # fmt: skip

    def runs(self, pid: str) -> list[dict]:
        with self.lock:
            ids = [
                r["id"]
                for r in self.db.execute(
                    "SELECT id FROM api_runs WHERE project_id=? ORDER BY rowid", (pid,)
                )
            ]
        return [x for i in ids if (x := self.run(pid, i))]
