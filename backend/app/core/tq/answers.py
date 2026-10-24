"""TQ answers: validation, history, scope resolution and compilation into run inputs.

An answer picks one of the options the TQ offered (plus a value when that option needs one) and a
scope: this row, this cable or everywhere. `compile_answers` folds the current answers into a
`Compiled` bundle that the pipeline feeds to the stage each answer belongs to. The narrower scope
wins when two answers touch the same thing; at equal scope the later answer wins.
"""

import json
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.core.ingest.normaliser import ValueMapOverrides
from app.core.model.pack import HardwareRow, Pack
from app.core.tq.model import OPTIONS, TQ
from app.core.tq.store import TqStore

Scope = Literal["row", "cable", "everywhere"]
SCOPE_RANK = {"everywhere": 0, "cable": 1, "row": 2}

# earliest pipeline stage each kind of answer can change
RESTART = {
    "map_confirm": "ingest", "map_pick": "ingest",
    "value": "normalise", "segregation": "normalise",
    "hardware": "hardware",
    "capacity": "pack", "naming": "pack", "rule_revise": "pack", "rule_waive": "pack",
    "revision": "pack",
    "note": None,
}  # fmt: skip

# what each option does, in OPTIONS order. "note" records the decision and changes no input.
EFFECT: dict[str, list[str]] = {
    "TQ-DATA": ["note", "note"],
    "TQ-MAP": ["map_confirm", "map_pick"],
    "TQ-VALUE": ["value", "note"],
    "TQ-HW": ["hardware", "note"],
    "TQ-CAP": ["capacity", "note"],
    "TQ-SEG": ["segregation", "note"],
    "TQ-SPARE": ["note", "note"],
    "TQ-ALM": ["capacity", "note"],
    "TQ-RULE": ["rule_revise", "rule_waive"],
    "TQ-NAME": ["naming", "note"],
    "TQ-REV": ["revision", "revision"],
}
# kinds that change a project-wide input, so only the "everywhere" scope makes sense
PROJECT_WIDE = {"map_confirm", "map_pick", "capacity", "naming", "rule_revise", "rule_waive"}
VALUE_FIELDS = {"io_type": "io_type", "duty": "duty_class", "duty_class": "duty_class",
                "segregation": "segregation"}  # fmt: skip
HW_FIELDS = ("charm", "charm_name", "tb", "tb_name", "tb_terminals", "loop_typical")


class AnswerError(ValueError):
    pass


class Answer(BaseModel):
    seq: int = 0
    tq_id: str
    option: str
    value: str | None = None
    fields: dict[str, object] = Field(default_factory=dict)
    scope: Scope = "everywhere"
    target: str | None = None  # a signal key for 'row', a cable for 'cable'
    author: str = "engineer"
    at: str = ""
    effect: str = "note"


def option_effect(tq: TQ, option: str) -> str:
    labels = [o.label for o in tq.options]
    if option not in labels:
        raise AnswerError(f"{tq.id}: '{option}' is not an option of {tq.code}; have {labels}")
    return EFFECT[tq.code][[lab for lab, _ in OPTIONS[tq.code]].index(option)]


def _allowed_values(field: str, pack: Pack) -> set[str]:
    vm = pack.valuemaps
    if field == "io_type":
        return set(vm.io_types.values())
    if field == "duty_class":
        return {*vm.duty_classes.values(), vm.default_duty_class}
    return {c.family for c in pack.segregation.codes}


def validate_answer(tq: TQ, a: Answer, pack: Pack) -> str:
    """Return the effect, or raise AnswerError. Nothing is stored here."""
    effect = option_effect(tq, a.option)
    if effect in PROJECT_WIDE and a.scope != "everywhere":
        raise AnswerError(f"{tq.code} answers apply project-wide; scope '{a.scope}' is not allowed")
    if a.scope == "row" and not (a.target or tq.signal_keys):
        raise AnswerError(f"{tq.id}: row scope needs a signal key and the TQ names none")
    if a.scope == "cable" and not (a.target or tq.data.get("cable")):
        raise AnswerError(f"{tq.id}: cable scope needs a cable name")
    if effect == "map_pick" and not a.value:
        raise AnswerError("pick another column: give the column name as the value")
    if effect in ("map_confirm", "map_pick") and not (tq.source_file and tq.data.get("field")):
        raise AnswerError(f"{tq.id}: the TQ does not say which file and field it is about")
    if effect in ("value", "segregation"):
        field = VALUE_FIELDS.get(
            tq.data.get("field", "segregation" if effect == "segregation" else "")
        )
        if field is None:
            raise AnswerError(f"{tq.id}: the TQ does not say which value it is about")
        if a.scope == "everywhere" and not tq.data.get("value"):
            raise AnswerError(
                f"{tq.id}: no single value is named by this TQ; answer at cable or row scope"
            )
        ok = _allowed_values(field, pack)
        if a.value not in ok:
            raise AnswerError(f"'{a.value}' is not a known {field}; have {sorted(ok)}")
    if effect == "hardware":
        missing = [k for k in ("charm", "tb") if not str(a.fields.get(k, "")).strip()]
        if missing:
            raise AnswerError(f"hardware answer needs part numbers for {missing}")
        extra = set(a.fields) - set(HW_FIELDS)
        if extra:
            raise AnswerError(f"unknown hardware fields {sorted(extra)}")
    if effect == "capacity":
        try:
            n = int(a.value or "")
        except ValueError as e:
            raise AnswerError("capacity answer: the value is the new cabinet limit") from e
        if n < 1:
            raise AnswerError("capacity answer: the cabinet limit must be at least 1")
    if effect == "naming" and not set(a.fields) & {"area", "unit"}:
        raise AnswerError("naming answer needs 'area' and/or 'unit' in fields")
    if effect == "rule_revise" and not a.fields:
        raise AnswerError("rule revision needs the parameter changes in fields")
    if effect in ("rule_revise", "rule_waive") and not (
        a.fields.get("rule") or tq.data.get("rules")
    ):
        raise AnswerError("name the rule: fields.rule")
    return effect


class AnswerStore(TqStore):
    """TQ store plus an append-only answer history. The latest answer per TQ is current."""

    def __init__(self, path: str = ":memory:"):
        super().__init__(path)
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS tq_answers (seq INTEGER PRIMARY KEY AUTOINCREMENT, "
            "tq_id TEXT NOT NULL, body TEXT NOT NULL)"
        )

    def answer(
        self,
        tq_id: str,
        option: str,
        *,
        pack: Pack,
        value: str | None = None,
        fields: dict[str, object] | None = None,
        scope: Scope = "everywhere",
        target: str | None = None,
        author: str = "engineer",
        now: datetime | None = None,
    ) -> Answer:
        tq = self.get(tq_id)
        if tq is None:
            raise AnswerError(f"unknown TQ '{tq_id}'")
        a = Answer(
            tq_id=tq_id, option=option, value=value, fields=fields or {}, scope=scope,
            target=target, author=author, at=(now or datetime.now(UTC)).isoformat(),
        )  # fmt: skip
        a.effect = validate_answer(tq, a, pack)
        with self.db:
            cur = self.db.execute(
                "INSERT INTO tq_answers (tq_id, body) VALUES (?, ?)", (tq_id, a.model_dump_json())
            )
            a.seq = int(cur.lastrowid or 0)
            label = option + (f": {value}" if value else "")
            self.db.execute("UPDATE tq SET status='answered', answer=? WHERE id=?", (label, tq_id))
        return a

    def history(self, tq_id: str) -> list[Answer]:
        rows = self.db.execute(
            "SELECT seq, body FROM tq_answers WHERE tq_id=? ORDER BY seq", (tq_id,)
        ).fetchall()
        return [Answer.model_validate({**json.loads(b), "seq": s}) for s, b in rows]

    def current(self) -> list[Answer]:
        """The latest answer of every answered TQ, oldest first."""
        rows = self.db.execute(
            "SELECT seq, body FROM tq_answers WHERE seq IN "
            "(SELECT MAX(seq) FROM tq_answers GROUP BY tq_id) ORDER BY seq"
        ).fetchall()
        return [Answer.model_validate({**json.loads(b), "seq": s}) for s, b in rows]

    def tq_map(self) -> dict[str, TQ]:
        return {t.id: t for t in self.all()}

    def compiled(self, pack: Pack) -> "Compiled":
        return compile_answers(self.current(), self.tq_map(), pack)

    def apply_status(self, tqs: list[TQ]) -> list[TQ]:
        """Carry answered status into a fresh run's TQs; unknown TQs are stored as open."""
        self.add_many(tqs)
        stored = self.tq_map()
        return [stored[t.id] for t in tqs]


class Compiled(BaseModel):
    """The current answers, folded into the inputs each pipeline stage reads."""

    confirmed: dict[str, dict[str, str]] = Field(default_factory=dict)  # file -> field -> column
    overrides: ValueMapOverrides = Field(default_factory=ValueMapOverrides)
    hardware_rows: list[HardwareRow] = Field(default_factory=list)  # most specific first
    max_cabinets: int | None = None
    names: dict[str, str] = Field(default_factory=dict)  # area / unit
    waived: dict[str, str] = Field(default_factory=dict)  # rule id -> who waived it
    rule_patches: dict[str, dict[str, object]] = Field(default_factory=dict)
    revision: dict[str, str] = Field(default_factory=dict)  # signal key or '*' -> keep | move
    notes: list[str] = Field(default_factory=list)  # answers that change no input
    restart: str | None = None  # earliest stage touched by any answer

    def part(self, stage: str) -> object:
        """What each stage reads from the answers; used in its input hash."""
        if stage == "ingest":
            return self.confirmed
        if stage == "normalise":
            return self.overrides.model_dump()
        if stage == "hardware":
            return [r.model_dump() for r in self.hardware_rows]
        if stage == "pack":
            return {
                "max_cabinets": self.max_cabinets, "names": self.names,
                "waived": sorted(self.waived), "patches": self.rule_patches,
            }  # fmt: skip
        return None


_ORDER = ("ingest", "map", "normalise", "hardware", "layout", "pack")


def _earlier(a: str | None, b: str | None) -> str | None:
    if a is None or b is None:
        return a or b
    return a if _ORDER.index(a) <= _ORDER.index(b) else b


def _hw_row(tq: TQ, a: Answer, pack: Pack, extra: dict[str, str], n: int) -> HardwareRow:
    base = next((r for r in pack.hardware.rows if r.id == tq.data.get("rule")), None)
    if base is not None:
        match: dict = dict(base.match)
    else:
        match = {k: v for k, v in tq.data.items() if k in ("io_type", "signal_type", "signal_level",
                                                           "duty_class")}  # fmt: skip
    match.update(extra)
    body = base.model_dump(exclude={"id", "match"}) if base else {}
    body.update({k: str(v) for k, v in a.fields.items() if k in HW_FIELDS})
    return HardwareRow(id=f"ANS-{tq.id}-{n}", match=match, **body)


def compile_answers(answers: list[Answer], tqs: dict[str, TQ], pack: Pack) -> Compiled:
    """Narrower scope first in the result; within a scope the later answer replaces the earlier."""
    out = Compiled()
    hw: dict[tuple, tuple[int, int, HardwareRow]] = {}
    for a in sorted(answers, key=lambda x: (SCOPE_RANK[x.scope], x.seq)):
        tq = tqs.get(a.tq_id)
        if tq is None:
            continue
        eff = a.effect
        out.restart = _earlier(out.restart, RESTART[eff]) if eff != "note" else out.restart
        if eff == "note":
            out.notes.append(f"{tq.id} {tq.code}: {a.option} (by {a.author})")
        elif eff in ("map_confirm", "map_pick"):
            col = a.value if eff == "map_pick" else tq.data.get("column")
            if col:
                out.confirmed.setdefault(tq.source_file or "", {})[tq.data["field"]] = col
        elif eff in ("value", "segregation"):
            field = VALUE_FIELDS[tq.data.get("field", "segregation")]
            raw = (tq.data.get("value") or "").upper()
            ov = out.overrides
            if a.scope == "everywhere":
                {"io_type": ov.io_types, "duty_class": ov.duty_classes,
                 "segregation": ov.segregation}[field][raw] = a.value or ""  # fmt: skip
            elif a.scope == "cable":
                cable = a.target or tq.data["cable"]
                ov.cables.setdefault(cable, {})[field] = a.value or ""
            else:
                for key in [a.target] if a.target else tq.signal_keys:
                    ov.rows.setdefault(key, {})[field] = a.value or ""
        elif eff == "hardware":
            if a.scope == "everywhere":
                scopes = [{}]
            elif a.scope == "cable":
                scopes = [{"cable": a.target or tq.data["cable"]}]
            else:
                keys = [a.target] if a.target else tq.signal_keys
                scopes = []
                for k in keys:
                    f, _, r = k.rpartition(":")
                    scopes.append({"source_file": f, "source_row": r})
            for n, extra in enumerate(scopes):
                row = _hw_row(tq, a, pack, extra, n)
                hw[(a.scope, json.dumps(row.match, sort_keys=True))] = (
                    SCOPE_RANK[a.scope], a.seq, row,
                )  # fmt: skip
        elif eff == "capacity":
            out.max_cabinets = int(a.value or 0)
        elif eff == "naming":
            out.names.update({k: str(v) for k, v in a.fields.items() if k in ("area", "unit")})
        elif eff in ("rule_revise", "rule_waive"):
            ids = str(a.fields.get("rule") or tq.data.get("rules", "")).split(",")
            for rid in filter(None, (i.strip() for i in ids)):
                if eff == "rule_waive":
                    out.waived[rid] = a.author
                else:
                    out.rule_patches.setdefault(rid, {}).update(
                        {k: v for k, v in a.fields.items() if k != "rule"}
                    )
        elif eff == "revision":
            keep = a.option.startswith("Keep")
            for key in tq.signal_keys or ["*"]:
                out.revision[key] = "keep" if keep else "move"
    out.hardware_rows = [r for _, _, r in sorted(hw.values(), key=lambda t: (-t[0], -t[1]))]
    return out
