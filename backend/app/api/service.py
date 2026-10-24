"""Glue between the REST layer and the core: no allocation logic lives here."""

import dataclasses
import threading
from pathlib import Path

from app.api.store import ApiStore
from app.config import Settings
from app.core.ai import Gateway
from app.core.ai.cache import AiCache
from app.core.events import EventStore
from app.core.events import models as ev
from app.core.events.run_events import run_events
from app.core.ingest.merge import build_signalset, map_files, read_files
from app.core.ingest.normaliser import ValueMapOverrides
from app.core.model.allocation import Allocation
from app.core.model.pack import Pack
from app.core.model.signal import Signal
from app.core.pipeline import Pipeline, PipelineRun
from app.core.reports import build_report
from app.core.revision.baseline import baseline_from_workbook, skey
from app.core.revision.history import HistoryError, commit_revision
from app.core.revision.impact import build_diff, build_impact, revision_sheets
from app.core.revision.match import label_order, normalise_label
from app.core.revision.solve import solve_revision
from app.core.rules.schema import Rule, load_rules
from app.core.rules.sets import RuleSet, load_preset, make_ruleset
from app.core.solve.chain import ChainResult
from app.core.tq.store import collect_tqs, tq_sheet
from app.core.writer.template import WriterError, build_rows, write_allocation


class Service:
    def __init__(self, store: ApiStore, pack: Pack, settings: Settings):
        self.store, self.pack, self.settings = store, pack, settings
        self.gateway = Gateway(settings, cache=AiCache(str(store.root / "ai_cache.db")))
        self.events = EventStore(store.db, store.lock)
        self.run_lock = threading.Lock()
        self._pipelines: dict[str, Pipeline] = {}

    # -- project inputs --------------------------------------------------------------------

    def paths_and_labels(self, pid: str) -> tuple[list[Path], dict[str, str]]:
        ups = self.store.uploads(pid)
        d = self.store.upload_dir(pid)
        return [d / u["stored_name"] for u in ups], {u["stored_name"]: u["name"] for u in ups}

    def overrides(self, project: dict) -> ValueMapOverrides:
        return ValueMapOverrides(**(project["settings"].get("overrides") or {}))

    def ruleset(self, project: dict) -> RuleSet:
        s = project["settings"]
        if s.get("rules") is not None:
            return make_ruleset("custom", load_rules(s["rules"]))
        return load_preset(self.pack, s.get("preset"))

    def rules(self, project: dict) -> list[Rule]:
        return self.ruleset(project).rules

    def preview(self, project: dict):
        """Read, map and normalise the project's uploads without allocating."""
        paths, labels = self.paths_and_labels(project["id"])
        confirmed = project["settings"].get("confirmed") or {}
        reads = read_files(paths, labels)
        maps = map_files(reads, self.pack, confirmed)
        ss = build_signalset(reads, maps, self.pack, self.overrides(project))
        return reads, maps, ss

    # -- a run -----------------------------------------------------------------------------

    def _pipeline(self, project: dict, params: dict) -> Pipeline:
        pid = project["id"]
        paths, labels = self.paths_and_labels(pid)
        s = project["settings"]
        overrides = {}
        if params.get("seed") is not None:
            overrides["seed"] = params["seed"]
        pl = Pipeline(
            paths, self.pack, s.get("area"), s.get("unit"), self.rules(project),
            overrides=self.overrides(project), confirmed=s.get("confirmed") or {},
            cpsat_enabled=params.get("cpsat"), qiga_enabled=params.get("qiga"),
            labels=labels, **overrides,
        )  # fmt: skip
        if pid in self._pipelines:
            pl.inherit(self._pipelines[pid])
        self._pipelines[pid] = pl
        return pl

    def begin(self, project: dict, params: dict) -> str:
        """Create the run and announce it; the work itself happens in `execute`."""
        rid = self.store.create_run(project["id"], params)
        self.events.emit(
            rid,
            ev.RunStarted(
                project_id=project["id"], uploads=len(self.store.uploads(project["id"])),
                params=params,
            ),
        )  # fmt: skip
        return rid

    def _listen(self, rid: str):
        def on(kind: str, stage: str, info: dict) -> None:
            if kind == "stage.started":
                self.events.emit(rid, ev.StageStarted(stage=stage))
            else:
                self.events.emit(rid, ev.StageFinished(stage=stage, **info))

        return on

    def execute(self, project: dict, rid: str, params: dict) -> None:
        """Run the pipeline and store everything a later GET needs. Never raises."""
        pid = project["id"]
        try:
            with self.run_lock:
                pl = self._pipeline(project, params)
                tq = self.store.tq_store(pid)
                run = pl.run(tq.compiled(self.pack), self._listen(rid))
                run.tqs = tq.apply_status(run.tqs)
            summary, data, output, report = self._results(project, rid, run)
            for event in run_events(run, report):
                self.events.emit(rid, event)
            self.events.emit(
                rid,
                ev.RunFinished(
                    allocated=summary["allocated"], held_out=summary["held_out"],
                    tqs=summary["tq_count"], solver=summary["solver"],
                ),
            )  # fmt: skip
            self.store.finish_run(rid, "finished", summary, data, output, None)
        except Exception as e:  # noqa: BLE001  a failed run is a result, not a crashed server
            msg = f"{type(e).__name__}: {e}"
            self.events.emit(rid, ev.ErrorEvent(code=type(e).__name__, message=str(e)))
            self.store.finish_run(rid, "failed", {}, {}, None, msg)

    def recover(self) -> None:
        """A run still marked running at startup was cut off by a restart."""
        for pid in [p["id"] for p in self.store.projects()]:
            for r in self.store.runs(pid):
                if r["status"] == "running":
                    self.events.emit(
                        r["id"], ev.ErrorEvent(code="interrupted", message="server restarted")
                    )
                    self.store.finish_run(
                        r["id"], "failed", {}, {}, None, "interrupted by a restart"
                    )

    def _results(self, project: dict, rid: str, run: PipelineRun, extra_sheets=None):
        pid = project["id"]
        alloc = run.allocation
        ss = run.signalset
        held = run._held_signals()
        issues = [*ss.issues, *run.blocks.issues, *alloc.issues]
        ruleset = make_ruleset(self.ruleset(project).name, run.rules)
        report = build_report(
            alloc, run.pack, ss.signals, issues, held, run.not_enforced, run.rules, ruleset
        )
        rows = build_rows(alloc, run.pack)
        output, output_error = None, None
        template = self.settings.resolve_template()
        if template is None:
            output_error = "no allocation template is configured (TEMPLATE_PATH or the data dir)"
        else:
            out = self.store.output_dir(pid) / f"{rid}.xlsx"
            try:
                sheets = {**report.sheets(), "TQ list": tq_sheet(run.tqs), **(extra_sheets or {})}
                write_allocation(alloc, run.pack, template, out, sheets)
                output = out.name
            except WriterError as e:
                output_error = str(e)
        summary = {
            **report.kpi.model_dump(exclude={"spares"}),
            "solver": alloc.solver,
            "tq_count": len(run.tqs),
            "unaccounted": run.unaccounted(),
            "stages_run": run.executed,
            "stages_reused": run.reused,
            "output_error": output_error,
        }
        data = {
            "allocation": alloc.model_dump(mode="json"),
            "rows": rows,
            "report": report.model_dump(mode="json"),
            "groups": [g.model_dump(mode="json") for g in run.blocks.groups],
            "tq_ids": [t.id for t in run.tqs],
            "events": [dataclasses.asdict(e) for e in run.chain.events],
        }
        return summary, data, output, report

    # -- revisions -------------------------------------------------------------------------

    def _rules_hash(self, project: dict) -> str:
        return make_ruleset("run", self.rules(project)).hash

    def baseline_from_run(self, project: dict, run: dict, label: str) -> str:
        """Make a finished run the first link of the project's revision chain."""
        alloc = Allocation.model_validate(run["data"]["allocation"])
        found = [
            p.signal for p in alloc.placements if p.signal and p.kind in ("field", "cabinet_alarm")
        ]
        signals: dict[tuple, Signal] = {}
        for s in [*found, *(u.signal for u in alloc.unplaced)]:
            signals.setdefault(skey(s), s)
        with self.store.lock:
            chain = self.store.chain(project["id"])
            if chain.labels():
                raise HistoryError("the project already has a baseline")
            run_id = chain.store.save_run(
                normalise_label(label), alloc, list(signals.values()), self.pack.hash,
                self._rules_hash(project),
            )  # fmt: skip
            chain.start(run_id, normalise_label(label))
        return run_id

    def baseline_from_issued(self, project: dict, path: Path, label: str) -> str:
        """Make an issued allocation workbook the first link of the chain."""
        base = baseline_from_workbook(path, self.pack, normalise_label(label))
        with self.store.lock:
            chain = self.store.chain(project["id"])
            if chain.labels():
                raise HistoryError("the project already has a baseline")
            run_id = chain.store.save_run(
                base.label, base.allocation, base.signals, self.pack.hash, ""
            )
            chain.start(run_id, base.label)
        return run_id

    def next_label(self, pid: str) -> str:
        with self.store.lock:
            labels = self.store.chain(pid).labels()
        last = max(labels, key=label_order, default="00")
        return f"{label_order(last)[0] + 1:02d}"

    def execute_revision(self, project: dict, rid: str, params: dict) -> None:
        """Re-allocate the project's current uploads as a revision of the chain's latest issue."""
        pid = project["id"]
        try:
            with self.run_lock:
                with self.store.lock:
                    chain = self.store.chain(pid)
                    last = chain.summary()[-1].label
                    baseline = chain.baseline_of(last)
                    base_hash = (
                        next(
                            r["rules_hash"]
                            for r in chain.store.list_runs()
                            if r["id"] == baseline.run_id
                        )
                        or ""
                    )
                label = normalise_label(params.get("label") or self.next_label(pid))
                pl = self._pipeline(project, {"cpsat": False, "qiga": False})
                tq = self.store.tq_store(pid)
                run0 = pl.run(tq.compiled(self.pack), self._listen(rid))
                rhash = make_ruleset("run", run0.rules).hash
                cpsat_on = params.get("cpsat")
                kw = {} if params.get("seed") is None else {"seed": params["seed"]}
                result = solve_revision(
                    baseline, run0.allocatable, run0.pack, run0.rules, label=label,
                    rules_changed=bool(base_hash) and base_hash != rhash,
                    use_cpsat=self.settings.cpsat_enabled if cpsat_on is None else cpsat_on,
                    use_qiga=params.get("qiga"), **kw,
                )  # fmt: skip
                impact = build_impact(result, baseline, run0.pack, label=label)
                diff = build_diff(result, baseline)
                with self.store.lock:
                    commit_revision(
                        chain.store, chain, baseline, result, run0.allocatable, run0.pack, label,
                        rhash,
                    )  # fmt: skip
                issues = [*run0.signalset.issues, *run0.blocks.issues]
                tqs = tq.apply_status(collect_tqs(issues, result.allocation, None, run0.held_out))
                rev = dataclasses.replace(
                    run0, chain=ChainResult(result.allocation, result.solver, result.events),
                    tqs=tqs,
                )  # fmt: skip
            summary, data, output, report = self._results(
                project, rid, rev, extra_sheets=revision_sheets(impact, diff)
            )
            summary["revision"] = label
            data["revision"] = {
                "label": label, "baseline_label": baseline.label, "solver": result.solver,
                "tier": result.tier, "pinned_blocks": result.pinned_blocks,
                "free_blocks": result.free_blocks,
                "impact": impact.model_dump(mode="json"),
                "diff": [r.model_dump(mode="json") for r in diff],
                "moves": [dataclasses.asdict(m) for m in result.moves],
                "violations": [str(v.message) for v in result.violations],
            }  # fmt: skip
            for event in run_events(rev, report):
                self.events.emit(rid, event)
            self.events.emit(
                rid,
                ev.RunFinished(
                    allocated=summary["allocated"], held_out=summary["held_out"],
                    tqs=summary["tq_count"], solver=summary["solver"],
                ),
            )  # fmt: skip
            self.store.finish_run(rid, "finished", summary, data, output, None)
        except Exception as e:  # noqa: BLE001  a failed revision is a result, not a crashed server
            msg = f"{type(e).__name__}: {e}"
            self.events.emit(rid, ev.ErrorEvent(code=type(e).__name__, message=str(e)))
            self.store.finish_run(rid, "failed", {}, {}, None, msg)
