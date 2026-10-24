#!/usr/bin/env node
// Checks an allocated workbook against the blank template it was written from: the writer
// (backend/app/core/writer/template.py) copies the template and fills it in, so the output's
// first sheet must keep the template's own name, header names and header order. It also checks
// the row count is a positive multiple of 384 (12 channels * 8 baseplates * 4 CIOCs per cabinet).
//
// Generic on purpose: it compares whatever two files it is given, so it needs no knowledge of the
// template's real header names. The blank template stays on your machine; never commit it.
//
// Usage: node scripts/verify-output.mjs <allocated.xlsx> <blank-template.xlsx>

import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";

/** Reads the first sheet's name, header row (trailing blanks trimmed) and non-empty row count. */
export async function readWorkbook(path) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error(`${path}: the workbook has no worksheet`);

  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell) => headers.push(cell.value == null ? "" : String(cell.value)));
  while (headers.length && headers[headers.length - 1] === "") headers.pop();

  let rows = 0;
  for (let r = 2; r <= sheet.rowCount; r++) {
    if (sheet.getRow(r).hasValues) rows += 1;
  }
  return { name: sheet.name, headers, rows };
}

/** Compares an allocated workbook's summary against the template's. Returns a list of check results. */
export function compare(allocated, template) {
  const checks = [];

  checks.push({
    ok: allocated.name === template.name,
    message:
      allocated.name === template.name
        ? `sheet name "${allocated.name}" matches the template`
        : `sheet name "${allocated.name}" does not match the template's "${template.name}"`,
  });

  checks.push({
    ok: allocated.headers.length === template.headers.length,
    message:
      allocated.headers.length === template.headers.length
        ? `${allocated.headers.length} headers, the same count as the template`
        : `${allocated.headers.length} headers, the template has ${template.headers.length}`,
  });

  const max = Math.max(allocated.headers.length, template.headers.length);
  const mismatches = [];
  for (let i = 0; i < max; i++) {
    if (allocated.headers[i] !== template.headers[i]) {
      mismatches.push(`column ${i + 1}: "${allocated.headers[i] ?? ""}" (template has "${template.headers[i] ?? ""}")`);
    }
  }
  if (mismatches.length === 0) {
    checks.push({ ok: true, message: "every header name and its order matches the template" });
  } else {
    for (const m of mismatches) checks.push({ ok: false, message: `header mismatch at ${m}` });
  }

  const multipleOf384 = allocated.rows > 0 && allocated.rows % 384 === 0;
  checks.push({
    ok: multipleOf384,
    message: multipleOf384 ? `${allocated.rows} rows, a multiple of 384` : `${allocated.rows} rows is not a positive multiple of 384`,
  });

  return checks;
}

async function main() {
  const [, , allocatedPath, templatePath] = process.argv;
  if (!allocatedPath || !templatePath) {
    console.error("Usage: node scripts/verify-output.mjs <allocated.xlsx> <blank-template.xlsx>");
    process.exit(2);
  }

  const [allocated, template] = await Promise.all([readWorkbook(allocatedPath), readWorkbook(templatePath)]);
  const checks = compare(allocated, template);

  let failed = false;
  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.message}`);
    if (!check.ok) failed = true;
  }
  process.exit(failed ? 1 : 0);
}

// Only run as a CLI; a test can import readWorkbook/compare without executing this.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`FAIL ${e.message}`);
    process.exit(1);
  });
}
