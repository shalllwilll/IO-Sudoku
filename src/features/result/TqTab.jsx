import { useMemo, useState } from "react";
import { api } from "../../api/index.js";
import { buildAnswerBody, scopesFor, TQ_SEVERITY } from "../../api/live/wire.js";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import { locateTq } from "./resultModel.js";

const PAGE = 50;
export const MAX_ANSWER = 1000;
const TONE = { blocking: "low", assumed: "medium", info: "neutral" };
const SCOPE_LABEL = { everywhere: "Everywhere", cable: "This cable", row: "This row" };

function TqCard({ tq, projectId, model, onShow, onAnswered }) {
  const [option, setOption] = useState(tq.options?.[0]?.label ?? "");
  const [scope, setScope] = useState("everywhere");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [noPosition, setNoPosition] = useState(false);

  const chosen = tq.options?.find((o) => o.label === option);

  async function submit() {
    if (busy) return;
    if (value.length > MAX_ANSWER) return setError(`Value is ${value.length} characters. The limit is ${MAX_ANSWER}.`);
    setBusy(true);
    setError("");
    try {
      const out = await api.answerTq(projectId, tq.id, buildAnswerBody(tq, { option, scope, value }));
      onAnswered(out.tq);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl border border-steel p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <code className="text-xs">{tq.code}</code>
        <Badge tone={TONE[tq.severity] ?? "neutral"}>{tq.severity}</Badge>
        <Badge>{tq.status}</Badge>
        <Button
          variant="ghost"
          className="ml-auto !px-3 !py-1"
          onClick={() => {
            const hit = locateTq(model, tq);
            setNoPosition(!hit);
            if (hit) onShow(hit);
          }}
        >
          Show in view
        </Button>
      </div>
      <p className="mt-2">{tq.message}</p>
      <p className="mt-1 text-xs text-soft-white/70">Default applied: {tq.default_applied || "none"}</p>
      {noPosition && <p className="mt-1 text-xs text-data-output">This TQ has no position in the view.</p>}
      {tq.status === "answered" ? (
        <p className="mt-2 text-xs">Answer: {tq.answer}</p>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {tq.options?.length > 0 && (
              <select aria-label={`Option for ${tq.code}`} value={option} onChange={(e) => setOption(e.target.value)} className="focus-ring rounded-xl border border-steel bg-gunmetal px-2 py-1 text-xs">
                {tq.options.map((o) => (
                  <option key={o.label} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            <select aria-label={`Scope for ${tq.code}`} value={scope} onChange={(e) => setScope(e.target.value)} className="focus-ring rounded-xl border border-steel bg-gunmetal px-2 py-1 text-xs">
              {scopesFor(tq).map((s) => (
                <option key={s} value={s}>
                  {SCOPE_LABEL[s]}
                </option>
              ))}
            </select>
            <input aria-label={`Value for ${tq.code}`} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value, if the option needs one" className="focus-ring min-w-0 flex-1 rounded-full border border-steel bg-gunmetal px-3 py-1 text-xs" />
            <Button disabled={busy || !option} onClick={submit}>
              Answer
            </Button>
          </div>
          {chosen && <p className="text-xs text-soft-white/70">If you choose this: {chosen.consequence}</p>}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-data-tq">
          {error}
        </p>
      )}
    </li>
  );
}

export default function TqTab({ projectId, tqs, report, model, onShow, onAnswered }) {
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tqs.filter(
      (t) =>
        (severity === "all" || t.severity === severity) &&
        (status === "all" || t.status === status) &&
        (!q || `${t.code} ${t.message} ${t.subject ?? ""}`.toLowerCase().includes(q)),
    );
  }, [tqs, severity, status, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages - 1);
  const slice = filtered.slice(current * PAGE, current * PAGE + PAGE);
  const groups = [...new Set(slice.map((t) => t.category))].sort();
  const kpi = report.report.kpi;

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Every signal is either placed or in the TQ list: <strong>{kpi.allocated}</strong> placed, <strong>{kpi.held_out}</strong> in TQs.
      </p>
      <div className="flex flex-wrap gap-2 text-xs">
        <select aria-label="Severity filter" value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(0); }} className="focus-ring rounded-xl border border-steel bg-gunmetal px-2 py-1">
          {["all", ...TQ_SEVERITY].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="Status filter" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} className="focus-ring rounded-xl border border-steel bg-gunmetal px-2 py-1">
          {["all", "open", "answered"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <input aria-label="Search TQs" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="Search" className="focus-ring rounded-full border border-steel bg-gunmetal px-3 py-1" />
      </div>

      {tqs.length === 0 ? (
        <p className="text-sm">No TQs. Every signal was placed.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm">No TQs match the filters.</p>
      ) : (
        groups.map((group) => (
          <section key={group}>
            <h3 className="mb-2 text-xs font-semibold uppercase text-soft-white/70">{group}</h3>
            <ul className="space-y-2">
              {slice
                .filter((t) => t.category === group)
                .map((tq) => (
                  <TqCard key={tq.id} tq={tq} projectId={projectId} model={model} onShow={onShow} onAnswered={onAnswered} />
                ))}
            </ul>
          </section>
        ))
      )}

      {pages > 1 && (
        <div className="flex items-center gap-3 text-xs">
          <Button variant="secondary" disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous
          </Button>
          Page {current + 1} of {pages}
          <Button variant="secondary" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
