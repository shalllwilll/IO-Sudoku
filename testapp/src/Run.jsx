import { downloadUrl } from "./api.js";

export function RunPanel({ project, run, log, busy, startRun, setTab }) {
  return (
    <div>
      <button onClick={startRun} disabled={busy}>{busy ? "Running..." : "Run allocation"}</button>
      {run && (
        <p>Run {run.id}: {run.status} {run.error && `(${run.error})`}{" "}
          {run.download_ready && <a href={downloadUrl(project.id, run.id)}>Download workbook</a>}{" "}
          {run.status === "finished" && <button onClick={() => setTab("Allocation")}>View allocation</button>}
        </p>
      )}
      {run?.summary?.output_error && <p>Workbook not written: {run.summary.output_error}</p>}
      <pre style={{ background: "#f4f4f4", height: 280, overflow: "auto", fontSize: 11 }}>
        {log.length ? log.join("\n") : "Event log is empty. Start a run."}
      </pre>
    </div>
  );
}
