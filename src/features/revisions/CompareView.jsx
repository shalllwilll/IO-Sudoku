import { useState } from "react";
import { Link } from "react-router-dom";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import Select from "../../components/ui/Select.jsx";
import { api } from "../../api/index.js";
import NaiveToggle from "./NaiveToggle.jsx";

const dash = (v) => (v === undefined || v === null ? "—" : v);
const PAGE = 50;

function Tile({ label, value }) {
  return (
    <div className="rounded-xl border border-steel p-3">
      <dt className="text-[10px] uppercase text-soft-white/60">{label}</dt>
      <dd className="text-xl font-semibold">{value}</dd>
    </div>
  );
}

/** Compares any two revisions in the chain. Counts first, the detail list second (MI-7). */
export default function CompareView({ projectId, chain }) {
  const [from, setFrom] = useState(chain[0]?.label ?? "");
  const [to, setTo] = useState(chain[chain.length - 1]?.label ?? "");
  const [comparison, setComparison] = useState(null);
  const [naive, setNaive] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const sameRun = from === to;
  const toRunId = chain.find((c) => c.label === to)?.run_id;

  async function compare() {
    if (sameRun) {
      setError("Pick two different revisions to compare.");
      return;
    }
    setBusy(true);
    setError("");
    setShown(PAGE);
    try {
      setComparison(await api.compareRevisions(projectId, { from, to }));
    } catch (e) {
      setError(e.message);
      setComparison(null);
    } finally {
      setBusy(false);
    }
  }

  if (chain.length < 2) {
    return <p className="text-sm text-soft-white/70">A single run has nothing to compare. Revise this project once more to compare.</p>;
  }

  const deltas = comparison?.deltas ?? [];
  const movedCount = naive ? comparison?.naive_moved : comparison?.moved;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select label="From" className="w-32" value={from} onChange={(e) => setFrom(e.target.value)} options={chain.map((c) => c.label)} />
        <Select label="To" className="w-32" value={to} onChange={(e) => setTo(e.target.value)} options={chain.map((c) => c.label)} />
        <Button onClick={compare} disabled={busy}>
          {busy ? "Comparing" : "Compare"}
        </Button>
      </div>
      {sameRun && <p className="text-xs text-data-tq">Pick two different revisions.</p>}
      {error && <ErrorState message={error} onRetry={compare} />}

      {comparison && (
        <>
          <dl className="grid grid-cols-5 gap-3">
            <Tile label="Added" value={dash(comparison.added)} />
            <Tile label="Removed" value={dash(comparison.removed)} />
            <Tile label="Moved" value={dash(movedCount)} />
            <Tile label="Modified" value={dash(comparison.modified)} />
            <Tile label="Unchanged" value={dash(comparison.unchanged)} />
          </dl>
          <NaiveToggle naive={naive} onChange={setNaive} available={comparison.naive_moved !== undefined} />

          <ul aria-label="Changed signals" className="space-y-1 text-xs">
            {deltas.slice(0, shown).map((d, i) => (
              <li key={`${d.tag ?? "removed"}-${i}`} className="flex items-center justify-between gap-2 rounded-xl border border-steel/60 px-3 py-2">
                <span className="flex items-center gap-2">
                  <Badge tone={{ Added: "high", Removed: "low", Moved: "medium", Modified: "neutral" }[d.kind] ?? "neutral"}>{d.kind}</Badge>
                  <span>{d.tag ?? "(no tag)"}</span>
                  {d.cable && <span className="text-soft-white/60">{d.cable}{d.pair ? `, pair ${d.pair}` : ""}</span>}
                </span>
                {d.tag && toRunId && (
                  <Link className="underline" to={`/projects/${projectId}/result?run=${toRunId}&highlight=${encodeURIComponent(d.tag)}`}>
                    Show on grid
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {deltas.length === 0 && <p className="text-sm text-soft-white/70">No changes between these two revisions.</p>}
          {shown < deltas.length && (
            <Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, deltas.length - shown)} more (of {deltas.length - shown} remaining)
            </Button>
          )}
        </>
      )}
    </div>
  );
}
