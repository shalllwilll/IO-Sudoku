// Workbook parsing stays local. ExcelJS is loaded only when a workbook is opened.
export const FIELDS = {
  tag: ["Tag Name", "Tag Number"],
  description: ["Service Description", "Instrument Description", "Service"],
  ioType: ["IO Type", "I/O Type", "I/O Type Name"],
  signalType: ["Signal Type"],
  cabinet: ["Electronic/ Marshalling Cabinet", "Marshalling Cabinet Name", "Marshalling Cabinet"],
  systemCabinet: ["System Cabinet", "System Cabinet Name"],
  controller: ["Controller", "Controller Assignment"],
  cioc: ["CIOC/CSLS Name", "I/O Allocation CIOC/CSLS"],
  baseplate: ["Baseplate", "Charm Baseplate"],
  channel: ["Channel_No", "Channel No", "Charm Slot"],
  charm: ["CHARM_No", "CHARM No"],
  charmType: ["CHARM Type"],
  terminalBlock: ["CHARM TB Part No", "Marshalling Cabinet T.B No"],
  terminal1: ["CHARM TB1", "TB 1"],
  terminal2: ["CHARM TB2", "TB 2"],
  terminal3: ["CHARM TB3", "TB 3"],
  cable: ["Field Cable No", "Multipair Cable No."],
  pair: ["Field Cable Pair", "Pair Number"],
  equipment: ["Equipment Name"],
  kind: ["Tag Status", "Placement Kind"],
  validation: ["Validation Status", "Allocation Validation Status"],
  validationMessage: ["Validation Message", "Validation Error"],
  tqId: ["TQ ID", "TQ Identifier"],
  tqSeverity: ["TQ Severity"],
  tqStatus: ["TQ Status"],
  tqMessage: ["TQ Message", "TQ Description"],
  revision: ["Revision No", "Revision #"],
  change: ["Change Type", "Revision Change Type"],
  visualizationHint: ["Visualization Status"],
  scenario: ["Synthetic Scenario"],
  dataOrigin: ["Data Origin"],
};

export const FIELD_LABELS = {
  tag: "Signal tag", description: "Description", ioType: "I/O type", signalType: "Signal type",
  cabinet: "Marshalling cabinet", systemCabinet: "System cabinet", controller: "Controller",
  cioc: "CIOC / CSLS", baseplate: "Baseplate", channel: "Channel within baseplate", charm: "CHARM identifier",
  charmType: "CHARM type", terminalBlock: "Terminal block", terminal1: "Terminal 1", terminal2: "Terminal 2", terminal3: "Terminal 3",
  cable: "Field cable", pair: "Cable pair", equipment: "Equipment", kind: "Position / tag kind",
  validation: "Source validation status", validationMessage: "Validation message",
  tqId: "TQ identifier", tqSeverity: "TQ severity", tqStatus: "TQ status", tqMessage: "TQ message",
  revision: "Revision", change: "Change category",
  visualizationHint: "Workbook visualization hint (not validation)", scenario: "Synthetic scenario", dataOrigin: "Data origin",
};

export function preferredDataSheet(workbook) {
  let best = 0, bestScore = -1;
  workbook.sheets.forEach((sheet, index) => {
    const mapping = suggestMapping(sheet.headers);
    const score = ["cabinet", "cioc", "baseplate", "channel", "tag"].reduce((value, field) => value + (mapping[field] !== "" ? 10 : 0), 0) + Object.values(mapping).filter((value) => value !== "").length;
    if (score > bestScore) { best = index; bestScore = score; }
  });
  return best;
}

export const clean = (value) => {
  const text = String(value ?? "").trim();
  return !text || /^(?:-|—|n\/a|null|undefined)$/i.test(text) ? "" : text;
};
const headerKey = (value) => clean(value).toLowerCase().replace(/[\s_]+/g, " ");

export function suggestMapping(headers) {
  return Object.fromEntries(Object.entries(FIELDS).map(([field, aliases]) => {
    const index = headers.findIndex((header) => aliases.some((alias) => headerKey(alias) === headerKey(header)));
    return [field, index < 0 ? "" : String(index)];
  }));
}

export function mappingProblems(mapping) {
  const used = new Map();
  const errors = [];
  for (const [field, column] of Object.entries(mapping)) {
    if (column === "") continue;
    if (used.has(column)) errors.push(`${FIELD_LABELS[field]} and ${FIELD_LABELS[used.get(column)]} use the same column.`);
    used.set(column, field);
  }
  if (mapping.tag === "" && mapping.channel === "") errors.push("Map a signal tag or a channel column to identify records.");
  return errors;
}

function cellText(cell) {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if (value instanceof Date) return value.toISOString();
  if ("formula" in value || "sharedFormula" in value) return value.result === undefined ? "" : String(value.result);
  if (value.richText) return value.richText.map((part) => part.text).join("");
  if (value.text !== undefined) return String(value.text);
  if (value.error) return String(value.error);
  return cell.text || "";
}

function makeSheet(name, rows) {
  const candidates = rows.slice(0, 30).map((row) => ({ row, score: Object.values(suggestMapping(row.values)).filter((v) => v !== "").length }));
  const best = candidates.sort((a, b) => b.score - a.score)[0];
  if (!best || best.score === 0) return { name, headerRow: rows[0]?.row ?? 1, headers: rows[0]?.values ?? [], rows: rows.slice(1) };
  return { name, headerRow: best.row.row, headers: best.row.values, rows: rows.filter((row) => row.row > best.row.row) };
}

export function parseCsv(text, name = "CSV") {
  const rows = [];
  let values = [], value = "", quoted = false, line = 1, startLine = 1;
  text = text.replace(/^\uFEFF/, "");
  for (let index = 0; index <= text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index++; }
      else if (quoted || value === "") quoted = !quoted;
      else value += char;
    } else if (!quoted && (char === "," || char === "\n" || index === text.length)) {
      values.push(value.replace(/\r$/, "")); value = "";
      if (values.length > 500) throw new Error("CSV exceeds the viewer limit of 500 columns.");
      if (char !== ",") {
        if (values.some((entry) => clean(entry))) rows.push({ row: startLine, values });
        if (rows.length > 100001) throw new Error("CSV exceeds the viewer limit of 100,000 data rows.");
        values = []; startLine = line + 1;
      }
    } else if (char !== undefined) value += char;
    if (char === "\n") line++;
  }
  if (quoted) throw new Error("CSV has an unterminated quoted field. Check the source file.");
  return makeSheet(name, rows);
}

export async function readWorkbook(buffer, name) {
  if (buffer.byteLength > 25 * 1024 * 1024) throw new Error("The workbook exceeds the 25 MB viewer limit.");
  const started = performance.now();
  let sheets;
  if (/\.csv$/i.test(name)) {
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
    catch { throw new Error("CSV must use UTF-8 encoding. Export as UTF-8 CSV and try again."); }
    sheets = [parseCsv(text)];
  }
  else {
    if (!/\.(xlsx|xlsm)$/i.test(name)) throw new Error("Choose an .xlsx, .xlsm, or .csv file. Save legacy .xls files as .xlsx first.");
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    try { await workbook.xlsx.load(buffer); }
    catch { throw new Error("This file could not be read as an Excel workbook. It may be damaged, encrypted, or use an unsupported format."); }
    sheets = workbook.worksheets.map((sheet) => {
      if (sheet.rowCount > 100001 || sheet.columnCount > 500) throw new Error("A worksheet exceeds the viewer limit of 100,000 rows or 500 columns. Split the workbook before importing.");
      const rows = [];
      sheet.eachRow((row) => {
        const values = Array.from({ length: sheet.columnCount }, (_, index) => cellText(row.getCell(index + 1)));
        if (values.some((value) => clean(value))) rows.push({ row: row.number, values });
      });
      return makeSheet(sheet.name, rows);
    });
  }
  if (!sheets.some((sheet) => sheet.rows.length)) throw new Error("The workbook contains no data rows below a header.");
  return { name, sheets, parseMs: performance.now() - started };
}
