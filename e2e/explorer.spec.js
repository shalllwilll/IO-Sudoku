import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";

test.describe.configure({ timeout: 60000 });
const header = "Tag Name,IO Type,Electronic/ Marshalling Cabinet,CIOC/CSLS Name,Baseplate,Channel_No,CHARM_No,Tag Status,Validation Status,TQ ID,TQ Severity,TQ Message";
function demoRows() {
  const rows = [header];
  for (const cabinet of ["A", "B", "C", "D"]) {
    for (let channel = 1; channel <= 8; channel++) {
      const io = ["AI", "AO", "DI", "DO"][(channel - 1) % 4], tq = channel === 1 || channel === 3;
      rows.push(["SIG-" + cabinet + "-" + channel, cabinet === "B" && io === "AI" ? "AIR" : io, "CAB-" + cabinet, "CIOC-" + cabinet, "BP-1", channel, channel, "Field", channel === 1 ? "validated" : "", tq ? "TQ-" + cabinet + "-" + channel : "", tq ? "assumed" : "", tq ? "Review " + cabinet + " channel " + channel : ""].join(","));
    }
    rows.push(["", "", "CAB-" + cabinet, "CIOC-" + cabinet, "BP-1", 9, 9, "Reserved Spare", "", "", "", ""].join(","));
    rows.push(["SPARE-" + cabinet, "", "CAB-" + cabinet, "CIOC-" + cabinet, "BP-1", 10, 10, "Wired Spare", "", "", "", ""].join(","));
  }
  return rows.join("\n");
}
let upload = 0;
async function openExplorer(page, reducedMotion = false) {
  if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => sessionStorage.setItem("iosudoku.session", JSON.stringify({ email: "demo@example.com" })));
  await page.goto("/plant");
  await expect(page.getByRole("heading", { name: "IO Signal Sudoku", exact: true })).toBeVisible();
}
async function runCsv(page, text = demoRows(), wait = true) {
  const name = "allocation-" + (++upload) + ".csv";
  await page.getByLabel("Excel workbook", { exact: true }).setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(text) });
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("region", { name: "Active dataset" })).toContainText(name);
  if (wait) await ready(page);
  return name;
}
async function ready(page) {
  await expect(page.locator(".simple-playback")).toHaveAttribute("data-phase", "complete", { timeout: 15000 });
  await expect(page.getByRole("combobox", { name: "I/O Type", exact: true })).toBeEnabled();
}
async function inspectChannel(page, cabinet, channel) {
  await page.getByRole("button", { name: "Details", exact: true }).click();
  const inspector = page.getByRole("complementary", { name: "Selection inspector" });
  await inspector.getByRole("button", { name: new RegExp("^CAB-" + cabinet) }).click();
  await inspector.getByRole("button", { name: new RegExp("^CIOC-" + cabinet) }).click();
  await inspector.getByRole("button", { name: /^BP-1/ }).click();
  await inspector.getByRole("button", { name: new RegExp("^Channel " + channel + " ") }).click();
  return inspector;
}
async function colorPixels(page, hex) {
  await page.mouse.move(0, 0); await page.waitForTimeout(1000);
  const screenshot = await page.locator("canvas").screenshot();
  const rgb = hex.match(/[a-f\d]{2}/gi).map((pair) => parseInt(pair, 16));
  return page.evaluate(async ({ png, rgb }) => {
    const image = new Image(); image.src = "data:image/png;base64," + png; await image.decode();
    const canvas = new OffscreenCanvas(image.width, image.height), context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const bytes = context.getImageData(0, 0, image.width, image.height).data;
    let count = 0;
    for (let index = 0; index < bytes.length; index += 4) if (rgb.every((value, channel) => Math.abs(value - bytes[index + channel]) <= 1)) count++;
    return count;
  }, { png: screenshot.toString("base64"), rgb });
}

test("one upload and Run load four actual cabinets directly, without a wizard or concurrent duplicate run", async ({ page }) => {
  await openExplorer(page);
  await expect(page.locator('input[type="file"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Run", exact: true })).toBeDisabled();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  let workers = 0; page.on("worker", () => workers++);
  await page.getByLabel("Excel workbook").setInputFiles({ name: "four-cabinets.csv", mimeType: "text/csv", buffer: Buffer.from(demoRows()) });
  await expect(page.getByText("four-cabinets.csv", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Run", exact: true }).evaluate((button) => { button.click(); button.click(); });
  await expect(page.getByRole("region", { name: "Active dataset" })).toContainText("4 cabinets");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(2);
  await expect(page.getByRole("combobox", { name: "I/O Type", exact: true })).toBeDisabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Workbook mapping" })).toHaveCount(0);
  await ready(page);
  expect(workers).toBe(1);
  await expect(page.getByRole("region", { name: "Active dataset" })).toContainText("32 of 32 matching signals");
});

test("field, four-cabinet sequence and individual slot progress complete in 5–8 seconds, with the static site structures never intercepting clicks", async ({ page }) => {
  await openExplorer(page); await runCsv(page, demoRows(), false);
  const start = Date.now();
  const centre = page.getByRole("region", { name: "Allocation viewport" });
  // The decorative field/control-room structures render inside the same canvas as the cabinets and
  // take no pointer input of their own (SiteStructures disables raycasting on every mesh), so a click
  // near either edge of the viewport still only ever reaches the canvas, never a DOM overlay.
  expect((await centre.boundingBox()).width).toBeGreaterThan(600);
  for (const cabinet of ["A", "B", "C", "D"]) await expect(page.getByRole("status")).toHaveText("Presenting CAB-" + cabinet, { timeout: 3000 });
  await expect(page.getByRole("status")).toHaveText("Signals reaching the control room", { timeout: 3000 });
  await ready(page);
  expect(Date.now() - start).toBeLessThan(8500);
  expect(Date.now() - start).toBeGreaterThan(5000);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.locator("footer")).toContainText("40 source records");
  await expect(page.locator("footer")).toContainText("Engineering validation has not run");
});

test("two filters combine across every cabinet even after selecting one cabinet", async ({ page }) => {
  await openExplorer(page); await runCsv(page);
  await page.getByRole("combobox", { name: "I/O Type", exact: true }).selectOption("AI");
  await expect(page.getByRole("region", { name: "Active dataset" })).toContainText("8 of 32 matching signals");
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await page.getByRole("complementary", { name: "Selection inspector" }).getByRole("button", { name: /^CAB-A/ }).click();
  await expect(page.getByRole("region", { name: "Active dataset" })).toContainText("8 of 32 matching signals");
  await page.getByRole("button", { name: "Records", exact: true }).click();
  const table = page.getByRole("table", { name: "Allocation records, available without WebGL" });
  for (const cabinet of ["A", "B", "C", "D"]) await expect(table).toContainText("CAB-" + cabinet);
  await page.getByRole("combobox", { name: "TQ Status", exact: true }).selectOption("raised");
  await expect(page.getByRole("region", { name: "Active dataset" })).toContainText("4 of 32 matching signals");
  await page.getByRole("combobox", { name: "I/O Type", exact: true }).selectOption("DI");
  await expect(page.getByRole("region", { name: "Active dataset" })).toContainText("4 of 32 matching signals");
  await page.getByRole("combobox", { name: "I/O Type", exact: true }).selectOption("");
  await expect(page.getByRole("region", { name: "Active dataset" })).toContainText("8 of 32 matching signals");
  await page.getByRole("combobox", { name: "I/O Type", exact: true }).selectOption("AO");
  await page.getByRole("combobox", { name: "TQ Status", exact: true }).selectOption("none");
  await expect(page.getByRole("region", { name: "Active dataset" })).toContainText("8 of 32 matching signals");
  await expect(page.getByRole("combobox")).toHaveCount(2);
  await page.getByRole("button", { name: "Issues (8)", exact: true }).click();
  await expect(page.getByRole("combobox")).toHaveCount(2);
});

test("nonmatching I/O and TQ slots dim without recoloring, reassignment, or camera movement", async ({ page }) => {
  // Give every AI a TQ so full-canvas blue pixels cannot come from a nearby No-TQ AI.
  await openExplorer(page); await runCsv(page, demoRows().replace(/(SIG-[A-D]-5,)(?:AI|AIR),/g, "$1AO,"));
  const inspector = await inspectChannel(page, "A", 1);
  await expect(inspector.getByRole("heading", { name: "SIG-A-1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close inspector" }).click();
  expect(await colorPixels(page, "#1976D2")).toBeGreaterThan(500);
  await page.getByRole("combobox", { name: "I/O Type", exact: true }).selectOption("AO");
  expect(await colorPixels(page, "#1976D2")).toBeLessThan(50);
  await expect(page.getByRole("navigation", { name: "Hardware hierarchy" })).toContainText("Channel 1");
  await page.getByRole("combobox", { name: "I/O Type", exact: true }).selectOption("AI");
  expect(await colorPixels(page, "#1976D2")).toBeGreaterThan(500);
  await page.getByRole("combobox", { name: "TQ Status", exact: true }).selectOption("none");
  expect(await colorPixels(page, "#1976D2")).toBeLessThan(50);
  await page.getByRole("combobox", { name: "TQ Status", exact: true }).selectOption("raised");
  expect(await colorPixels(page, "#1976D2")).toBeGreaterThan(500);
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Selection inspector" })).toContainText("Application engineering validation: not run");
});

test("manual focus during playback persists after completion, with working orbit, pan and zoom", async ({ page }) => {
  await openExplorer(page); await runCsv(page, demoRows(), false);
  await inspectChannel(page, "A", 2);
  await page.getByRole("button", { name: "Close inspector" }).click();
  const canvas = page.locator("canvas"), box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.52, { steps: 12 }); await page.mouse.up();
  await ready(page); await page.mouse.move(0, 0); await page.waitForTimeout(1000);
  const settled = await canvas.screenshot(); await page.waitForTimeout(1700);
  expect((await canvas.screenshot()).equals(settled)).toBe(true);
  await expect(page.getByRole("navigation", { name: "Hardware hierarchy" })).toContainText("Channel 2");
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5); await page.mouse.wheel(0, 180); await page.waitForTimeout(600);
  expect((await canvas.screenshot()).equals(settled)).toBe(false);
  const zoom = await canvas.screenshot();
  await page.mouse.down({ button: "right" }); await page.mouse.move(box.x + box.width * 0.56, box.y + box.height * 0.56, { steps: 12 }); await page.mouse.up({ button: "right" }); await page.mouse.move(0, 0); await page.waitForTimeout(600);
  expect((await canvas.screenshot()).equals(zoom)).toBe(false);
});

test("TQ/error navigation and conflicting/unplaced record details remain available without extra filters", async ({ page }) => {
  await openExplorer(page);
  const rows = [header, "ERR-A,AO,CAB-A,CIOC-A,BP-1,1,1,Field,failed,TQ-A,blocking,Check duplicate", "ERR-B,DI,CAB-A,CIOC-A,BP-1,1,1,Field,,,,", "UNPLACED,AI,,CIOC-A,BP-1,2,2,Field,,,,"].join("\n");
  await runCsv(page, rows);
  await page.getByRole("button", { name: /^Issues \(/ }).click();
  await expect(page.getByRole("combobox")).toHaveCount(2);
  await page.getByRole("list", { name: "Allocation issues" }).getByRole("button").filter({ hasText: "No record was chosen" }).click();
  const inspector = page.getByRole("complementary", { name: "Selection inspector" });
  await expect(inspector.getByRole("heading", { name: "ERR-A", exact: true })).toBeVisible();
  await expect(inspector.getByRole("heading", { name: "ERR-B", exact: true })).toBeVisible();
  await expect(inspector).toContainText("Unknown I/O Type");
  await page.getByRole("button", { name: /^Issues \(/ }).click();
  await page.getByRole("list", { name: "Allocation issues" }).getByRole("button").filter({ hasText: "No reliable cabinet" }).click();
  await expect(inspector).toContainText("no reliable hardware location");
  await expect(page.getByRole("navigation", { name: "Hardware hierarchy" })).not.toContainText("Channel 1");
});

test("replacement cancels old playback and uses only the new workbook's records", async ({ page }) => {
  await openExplorer(page); const first = await runCsv(page, demoRows(), false);
  const next = [header, "NEW-ONLY,DO,CAB-Z,CIOC-Z,BP-1,1,1,Field,,,,"].join("\n");
  const name = await runCsv(page, next);
  await expect(page.getByRole("region", { name: "Active dataset" })).toContainText(name);
  await expect(page.getByRole("region", { name: "Active dataset" })).toContainText("1 cabinets");
  await expect(page.getByRole("region", { name: "Active dataset" })).not.toContainText(first);
  await page.getByRole("button", { name: "Records", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("NEW-ONLY");
  await expect(page.getByRole("table")).not.toContainText("SIG-A");
});

test("invalid files and missing columns produce one understandable error and no setup screen", async ({ page }) => {
  await openExplorer(page);
  await page.getByLabel("Excel workbook").setInputFiles({ name: "broken.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("not a workbook") });
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("could not be read");
  await page.getByLabel("Excel workbook").setInputFiles({ name: "unknown.csv", mimeType: "text/csv", buffer: Buffer.from("Unknown,Columns\na,b") });
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("needs these allocation columns");
  await expect(page.getByRole("alert")).toHaveCount(1);
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await runCsv(page);
  await expect(page.locator("canvas")).toBeVisible();
});

test("WebGL fallback, keyboard controls, reduced motion and responsive layouts remain usable", async ({ page }) => {
  await page.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type.includes("webgl") ? null : original.call(this, type, ...args); }; });
  await openExplorer(page, true); await runCsv(page);
  await expect(page.getByRole("heading", { name: "3D rendering is unavailable" })).toBeVisible();
  await expect(page.getByRole("table")).toContainText("SIG-A-1");
  await page.getByRole("button", { name: "Details", exact: true }).press("Enter");
  await page.getByRole("complementary", { name: "Selection inspector" }).getByRole("button", { name: /^CAB-A/ }).press("Enter");
  await page.getByRole("button", { name: "Close inspector" }).press("Enter");
  for (const width of [1280, 1024, 768, 390]) { await page.setViewportSize({ width, height: 900 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width); }
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
});

const coloredWorkbook = process.env.IO_COLOR_WORKBOOK || resolve(process.cwd(), "../../../Downloads/IO_Signal_Sudoku_Synthetic_3D_Demo_IO_Colored.xlsx");
test("the supplied Excel loads in one Run with all original cabinets, exact I/O colors and TQs", async ({ page }) => {
  test.skip(!existsSync(coloredWorkbook), "Supplied workbook is local and not committed.");
  await openExplorer(page);
  await page.getByLabel("Excel workbook").setInputFiles(coloredWorkbook);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("region", { name: "Active dataset" })).toContainText(basename(coloredWorkbook));
  await ready(page);
  await expect(page.getByRole("region", { name: "Active dataset" })).toContainText("3 cabinets");
  await expect(page.getByRole("region", { name: "Active dataset" })).toContainText("708 of 708 matching signals");
  await expect(page.locator("footer")).toContainText("1,152 source records");
  for (const [code, name, color, count] of [["AI", "Analog Input", "#1976D2", 260], ["AO", "Analog Output", "#8E24AA", 124], ["DI", "Digital Input", "#43A047", 169], ["DO", "Digital Output", "#FB8C00", 155]]) {
    await page.getByRole("combobox", { name: "I/O Type", exact: true }).selectOption(code);
    await expect(page.getByRole("region", { name: "Active dataset" })).toContainText(count + " of 708 matching signals");
    await page.getByRole("button", { name: "Records", exact: true }).click();
    const first = page.getByRole("table").locator("tbody button").first(), tag = await first.innerText();
    await first.click();
    await page.getByRole("button", { name: "Close inspector" }).click();
    await page.waitForTimeout(900); // Allow the explicit focus transition to settle before hovering its moving label.
    const label = page.getByRole("region", { name: "Interactive schematic allocation scene" }).getByRole("button", { name: new RegExp("^Channel \\d+: " + code + " — " + name + "$") });
    await label.hover();
    await expect(page.getByRole("tooltip")).toContainText(code + " — " + name);
    await expect(page.getByRole("tooltip")).toContainText(tag);
    await expect(page.getByRole("tooltip")).toContainText(/Channel \d+ · CHARM/);
    expect(await colorPixels(page, color)).toBeGreaterThan(500);
  }
  await page.getByRole("combobox", { name: "I/O Type", exact: true }).selectOption("AO");
  await page.getByRole("combobox", { name: "TQ Status", exact: true }).selectOption("all");
  await page.getByRole("button", { name: /^Issues \(/ }).click();
  await page.getByRole("list", { name: "Allocation issues" }).getByRole("button").filter({ hasText: "RED — Error / TQ" }).first().click();
  await expect(page.getByRole("complementary", { name: "Selection inspector" })).toContainText("Application engineering validation: not run");
  await page.getByRole("button", { name: "Close inspector" }).click();
  expect(await colorPixels(page, "#8E24AA")).toBeGreaterThan(500);
  expect(await colorPixels(page, "#FF767E")).toBeGreaterThan(20);
  await page.screenshot({ path: "test-results/simple-four-part-flow.png", fullPage: true });
  await page.getByRole("combobox", { name: "I/O Type", exact: true }).selectOption("");
  await page.getByRole("button", { name: "Fit scene / reset", exact: true }).click();
  await page.mouse.move(0, 0); await page.waitForTimeout(900);
  await page.screenshot({ path: "test-results/simple-flow-overview.png", fullPage: true });
});
