import { describe, expect, it } from "vitest";
import { buildDataset } from "./model.js";
import { createGeometry, fullSignalRoute } from "./geometry.js";
import { routeCurveT, routePoints } from "./allocationRoute.js";
import { ARRIVAL_MS, FILL_MS, PLAYBACK_MS } from "./allocationPlayback.js";

const row = (id, overrides = {}) => ({ id, tag: `TAG-${id}`, ioType: "DI", kind: "Allocated", cabinet: `CAB-${id}`, cioc: "C1", baseplate: "BP-1", channel: "1", sourceFile: "t.xlsx", sourceRow: Number(id) + 1, ...overrides });

describe("routeCurveT", () => {
  it("starts at 0, ends at 1, and only reaches the midpoint once every cabinet is filled", () => {
    expect(routeCurveT(0, 3)).toBe(0);
    expect(routeCurveT(PLAYBACK_MS, 3)).toBe(1);
    expect(routeCurveT(PLAYBACK_MS + 500, 3)).toBe(1);
    const t = routeCurveT(ARRIVAL_MS, 3);
    expect(t).toBeCloseTo(1 / 4, 5); // exactly at cabinet 1 when arrival finishes
    expect(routeCurveT(ARRIVAL_MS + FILL_MS, 3)).toBeCloseTo(3 / 4, 5); // at cabinet 3 when filling finishes
  });
  it("advances monotonically through arrival, filling and outgoing", () => {
    const samples = [0, 200, ARRIVAL_MS, ARRIVAL_MS + 100, ARRIVAL_MS + FILL_MS / 2, ARRIVAL_MS + FILL_MS, ARRIVAL_MS + FILL_MS + 300, PLAYBACK_MS];
    const values = samples.map((ms) => routeCurveT(ms, 3));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
  });
  it("is defined even with zero cabinets", () => {
    expect(routeCurveT(1000, 0)).toBe(1);
  });
});

describe("routePoints / fullSignalRoute", () => {
  it("places one point per cabinet between the field and control-room ends", () => {
    const dataset = buildDataset([row("1"), row("2"), row("3")]);
    const geometry = createGeometry(dataset);
    const points = routePoints(geometry, dataset);
    expect(points).toHaveLength(dataset.root.childIds.length + 2);
    const field = geometry.get("site-field"), control = geometry.get("site-control");
    expect(points[0][0]).toBeLessThan(field.position[0] + field.size[0]);
    expect(points.at(-1)[0]).toBeGreaterThan(control.position[0] - control.size[0]);
  });
  it("extends the field-to-CHARM route on to the control room, field-first regardless of direction", () => {
    const dataset = buildDataset([row("1", { ioType: "AI" }), row("2", { ioType: "AO", cabinet: "CAB-1" })]);
    const geometry = createGeometry(dataset);
    const control = geometry.get("site-control");
    for (const record of dataset.records) {
      const route = fullSignalRoute(geometry, dataset, record);
      expect(route.at(-1)[0]).toBeCloseTo(control.position[0] - control.size[0] * 0.35, 5);
      const slotShape = geometry.get(record.nodeId);
      // The field end comes first and the CHARM slot appears before the appended control point.
      expect(route[0][0]).toBeLessThan(slotShape.position[0]);
    }
  });
});
