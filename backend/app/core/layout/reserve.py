import math

from app.core.model.pack import Pack


def spare_baseplates(pack: Pack) -> int:
    """Empty baseplates kept per cabinet: spare_percent of its baseplates, rounded per the pack."""
    cap = pack.capacity
    total = cap.baseplates_per_cioc * cap.ciocs_per_cabinet
    raw = total * cap.spare_percent / 100
    fn = {"floor": math.floor, "ceil": math.ceil, "round": round}[cap.spare_rounding]
    return int(fn(raw))


def usable_baseplates_per_cabinet(pack: Pack) -> int:
    cap = pack.capacity
    total = cap.baseplates_per_cioc * cap.ciocs_per_cabinet
    return max(0, total - 1 - spare_baseplates(pack))  # minus the cabinet-alarm baseplate
