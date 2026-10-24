"""The allocation pipeline as an explicit ordered list of stages with input hashes.

    ingest -> map -> normalise -> hardware -> layout -> pack

Each stage's hash covers everything it reads: the hash of the stage before it, the slice of the
pack it uses and the slice of the TQ answers that belongs to it. `run` recomputes the hashes, finds
the first stage whose hash changed and re-runs from there; earlier stages and any later stage whose
inputs ended up unchanged are served from the stage cache.

    mapping answers  -> ingest      value / segregation answers -> normalise
    hardware answers -> hardware    rule / capacity / naming answers -> pack
"""

import hashlib
import json
import time
from dataclasses import dataclass, field
from pathlib import Path

from app.core.hardware.engine import resolve_hardware
from app.core.ingest.merge import SignalSet, build_signalset, map_files, read_files
from app.core.ingest.normaliser import HeldOut, ValueMapOverrides
from app.core.layout.blocks import BlockSet, build_blocks
from app.core.model.issue import Issue
from app.core.model.pack import Pack
from app.core.model.signal import Signal
from app.core.rules.schema import Rule
from app.core.rules.sets import make_ruleset
from app.core.solve.cache import ResultCache
from app.core.solve.chain import ChainResult, run_chain
from app.core.tq.answers import Compiled
from app.core.tq.model import TQ
from app.core.tq.store import collect_tqs, unaccounted

STAGES = ("ingest", "map", "normalise", "hardware", "layout", "pack")


def _hash(*parts: object) -> str:
    raw = json.dumps(parts, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


def _file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@dataclass
class HardwareStage:
    pack: Pack  # the pack with the answered hardware rows in front
    signals: list[Signal]
    held_out: list[HeldOut]


@dataclass
class PipelineRun:
    executed: list[str]
    reused: list[str]
    restart_from: str | None
    hashes: dict[str, str]
    seconds: dict[str, float]
    signalset: SignalSet
    held_out: list[HeldOut]  # every signal kept out of allocation, from any stage
    blocks: BlockSet
    chain: ChainResult
    pack: Pack  # the effective pack the allocation was made with
    rules: list[Rule]
    not_enforced: list[str]
    tqs: list[TQ] = field(default_factory=list)

    @property
    def allocation(self):
        return self.chain.allocation

    def _held_signals(self) -> list[Signal]:
        return [
            h.signal or Signal(source_file=h.source_file, source_row=h.source_row)
            for h in self.held_out
        ]

    def unaccounted(self) -> list[str]:
        """Signals that are neither allocated nor on the TQ list. Must be empty."""
        held = self._held_signals()
        return unaccounted(self.signalset.signals, self.allocation, self.tqs, held)


class Pipeline:
    def __init__(
        self,
        paths: list[str | Path],
        pack: Pack,
        area: str | None = None,
        unit: str | None = None,
        rules: list[Rule] | None = None,
        *,
        overrides: ValueMapOverrides | None = None,
        confirmed: dict[str, dict[str, str]] | None = None,
        cache: ResultCache | None = None,
        cpsat_enabled: bool | None = None,
        **chain_overrides,
    ):
        self.paths = sorted(Path(p) for p in paths)
        self.pack = pack
        self.area, self.unit = area, unit
        self.rules = list(rules or [])
        self.base_overrides = overrides or ValueMapOverrides()
        self.base_confirmed = confirmed or {}
        self.cache = cache
        self.cpsat_enabled = cpsat_enabled
        self.chain_overrides = chain_overrides
        self._done: dict[str, tuple[str, object]] = {}

    def forget(self) -> None:
        self._done.clear()

    # -- inputs per stage ------------------------------------------------------------------

    def _confirmed(self, c: Compiled) -> dict[str, dict[str, str]]:
        out = {f: dict(m) for f, m in self.base_confirmed.items()}
        for f, m in c.confirmed.items():
            out.setdefault(f, {}).update(m)
        return out

    def _overrides(self, c: Compiled) -> ValueMapOverrides:
        base, add = self.base_overrides, c.overrides
        return ValueMapOverrides(
            io_types={**base.io_types, **add.io_types},
            duty_classes={**base.duty_classes, **add.duty_classes},
            segregation={**base.segregation, **add.segregation},
            rows={**base.rows, **add.rows},
            cables={**base.cables, **add.cables},
        )

    def _effective_rules(self, c: Compiled) -> tuple[list[Rule], list[str]]:
        rules: list[Rule] = []
        not_enforced: list[str] = []
        for r in self.rules:
            if r.id in c.waived:
                not_enforced.append(f"rule {r.id}: waived by {c.waived[r.id]} (TQ answer)")
                continue
            if r.id in c.rule_patches:
                r = r.model_copy(update={"parameters": {**r.parameters, **c.rule_patches[r.id]}})
            rules.append(r)
        return rules, not_enforced

    # -- the run ---------------------------------------------------------------------------

    def run(self, compiled: Compiled | None = None) -> PipelineRun:
        c = compiled or Compiled()
        pack = self.pack
        executed: list[str] = []
        reused: list[str] = []
        hashes: dict[str, str] = {}
        seconds: dict[str, float] = {}
        prev = ""

        def stage(name: str, inputs: object, fn):
            nonlocal prev
            h = _hash(name, prev, inputs)
            hit = self._done.get(name)
            if hit and hit[0] == h:
                reused.append(name)
                out = hit[1]
            else:
                t0 = time.perf_counter()
                out = fn()
                seconds[name] = time.perf_counter() - t0
                self._done[name] = (h, out)
                executed.append(name)
            hashes[name], prev = h, h
            return out

        confirmed = self._confirmed(c)
        files = [(p.name, _file_hash(p)) for p in self.paths]
        reads = stage("ingest", [files, confirmed], lambda: read_files(self.paths))
        mappings = stage(
            "map",
            [pack.aliases.model_dump(), pack.schema_.model_dump()],
            lambda: map_files(reads, pack, confirmed),
        )
        overrides = self._overrides(c)
        ss: SignalSet = stage(
            "normalise",
            [
                pack.valuemaps.model_dump(),
                pack.segregation.model_dump(),
                pack.schema_.model_dump(),
                overrides.model_dump(),
            ],
            lambda: build_signalset(reads, mappings, pack, overrides),
        )

        def hardware() -> HardwareStage:
            hw_pack = pack.model_copy(
                update={
                    "hardware": pack.hardware.model_copy(
                        update={"rows": [*c.hardware_rows, *pack.hardware.rows]}
                    )
                }
            )
            kept: list[Signal] = []
            held: list[HeldOut] = []
            for s in ss.signals:
                res = resolve_hardware(s, hw_pack)
                if res.held_out:
                    held.append(
                        HeldOut(
                            source_file=s.source_file or "",
                            source_row=s.source_row or 0,
                            tag=s.tag,
                            issues=res.issues,
                            signal=s,
                        )
                    )
                else:
                    kept.append(s)
            return HardwareStage(hw_pack, kept, held)

        hw: HardwareStage = stage(
            "hardware", [pack.hardware.model_dump(), c.part("hardware")], hardware
        )
        blocks: BlockSet = stage("layout", [pack.hash], lambda: build_blocks(hw.signals, hw.pack))

        rules, not_enforced = self._effective_rules(c)
        rhash = make_ruleset("run", rules).hash
        eff = hw.pack.model_copy(
            update={
                "capacity": hw.pack.capacity.model_copy(
                    update={"max_cabinets": c.max_cabinets} if c.max_cabinets is not None else {}
                ),
                "hash": _hash(pack.hash, c.part("hardware"), c.part("pack")),
            }
        )
        area = c.names.get("area", self.area)
        unit = c.names.get("unit", self.unit)
        chain: ChainResult = stage(
            "pack",
            [eff.hash, rhash, area, unit, self.cpsat_enabled, self.chain_overrides],
            lambda: run_chain(
                blocks, eff, area, unit, rules, ruleset_hash=rhash, cache=self.cache,
                cpsat_enabled=self.cpsat_enabled, **self.chain_overrides,
            ),
        )  # fmt: skip

        held_all = [*ss.held_out, *hw.held_out, *blocks.held_out]
        issues: list[Issue] = [*ss.issues, *blocks.issues]
        run = PipelineRun(
            executed=executed,
            reused=reused,
            restart_from=executed[0] if executed else None,
            hashes=hashes,
            seconds=seconds,
            signalset=ss,
            held_out=held_all,
            blocks=blocks,
            chain=chain,
            pack=eff,
            rules=rules,
            not_enforced=not_enforced,
        )
        run.tqs = collect_tqs(issues, chain.allocation, None, held_all)
        return run
