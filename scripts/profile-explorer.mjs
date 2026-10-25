// Local-only benchmark. Prints counts and timings, never tags or row contents.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { readWorkbook, suggestMapping } from "../src/features/explorer/workbook.js";
import { buildDataset, filterRecords, recordsFromSheet } from "../src/features/explorer/model.js";
import { createGeometry } from "../src/features/explorer/geometry.js";

const file = process.argv[2];
if (!file) { console.error("Usage: node --expose-gc scripts/profile-explorer.mjs <local-allocation.xlsx>"); process.exit(1); }
const buffer = await readFile(file);
const workbook = await readWorkbook(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), basename(file));
const sheet = workbook.sheets.reduce((largest, candidate) => candidate.rows.length > largest.rows.length ? candidate : largest);
const records = recordsFromSheet(workbook, sheet, suggestMapping(sheet.headers));
for (const scale of [1, 10]) {
  const rows = scale === 1 ? records : Array.from({ length: scale }, (_, group) => records.map((record) => ({ ...record, id: `${group}:${record.id}`, cabinet: `${group}:${record.cabinet}`, tag: record.tag ? `${group}:${record.tag}` : "" }))).flat();
  const start = performance.now();
  const dataset = buildDataset(rows);
  const normalized = performance.now();
  const shapes = createGeometry(dataset);
  const geometry = performance.now();
  filterRecords(dataset, { ioType: dataset.records.find((record) => record.active)?.ioType });
  console.log(JSON.stringify({ scale, records: rows.length, positions: dataset.counts.positions, normalizationMs: +(normalized - start).toFixed(2), geometryMs: +(geometry - normalized).toFixed(2), filterMs: +(performance.now() - geometry).toFixed(2), hardwareNodes: shapes.size, heapMb: +(process.memoryUsage().heapUsed / 1048576).toFixed(2), workbookParseMs: +workbook.parseMs.toFixed(2) }));
}
if (global.gc) {
  global.gc();
  const before = process.memoryUsage().heapUsed;
  for (let index = 0; index < 5; index++) { const dataset = buildDataset(records); createGeometry(dataset); }
  global.gc();
  console.log(JSON.stringify({ repeatedDatasetSwitches: 5, retainedHeapDeltaMb: +((process.memoryUsage().heapUsed - before) / 1048576).toFixed(2), note: "Approximate Node heap observation, not a browser GPU memory guarantee." }));
}
