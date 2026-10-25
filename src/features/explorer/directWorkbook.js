import { FIELD_LABELS, mappingProblems, preferredDataSheet, suggestMapping } from "./workbook.js";
import { buildDataset, recordsFromSheet } from "./model.js";

export function allocatedWorkbook(workbook, previous = null) {
  const sheet = workbook.sheets[preferredDataSheet(workbook)];
  const sameHeaders = previous?.sourceHeaders && JSON.stringify(previous.sourceHeaders) === JSON.stringify(sheet.headers);
  const mapping = sameHeaders && previous.mapping ? previous.mapping : suggestMapping(sheet.headers);
  const missing = ["tag", "ioType", "cabinet", "cioc", "baseplate", "channel"].filter((field) => mapping[field] === "" || mapping[field] === undefined);
  if (missing.length) throw new Error(`The workbook needs these allocation columns: ${missing.map((field) => FIELD_LABELS[field]).join(", ")}. Use the allocated worksheet or correct its column headings.`);
  const problems = mappingProblems(mapping);
  if (problems.length) throw new Error(`Please correct the workbook's column headings. ${problems[0]}`);
  if (!sheet.rows.length) throw new Error("The allocation worksheet is empty. Choose a workbook containing allocation rows.");
  return buildDataset(recordsFromSheet(workbook, sheet, mapping), { name: workbook.name, sheet: sheet.name, source: "workbook", parseMs: workbook.parseMs, mapping, sourceHeaders: sheet.headers,
    validationNote: "Allocated positions are shown as supplied. Application engineering validation has not run." });
}
