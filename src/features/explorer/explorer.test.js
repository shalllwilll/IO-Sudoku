import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ancestors, buildDataset, datasetFromRun, filterRecords, recordsFromSheet } from "./model.js";
import { combinedBounds, createGeometry, logicalRoute } from "./geometry.js";
import { mappingProblems, parseCsv, readWorkbook, suggestMapping } from "./workbook.js";
import { preferredDataSheet } from "./workbook.js";
import { IO_TYPES, UNKNOWN_IO, ioType, positionIo } from "./ioTypes.js";
import { slotIndicator } from "./IoPresentation.jsx";

const record = (id, overrides = {}) => ({ id, tag: `TEST-${id}`, ioType: "AI", kind: "Field", cabinet: "CAB-A", cioc: "CIOC-A", baseplate: "BP-1", channel: id, sourceFile: "test.xlsx", sourceRow: Number(id) + 1, ...overrides });

describe("allocation explorer data integrity", () => {
  it("retains all conflicting rows, marks the exact position, and keeps tags distinct from source identity", () => {
    const dataset = buildDataset([record("1"), record("2", { channel: "1", tag: "TEST-1" })]);
    expect(dataset.records).toHaveLength(2);
    expect(dataset.counts.positions).toBe(1);
    expect(dataset.records.every((row) => row.status === "error")).toBe(true);
    expect(dataset.issues.find((issue) => issue.kind === "conflict").recordIds).toEqual(["1", "2"]);
    expect(dataset.issues.find((issue) => issue.kind === "duplicate-tag").recordIds).toHaveLength(2);
    expect(dataset.nodes.get(dataset.records[0].nodeId).recordIds).toEqual(["1", "2"]);
  });
  it("keeps source assertions separate from application validation", () => {
    const dataset = buildDataset([record("1"), record("2", { validation: "validated" }), record("3", { validation: "mystery" }), record("4", { kind: "Spare Slot", tag: "" }), record("5", { kind: "Wired Spare" })]);
    expect(dataset.records.map((row) => row.status)).toEqual(["unverified", "unverified", "unverified", "unused", "wired_spare"]);
    expect(dataset.counts.signals).toBe(3);
    expect(dataset.counts.valid).toBe(0);
    expect(dataset.records[1].sourceValidationState).toBe("valid");
    expect(dataset.records.every((row) => row.applicationValidation === "not_run")).toBe(true);
    expect(dataset.counts.spares).toBe(2);
  });
  it("keeps partial or malformed assignments unplaced instead of inventing hardware", () => {
    const dataset = buildDataset([record("1", { cioc: "" }), record("2", { channel: "not a channel" }), record("3", { channel: "0" })]);
    expect(dataset.counts.positions).toBe(0);
    expect(dataset.counts.unplaced).toBe(3);
    expect(dataset.issues.every((issue) => !issue.nodeIds.length)).toBe(true);
  });
  it("keys identical CIOC, baseplate and channel labels by their parents", () => {
    const dataset = buildDataset([record("1"), record("2", { cabinet: "CAB-B", channel: "1" })]);
    expect(dataset.records[0].nodeId).not.toBe(dataset.records[1].nodeId);
    const trail = ancestors(dataset, dataset.records[0].nodeId);
    expect(trail.map((node) => node.type)).toEqual(["overview", "cabinet", "cioc", "baseplate", "position"]);
  });
  it("does not classify a blocking TQ as a confirmed engineering error", () => {
    const dataset = buildDataset([record("1")], {}, [{ id: "TQ-1", kind: "tq", severity: "blocking", message: "Unknown", recordIds: ["1"] }]);
    expect(dataset.records[0].status).toBe("warning");
    expect(dataset.counts.errors).toBe(0);
    const resolved = buildDataset([record("1")], {}, [{ id: "TQ-2", kind: "tq", severity: "blocking", status: "answered", message: "Confirmed", recordIds: ["1"] }]);
    expect(resolved.records[0].status).toBe("unverified");
    expect(filterRecords(resolved, { tq: "answered" })).toHaveLength(1);
    expect(filterRecords(resolved, { tq: "with" })).toHaveLength(0);
  });
  it("filters without changing records or losing conflicting source rows", () => {
    const dataset = buildDataset([record("1"), record("2", { cabinet: "CAB-B", ioType: "DO" })]);
    expect(filterRecords(dataset, { cabinet: "CAB-B", ioType: "DO" })).toHaveLength(1);
    expect(filterRecords(dataset, { selectedOnly: true }, ["1"])[0].id).toBe("1");
    expect(dataset.records).toHaveLength(2);
  });
  it("creates finite bounds and ends logical routes at the correct position, reversing outputs", () => {
    const dataset = buildDataset([record("1"), record("2", { ioType: "AO" })]);
    const geometry = createGeometry(dataset);
    expect([...geometry.values()].every((shape) => [...shape.position, ...shape.size].every(Number.isFinite))).toBe(true);
    const input = logicalRoute(geometry, dataset, dataset.records[0]);
    const output = logicalRoute(geometry, dataset, dataset.records[1]);
    expect(input.at(-1).slice(0, 2)).toEqual(geometry.get(dataset.records[0].nodeId).position.slice(0, 2));
    expect(output[0].slice(0, 2)).toEqual(geometry.get(dataset.records[1].nodeId).position.slice(0, 2));
    expect(combinedBounds(geometry, dataset.records.map((row) => row.nodeId)).size[0]).toBeGreaterThan(0);
    const internal = { ...dataset.records[0], kind: "cabinet alarm" };
    expect(logicalRoute(geometry, dataset, internal)[0][0]).toBe(geometry.get(ancestors(dataset, internal.nodeId).find((node) => node.type === "cabinet").id).position[0]);
  });
});

describe("I/O identity independent of status", () => {
  it("uses the exact four type colors and recognizes only explicit aliases", () => {
    for (const [raw, code, color] of [["AI", "AI", "#1976D2"], ["AIR", "AI", "#1976D2"], ["AO", "AO", "#8E24AA"], ["AOR", "AO", "#8E24AA"], ["DI", "DI", "#43A047"], ["DIR", "DI", "#43A047"], ["DO", "DO", "#FB8C00"], ["DOR", "DO", "#FB8C00"]]) expect(ioType(raw)).toMatchObject({ code, color });
    for (const raw of ["", "-", "AI-UNKNOWN", "AI-ish", "XQ", null]) expect(ioType(raw)).toEqual(UNKNOWN_IO);
  });
  it("retains an AO body under errors and TQs, with a separate outline", () => {
    const dataset = buildDataset([record("1", { ioType: "AO", validation: "failed" }), record("2", { ioType: "AO", tqId: "TQ", tqSeverity: "blocking", tqMessage: "Review" })]);
    for (const row of dataset.records) expect(dataset.nodes.get(row.nodeId).io).toEqual(IO_TYPES.AO);
    expect(slotIndicator(dataset.nodes.get(dataset.records[0].nodeId), dataset).color).not.toBe(IO_TYPES.AO.color);
    expect(slotIndicator(dataset.nodes.get(dataset.records[1].nodeId), dataset).label).toContain("TQ");
  });
  it("keeps spares neutral even if they contain a type, and does not choose between conflicting types", () => {
    const dataset = buildDataset([record("1", { ioType: "DI", kind: "Reserved Spare" }), record("2", { ioType: "DO", kind: "Unused Position" }), record("3", { ioType: "AI", kind: "Wired Spare" })]);
    expect(dataset.counts).toMatchObject({ signals: 0, spares: 3 });
    for (const row of dataset.records) expect(dataset.nodes.get(row.nodeId).io).toMatchObject({ code: "SPARE", color: "#78818D" });
    expect(positionIo([record("1", { ioType: "AI" }), record("2", { ioType: "DI" })])).toMatchObject({ code: "UNKNOWN", color: "#78818D", conflict: true });
  });
});

describe("explicit workbook mapping", () => {
  it("separates CHARM identifiers from channels and never interprets Tag Status as validation", () => {
    const mapping = suggestMapping(["Tag Name", "Channel_No", "CHARM_No", "Tag Status", "Validation Status"]);
    expect(mapping.channel).toBe("1"); expect(mapping.charm).toBe("2"); expect(mapping.kind).toBe("3"); expect(mapping.validation).toBe("4");
    expect(suggestMapping(["Status", "Tag Status"]).validation).toBe("");
    expect(mappingProblems({ ...mapping, charm: "1" })).toHaveLength(1);
  });
  it("reads quoted CSV, line breaks, UTF-8 headers, and exact source rows", () => {
    const sheet = parseCsv('\uFEFFTag Name,Service Description,Channel_No\n"TEST,1","two\nlines",1\nTEST-2,"a ""quote""",2');
    expect(sheet.rows[0].values).toEqual(["TEST,1", "two\nlines", "1"]);
    expect(sheet.rows[1].row).toBe(4);
    const rows = recordsFromSheet({ name: "test.csv" }, sheet, suggestMapping(sheet.headers));
    expect(rows[1].sourceRow).toBe(4);
    expect(rows[1].sourceValues).toHaveLength(3);
    expect(() => parseCsv('Tag Name\n"broken')).toThrow(/unterminated/);
  });
  it("keeps raw MDB inputs unplaced", () => {
    const sheet = parseCsv("Tag Number,I/O Type Name,Service\nTEST-1,AI,Example");
    const dataset = buildDataset(recordsFromSheet({ name: "raw.csv" }, sheet, suggestMapping(sheet.headers)));
    expect(dataset.counts).toMatchObject({ records: 1, signals: 1, placed: 0, valid: 0, positions: 0 });
  });
  it("maps run TQs by source keys rather than by a duplicate display tag", () => {
    const dataset = datasetFromRun({ projectId: "p", runId: "r", mock: true,
      layout: { layout: { cabinets: [{ no: 1, name: "CAB-A" }], ciocs: [{ no: 1, name: "CIOC-A", cabinet: 1, baseplates: [{ n: 1, name: "BP-1" }] }] } },
      allocation: { placements: [{ cioc_no: 1, baseplate: 1, channel: 1, kind: "field", signal: { tag: "DUP", source_file: "test.xlsx", source_row: 2 } }, { cioc_no: 1, baseplate: 1, channel: 2, kind: "field", signal: { tag: "DUP", source_file: "test.xlsx", source_row: 3 } }], unplaced: [] },
      tqs: [{ id: "TQ", status: "open", severity: "assumed", signal_keys: ["test.xlsx:3"], message: "Check source" }] });
    expect(dataset.issues.find((issue) => issue.kind === "tq").recordIds).toEqual(["run:r:placement:1"]);
    expect(dataset.records.map((row) => row.status)).toEqual(["unverified", "warning"]);
  });
});

// Workbooks remain outside Git. These checks run locally when the supplied dataset is present.
const allocationPath = resolve(process.cwd(), "../dataset/Sample_IO_Allocation_VIT_v2 1.xlsx");
it.skipIf(!existsSync(allocationPath))("loads the supplied allocation workbook without substituting fixture records", async () => {
  const buffer = readFileSync(allocationPath);
  const workbook = await readWorkbook(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), "allocation.xlsx");
  const sheet = workbook.sheets.find((item) => item.name === "IO Assignment");
  const dataset = buildDataset(recordsFromSheet(workbook, sheet, suggestMapping(sheet.headers)));
  expect(sheet.headers).toContain("Channel_No"); expect(sheet.headers).toContain("CHARM_No");
  expect(dataset.counts).toMatchObject({ records: 1152, signals: 189, positions: 1152, cabinets: 3, valid: 0, spares: 963, unplaced: 0 });
  expect([...dataset.nodes.values()].filter((node) => node.type === "cioc")).toHaveLength(12);
  expect([...dataset.nodes.values()].filter((node) => node.type === "baseplate")).toHaveLength(96);
  expect(dataset.records.filter((row) => row.status === "wired_spare")).toHaveLength(22);
  expect(dataset.records.filter((row) => row.status === "unused")).toHaveLength(941);
}, 30000);

const inputPath = resolve(process.cwd(), "../dataset/Sample_IO_MDB_VIT_v2 1.xlsx");
it.skipIf(!existsSync(inputPath))("retains the supplied raw MDB rows as unplaced input", async () => {
  const buffer = readFileSync(inputPath);
  const workbook = await readWorkbook(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), "input.xlsx");
  const sheet = workbook.sheets[0];
  const dataset = buildDataset(recordsFromSheet(workbook, sheet, suggestMapping(sheet.headers)));
  expect(dataset.counts.records).toBe(190);
  expect(dataset.counts.valid).toBe(0);
  expect(dataset.counts.positions).toBe(0);
  expect(dataset.counts.unplaced).toBe(190);
}, 30000);

const colorPath = process.env.IO_COLOR_WORKBOOK || resolve(process.cwd(), "../../../Downloads/IO_Signal_Sudoku_Synthetic_3D_Demo_IO_Colored.xlsx");
it.skipIf(!existsSync(colorPath))("matches every active synthetic workbook I/O cell fill, preserves spares and rejects demo validation claims", async () => {
  const buffer = readFileSync(colorPath);
  const workbook = await readWorkbook(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), "synthetic.xlsx");
  const sheet = workbook.sheets[preferredDataSheet(workbook)];
  expect(sheet.name).toBe("IO Assignment");
  const dataset = buildDataset(recordsFromSheet(workbook, sheet, suggestMapping(sheet.headers)));
  expect(dataset.counts).toMatchObject({ records: 1152, signals: 708, spares: 444, valid: 0 });
  const { default: ExcelJS } = await import("exceljs");
  const source = new ExcelJS.Workbook(); await source.xlsx.load(buffer);
  const sourceSheet = source.getWorksheet("IO Assignment");
  const column = sheet.headers.indexOf("IO Type") + 1;
  const counts = {};
  for (const row of dataset.records.filter((row) => row.active)) {
    const definition = dataset.nodes.get(row.nodeId).io;
    const fill = sourceSheet.getRow(row.sourceRow).getCell(column).fill.fgColor.argb;
    expect(definition.color.toUpperCase()).toBe(`#${fill.slice(-6)}`.toUpperCase());
    counts[definition.code] = (counts[definition.code] ?? 0) + 1;
  }
  expect(counts).toEqual({ AI: 260, AO: 124, DI: 169, DO: 155 });
  expect(dataset.issues.some((issue) => issue.kind === "source-hint")).toBe(true);
}, 30000);
