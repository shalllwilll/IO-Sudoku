import { useState } from "react";
import { ancestors, STATUS } from "./model.js";
import { AllocationBadge, IoTypeBadge, RecordValidation, allocationText, nodeIo } from "./IoPresentation.jsx";
import { areaText, nodeLabel } from "./displayNames.js";
import TqCard from "./TqCard.jsx";

export function StatusBadge({ status }) {
  const style = STATUS[status] ?? STATUS.unverified;
  return <span className="explorer-status" style={{ color: style.textColor || style.color }}><span aria-hidden="true">{style.cue}</span> {style.label}</span>;
}

export function Filters({ dataset, filters, onChange, onClear }) {
  const select = (field, label, options) => <label key={field} className="explorer-field">{label}<select value={filters[field] ?? ""} onChange={(event) => onChange(field, event.target.value)}><option value="">All</option>{options.map((option) => typeof option === "string" ? <option key={option}>{option}</option> : <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  const distinct = (key) => [...new Set(dataset.records.map((record) => record[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  return <div className="space-y-3">
    <label className="explorer-field">Search signals<input placeholder="Tag, description, CHARM, cable…" value={filters.search} onChange={(event) => onChange("search", event.target.value)} /></label>
    <div className="grid grid-cols-2 gap-2">
      {select("cabinet", "Cabinet", distinct("cabinet"))}
      {select("cioc", "CIOC / CSLS", distinct("cioc"))}
      {select("baseplate", "Baseplate", distinct("baseplate"))}
      {select("ioType", "I/O type", distinct("ioType"))}
    </div>
    <details><summary className="cursor-pointer text-xs text-soft-white/80">More filters</summary><div className="mt-3 grid grid-cols-2 gap-2">
      {select("signalType", "Signal type", distinct("signalType"))}
      {select("charm", "CHARM identifier", distinct("charm"))}
      {select("status", "Allocation status", Object.entries(STATUS).map(([value, style]) => ({ value, label: style.label })))}
      {select("issues", "Issues", [{ value: "with", label: "With issues" }, { value: "without", label: "Without issues" }])}
      {select("tq", "TQs", [{ value: "with", label: "With unresolved TQs" }, ...[...new Set(dataset.issues.filter((issue) => issue.kind === "tq").map((issue) => issue.status || "unknown"))].map((status) => ({ value: status, label: `TQ status: ${status}` }))])}
      {select("revision", "Revision", distinct("revision"))}
      {select("change", "Change category", distinct("change"))}
    </div></details>
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(filters.selectedOnly)} onChange={(event) => onChange("selectedOnly", event.target.checked)} />Selected signals only</label>
    <button type="button" className="explorer-button w-full" onClick={onClear}>Clear filters and signal selection</button>
  </div>;
}

function TreeNode({ dataset, id, selectedId, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const node = dataset.nodes.get(id);
  return <li className="mt-1">
    <div className="flex items-center gap-1">
      {node.childIds.length > 0 && <button type="button" className="explorer-tree-toggle" aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} ${node.label}`} onClick={() => setExpanded((value) => !value)}>{expanded ? "−" : "+"}</button>}
      <button type="button" aria-pressed={id === selectedId} className={`explorer-tree-node ${id === selectedId ? "is-selected" : ""}`} onClick={() => onSelect(id)}>
        <span title={node.label}>{nodeLabel(node)}</span><span className="ml-1 text-soft-white/70">{node.type !== "position" ? `(${node.summary.signals})` : nodeIo(node, dataset).code}</span>
      </button>
    </div>
    {expanded && <ul className="ml-3 border-l border-steel pl-2">{node.childIds.map((child) => <TreeNode key={child} dataset={dataset} id={child} selectedId={selectedId} onSelect={onSelect} />)}</ul>}
  </li>;
}

export function HardwareTree({ dataset, selectedId, onSelect }) {
  return <ul aria-label="Equipment hierarchy">{dataset.root.childIds.map((id) => <TreeNode key={id} dataset={dataset} id={id} selectedId={selectedId} onSelect={onSelect} />)}</ul>;
}

export function SignalList({ records, selectedIds, activeRecordId, onToggle, onInspect }) {
  const [limit, setLimit] = useState(100);
  return <div>
    <p className="mb-2 text-xs text-soft-white/80">{records.length.toLocaleString()} matching records · showing {Math.min(limit, records.length)}</p>
    <ul aria-label="Signal records" className="space-y-1">
      {records.slice(0, limit).map((record) => <li key={record.id} className={`explorer-record ${activeRecordId === record.id ? "is-selected" : ""}`}>
        <input type="checkbox" aria-label={`Select source row ${record.sourceRow} ${record.tag || record.kind || "unlabelled record"}`} checked={selectedIds.has(record.id)} onChange={() => onToggle(record.id)} />
        <button className="min-w-0 flex-1 text-left" type="button" onClick={() => onInspect(record.id)}>
          <span className="block break-words text-xs font-medium">{record.tag || (record.kind === "spare slot" ? "Unused position" : "Unlabelled record")}</span>
          <IoTypeBadge record={record} />
          <span className="mt-0.5 block text-[11px] text-soft-white/75">{record.cioc || "Unplaced"} · row {record.sourceRow}</span>
          <AllocationBadge record={record} />{["error", "warning"].includes(record.status) && <StatusBadge status={record.status} />}
        </button>
      </li>)}
    </ul>
    {!records.length && <p className="text-sm text-soft-white/80">No records match these filters.</p>}
    {limit < records.length && <button type="button" className="explorer-button mt-3 w-full" onClick={() => setLimit((value) => value + 100)}>Show next 100 records</button>}
  </div>;
}

export function IssueList({ dataset, records, selectedIssueId, onInspect, compact = false }) {
  const [kind, setKind] = useState("");
  const [severity, setSeverity] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [limit, setLimit] = useState(100);
  const recordIds = new Set(records.map((record) => record.id));
  const issues = dataset.issues.filter((issue) => (!kind || (kind === "error" ? issue.severity === "error" : kind === "warning" ? issue.severity !== "error" && issue.kind !== "tq" : issue.kind === "tq")) && (!severity || issue.severity === severity) && (!status || issue.status === status) && (!issue.nodeIds.length || issue.recordIds.some((id) => recordIds.has(id))) && `${issue.message} ${issue.reference} ${issue.recordIds.map((id) => dataset.recordMap.get(id)?.tag).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="space-y-3">
    {!compact && <><label className="explorer-field">Search issues<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Message, reference, tag…" /></label>
    <div className="grid grid-cols-2 gap-2"><label className="explorer-field">Issue type<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="">All issues</option><option value="error">Errors</option><option value="warning">Warnings / information</option><option value="tq">TQs</option></select></label>
      <label className="explorer-field">Issue severity<select value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="">All severities</option>{[...new Set(dataset.issues.map((issue) => issue.severity))].map((value) => <option key={value}>{value}</option>)}</select></label></div>
    <label className="explorer-field">TQ status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{[...new Set(dataset.issues.map((issue) => issue.status).filter(Boolean))].map((value) => <option key={value}>{value}</option>)}</select></label></>}
    <p className="text-xs text-soft-white/80">{issues.length} issues. Import diagnostics are presentation checks, not engineering validation. Unlocated issues remain listed.</p>
    <ul aria-label="Allocation issues" className="space-y-2">{issues.slice(0, limit).map((issue) => <li key={issue.id}>
      <button type="button" className={`explorer-issue ${selectedIssueId === issue.id ? "is-selected" : ""}`} onClick={() => onInspect(issue.id)}>
        <span className="block text-xs font-semibold" style={{ color: issue.severity === "error" ? STATUS.error.color : issue.severity === "info" ? STATUS.unverified.color : STATUS.warning.color }}>{issue.kind === "tq" ? "TQ" : issue.reference} · {issue.severity}{issue.status ? ` · ${issue.status}` : ""}</span>
        <span className="mt-1 block text-xs">{issue.message}</span>
        <span className="mt-1 block text-[11px] text-soft-white/75">{issue.nodeIds.length ? `${issue.nodeIds.length} hardware location(s)` : "Unplaced / no reliable physical location"}</span>
        {issue.recordIds.slice(0, 3).map((id) => { const record = dataset.recordMap.get(id); return <span key={id} className="mt-1 block break-words text-[11px] text-soft-white/80">{record.tag || `Row ${record.sourceRow}`} · {[record.cabinet, record.cioc, record.baseplate, record.channel].filter(Boolean).join(" / ") || "Unplaced"}</span>; })}
      </button>
    </li>)}</ul>
    {!issues.length && <p className="text-sm text-soft-white/80">No reported issues match. This does not establish engineering validity.</p>}
    {limit < issues.length && <button className="explorer-button" type="button" onClick={() => setLimit((value) => value + 100)}>Show next 100 issues</button>}
  </div>;
}

const DETAIL_FIELDS = { tag: "Tag", description: "Description", ioType: "I/O type", signalType: "Signal type", area: "Operating area", unit: "Unit", charm: "CHARM identifier", charmType: "CHARM type", channel: "Channel", baseplate: "Baseplate", cioc: "CIOC / CSLS", cabinet: "Marshalling cabinet", systemCabinet: "System cabinet", controller: "Controller", terminalBlock: "Terminal block", terminal1: "Terminal 1", terminal2: "Terminal 2", terminal3: "Terminal 3", cable: "Field cable", pair: "Cable pair", equipment: "Equipment", revision: "Revision", change: "Change category" };

// Readable labels sit beside the exact source identifiers and never replace them.
function detailValue(record, field) {
  if (field === "area") return record.area ? areaText(record.area) : "";
  if (field === "cabinet") return record.cabinetDisplay ? `${record.cabinetDisplay} (${record.cabinet})` : record.cabinet;
  return record[field];
}

function RecordDetails({ record, dataset }) {
  return <article className="explorer-record-details">
    <h3 className="text-sm font-semibold">{record.displayName || record.tag || allocationText(record) || `Source row ${record.sourceRow}`}</h3>
    {record.displayName && record.tag && <p className="text-xs">Tag: {record.tag}</p>}
    <IoTypeBadge record={record} /><div className="mt-1"><AllocationBadge record={record} />{["error", "warning"].includes(record.status) && <StatusBadge status={record.status} />}</div>
    <RecordValidation record={record} />
    <dl className="explorer-dl">{Object.entries(DETAIL_FIELDS).map(([field, label]) => <div key={field}><dt>{label}</dt><dd>{detailValue(record, field) || "Unavailable"}</dd></div>)}</dl>
    <p className="mt-3 break-words text-xs text-soft-white/80">Source: {record.sourceFile || "Unavailable"} · {record.sourceSheet || "sheet unavailable"} · row {record.sourceRow || "unavailable"}</p>
    {record.issueIds.length > 0 && <ul className="mt-3 space-y-2 text-xs">{record.issueIds.map((id) => { const issue = dataset.issues.find((item) => item.id === id); return <li key={id}>{issue.kind === "tq" ? <TqCard issue={issue} dataset={dataset} /> : <><strong>{issue.reference} · {issue.severity}</strong><br />{issue.message}</>}</li>; })}</ul>}
    {record.sourceValues && <details className="mt-4"><summary className="cursor-pointer text-xs">All source columns</summary><dl className="explorer-dl">{record.sourceValues.map((entry, index) => <div key={index}><dt>{entry.header}</dt><dd>{entry.value || "Unavailable"}</dd></div>)}</dl></details>}
  </article>;
}

export function SelectionDetails({ dataset, selectedId, activeRecordId, issueId, onSelect, onInspect }) {
  const node = dataset.nodes.get(selectedId);
  const activeRecord = dataset.recordMap.get(activeRecordId);
  const issue = dataset.issues.find((item) => item.id === issueId);
  const positionRecords = node?.type === "position" ? node.recordIds.map((id) => dataset.recordMap.get(id)) : [];
  const records = positionRecords.length > 1 ? positionRecords : activeRecord ? [activeRecord] : positionRecords;
  return <div className="space-y-4">
    <h2 className="text-sm font-semibold">Inspection details</h2>
    {issue && <section className="rounded-xl border border-steel p-3 text-xs">{issue.kind === "tq" ? <TqCard issue={issue} dataset={dataset} /> : <><h3 className="font-semibold">{issue.reference} · {issue.severity}</h3><p className="mt-2">{issue.message}</p></>}<p className="mt-2 text-soft-white/80">{issue.nodeIds.length ? "Related source records:" : "This issue has no reliable hardware location. The camera has not been moved to an unrelated position."}</p><ul className="mt-2 space-y-2">{issue.recordIds.map((id) => { const record = dataset.recordMap.get(id); return <li key={id}><button type="button" className="underline" onClick={() => onInspect(id)}>{record.tag || `Row ${record.sourceRow}`} · {record.baseplate || "unplaced"} / {record.channel || "—"}</button></li>; })}</ul></section>}
    {node && <>
      <div><span className="text-xs uppercase tracking-wider text-soft-white/75">{node.type}</span><h3 className="mt-1 break-words text-base font-semibold">{nodeLabel(node)}</h3>{node.display && <p className="text-xs text-soft-white/80">Source identifier: {node.label}{node.areaCode ? ` · ${areaText(node.areaCode)}` : ""}</p>}{node.type === "position" && <IoTypeBadge definition={nodeIo(node, dataset)} />}{["error", "warning"].includes(node.status) && <div><StatusBadge status={node.status} /></div>}</div>
      <nav aria-label="Selected hardware parents" className="flex flex-wrap gap-2 text-xs">{ancestors(dataset, node.id).slice(0, -1).map((parent) => <button type="button" className="underline" key={parent.id} onClick={() => onSelect(parent.id)} title={parent.label}>{nodeLabel(parent)}</button>)}</nav>
      {node.type !== "position" && <><dl className="explorer-dl"><div><dt>Source records</dt><dd>{node.summary.records}</dd></div><div><dt>Active signals</dt><dd>{node.summary.signals}</dd></div><div><dt>Occupied records</dt><dd>{node.summary.occupied}</dd></div><div><dt>Spare records</dt><dd>{node.summary.spares}</dd></div><div><dt>Related issues</dt><dd>{node.summary.issues}</dd></div></dl>
        <ul aria-label="Selected hardware children" className="space-y-1">{node.childIds.map((id) => { const child = dataset.nodes.get(id); return <li key={id}><button type="button" className="explorer-child" onClick={() => onSelect(id)} title={child.label}>{nodeLabel(child)}{child.type === "position" && <IoTypeBadge definition={nodeIo(child, dataset)} compact />}<span aria-hidden="true">{STATUS[child.status].cue} →</span></button></li>; })}</ul>
      </>}
      {node.type === "position" && node.recordIds.length > 1 && <p role="alert" className="text-sm" style={{ color: STATUS.error.color }}>Conflicting assignment: all {node.recordIds.length} records are shown below.</p>}
      {node.type === "position" && !node.recordIds.length && <p className="text-sm text-soft-white/80">No record assigned. This position comes from the run's configured hardware layout.</p>}
    </>}
    {records.map((record) => <RecordDetails key={record.id} record={record} dataset={dataset} />)}
    {!node && !activeRecord && !issue && <p className="text-sm text-soft-white/80">Select equipment, a signal, or an issue to inspect its data.</p>}
  </div>;
}
