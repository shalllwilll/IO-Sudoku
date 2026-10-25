import { STATUS, issueResolved } from "./model.js";
import { UNKNOWN_IO, isSpareRecord, positionIo, recordIo } from "./ioTypes.js";
import { areaText } from "./displayNames.js";

export const nodeIo = (node, dataset) => node?.io ?? positionIo((node?.recordIds ?? []).map((id) => dataset.recordMap.get(id)));

export function slotIndicator(node, dataset) {
  const ids = new Set(node.recordIds.flatMap((id) => dataset.recordMap.get(id)?.issueIds ?? []));
  const issues = [...ids].map((id) => dataset.issues.find((issue) => issue.id === id)).filter((issue) => issue && (issue.kind === "tq" || !issueResolved(issue)));
  if (issues.some((issue) => issue.severity === "error" || issue.hintSeverity === "error")) return { color: STATUS.error.color, cue: "×", label: "Error / conflict / source error hint" };
  if (issues.some((issue) => issue.kind === "tq")) return { color: STATUS.error.color, cue: "TQ", label: "TQ present (see source status)" };
  if (issues.some((issue) => issue.severity !== "info")) return { color: STATUS.warning.color, cue: "!", label: "Warning" };
  if (issues.length) return { color: "#b8d9f5", cue: "i", label: "Information" };
  return null;
}

export function IoTypeBadge({ record, definition, compact = false }) {
  const info = definition ?? (record ? recordIo(record) : UNKNOWN_IO);
  return <span className="explorer-io-badge" data-io-type={info.code} data-io-color={info.color}>
    <span aria-hidden="true" className="explorer-io-swatch" style={{ backgroundColor: info.color }} />
    <span>{info.code === "UNKNOWN" ? info.name : info.code === "SPARE" ? info.name : compact ? info.code : `${info.code} — ${info.name}`}</span>
  </span>;
}

export const allocationText = (record) => isSpareRecord(record) ? record.kind === "wired spare" ? "Wired spare" : record.kind === "reserved spare" ? "Reserved spare" : "Unused / spare position" : record.nodeId ? "Allocated" : "Unallocated";

export function AllocationBadge({ record }) {
  return <span className="explorer-allocation-badge">{allocationText(record)}</span>;
}

export function RecordValidation({ record }) {
  return <div className="explorer-validation-note">
    <p>Application engineering validation: <strong>not run</strong>.</p>
    {record.validation && <p>Imported source result: <strong>{record.validation}</strong>. This is a source assertion, not a completed application check.</p>}
    {record.visualizationHint && <p>Workbook visualization hint: {record.visualizationHint} (illustrative, not validation).</p>}
  </div>;
}

export function SlotHoverCard({ node, dataset }) {
  const info = nodeIo(node, dataset);
  const rows = node.recordIds.map((id) => dataset.recordMap.get(id));
  const indicator = slotIndicator(node, dataset);
  return <div role="tooltip" id="charm-slot-hover" className="explorer-slot-card">
    <IoTypeBadge definition={info} />
    {info.conflict && <p className="mt-1 text-xs">Conflicting source types; no single I/O type chosen.</p>}
    {!rows.length && <p className="mt-2 text-xs">Unused position · no source signal assigned.</p>}
    {rows.slice(0, 4).map((record) => <section key={record.id} className="mt-2 border-t border-steel pt-2">
      {/* Function first, then where it is wired, then its status. Spares show a status, not a name. */}
      <strong className="block break-words text-sm">{record.displayName || (isSpareRecord(record) ? allocationText(record) : "Signal name unavailable")}</strong>
      {record.tag && <p className="text-xs">Tag: <span className="font-medium">{record.tag}</span></p>}
      {rows.length > 1 && <IoTypeBadge record={record} />}
      <p className="text-xs">I/O type: {record.ioType ? `${record.ioType} — ${recordIo(record).name}` : "Unavailable"}</p>
      {record.equipment && <p className="text-xs">Equipment: {record.equipment}</p>}
      {record.description && !isSpareRecord(record) && <p className="text-xs">Service: {record.description}</p>}
      {(record.area || record.unit) && <p className="text-xs">{[record.area && areaText(record.area), record.unit && `Unit ${record.unit}`].filter(Boolean).join(" · ")}</p>}
      <p className="mt-1 text-xs">{record.cabinetDisplay ? `${record.cabinetDisplay} (${record.cabinet})` : record.cabinet || "Cabinet unavailable"}{record.controller ? ` · ${record.controller}` : ""}</p>
      <p className="text-xs">{record.cioc || "CIOC unavailable"} / {record.baseplate || "Baseplate unavailable"} / Channel {record.channel || "unavailable"} · CHARM {record.charm || "unavailable"}</p>
      {(record.cable || record.pair) && <p className="text-xs">Cable {record.cable || "unavailable"}{record.pair ? ` · ${record.pair}` : ""}</p>}
      <div className="mt-1"><AllocationBadge record={record} /><span className="explorer-validation-note">Engineering validation: not run</span></div>
      {record.issueIds.map((id) => { const issue = dataset.issues.find((item) => item.id === id); return <p key={id} className="mt-1 text-xs">{issue.kind === "tq" && !/^TQ/i.test(issue.reference) ? `TQ ${issue.reference}` : issue.reference}{issue.severity && issue.severity !== "unknown" ? ` · ${issue.severity}` : ""}{issue.status && issue.status !== "unknown" ? ` · ${issue.status}` : ""}: {issue.message}</p>; })}
    </section>)}
    {indicator && <p className="mt-2 text-xs" style={{ color: indicator.color }}>{indicator.cue} {indicator.label}</p>}
    {rows.length > 4 && <p className="mt-2 text-xs">{rows.length - 4} additional source records. Click the slot to inspect all.</p>}
  </div>;
}

export function ValidationChecks({ dataset }) {
  const diagnosticCount = (kind) => dataset.issues.filter((issue) => issue.kind === kind).length;
  const unknown = dataset.records.filter((record) => recordIo(record).code === "UNKNOWN").length;
  return <details className="explorer-validation-checks">
    <summary>Validation checks: local import checks completed · application engineering validation not run</summary>
    <ul className="mt-2 list-disc space-y-1 pl-5">
      <li>{dataset.source === "run" ? "Existing allocation-run responses normalized. Mock run data is not live engineering validation." : "Workbook/CSV read and explicit column mapping completed."}</li>
      <li>Hardware reference / positive integer channel checks run: {diagnosticCount("missing-location")} unplaced records.</li>
      <li>Duplicate physical assignment checks run: {diagnosticCount("conflict")} conflicting positions.</li>
      <li>Duplicate tag identity checks run: {diagnosticCount("duplicate-tag")} ambiguous tag groups.</li>
      <li>I/O classification run: {unknown} records have Unknown I/O Type. Spare positions are classified separately.</li>
    </ul>
    <p className="mt-2">Incomplete: application engineering validation, CHARM/electrical compatibility, capacity, cabling, segregation, allocation-rule enforcement, and live backend validation. These local import checks do not establish engineering validity.</p>
    <p className="mt-2">Workbook status assertions, synthetic scenarios, and visualization colors are source information. They cannot mark an assignment application-validated.</p>
  </details>;
}
