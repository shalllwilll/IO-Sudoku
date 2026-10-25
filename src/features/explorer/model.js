import { clean } from "./workbook.js";
import { isSpareRecord, positionIo, positionKind, recordIo } from "./ioTypes.js";
import { areaDisplay, cabinetDisplay, signalDisplayName } from "./displayNames.js";

export const STATUS = {
  valid: { label: "Application validated", color: "#60d394", cue: "✓" },
  error: { label: "Error / conflict", color: "#ff767e", cue: "×" },
  warning: { label: "Warning / unresolved TQ", color: "#ffc46b", cue: "!" },
  unverified: { label: "Allocated", color: "#b4bfcd", cue: "·" },
  unused: { label: "Unused position", color: "#58616e", textColor: "#b4bfcd", cue: "○" },
  wired_spare: { label: "Wired spare", color: "#a6aebd", cue: "◇" },
  reserved_spare: { label: "Reserved spare", color: "#a6aebd", cue: "◇" },
  unallocated: { label: "Unplaced / incomplete", color: "#c7a8e8", cue: "—" },
};
const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
export const hardwareId = (...parts) => JSON.stringify(parts.map(String));
const sourceKey = (record) => `${record.sourceFile}:${record.sourceRow}`;
export const issueResolved = (issue) => ["answered", "resolved", "closed"].includes(clean(issue?.status).toLowerCase());
const unknownValidation = new Set(["", "unverified", "unknown", "pending", "not validated"]);

function validationState(value) {
  const status = clean(value).toLowerCase();
  if (["valid", "validated", "passed", "success"].includes(status)) return "valid";
  if (["invalid", "failed", "error", "violation"].includes(status)) return "error";
  if (["warning", "incomplete", "unresolved"].includes(status)) return "warning";
  return "unverified";
}

export function recordsFromSheet(workbook, sheet, mapping) {
  return sheet.rows.map(({ row, values }) => {
    const record = Object.fromEntries(Object.entries(mapping).map(([field, index]) => [field, index === "" ? "" : clean(values[Number(index)])]));
    return { ...record, id: hardwareId(workbook.name, sheet.name, row), sourceFile: workbook.name, sourceSheet: sheet.name, sourceRow: row,
      sourceValues: sheet.headers.map((header, index) => ({ header: header || `Column ${index + 1}`, value: clean(values[index]) })),
    };
  });
}

export function buildDataset(records, meta = {}, suppliedIssues = [], hardware = []) {
  const started = performance.now();
  const nodes = new Map();
  const root = { id: "overview", type: "overview", label: "Equipment overview", parentId: null, childIds: [], recordIds: [] };
  nodes.set(root.id, root);
  const issues = suppliedIssues.map((issue) => ({ ...issue, recordIds: [...(issue.recordIds ?? [])] }));
  const recordMap = new Map();
  const addIssue = (record, kind, message, severity = "warning", reference = "Import diagnostic") => {
    const issue = { id: `${record.id}:${kind}`, kind, message, severity, reference, recordIds: [record.id], source: "presentation" };
    issues.push(issue); return issue;
  };
  function node(type, label, parentId, key) {
    const id = hardwareId(type, ...key);
    if (!nodes.has(id)) {
      nodes.set(id, { id, type, label, parentId, childIds: [], recordIds: [] });
      nodes.get(parentId).childIds.push(id);
    }
    return nodes.get(id);
  }
  function locate(record) {
    if (![record.cabinet, record.cioc, record.baseplate, record.channel].every((v) => clean(v))) return null;
    if (!/^\d+$/.test(String(record.channel)) || Number(record.channel) < 1) return null;
    const cabinet = node("cabinet", record.cabinet, root.id, [record.cabinet]);
    // Display text only: node.label stays the exact source identifier.
    if (!cabinet.display) { const display = cabinetDisplay(record.cabinet, record.unit); if (display) cabinet.display = display; }
    if (!cabinet.areaCode && clean(record.area)) cabinet.areaCode = clean(record.area);
    const cioc = node("cioc", record.cioc, cabinet.id, [record.cabinet, record.cioc]);
    const baseplate = node("baseplate", record.baseplate, cioc.id, [record.cabinet, record.cioc, record.baseplate]);
    const position = node("position", `Channel ${record.channel}`, baseplate.id, [record.cabinet, record.cioc, record.baseplate, String(Number(record.channel))]);
    position.channel = String(Number(record.channel));
    return position;
  }
  for (const entry of hardware) locate(entry);
  for (const raw of records) {
    const record = { ...raw, ioType: clean(raw.ioType).toUpperCase(), issueIds: [], nodeId: null };
    const kind = positionKind(record.kind);
    record.kind = kind;
    const spare = isSpareRecord(record);
    const wiredSpare = kind === "wired spare";
    record.active = !spare && Boolean(record.tag || record.ioType || record.description);
    // Presentation metadata only. Spare and unused positions get a status, never a signal name.
    record.displayName = record.active ? signalDisplayName(record) : "";
    record.cabinetDisplay = cabinetDisplay(record.cabinet, record.unit);
    record.areaDisplay = areaDisplay(record.area);
    record.sourceValidationState = validationState(record.validation);
    record.applicationValidation = "not_run";
    // A workbook assertion (including a manually mapped demo hint) is not an application check.
    record.status = wiredSpare ? "wired_spare" : kind === "reserved spare" ? "reserved_spare" : spare ? "unused" : record.sourceValidationState === "valid" ? "unverified" : record.sourceValidationState;
    record.io = recordIo(record);
    const position = locate(record);
    if (!position) {
      record.status = "unallocated";
      addIssue(record, "missing-location", "No reliable cabinet / CIOC / baseplate / positive integer channel assignment. This record is unplaced.");
    } else {
      record.nodeId = position.id;
      let current = position;
      while (current) { current.recordIds.push(record.id); current = nodes.get(current.parentId); }
    }
    if (!unknownValidation.has(clean(record.validation).toLowerCase()) && validationState(record.validation) === "unverified") {
      addIssue(record, "unknown-validation", `Unrecognized validation status: ${record.validation}. Not classified as valid.`, "info");
    }
    if (["error", "warning"].includes(validationState(record.validation))) {
      addIssue(record, "validation", record.validationMessage || `Source validation status: ${record.validation}`, validationState(record.validation), "Workbook validation");
    } else if (record.validationMessage) addIssue(record, "validation-note", record.validationMessage, "info", "Workbook validation");
    if (record.tqId || record.tqMessage) {
      const issue = addIssue(record, "tq", record.tqMessage || `TQ ${record.tqId}`, record.tqSeverity || "unknown", record.tqId || "Workbook TQ");
      issue.status = record.tqStatus || "unknown";
    }
    if (/^(?:AMBER|RED)\s*[—–-]/i.test(record.visualizationHint || "")) {
      const issue = addIssue(record, "source-hint", record.visualizationHint, "warning", "Workbook visualization hint");
      issue.source = "workbook hint (not application validation)";
      issue.hintSeverity = /^RED/i.test(record.visualizationHint) ? "error" : "warning";
    }
    recordMap.set(record.id, record);
  }
  const tags = new Map();
  for (const record of recordMap.values()) {
    if (!record.active || !record.tag) continue;
    if (!tags.has(record.tag)) tags.set(record.tag, []);
    tags.get(record.tag).push(record.id);
  }
  for (const ids of tags.values()) if (ids.length > 1) issues.push({ id: `${ids[0]}:duplicate-tag`, kind: "duplicate-tag", severity: "info", reference: "Import diagnostic", source: "presentation", message: "This tag occurs in multiple source records. Source row identity is retained; tag-only navigation is ambiguous.", recordIds: ids });
  for (const position of [...nodes.values()].filter((n) => n.type === "position" && n.recordIds.length > 1)) {
    const message = `${position.recordIds.length} source records assign this same physical position. No record was chosen over another.`;
    issues.push({ id: `${position.id}:conflict`, kind: "conflict", severity: "error", reference: "Import diagnostic", source: "presentation", message, recordIds: [...position.recordIds] });
  }
  // Exact source identity is used for TQs. Duplicate display tags never resolve to an arbitrary row.
  for (const issue of issues) {
    issue.recordIds = issue.recordIds.filter((id) => recordMap.has(id));
    issue.nodeIds = [...new Set(issue.recordIds.map((id) => recordMap.get(id).nodeId).filter(Boolean))];
    for (const id of issue.recordIds) {
      const record = recordMap.get(id);
      record.issueIds.push(issue.id);
      if (issueResolved(issue)) continue;
      if (issue.severity === "error") record.status = "error";
      else if (!isSpareRecord(record) && !["error", "unallocated"].includes(record.status) && !["info", "answered"].includes(issue.severity)) record.status = "warning";
    }
  }
  const severityOrder = ["error", "warning", "unallocated", "unverified", "valid", "wired_spare", "reserved_spare", "unused"];
  for (const current of nodes.values()) {
    current.childIds.sort((a, b) => natural(nodes.get(a).label, nodes.get(b).label));
    const own = current.recordIds.map((id) => recordMap.get(id));
    if (current.type === "position") current.io = positionIo(own);
    current.status = severityOrder.find((status) => own.some((record) => record.status === status)) ?? "unused";
    current.summary = { records: own.length, signals: own.filter((record) => record.active).length,
      occupied: own.filter((record) => record.nodeId && (!isSpareRecord(record) || record.kind === "wired spare")).length,
      spares: own.filter(isSpareRecord).length,
      issues: new Set(own.flatMap((record) => record.issueIds).filter((id) => !issueResolved(issues.find((issue) => issue.id === id)))).size };
  }
  const all = [...recordMap.values()];
  return { ...meta, id: meta.id ?? `${meta.name}:${Date.now()}`, records: all, recordMap, nodes, root,
    issues, normalizeMs: performance.now() - started,
    counts: { records: all.length, signals: all.filter((r) => r.active).length, placed: all.filter((r) => r.active && r.nodeId).length,
      valid: all.filter((r) => r.active && r.status === "valid").length,
      errors: all.filter((r) => r.status === "error").length, spares: all.filter(isSpareRecord).length,
      unplaced: all.filter((r) => !r.nodeId).length, cabinets: root.childIds.length,
      positions: [...nodes.values()].filter((n) => n.type === "position").length },
  };
}

export function filterRecords(dataset, filters, selectedIds = []) {
  const picked = new Set(selectedIds);
  return dataset.records.filter((record) => {
    if (filters.selectedOnly && !picked.has(record.id)) return false;
    if (filters.search && ![record.tag, record.description, record.charm, record.cable].some((value) => clean(value).toLowerCase().includes(filters.search.toLowerCase()))) return false;
    if (filters.cabinet && record.cabinet !== filters.cabinet) return false;
    if (filters.cioc && record.cioc !== filters.cioc) return false;
    if (filters.baseplate && record.baseplate !== filters.baseplate) return false;
    if (filters.ioType && record.ioType !== filters.ioType) return false;
    if (filters.signalType && record.signalType !== filters.signalType) return false;
    if (filters.charm && record.charm !== filters.charm) return false;
    if (filters.status && record.status !== filters.status) return false;
    if (filters.issues === "with" && !record.issueIds.length) return false;
    if (filters.issues === "without" && record.issueIds.length) return false;
    if (filters.tq && !record.issueIds.some((id) => { const issue = dataset.issues.find((i) => i.id === id); return issue?.kind === "tq" && (filters.tq === "with" ? !issueResolved(issue) : issue.status === filters.tq); })) return false;
    if (filters.revision && record.revision !== filters.revision) return false;
    if (filters.change && record.change !== filters.change) return false;
    return true;
  });
}

export function ancestors(dataset, id) {
  const result = [];
  for (let node = dataset.nodes.get(id); node; node = dataset.nodes.get(node.parentId)) result.unshift(node);
  return result;
}

export function datasetFromRun({ layout, allocation, tqs = [], report, projectId, runId, mock = false }) {
  const ciocs = new Map(layout.layout.ciocs.map((cioc) => [cioc.no, cioc]));
  const cabinets = new Map(layout.layout.cabinets.map((cabinet) => [cabinet.no, cabinet]));
  const records = allocation.placements.map((placement, index) => {
    const signal = placement.signal ?? {};
    const cioc = ciocs.get(placement.cioc_no);
    const bp = cioc?.baseplates.find((plate) => plate.n === placement.baseplate);
    return { id: `run:${runId}:placement:${index}`, tag: signal.tag ?? "", description: signal.instrument_description ?? "",
      ioType: signal.io_type ?? "", signalType: signal.signal_type ?? "", cabinet: cabinets.get(cioc?.cabinet)?.name ?? "",
      cioc: cioc?.name ?? "", baseplate: bp?.name ?? "", channel: String(placement.channel ?? ""), charm: String(signal.extras?.charm_no ?? ""),
      charmType: signal.extras?.charm_type ?? "", terminalBlock: signal.extras?.terminal_block ?? "",
      controller: signal.controller ?? "", cable: signal.cable ?? "", pair: String(signal.pair ?? placement.pair ?? ""),
      kind: placement.kind === "wired_spare" ? "wired spare" : placement.kind === "cabinet_alarm" ? "cabinet alarm" : "field",
      validation: placement.validation_status ?? signal.validation_status ?? "", sourceFile: signal.source_file ?? "", sourceRow: signal.source_row ?? "",
      sourceSheet: signal.source_sheet ?? "", revision: signal.revision ?? "", change: signal.change_type ?? "" };
  });
  for (const [index, signal] of (allocation.unplaced ?? []).entries()) records.push({ ...signal, id: `run:${runId}:unplaced:${index}`, ioType: signal.io_type, sourceFile: signal.source_file, sourceRow: signal.source_row, cabinet: "", cioc: "", baseplate: "", channel: "" });
  const issues = tqs.map((tq) => ({
    id: `tq:${tq.id}`, kind: "tq", severity: tq.severity, status: tq.status, reference: tq.id, message: tq.message, source: "run TQ",
    recordIds: records.filter((record) => (tq.signal_keys?.length ? tq.signal_keys : [tq.subject]).includes(sourceKey(record))).map((record) => record.id),
  }));
  for (const rule of report?.report?.rules ?? []) if (!rule.passed) issues.push({ id: `rule:${rule.rule}`, kind: "validation", severity: "error", reference: rule.rule, message: `${rule.description} (${rule.violations} reported violations; no per-position references supplied)`, recordIds: [], source: "run report" });
  // This capacity is the existing application's explicit DeltaV 12-channel preset, not inferred
  // from a missing workbook row. Workbook imports never synthesize hardware positions.
  const hardware = layout.layout.ciocs.flatMap((cioc) => cioc.baseplates.flatMap((plate) => Array.from({ length: 12 }, (_, index) => ({ cabinet: cabinets.get(cioc.cabinet)?.name, cioc: cioc.name, baseplate: plate.name, channel: String(index + 1) }))));
  return buildDataset(records, { name: `${mock ? "Mock " : ""}allocation run ${runId}`, projectId, runId, source: "run", mock, validationNote: "Source validation reports and global rule failures are displayed separately. Application engineering validation has not run in this viewer." }, issues, hardware);
}
