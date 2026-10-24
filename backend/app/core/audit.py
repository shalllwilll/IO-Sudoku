"""Aggregate comparison of a generated allocation against a reference workbook.

This module deliberately reports counts and rates only. It never serialises reference row values,
so the hackathon workbooks can remain outside version control.
"""

import re
from collections import Counter
from pathlib import Path

import openpyxl
from pydantic import BaseModel

from app.core.model.allocation import Allocation
from app.core.model.pack import Pack
from app.core.writer.template import build_rows


def _norm(value: object) -> str:
    return "" if value is None else str(value).strip()


def _rows(path: Path) -> list[dict[str, object]]:
    ws = openpyxl.load_workbook(path, read_only=True, data_only=True).active
    values = ws.iter_rows(values_only=True)
    headers = next(values)
    return [dict(zip(headers, row, strict=False)) for row in values]


def _key(row: dict[str, object]) -> tuple[str, str]:
    cable = row.get("Field Cable No", row.get("fieldcableno"))
    pair = _norm(row.get("Field Cable Pair", row.get("fieldcablepair")))
    digits = re.search(r"\d+", pair)
    return (_norm(cable), digits.group(0) if digits else pair)


class AuditResult(BaseModel):
    reference_rows: int
    generated_rows: int
    field_reference: int
    field_matched: int
    field_placement_exact: int
    ownership_exact: int
    alarm_reference: int
    alarm_matched: int
    status_counts_reference: dict[str, int]
    status_counts_generated: dict[str, int]
    wired_hardware_exact: int
    wired_hardware_compared: int

    @property
    def field_match_rate(self) -> float:
        return self.field_matched / self.field_reference if self.field_reference else 1.0


def compare_reference(alloc: Allocation, pack: Pack, reference_path: str | Path) -> AuditResult:
    """Compare stable cable/pair identities plus allocation-level outcomes."""
    reference = _rows(Path(reference_path))
    generated = build_rows(alloc, pack)
    ref_field = [r for r in reference if _norm(r.get("Tag Status")) == "Field"]
    gen_field = [r for r in generated if _norm(r.get("tagstatus")) == "Field"]
    by_key = {_key(r): r for r in gen_field}
    matched = [(_r, by_key[_key(_r)]) for _r in ref_field if _key(_r) in by_key]
    placement = (
        "Electronic/ Marshalling Cabinet",
        "Controller",
        "CIOC/CSLS Name",
        "Baseplate",
        "Channel_No",
    )
    ownership = ("Technical Room", "Operating Area", "Risk Area")
    # Generated rows use normalised template keys; keep this mapping explicit and reviewable.
    place_keys = (
        "electronicmarshallingcabinet",
        "controller",
        "cioccslsname",
        "baseplate",
        "channelno",
    )
    own_keys = ("technicalroom", "operatingarea", "riskarea")
    field_placement_exact = sum(
        all(_norm(r.get(c)) == _norm(g.get(k)) for c, k in zip(placement, place_keys, strict=True))
        for r, g in matched
    )
    ownership_exact = sum(
        all(_norm(r.get(c)) == _norm(g.get(k)) for c, k in zip(ownership, own_keys, strict=True))
        for r, g in matched
    )
    ref_alarm = [r for r in reference if _norm(r.get("Tag Status")) == "Cabinet Alarm"]
    gen_alarm = {
        _norm(r.get("tagname")) for r in generated if _norm(r.get("tagstatus")) == "Cabinet Alarm"
    }
    ref_wired = {_key(r): r for r in reference if _norm(r.get("Tag Status")) == "Wired Spare"}
    gen_wired = {_key(r): r for r in generated if _norm(r.get("tagstatus")) == "Wired Spare"}
    wired_pairs = [(r, gen_wired[k]) for k, r in ref_wired.items() if k in gen_wired]
    return AuditResult(
        reference_rows=len(reference),
        generated_rows=len(generated),
        field_reference=len(ref_field),
        field_matched=len(matched),
        field_placement_exact=field_placement_exact,
        ownership_exact=ownership_exact,
        alarm_reference=len(ref_alarm),
        alarm_matched=sum(_norm(r.get("Tag Name")) in gen_alarm for r in ref_alarm),
        status_counts_reference=dict(Counter(_norm(r.get("Tag Status")) for r in reference)),
        status_counts_generated=dict(Counter(_norm(r.get("tagstatus")) for r in generated)),
        wired_hardware_exact=sum(
            _norm(r.get("CHARM Type")) == _norm(g.get("charmtype")) for r, g in wired_pairs
        ),
        wired_hardware_compared=len(wired_pairs),
    )
