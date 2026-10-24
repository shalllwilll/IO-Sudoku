from pydantic import BaseModel, Field

from app.core.model.issue import Issue
from app.core.model.pack import Pack


class Declaration(BaseModel):
    assumed: list[str] = Field(default_factory=list)
    defaulted: list[str] = Field(default_factory=list)
    not_enforced: list[str] = Field(default_factory=list)


def build_declaration(
    pack: Pack, issues: list[Issue], not_enforced: list[str] | None = None
) -> Declaration:
    """What was assumed, what a default filled in, and what is not enforced."""
    cap = pack.capacity
    d = Declaration(not_enforced=list(not_enforced or []))
    conflicts = ", ".join("/".join(p) for p in pack.segregation.conflicts)
    d.assumed = [
        f"Hierarchy: {cap.channels_per_baseplate} channels per baseplate, "
        f"{cap.baseplates_per_cioc} baseplates per CIOC, "
        f"{cap.ciocs_per_cabinet} CIOCs per cabinet.",
        f"CIOCs per controller is {cap.ciocs_per_controller} (parameter, not confirmed).",
        f"Controllers per system cabinet is {cap.controllers_per_system_cabinet} "
        "(parameter, not confirmed).",
        f"Spare rule: {cap.spare_percent}% of baseplates kept empty per cabinet "
        f"({cap.spare_rounding} rounding); baseplate {cap.alarm_baseplate_index} of each "
        "cabinet is reserved for cabinet alarms.",
        f"Segregation conflicts: {conflicts} never share a CIOC; unknown codes get their own CIOC.",
    ]
    relay = [r for r in pack.hardware.rows if r.charm is None or r.tb is None]
    for r in relay:
        d.assumed.append(
            f"Hardware rule {r.id} has no part number defined; matching signals are held out."
        )
    seen: set[str] = set()
    for i in issues:
        if i.severity in ("warning", "assumed") and i.message not in seen:
            seen.add(i.message)
            d.defaulted.append(f"{i.code}: {i.message}")
    return d
