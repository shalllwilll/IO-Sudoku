import { FIELD_LABELS, clean, mappingProblems, preferredDataSheet, suggestMapping } from "./workbook.js";
import { buildDataset, recordsFromSheet } from "./model.js";

const lower = (value) => clean(value).toLowerCase();

// A separate TQ register sheet, when the workbook has one, supplies each TQ's status.
// The allocation rows carry a TQ id and message but no status column.
export function tqRegisterStatuses(workbook) {
  const statuses = new Map();
  for (const sheet of workbook.sheets) {
    const headers = sheet.headers.map(lower);
    const [id, tag, status] = ["tq id", "signal tag", "status"].map((name) => headers.indexOf(name));
    if (id < 0 || tag < 0 || status < 0) continue;
    for (const { values } of sheet.rows) if (clean(values[id])) statuses.set(`${clean(values[id])}|${clean(values[tag])}`, clean(values[status]));
  }
  return statuses;
}

export function allocatedWorkbook(workbook, previous = null) {
  const sheet = workbook.sheets[preferredDataSheet(workbook)];
  const sameHeaders = previous?.sourceHeaders && JSON.stringify(previous.sourceHeaders) === JSON.stringify(sheet.headers);
  const mapping = sameHeaders && previous.mapping ? previous.mapping : suggestMapping(sheet.headers);
  const missing = ["tag", "ioType", "cabinet", "cioc", "baseplate", "channel"].filter((field) => mapping[field] === "" || mapping[field] === undefined);
  if (missing.length) throw new Error(`The workbook needs these allocation columns: ${missing.map((field) => FIELD_LABELS[field]).join(", ")}. Use the allocated worksheet or correct its column headings.`);
  const problems = mappingProblems(mapping);
  if (problems.length) throw new Error(`Please correct the workbook's column headings. ${problems[0]}`);
  if (!sheet.rows.length) throw new Error("The allocation worksheet is empty. Choose a workbook containing allocation rows.");
  const records = recordsFromSheet(workbook, sheet, mapping);
  const register = tqRegisterStatuses(workbook);
  if (register.size) for (const record of records) if (record.tqId && !record.tqStatus) record.tqStatus = register.get(`${record.tqId}|${record.tag}`) ?? "";
  return buildDataset(records, { name: workbook.name, sheet: sheet.name, source: "workbook", parseMs: workbook.parseMs, mapping, sourceHeaders: sheet.headers,
    validationNote: "Allocated positions are shown as supplied. Application engineering validation has not run." });
}
