// Read-only run detail. The backend's RunOut carries no separate audit trail, so this shows the
// run record itself — status, timestamps and its summary — rather than a fabricated event log
// (docs/contract-gaps.md).
const dash = (v) => (v === undefined || v === null || v === "" ? "—" : v);

export default function RunLog({ run }) {
  const rows = [
    ["Run id", run.id],
    ["Status", run.status],
    ["Created", run.created_at ? new Date(run.created_at).toLocaleString() : "—"],
    ["Finished", run.finished_at ? new Date(run.finished_at).toLocaleString() : "—"],
    ["Error", dash(run.error)],
  ];
  const summary = run.summary && Object.keys(run.summary).length > 0 ? run.summary : null;

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-gunmetal p-3 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-soft-white/60">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
      {summary && (
        <>
          <dt className="pt-1 text-soft-white/60">Summary</dt>
          <dd className="pt-1">
            {Object.entries(summary).map(([k, v]) => (
              <span key={k} className="mr-3">
                {k}: {String(v)}
              </span>
            ))}
          </dd>
        </>
      )}
    </dl>
  );
}
