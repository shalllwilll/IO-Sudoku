// This run's own change summary, from GET /runs/{id}/impact. Shown only on a revision run (the
// backend returns available: true only then) — the fuller compare-any-two view lives on the
// project's Revisions page.
const dash = (v) => (v === undefined || v === null ? "—" : v);

function Tile({ label, value }) {
  return (
    <div className="rounded-xl border border-steel p-3">
      <dt className="text-[10px] uppercase text-soft-white/60">{label}</dt>
      <dd className="text-xl font-semibold">{value}</dd>
    </div>
  );
}

export default function ImpactTab({ impact }) {
  return (
    <div className="space-y-4">
      <p className="text-sm">
        Revision <strong>{impact.label}</strong> against baseline <strong>{impact.baseline_label}</strong>.
      </p>
      <dl className="grid grid-cols-4 gap-3">
        <Tile label="Added" value={dash(impact.added)} />
        <Tile label="Removed" value={dash(impact.removed)} />
        <Tile label="Moved" value={dash(impact.moved)} />
        <Tile label="Unchanged" value={dash(impact.unchanged)} />
      </dl>
      {impact.moves_by_reason && Object.keys(impact.moves_by_reason).length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Why signals moved</h3>
          <ul className="space-y-1 text-sm">
            {Object.entries(impact.moves_by_reason).map(([reason, count]) => (
              <li key={reason} className="flex justify-between">
                <span className="capitalize">{reason.replace(/_/g, " ")}</span>
                <span>{count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-soft-white/70">
        Solver: {dash(impact.solver)} · {dash(impact.total_baseline)} signals in the baseline, {dash(impact.total_revised)} in this revision.
      </p>
    </div>
  );
}
