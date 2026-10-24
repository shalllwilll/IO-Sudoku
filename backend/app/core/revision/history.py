"""Revision chain and history: read-only views over stored records.

The query methods only read, so each can be exposed as a GET endpoint later.
"""

import json
from datetime import UTC, datetime

from pydantic import BaseModel, Field

from app.core.model.pack import Pack
from app.core.revision.baseline import Baseline, RunStore, skey
from app.core.revision.impact import DiffRow, Impact, slot_text
from app.core.revision.match import label_order, match_revision, normalise_label


class HistoryError(ValueError):
    pass


class ChainEntry(BaseModel):
    seq: int
    label: str
    run_id: str
    parent_label: str | None = None
    created_at: str | None = None
    impact: Impact | None = None  # none for the baseline


class HistoryEntry(BaseModel):
    label: str
    change: str
    old_slot: str
    new_slot: str
    reason: str
    detail: str = ""


class SignalDelta(BaseModel):
    tag: str | None
    cable: str | None = None
    pair: int | None = None
    kind: str  # added | removed | modified | moved
    old_slot: str = "-"
    new_slot: str = "-"
    fields: list[str] = Field(default_factory=list)


class Comparison(BaseModel):
    from_label: str
    to_label: str
    added: int = 0
    removed: int = 0
    modified: int = 0
    moved: int = 0
    unchanged: int = 0
    deltas: list[SignalDelta] = Field(default_factory=list)


class CumulativeRow(BaseModel):
    tag: str | None
    cable: str | None = None
    pair: int | None = None
    slot: str
    first_label: str
    last_changed_label: str
    changes: int


class RevisionChain:
    def __init__(self, store: RunStore):
        self.store = store
        self.db = store.db

    # -- writing ---------------------------------------------------------------------------
    def _next_seq(self) -> int:
        return self.db.execute("SELECT COALESCE(MAX(seq), 0) + 1 FROM revisions").fetchone()[0]

    def _insert(self, label, run_id, parent_id, impact, changes) -> str:
        label = normalise_label(label)
        if self.db.execute("SELECT 1 FROM revisions WHERE label=?", (label,)).fetchone():
            raise HistoryError(f"revision '{label}' is already recorded")
        seq = self._next_seq()
        rid = f"rev-{seq:04d}"
        with self.db:
            self.db.execute(
                "INSERT INTO revisions VALUES (?,?,?,?,?,?,?,?)",
                (
                    rid,
                    seq,
                    label,
                    run_id,
                    parent_id,
                    datetime.now(UTC).isoformat(timespec="seconds"),
                    impact.model_dump_json() if impact else None,
                    json.dumps([c.model_dump() for c in changes]),
                ),
            )
        return rid

    def start(self, run_id: str, label: str = "00") -> str:
        """Record the baseline: the first link of the chain."""
        if self.db.execute("SELECT COUNT(*) FROM revisions").fetchone()[0]:
            raise HistoryError("the chain already has a baseline")
        self.store.load_baseline(run_id)  # fails clearly for an unknown run
        return self._insert(label, run_id, None, None, [])

    def add(self, run_id: str, label: str, impact: Impact, diff: list[DiffRow]) -> str:
        last = self._last()
        if last is None:
            raise HistoryError("start the chain with the baseline first")
        self.store.load_baseline(run_id)
        return self._insert(label, run_id, last[0], impact, diff)

    def _last(self) -> tuple | None:
        return self.db.execute(
            "SELECT id, label, run_id FROM revisions ORDER BY seq DESC"
        ).fetchone()

    # -- reading ---------------------------------------------------------------------------
    def _rows(self) -> list[tuple]:
        return self.db.execute(
            "SELECT id, seq, label, run_id, parent_id, created_at, impact_json, changes_json "
            "FROM revisions ORDER BY seq"
        ).fetchall()

    def labels(self) -> list[str]:
        return [r[2] for r in self._rows()]

    def summary(self) -> list[ChainEntry]:
        rows = self._rows()
        label_of = {r[0]: r[2] for r in rows}
        return [
            ChainEntry(
                seq=r[1],
                label=r[2],
                run_id=r[3],
                parent_label=label_of.get(r[4]),
                created_at=r[5],
                impact=Impact.model_validate_json(r[6]) if r[6] else None,
            )
            for r in rows
        ]

    def _record(self, label: str) -> tuple:
        want = normalise_label(label)
        for r in self._rows():
            if r[2] == want:
                return r
        have = ", ".join(sorted(self.labels(), key=label_order)) or "none recorded"
        raise HistoryError(f"unknown revision '{label}'; recorded revisions: {have}")

    def baseline_of(self, label: str) -> Baseline:
        b = self.store.load_baseline(self._record(label)[3])
        return b.model_copy(update={"label": normalise_label(label)})

    def compare(self, a: str, b: str) -> Comparison:
        """What differs between the allocations of two revisions (a is the older side)."""
        base_a, base_b = self.baseline_of(a), self.baseline_of(b)
        m = match_revision(base_a, base_b.signals)
        slots_b = base_b.slots()
        out = Comparison(from_label=base_a.label, to_label=base_b.label)
        for c in m.changes:
            s = c.signal
            old_slot = slot_text(base_a.layout, c.slot)
            new_p = slots_b.get(skey(c.new)) if c.new else None
            new_cell = (new_p.cioc_no, new_p.baseplate, new_p.channel) if new_p else None
            new_slot = slot_text(base_b.layout, new_cell)
            base = {"tag": s.tag, "cable": s.cable, "pair": s.pair}
            if c.kind == "added":
                out.added += 1
                out.deltas.append(SignalDelta(kind="added", new_slot=new_slot, **base))
            elif c.kind == "deleted":
                out.removed += 1
                out.deltas.append(SignalDelta(kind="removed", old_slot=old_slot, **base))
            elif old_slot != new_slot:
                out.moved += 1
                out.deltas.append(
                    SignalDelta(
                        kind="moved",
                        old_slot=old_slot,
                        new_slot=new_slot,
                        fields=c.changed_fields,
                        **base,
                    )
                )
            elif c.kind == "modified":
                out.modified += 1
                out.deltas.append(
                    SignalDelta(
                        kind="modified",
                        old_slot=old_slot,
                        new_slot=new_slot,
                        fields=c.changed_fields,
                        **base,
                    )
                )
            else:
                out.unchanged += 1
        return out

    def _diffs(self) -> list[tuple[str, list[DiffRow]]]:
        return [
            (r[2], [DiffRow.model_validate(d) for d in json.loads(r[7] or "[]")])
            for r in self._rows()
        ]

    def signal_history(self, tag: str) -> list[HistoryEntry]:
        """Every recorded change of one tag, oldest first (a renamed tag is followed)."""
        names = {tag}
        out: list[HistoryEntry] = []
        for label, diff in self._diffs():
            for d in diff:
                if d.tag in names or (d.old_tag and d.old_tag in names):
                    names |= {x for x in (d.tag, d.old_tag) if x}
                    out.append(
                        HistoryEntry(
                            label=label,
                            change=d.change,
                            old_slot=d.old_slot,
                            new_slot=d.new_slot,
                            reason=d.reason,
                            detail=d.detail,
                        )
                    )
        return out

    def cumulative(self) -> list[CumulativeRow]:
        """The current state after every revision, with when each signal last changed."""
        rows = self._rows()
        if not rows:
            return []
        current = self.baseline_of(rows[-1][2])
        base_label = rows[0][2]
        first: dict[str, str] = {}
        last: dict[str, str] = {}
        count: dict[str, int] = {}
        for label, diff in self._diffs():
            for d in diff:
                for name in {d.tag, d.old_tag} - {None}:
                    count[name] = count.get(name, 0) + 1
                    last[name] = label
                    if d.change == "Added":
                        first.setdefault(name, label)
        out = []
        for p in current.allocation.placements:
            if p.signal is None or p.kind not in ("field", "cabinet_alarm"):
                continue
            t = p.signal.tag or ""
            out.append(
                CumulativeRow(
                    tag=p.signal.tag,
                    cable=p.signal.cable,
                    pair=p.signal.pair,
                    slot=slot_text(current.layout, (p.cioc_no, p.baseplate, p.channel)),
                    first_label=first.get(t, base_label),
                    last_changed_label=last.get(t, first.get(t, base_label)),
                    changes=count.get(t, 0),
                )
            )
        return sorted(out, key=lambda r: (r.slot, r.tag or ""))


def commit_revision(
    store: RunStore,
    chain: RevisionChain,
    baseline: Baseline,
    result,
    revised_signals: list,
    pack: Pack,
    label: str,
    rules_hash: str = "",
) -> str:
    """Store a solved revision as a run and link it into the chain. Returns the revision id."""
    from app.core.revision.impact import build_diff, build_impact

    impact = build_impact(result, baseline, pack, label=normalise_label(label))
    diff = build_diff(result, baseline)
    run_id = store.save_run(
        normalise_label(label),
        result.allocation,
        revised_signals,
        pack.hash,
        rules_hash,
        parent_id=baseline.run_id,
    )
    return chain.add(run_id, label, impact, diff)
