import Badge from "../../components/ui/Badge.jsx";
import { crossCheck } from "./crossCheck.js";

const dash = (v) => (v === undefined || v === null ? "—" : v);

function Tile({ label, value }) {
  return (
    <div className="rounded-xl border border-steel p-3">
      <dt className="text-[10px] uppercase text-soft-white/60">{label}</dt>
      <dd className="text-xl font-semibold">{value}</dd>
    </div>
  );
}

const PassFail = ({ pass }) => (pass ? <Badge tone="high">✓ Pass</Badge> : <Badge tone="low">✗ Fail</Badge>);

/** Displays the numbers the API returns. Nothing is recomputed here. */
export default function ReportTab({ report, model, tqs }) {
  const r = report.report;
  const kpi = r.kpi;
  const mismatches = model ? crossCheck(report, model) : [];
  if (mismatches.length) console.warn("[report] report and view disagree", mismatches.length);
  const openTqs = tqs.filter((t) => t.status !== "answered").length;
  const violations = r.rules.reduce((n, rule) => n + (rule.violations ?? 0), 0);

  return (
    <div className="space-y-5">
      {mismatches.length > 0 && (
        <div role="alert" className="rounded-xl border border-data-tq p-3 text-sm">
          <strong>Report and view disagree</strong>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {mismatches.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      <dl className="grid grid-cols-3 gap-3">
        <Tile label="Cabinets needed" value={kpi.cabinets} />
        <Tile label="CIOCs needed" value={kpi.ciocs} />
        <Tile label="Signals allocated" value={`${kpi.allocated} of ${kpi.signals_total}`} />
        <Tile label="Open TQs" value={openTqs} />
        <Tile label="Rule violations" value={violations} />
        <Tile label="Utilisation" value={`${Math.round(kpi.utilisation * 100)}%`} />
      </dl>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Per cabinet</h3>
        <table className="w-full text-left text-xs">
          <thead className="uppercase text-soft-white/60">
            <tr>
              <th>Cabinet</th>
              <th>CIOCs used</th>
              <th>Baseplates used of 32</th>
              <th>Fill (of 384)</th>
              <th>Wired spare pairs</th>
              <th>Free slots</th>
              <th>Empty baseplates</th>
            </tr>
          </thead>
          <tbody>
            {(kpi.spares.cabinets ?? []).map((c) => (
              <tr key={c.cabinet} className="border-t border-steel/50">
                <td className="py-1">{c.cabinet}</td>
                <td>{dash(c.ciocs_used)}</td>
                <td>{dash(c.baseplates_used)}</td>
                <td>{dash(c.fill)}</td>
                <td>{dash(c.wired_spare_pairs)}</td>
                <td>{dash(c.free_slots)}</td>
                <td>{dash(c.empty_baseplates)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Spare compliance</h3>
        <table className="w-full text-left text-xs">
          <thead className="uppercase text-soft-white/60">
            <tr>
              <th>Scope</th>
              <th>Target %</th>
              <th>Actual %</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {(kpi.spares.cabinets ?? []).map((c) => (
              <tr key={`c-${c.cabinet}`} className="border-t border-steel/50">
                <td className="py-1">{c.cabinet}</td>
                <td>{dash(c.target)}</td>
                <td>{dash(c.actual)}</td>
                <td>{c.target === undefined ? "—" : <PassFail pass={c.actual >= c.target} />}</td>
              </tr>
            ))}
            {(kpi.spares.by_controller_io ?? []).map((c) => (
              <tr key={`io-${c.controller}-${c.io_type}`} className="border-t border-steel/50">
                <td className="py-1">
                  Controller {c.controller}, {c.io_type}
                </td>
                <td>{dash(c.target)}</td>
                <td>{dash(c.actual)}</td>
                <td>{c.target === undefined ? "—" : <PassFail pass={c.actual >= c.target} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Rule check</h3>
        <table className="w-full text-left text-xs">
          <thead className="uppercase text-soft-white/60">
            <tr>
              <th>Rule</th>
              <th>Status</th>
              <th>Signals touched</th>
              <th>Violations</th>
            </tr>
          </thead>
          <tbody>
            {r.rules.map((rule) => (
              <tr key={rule.id} className="border-t border-steel/50">
                <td className="py-1">{rule.name}</td>
                <td>
                  {rule.status === "not_enforced" ? (
                    <span>
                      <Badge tone="medium">Not enforced</Badge> {rule.not_enforced_reason}
                    </span>
                  ) : (
                    <PassFail pass={rule.status === "pass"} />
                  )}
                </td>
                <td>{dash(rule.touched)}</td>
                <td>{dash(rule.violations)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-soft-white/70">
        Solver: {dash(r.solver)} · Pack hash: {dash(r.pack_hash)}
      </p>
    </div>
  );
}
