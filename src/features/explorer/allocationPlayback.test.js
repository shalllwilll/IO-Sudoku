import { describe, expect, it } from "vitest";
import { buildDataset } from "./model.js";
import { allocationTimeline, allocationFrame, createAllocationPlayback, inspectionRecords, PLAYBACK_MS, slotBrightness } from "./allocationPlayback.js";
import { allocatedWorkbook } from "./directWorkbook.js";
import { parseCsv } from "./workbook.js";

function fixture() {
  const records = ["A", "B", "C", "D"].flatMap((cabinet, index) => [1, 2].map((channel) => ({ id: `${cabinet}:${channel}`, tag: `TEST-${cabinet}-${channel}`, ioType: ["AI", "AIR", "DI", "AO"][index], cabinet: `CAB-${cabinet}`, cioc: `CIOC-${cabinet}`, baseplate: "BP-1", channel: String(channel), kind: "Field", sourceFile: "test.xlsx", sourceRow: index * 2 + channel + 1 })));
  records.push({ ...records[0], id: "spare", tag: "", channel: "3", kind: "Reserved Spare" });
  return buildDataset(records, {}, [{ id: "TQ-A", kind: "tq", status: "open", severity: "blocking", message: "Review A", recordIds: ["A:1"] }, { id: "TQ-C", kind: "tq", status: "open", severity: "assumed", message: "Review C", recordIds: ["C:1"] }]);
}

describe("sequential allocation presentation", () => {
  it("visits every actual cabinet and occupied position in hardware order, with no assignment changes", () => {
    const dataset = fixture(), before = JSON.stringify(dataset.records);
    const timeline = allocationTimeline(dataset);
    expect(timeline.cabinets.map((cabinet) => cabinet.label)).toEqual(["CAB-A", "CAB-B", "CAB-C", "CAB-D"]);
    expect(timeline.entries).toHaveLength(8);
    expect(timeline.rank.size).toBe(8);
    expect(allocationFrame(timeline, 0).phase).toBe("arrival");
    for (let index = 0; index < 4; index++) {
      const frame = allocationFrame(timeline, 650 + index * 1300);
      expect(frame.activeCabinetId).toBe(timeline.cabinets[index].id);
      expect(frame.current.cabinet).toBe(`CAB-${["A", "B", "C", "D"][index]}`);
    }
    expect(allocationFrame(timeline, 5900).phase).toBe("outgoing");
    expect(allocationFrame(timeline, PLAYBACK_MS)).toMatchObject({ phase: "complete", revealed: 8, running: false });
    const playback = createAllocationPlayback(dataset, { now: 0 });
    let count = 0;
    for (let elapsed = 0; elapsed <= 7000; elapsed += 17) { const frame = playback.advance(elapsed); expect(frame.revealed).toBeGreaterThanOrEqual(count); count = frame.revealed; }
    expect(JSON.stringify(dataset.records)).toBe(before);
    expect(dataset.counts.cabinets).toBe(4);
    expect(dataset.counts.valid).toBe(0);
  });
  it("cancels obsolete playback and supports instant reduced-motion presentation", () => {
    const dataset = fixture(), old = createAllocationPlayback(dataset, { now: 0 });
    old.advance(1000); old.cancel();
    expect(old.advance(2000)).toMatchObject({ phase: "complete", running: false, revealed: 8 });
    const next = createAllocationPlayback(dataset, { now: 3000 });
    expect(next.advance(3100).phase).toBe("arrival");
    expect(old.current.phase).toBe("complete");
    expect(createAllocationPlayback(dataset, { reducedMotion: true }).current).toMatchObject({ phase: "complete", running: false, revealed: 8 });
  });
  it("supports three or four actual cabinets without inserting a decorative allocation", () => {
    const dataset = fixture();
    const three = buildDataset(dataset.records.filter((record) => record.cabinet !== "CAB-D"));
    expect(allocationTimeline(three).cabinets).toHaveLength(3);
    expect(allocationTimeline(dataset).cabinets).toHaveLength(4);
  });
});

describe("two global inspection filters", () => {
  it("combines canonical I/O aliases and actual TQs across every cabinet", () => {
    const dataset = fixture(), before = JSON.stringify(dataset.records);
    expect(inspectionRecords(dataset, { ioType: "AI", tq: "all" }).map((record) => record.cabinet)).toEqual(["CAB-A", "CAB-A", "CAB-B", "CAB-B"]);
    expect(inspectionRecords(dataset, { ioType: "AI", tq: "raised" }).map((record) => record.id)).toEqual(["A:1"]);
    expect(inspectionRecords(dataset, { ioType: "DI", tq: "raised" }).map((record) => record.id)).toEqual(["C:1"]);
    expect(inspectionRecords(dataset, { ioType: "AO", tq: "none" }).map((record) => record.id)).toEqual(["D:1", "D:2"]);
    const visible = new Set(inspectionRecords(dataset, { ioType: "AI", tq: "none" }).map((record) => record.id));
    expect(slotBrightness(dataset.nodes.get(dataset.recordMap.get("A:1").nodeId), dataset, visible, null)).toBe(0.12);
    expect(slotBrightness(dataset.nodes.get(dataset.recordMap.get("B:1").nodeId), dataset, visible, null)).toBe(1);
    expect(slotBrightness(dataset.nodes.get(dataset.recordMap.get("spare").nodeId), dataset, visible, null)).toBe(1);
    expect(JSON.stringify(dataset.records)).toBe(before);
  });
});

it("loads a recognized workbook in one step and gives a concise missing-column error", () => {
  const sheet = parseCsv("Tag Name,IO Type,Electronic/ Marshalling Cabinet,CIOC/CSLS Name,Baseplate,Channel_No\nTEST-1,AI,CAB-A,CIOC-A,BP-1,1");
  const workbook = { name: "test.csv", sheets: [sheet] };
  expect(allocatedWorkbook(workbook).counts).toMatchObject({ signals: 1, positions: 1, cabinets: 1 });
  expect(() => allocatedWorkbook({ name: "bad.csv", sheets: [parseCsv("Unknown,Columns\na,b")] })).toThrow(/needs these allocation columns/);
});
