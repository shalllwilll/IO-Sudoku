import json
import sqlite3
from collections import defaultdict

from app.core.ingest.normaliser import HeldOut
from app.core.model.allocation import Allocation
from app.core.model.issue import Issue
from app.core.model.signal import Signal
from app.core.tq.model import TQ, signal_key, tq_from_issue

_JSON = {"options", "signal_keys", "data"}
_COLUMNS = list(TQ.model_fields)


class TqStore:
    def __init__(self, path: str = ":memory:"):
        self.db = sqlite3.connect(path)
        cols = ", ".join(f"{c} TEXT" + (" PRIMARY KEY" if c == "id" else "") for c in _COLUMNS)
        self.db.execute(f"CREATE TABLE IF NOT EXISTS tq ({cols})")

    def add(self, tq: TQ) -> bool:
        """Insert unless the id exists; a repeat merges its signal keys. True if new."""
        row = self.get(tq.id)
        if row is not None:
            merged = sorted(set(row.signal_keys) | set(tq.signal_keys))
            if merged != row.signal_keys:
                self.db.execute(
                    "UPDATE tq SET signal_keys=? WHERE id=?", (json.dumps(merged), tq.id)
                )
            return False
        data = tq.model_dump()
        vals = [
            json.dumps(data[c]) if c in _JSON else (None if data[c] is None else str(data[c]))
            for c in _COLUMNS
        ]
        self.db.execute(
            f"INSERT INTO tq ({', '.join(_COLUMNS)}) VALUES ({', '.join('?' * len(_COLUMNS))})",
            vals,
        )
        return True

    def add_many(self, tqs: list[TQ]) -> int:
        with self.db:
            return sum(self.add(t) for t in tqs)

    def _row(self, r: tuple) -> TQ:
        d = dict(zip(_COLUMNS, r, strict=True))
        for c in _JSON:
            d[c] = json.loads(d[c])
        if d["source_row"] is not None:
            d["source_row"] = int(d["source_row"])
        return TQ.model_validate(d)

    def get(self, id_: str) -> TQ | None:
        r = self.db.execute("SELECT * FROM tq WHERE id=?", (id_,)).fetchone()
        return self._row(r) if r else None

    def all(self) -> list[TQ]:
        rows = self.db.execute("SELECT * FROM tq ORDER BY code, id").fetchall()
        return [self._row(r) for r in rows]

    def columns(self) -> list[str]:
        return [r[1] for r in self.db.execute("PRAGMA table_info(tq)")]

    def grouped(self) -> dict[str, list[TQ]]:
        out: dict[str, list[TQ]] = defaultdict(list)
        for t in self.all():
            out[t.category].append(t)
        return dict(out)


DEFAULT_APPLIED = {
    "TQ-VALUE": "applied the pack's default policy for the value",
    "TQ-NAME": "used the default name part",
    "TQ-MAP": "used the best-guess column",
    "TQ-DATA": "kept the signal out of allocation",
    "TQ-HW": "signal held out",
    "TQ-CAP": "signal held out",
    "TQ-SEG": "signals held out or separated",
    "TQ-ALM": "signal held out",
}


def collect_tqs(
    issues: list[Issue],
    alloc: Allocation | None = None,
    held_out: list[Signal] | None = None,
    held: list[HeldOut] | None = None,
) -> list[TQ]:
    """Turn every recorded issue into a TQ; unplaced signals are attached to their issue's TQ."""
    by_id: dict[str, TQ] = {}
    pending: list[tuple[Signal, list[Issue]]] = [(h, []) for h in held_out or []]
    pending += [
        (Signal(source_file=h.source_file, source_row=h.source_row), h.issues) for h in held or []
    ]
    if alloc:
        pending += [(u.signal, u.issues) for u in alloc.unplaced]
        issues = [*issues, *alloc.issues]
    for i in issues:
        t = tq_from_issue(i, DEFAULT_APPLIED.get(i.code, ""))
        by_id.setdefault(t.id, t)
    for sig, iss in pending:
        key = signal_key(sig.source_file, sig.source_row)
        for i in iss:
            t = tq_from_issue(i, DEFAULT_APPLIED.get(i.code, ""))
            cur = by_id.setdefault(t.id, t)
            if key not in cur.signal_keys:
                cur.signal_keys.append(key)
    return sorted(by_id.values(), key=lambda t: (t.code, t.id))


def unaccounted(
    all_signals: list[Signal],
    alloc: Allocation,
    tqs: list[TQ],
    held_out: list[Signal] | None = None,
) -> list[str]:
    """Signals that are neither in the allocation nor named by a TQ (must be empty)."""
    placed = {
        signal_key(p.signal.source_file, p.signal.source_row)
        for p in alloc.placements
        if p.signal is not None
    }
    in_tq = {k for t in tqs for k in t.signal_keys}
    out = []
    for s in [*all_signals, *(held_out or [])]:
        k = signal_key(s.source_file, s.source_row)
        if k not in placed and k not in in_tq:
            out.append(k)
    return sorted(set(out))


def tq_sheet(tqs: list[TQ]) -> list[list[object]]:
    rows: list[list[object]] = [
        [
            "TQ id",
            "Code",
            "Category",
            "Severity",
            "Subject",
            "Message",
            "Default applied",
            "Options",
            "Signals",
            "Status",
        ]
    ]
    for t in tqs:
        rows.append(
            [
                t.id, t.code, t.category, t.severity, t.subject, t.message, t.default_applied,
                "; ".join(f"{o.label} -> {o.consequence}" for o in t.options),
                ", ".join(t.signal_keys), t.status,
            ]
        )  # fmt: skip
    return rows
