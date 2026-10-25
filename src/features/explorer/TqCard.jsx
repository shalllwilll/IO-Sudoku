import { tqGuidance, tqStatusText } from "./tqGuidance.js";
import { issueResolved } from "./model.js";

const where = (record) => [record.cabinetDisplay || record.cabinet, record.cioc, record.baseplate, record.channel && `Channel ${record.channel}`, record.charm && `CHARM ${record.charm}`].filter(Boolean).join(" / ") || "No reliable hardware location";

// One TQ, with the dataset's own message and status, then a general reading of that kind of issue and a
// proposal. The proposal is a suggestion for the owner to confirm, not a finding.
export default function TqCard({ issue, dataset }) {
  const guide = tqGuidance(issue.message);
  const records = issue.recordIds.map((id) => dataset.recordMap.get(id)).filter(Boolean);
  const demo = records.some((record) => /synthetic/i.test(record.dataOrigin ?? ""));
  return <section className="explorer-tq-card" aria-label={`TQ ${issue.reference}`}>
    <h4 className="text-xs font-semibold">{issue.reference} · {issueResolved(issue) ? "Resolved" : tqStatusText(issue.status)}</h4>
    <p className="mt-1 text-xs">{issue.message}</p>
    <dl className="explorer-dl">
      <div><dt>Affected signal</dt><dd>{records.slice(0, 3).map((record) => record.tag || `Row ${record.sourceRow}`).join(", ") || "Unavailable"}{records.length > 3 ? ` +${records.length - 3} more` : ""}</dd></div>
      {records.slice(0, 3).map((record) => <div key={record.id}><dt>Position</dt><dd>{where(record)}</dd></div>)}
      <div><dt>Why it matters</dt><dd>{guide.why}</dd></div>
      <div><dt>Check needed</dt><dd>{guide.check}</dd></div>
      <div><dt>Proposed resolution</dt><dd>{guide.proposal} <em>(proposal, not confirmed by the source data)</em></dd></div>
    </dl>
    {demo && <p className="mt-1 text-[11px] text-soft-white/80">Demonstration case from synthetic data. It does not show a real wiring defect or plant hazard.</p>}
  </section>;
}
