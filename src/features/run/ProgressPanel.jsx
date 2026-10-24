import Button from "../../components/ui/Button.jsx";
import { cancelRun } from "./runController.js";
import { useRunState } from "./runStore.js";

/** Stage progress, a short event log, and Cancel while running. */
export default function ProgressPanel({ onRetry }) {
  const run = useRunState();
  const percent = run.status === "completed" ? 100 : run.totalStages ? Math.round((run.doneStages / run.totalStages) * 100) : 0;

  return (
    <section aria-label="Run progress" className="rounded-panel border border-steel bg-carbon p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">
          {run.status === "completed" && "Run completed"}
          {run.status === "running" && "Running"}
          {run.status === "failed" && "Run failed"}
          {run.status === "cancelled" && "Run cancelled"}
          {run.status === "idle" && "No run yet"}
        </h2>
        {run.status === "running" && (
          <Button variant="secondary" onClick={cancelRun}>
            Cancel
          </Button>
        )}
      </div>

      <div
        role="progressbar"
        aria-label="Run progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-3 h-2 overflow-hidden rounded-full bg-gunmetal"
      >
        <div className="h-full bg-soft-white transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-sm text-soft-white/80">
        {run.stage ? `Stage: ${run.stage}` : "Waiting for the first update"} · {run.placed} signals placed · {run.tqs.length} TQs
      </p>

      {run.notice && (
        <p role="status" className="mt-2 text-sm text-data-output">
          {run.notice}
        </p>
      )}
      {run.error && (
        <p role="alert" className="mt-2 text-sm text-data-tq">
          {run.error}
        </p>
      )}
      {(run.status === "failed" || run.status === "cancelled") && onRetry && (
        <Button className="mt-3" onClick={onRetry}>
          Run again
        </Button>
      )}

      <ol className="mt-4 max-h-40 space-y-1 overflow-y-auto text-xs text-soft-white/70" aria-label="Event log">
        {run.log.slice(-10).map((entry) => (
          <li key={entry.seq}>{entry.text}</li>
        ))}
      </ol>
    </section>
  );
}
