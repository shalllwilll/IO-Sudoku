import { describe, expect, it } from "vitest";
import { areaDisplay, areaText, cabinetDisplay, nodeLabel, signalDisplayName } from "./displayNames.js";
import { tqGuidance, tqStatusText } from "./tqGuidance.js";
import { tqRegisterStatuses } from "./directWorkbook.js";
import { buildDataset } from "./model.js";

const row = (id, overrides = {}) => ({ id, tag: `TAG-${id}`, ioType: "DI", kind: "Allocated", cabinet: "P30-DCM-32001-04", cioc: "C1", baseplate: "BP-1", channel: id, unit: "320", area: "OA-11", sourceFile: "t.xlsx", sourceRow: Number(id) + 1, ...overrides });

describe("display names", () => {
  it("labels cabinets by unit and number, and leaves other identifiers alone", () => {
    expect(cabinetDisplay("P30-DCM-32001-01")).toBe("Unit 320 — Cabinet 01");
    expect(cabinetDisplay("P30-DCM-32001-04")).toBe("Unit 320 — Cabinet 04");
    expect(cabinetDisplay("P24-DCM-50002-01")).toBe("Unit 500 — Cabinet 01");
    expect(cabinetDisplay("CAB-A")).toBe("");
    expect(nodeLabel({ label: "CAB-A" })).toBe("CAB-A");
  });
  it("labels operating areas and keeps the code beside them", () => {
    expect(areaDisplay("OA-14")).toBe("Process Area 14");
    expect(areaText("OA-14")).toBe("Process Area 14 (OA-14)");
    expect(areaText("North")).toBe("North");
  });
  it("derives a signal name from the row's own description only", () => {
    expect(signalDisplayName({ description: "SYNTHETIC DEMO — Pressure transmitter" })).toBe("Pressure transmitter — process pressure monitoring");
    expect(signalDisplayName({ description: "SYNTHETIC DEMO — Horn / audible alarm" })).toBe("Horn — audible alarm output");
    expect(signalDisplayName({ description: "SYNTHETIC DEMO — On/off valve solenoid" })).toBe("On/off valve solenoid — on/off valve actuation");
    expect(signalDisplayName({ description: "SYNTHETIC DEMO — Analyzer transmitter" })).toBe("Analyzer transmitter");
    expect(signalDisplayName({ description: "" })).toBe("");
  });
  it("derives the labels per dataset, keeps source identifiers, and names no spare", () => {
    const dataset = buildDataset([
      row("1", { description: "SYNTHETIC DEMO — Level switch", equipment: "EQ-1" }),
      row("2", { kind: "Wired Spare", tag: "", description: "Wired spare — field wiring present, no active signal assigned" }),
    ]);
    const [signal, spare] = dataset.records;
    expect(signal.displayName).toBe("Level switch — discrete level condition");
    expect(signal.tag).toBe("TAG-1");
    expect(spare.displayName).toBe("");
    const cabinet = dataset.nodes.get(dataset.root.childIds[0]);
    expect(cabinet.label).toBe("P30-DCM-32001-04");
    expect(cabinet.display).toBe("Unit 320 — Cabinet 04");
    expect(cabinet.areaCode).toBe("OA-11");
    expect(dataset.counts.cabinets).toBe(1);
    const other = buildDataset([row("1", { cabinet: "CAB-X", unit: "", area: "" })]);
    expect(other.nodes.get(other.root.childIds[0]).display).toBeUndefined();
  });
});

describe("TQ guidance", () => {
  it("explains known issue kinds and falls back to a generic reading", () => {
    expect(tqGuidance("Allocation conflict: the target position is reported as already occupied by another record.").check).toMatch(/source rows/);
    expect(tqGuidance("CHARM type / signal type incompatibility: confirm approved hardware selection.").why).toMatch(/CHARM/);
    expect(tqGuidance("Something new").why).toMatch(/flags this signal/);
  });
  it("reports the status as supplied and never invents one", () => {
    expect(tqStatusText("OPEN")).toBe("Open");
    expect(tqStatusText("")).toBe("Status not supplied");
  });
  it("reads statuses from a TQ register sheet by TQ id and tag", () => {
    const workbook = { sheets: [{ headers: ["TQ ID", "Signal Tag", "Status"], rows: [{ row: 2, values: ["TQ-1", "A", "OPEN"] }, { row: 3, values: ["TQ-2", "B", "RESOLVED"] }] }, { headers: ["Tag"], rows: [] }] };
    const statuses = tqRegisterStatuses(workbook);
    expect(statuses.get("TQ-1|A")).toBe("OPEN");
    expect(statuses.get("TQ-2|B")).toBe("RESOLVED");
    expect(statuses.size).toBe(2);
  });
});
