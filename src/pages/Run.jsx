import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/index.js";
import FileChip from "../components/FileChip.jsx";
import { pageDurationMs } from "../components/PageTransition.jsx";
import Button from "../components/ui/Button.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";
import Panel from "../components/ui/Panel.jsx";
import { initialAssignments, isValid, validateAssignments } from "../features/mapping/mappingState.js";
import ProgressPanel from "../features/run/ProgressPanel.jsx";
import { startRun } from "../features/run/runController.js";
import { runStore, useRunState } from "../features/run/runStore.js";

/** Reads the project's current state so Run can be blocked, with the reason shown. */
async function loadPreflight(id) {
  const [mapping, rules] = await Promise.all([api.getMapping(id), api.getRules(id)]);
  const mappingOk = mapping.sheets.every((sheet) =>
    isValid(validateAssignments(initialAssignments(sheet, mapping.confirmed?.[sheet.file]), mapping.required)),
  );
  return {
    files: mapping.sheets.map((s) => s.file),
    mappingOk,
    enabledRules: rules.rules.filter((r) => r.enabled).length,
    totalRules: rules.rules.length,
    preset: rules.preset,
  };
}

export default function Run() {
  const { id } = useParams();
  const navigate = useNavigate();
  const run = useRunState();
  const [pre, setPre] = useState(null);
  const [error, setError] = useState("");
  const [startError, setStartError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const busy = useRef(false);

  function load() {
    loadPreflight(id)
      .then((p) => {
        setError("");
        setPre(p);
      })
      .catch((e) => setError(e.message));
  }
  useEffect(load, [id]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!pre) return <p role="status">Loading summary</p>;

  const finished = run.projectId === id && run.status === "finished";
  const resultPath = `/projects/${id}/result?run=${run.runId}`;

  async function onRun() {
    if (busy.current) return;
    busy.current = true;
    setStartError("");
    try {
      const started = await startRun(id, { fileNames: pre.files });
      if (!started) return;
      setLeaving(true);
      await new Promise((resolve) => setTimeout(resolve, pageDurationMs()));
      // A run that failed straight away cancels the transition.
      if (runStore.getState().status === "failed") {
        setLeaving(false);
        return;
      }
      navigate(`/projects/${id}/result?run=${started.id}`);
    } catch (e) {
      setLeaving(false);
      setStartError(e.message || "The run could not be started.");
    } finally {
      busy.current = false;
    }
  }

  const reason = !pre.mappingOk ? "Mapping is incomplete." : pre.files.length === 0 ? "No files uploaded." : "";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {leaving && <FileChip names={pre.files} className="chip-to-corner fixed left-4 top-4 z-10" />}
      <h1 className="text-2xl font-semibold">Run</h1>
      <Panel title="Before you run">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase text-soft-white/60">Files</dt>
            <dd>
              <FileChip names={pre.files} />
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-soft-white/60">Mapping</dt>
            <dd>{pre.mappingOk ? "Complete" : <Link className="underline" to={`/projects/${id}/mapping`}>Incomplete: fix it</Link>}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-soft-white/60">Rules</dt>
            <dd>
              {pre.enabledRules} of {pre.totalRules} enabled ({pre.preset})
            </dd>
          </div>
        </dl>
        {reason && (
          <p role="alert" className="mt-3 text-sm text-data-tq">
            {reason}
          </p>
        )}
        {startError && (
          <p role="alert" className="mt-3 text-sm text-data-tq">
            {startError}
          </p>
        )}
        <div className="mt-4">
          {finished ? (
            <Button onClick={() => navigate(resultPath)}>View result</Button>
          ) : (
            <Button disabled={Boolean(reason) || leaving || run.status === "running"} onClick={onRun}>
              Run
            </Button>
          )}
        </div>
      </Panel>
      {run.projectId === id && run.status !== "idle" && <ProgressPanel onRetry={onRun} />}
    </div>
  );
}

