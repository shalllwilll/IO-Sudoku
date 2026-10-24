"""Solver chain: CP-SAT, greedy, QIGA, then the TQ list. Every output passes the validator."""

from dataclasses import asdict, dataclass, field

from app.config import Settings
from app.core.layout.blocks import BlockSet
from app.core.model.allocation import Allocation, Unplaced
from app.core.model.issue import Issue
from app.core.model.layout import Layout
from app.core.model.pack import Pack
from app.core.rules.schema import Rule
from app.core.rules.sets import make_ruleset
from app.core.solve import cpsat
from app.core.solve.cache import ResultCache, make_key
from app.core.solve.greedy import solve_greedy
from app.core.solve.qiga import solve_qiga

PROBE_DETERMINISTIC_TIME = 2.0


@dataclass
class Event:
    stage: str  # cpsat | greedy | qiga | tq | rules | cache
    status: str
    message: str = ""


@dataclass
class ChainResult:
    allocation: Allocation
    solver: str  # cpsat | greedy | qiga | tq
    events: list[Event] = field(default_factory=list)
    cached: bool = False
    key: str = ""
    cpsat: cpsat.CpsatResult | None = None

    @property
    def fell_back(self) -> bool:
        return any(e.status == "fallback" for e in self.events)


def _all_signals(blocks: BlockSet):
    sigs, alarms = cpsat.solver_inputs(blocks)
    return [*sigs, *alarms]


def tq_only(blocks: BlockSet, reason: str) -> Allocation:
    """Last resort: nothing is placed and every signal is on the TQ list."""
    iss = Issue(code="TQ-CAP", severity="blocking", message=reason)
    alloc = Allocation(layout=Layout(), solver="tq", issues=[iss])
    alloc.unplaced = [Unplaced(signal=s, issues=[iss]) for s in _all_signals(blocks)]
    return alloc


def _feasible(blocks, pack, area, unit, rules, **kw) -> bool | None:
    r = cpsat.solve_cpsat(
        blocks, pack, area, unit, rules, strict=True, deterministic_time=PROBE_DETERMINISTIC_TIME, **kw
    )  # fmt: skip
    if r.ok:
        return True
    if r.status in ("INFEASIBLE", "REJECTED"):
        return False
    return None


def probe_rule_conflicts(
    blocks: BlockSet,
    pack: Pack,
    area: str | None,
    unit: str | None,
    rules: list[Rule] | None,
) -> list[str] | None:
    """Smallest set of hard rules that cannot hold together (deletion filter), by toggling.

    Returns [] when the rules are not the cause, None when the probe could not decide.
    """
    active = [r for r in rules or [] if r.enabled and r.enforced and r.strength == "hard"]
    if not active:
        return []
    base = [r for r in rules or [] if r not in active]
    if _feasible(blocks, pack, area, unit, [*base]) is not True:
        return []  # infeasible without any rule: capacity, not rules
    if (feas := _feasible(blocks, pack, area, unit, [*base, *active])) is True:
        return []
    if feas is None:
        return None
    keep = list(active)
    for r in list(keep):
        rest = [x for x in keep if x is not r]
        if _feasible(blocks, pack, area, unit, [*base, *rest]) is False:
            keep = rest  # still infeasible without r: r is not needed in the conflict
    return [r.id for r in keep]


def run_chain(
    blocks: BlockSet,
    pack: Pack,
    area: str | None = None,
    unit: str | None = None,
    rules: list[Rule] | None = None,
    *,
    ruleset_hash: str | None = None,
    cache: ResultCache | None = None,
    cpsat_enabled: bool | None = None,
    qiga_enabled: bool | None = None,
    versions: dict[str, str] | None = None,
    **overrides,
) -> ChainResult:
    settings = Settings.from_env()
    enabled = settings.cpsat_enabled if cpsat_enabled is None else cpsat_enabled
    qiga_on = settings.qiga_enabled if qiga_enabled is None else qiga_enabled
    rhash = ruleset_hash or make_ruleset("run", list(rules or [])).hash
    cap = pack.capacity
    key = make_key(
        blocks, pack.hash, rhash, versions, area=area, unit=unit, cpsat=enabled, qiga=qiga_on,
        seed=overrides.get("seed", cap.cpsat_seed),
        det=overrides.get("deterministic_time", cap.cpsat_deterministic_time),
    )  # fmt: skip
    if cache is not None and (hit := cache.get(key)) is not None:
        alloc, events = hit
        evs = [Event(**e) for e in events] + [Event("cache", "hit", key[:12])]
        return ChainResult(alloc, alloc.solver, evs, cached=True, key=key)

    events: list[Event] = []
    chosen: ChainResult | None = None
    if enabled:
        chosen = _try_cpsat(blocks, pack, area, unit, rules, events, overrides)
    else:
        events.append(Event("cpsat", "skipped", "disabled in settings"))
    if chosen is None:
        chosen = _try_greedy(blocks, pack, area, unit, rules, events)
        if chosen.solver == "greedy" and _improvable(chosen.allocation):
            chosen = _try_qiga(chosen, blocks, pack, rules, events, qiga_on)
    chosen.events, chosen.key = events, key
    if any(i.code == "TQ-RULE" for i in chosen.allocation.issues):
        _explain_rule_failure(chosen, blocks, pack, area, unit, rules)
    if cache is not None and chosen.solver != "tq" and (chosen.solver == "cpsat" or not enabled):
        cache.put(key, chosen.allocation, [asdict(e) for e in events])
    return chosen


def _try_cpsat(blocks, pack, area, unit, rules, events, overrides) -> ChainResult | None:
    try:
        r = cpsat.solve_cpsat(blocks, pack, area, unit, rules, **overrides)
    except cpsat.CpsatError as e:
        events.append(Event("cpsat", "fallback", f"unusable: {e}"))
        return None
    if r.ok:
        events.append(Event("cpsat", "used", r.log()))
        return ChainResult(r.allocation, "cpsat", cpsat=r)
    status = "skipped" if r.status == "SKIPPED" else "fallback"
    events.append(Event("cpsat", status, f"{r.status}: {r.message or r.log()}"))
    return None


def _try_greedy(blocks, pack, area, unit, rules, events) -> ChainResult:
    try:
        alloc = solve_greedy(blocks, pack, area, unit, rules)
        bad = cpsat.gate(alloc, blocks, pack, rules)
    except Exception as e:  # noqa: BLE001 - the chain ends in the TQ list, never in an exception
        events.append(Event("greedy", "fallback", f"{type(e).__name__}: {e}"))
        return _tq(blocks, events, f"greedy failed: {e}")
    if bad:
        events.append(Event("greedy", "fallback", f"{len(bad)} validator violations"))
        return _tq(blocks, events, f"no solver produced a valid allocation ({bad[0].message})")
    events.append(Event("greedy", "used", f"{len(alloc.placements)} positions"))
    return ChainResult(alloc, "greedy")


def _improvable(alloc: Allocation) -> bool:
    """Signals left over for want of room or a rule, which a different packing might place."""
    return any(i.code in ("TQ-CAP", "TQ-RULE") for u in alloc.unplaced for i in u.issues)


def _try_qiga(chosen: ChainResult, blocks, pack, rules, events, on: bool) -> ChainResult:
    """Search for a packing of the greedy layout that leaves fewer signals on the TQ list."""
    if not on:
        events.append(Event("qiga", "skipped", "disabled in settings"))
        return chosen
    alloc = chosen.allocation
    try:
        r = solve_qiga(
            blocks, alloc.layout, pack, rules, alloc,
            gate=lambda a: cpsat.gate(a, blocks, pack, rules),
        )  # fmt: skip
    except Exception as e:  # noqa: BLE001 - a failed search keeps the greedy answer
        events.append(Event("qiga", "fallback", f"{type(e).__name__}: {e}"))
        return chosen
    if r.allocation is None:
        status = "fallback" if r.status == "rejected" else r.status.replace("no_gain", "kept")
        events.append(Event("qiga", status, r.message))
        return chosen
    events.append(Event("qiga", "used", f"{r.message} in {r.evaluated} decodes"))
    return ChainResult(r.allocation, "qiga")


def _tq(blocks: BlockSet, events: list[Event], reason: str) -> ChainResult:
    events.append(Event("tq", "used", reason))
    return ChainResult(tq_only(blocks, reason), "tq")


def _explain_rule_failure(res: ChainResult, blocks, pack, area, unit, rules) -> None:
    found = probe_rule_conflicts(blocks, pack, area, unit, rules)
    if found:
        msg = f"hard rules {', '.join(found)} cannot all hold; signals were left on the TQ list"
        res.allocation.issues.append(
            Issue(code="TQ-RULE", severity="blocking", message=msg, data={"rules": ",".join(found)})
        )
        res.events.append(Event("rules", "conflict", msg))
    elif found is None:
        res.events.append(Event("rules", "undecided", "rule-toggle probe hit its time limit"))
    else:
        res.events.append(Event("rules", "no-conflict", "unplaced signals are not a rule clash"))
