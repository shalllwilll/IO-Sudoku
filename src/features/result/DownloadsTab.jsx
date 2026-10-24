import { useEffect, useState } from "react";
import { api } from "../../api/index.js";
import Button from "../../components/ui/Button.jsx";
import { saveBlob, saveCsv, saveJson } from "../../lib/download.js";

/**
 * Every deliverable for a finished run. Only the allocated workbook is a real backend file
 * (GET /runs/{id}/download); the backend has no endpoint for a rule-check report, TQ list,
 * declaration page or run log as separate files, so those are built here from data this page
 * already holds (docs/contract-gaps.md). A revision report needs this run's impact.
 */
export default function DownloadsTab({ projectId, runId, report, tqs, impact }) {
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .getRun(projectId, runId)
      .then((r) => alive && setRun(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [projectId, runId]);

  async function trigger(name, action) {
    setBusy(name);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e.message || "The download failed.");
    } finally {
      setBusy(null);
    }
  }

  const kpi = report.report.kpi;
  const items = [
    {
      id: "workbook",
      title: "Allocated workbook",
      detail: "The allocation written into the output template.",
      ready: true,
      action: async () => {
        const { blob, filename } = await api.downloadAllocation(projectId, runId);
        saveBlob(blob, filename);
      },
    },
    {
      id: "report",
      title: "Rule-check report",
      detail: "KPIs, spare compliance and rule results, as CSV.",
      ready: true,
      action: async () => {
        const rows = [
          ["Metric", "Value"],
          ["Cabinets", kpi.cabinets],
          ["CIOCs", kpi.ciocs],
          ["Signals allocated", `${kpi.allocated} of ${kpi.signals_total}`],
          ["Utilisation", kpi.utilisation],
          [],
          ["Rule", "Description", "Passed", "Violations", "Strength"],
          ...report.report.rules.map((r) => [r.rule, r.description, r.passed ? "yes" : "no", r.violations, r.strength ?? ""]),
        ];
        await saveCsv(rows, `rule-check_${runId}.csv`);
      },
    },
    {
      id: "tqs",
      title: "TQ list",
      detail: `${tqs.length} technical queries, as CSV.`,
      ready: true,
      action: async () => {
        const rows = [
          ["Code", "Category", "Severity", "Status", "Subject", "Message", "Answer"],
          ...tqs.map((t) => [t.code, t.category, t.severity, t.status, t.subject, t.message, t.answer ?? ""]),
        ];
        await saveCsv(rows, `tqs_${runId}.csv`);
      },
    },
    {
      id: "declaration",
      title: "Declaration page",
      detail: "The rule set, assumptions and defaults, as JSON.",
      ready: true,
      action: () => saveJson(report.report.declaration, `declaration_${runId}.json`),
    },
    {
      id: "revision-report",
      title: "Revision report",
      detail: impact?.available ? "This revision's change summary, as CSV." : "Only available for a revision run.",
      ready: Boolean(impact?.available),
      action: async () => {
        const rows = [["Field", "Value"], ...Object.entries(impact.impact).filter(([k]) => k !== "moves_by_reason")];
        await saveCsv(rows, `revision-report_${runId}.csv`);
      },
    },
    {
      id: "run-log",
      title: "Run log",
      detail: run ? "Status and timestamps for this run, as JSON." : "Loading the run's details.",
      ready: Boolean(run),
      action: () => saveJson(run, `run-log_${runId}.json`),
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-soft-white/80">
        The workbook is the backend's own file. The others are generated from this page, so they match what is shown here exactly.
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-steel p-3">
            <div>
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-xs text-soft-white/70">{item.detail}</p>
            </div>
            <Button
              variant="secondary"
              disabled={!item.ready || busy === item.id}
              onClick={() => trigger(item.id, item.action)}
              aria-label={`Download ${item.title}`}
            >
              {busy === item.id ? "Preparing" : "Download"}
            </Button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-data-tq">
          {error}
        </p>
      )}
    </div>
  );
}
