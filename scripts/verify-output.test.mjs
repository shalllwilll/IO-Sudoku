import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compare, readWorkbook } from "./verify-output.mjs";

const HEADERS = ["Tag", "IO Type", "Cable", "Pair"];

async function writeWorkbook(path, { sheetName = "IO Assignment", headers = HEADERS, rows = 384 } = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(headers);
  for (let i = 0; i < rows; i++) sheet.addRow(headers.map((h, col) => `${h}-${i}-${col}`));
  await workbook.xlsx.writeFile(path);
}

describe("verify-output", () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "verify-output-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("passes every check when the allocated workbook matches the template", async () => {
    const template = join(dir, "template.xlsx");
    const allocated = join(dir, "allocated.xlsx");
    await writeWorkbook(template, { rows: 0 });
    await writeWorkbook(allocated, { rows: 768 }); // two cabinets' worth

    const checks = compare(await readWorkbook(allocated), await readWorkbook(template));
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(checks.map((c) => c.message)).toContain("768 rows, a multiple of 384");
  });

  it("fails and names the header when one is renamed", async () => {
    const template = join(dir, "template.xlsx");
    const allocated = join(dir, "allocated.xlsx");
    await writeWorkbook(template, { rows: 0 });
    await writeWorkbook(allocated, { headers: ["Tag", "IO Kind", "Cable", "Pair"], rows: 384 });

    const checks = compare(await readWorkbook(allocated), await readWorkbook(template));
    const failed = checks.filter((c) => !c.ok);
    expect(failed).toHaveLength(1);
    expect(failed[0].message).toMatch(/column 2.*"IO Kind".*"IO Type"/);
  });

  it("fails on a row count that is not a multiple of 384", async () => {
    const template = join(dir, "template.xlsx");
    const allocated = join(dir, "allocated.xlsx");
    await writeWorkbook(template, { rows: 0 });
    await writeWorkbook(allocated, { rows: 379 }); // 384 minus 5

    const checks = compare(await readWorkbook(allocated), await readWorkbook(template));
    const rowCheck = checks.find((c) => c.message.includes("rows"));
    expect(rowCheck.ok).toBe(false);
  });

  it("fails when the sheet is renamed", async () => {
    const template = join(dir, "template.xlsx");
    const allocated = join(dir, "allocated.xlsx");
    await writeWorkbook(template, { rows: 0 });
    await writeWorkbook(allocated, { sheetName: "Allocation Output", rows: 384 });

    const checks = compare(await readWorkbook(allocated), await readWorkbook(template));
    const sheetCheck = checks.find((c) => c.message.includes("sheet name"));
    expect(sheetCheck.ok).toBe(false);
  });

  it("fails on a missing header and reports the count difference", async () => {
    const template = join(dir, "template.xlsx");
    const allocated = join(dir, "allocated.xlsx");
    await writeWorkbook(template, { rows: 0 });
    await writeWorkbook(allocated, { headers: ["Tag", "IO Type", "Cable"], rows: 384 });

    const checks = compare(await readWorkbook(allocated), await readWorkbook(template));
    expect(checks.some((c) => !c.ok && c.message.includes("3 headers"))).toBe(true);
  });
});
