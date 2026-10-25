import { describe, expect, it } from "vitest";
import { buildDataset } from "./model.js";
import { createGeometry } from "./geometry.js";
import { computeLod, emptyLod, forcedLodFor, lodThresholds, sameLod, withHysteresis } from "./cabinetVisibility.js";
import { ancestors } from "./model.js";

const row = (id, overrides = {}) => ({ id, tag: `TAG-${id}`, ioType: "DI", kind: "Allocated", cabinet: "CAB-A", cioc: "C1", baseplate: "BP-1", channel: id, sourceFile: "t.xlsx", sourceRow: Number(id) + 1, ...overrides });

describe("withHysteresis", () => {
  it("opens only once inside enter, and stays open until past exit", () => {
    const thresholds = { enter: 10, exit: 14 };
    expect(withHysteresis(false, 11, thresholds)).toBe(false);
    expect(withHysteresis(false, 9, thresholds)).toBe(true);
    expect(withHysteresis(true, 13, thresholds)).toBe(true);
    expect(withHysteresis(true, 15, thresholds)).toBe(false);
  });
});

describe("computeLod", () => {
  const dataset = buildDataset([row("1"), row("2", { cabinet: "CAB-B", cioc: "C2", baseplate: "BP-2", channel: "1" })]);
  const geometry = createGeometry(dataset);
  const [cabA, cabB] = dataset.root.childIds;

  it("opens nothing far from both cabinets", () => {
    const next = computeLod(dataset, geometry, [0, 0, 500], emptyLod());
    expect(next.cabinets.size).toBe(0);
  });
  it("opens a cabinet, then its CIOC, then its baseplate, as the camera gets closer", () => {
    // A single cabinet with a hand-built, well-separated geometry, so each level's threshold is
    // tested in isolation rather than depending on how close a minimal fixture happens to pack.
    const solo = buildDataset([row("1")]);
    const [cabinetId] = solo.root.childIds;
    const [ciocId] = solo.nodes.get(cabinetId).childIds;
    const [plateId] = solo.nodes.get(ciocId).childIds;
    // Each level is smaller than its parent, as real CIOCs and baseplates are, sitting just inside
    // its depth. The camera positions below mirror how `CameraController`'s own "fit to bounding
    // box" distance scales with an object's size: close enough to open that object's own level,
    // without yet being close enough for its much smaller child.
    const spread = new Map(createGeometry(solo));
    spread.set(cabinetId, { position: [0, 0, 0], size: [10, 8, 3] });
    spread.set(ciocId, { position: [0, 0, 1.2], size: [3, 3, 1] });
    spread.set(plateId, { position: [0, 0, 2.4], size: [0.6, 0.6, 0.4] });
    const cabinetEnter = lodThresholds(spread.get(cabinetId)).enter;
    const ciocEnter = lodThresholds(spread.get(ciocId)).enter;
    const plateEnter = lodThresholds(spread.get(plateId)).enter;

    const far = computeLod(solo, spread, [0, 0, cabinetEnter * 4], emptyLod());
    expect(far.cabinets.has(cabinetId)).toBe(false);

    const atCabinet = computeLod(solo, spread, [0, 0, cabinetEnter * 0.9], emptyLod());
    expect(atCabinet.cabinets.has(cabinetId)).toBe(true);
    expect(atCabinet.ciocs.size).toBe(0);
    expect(atCabinet.baseplates.size).toBe(0);

    const atCioc = computeLod(solo, spread, [0, 0, 1.2 + ciocEnter * 0.9], atCabinet);
    expect(atCioc.ciocs.has(ciocId)).toBe(true);
    expect(atCioc.baseplates.size).toBe(0);

    const atBaseplate = computeLod(solo, spread, [0, 0, 2.4 + plateEnter * 0.9], atCioc);
    expect(atBaseplate.baseplates.has(plateId)).toBe(true);
  });
  it("leaves a cabinet far outside every threshold closed", () => {
    const cabBShape = geometry.get(cabB);
    const thresholds = lodThresholds(cabBShape);
    const farFromB = [cabBShape.position[0] + thresholds.exit * 3, cabBShape.position[1], cabBShape.position[2]];
    const next = computeLod(dataset, geometry, farFromB, emptyLod());
    expect(next.cabinets.has(cabB)).toBe(false);
  });
  it("keeps a forced id open however far the camera is, without opening its siblings", () => {
    const forced = forcedLodFor(dataset, ancestors, [dataset.records[0].nodeId]);
    const next = computeLod(dataset, geometry, [0, 0, 500], emptyLod(), forced);
    expect(next.cabinets.has(cabA)).toBe(true);
    expect(next.cabinets.has(cabB)).toBe(false);
    expect(next.baseplates.has(dataset.nodes.get(dataset.records[0].nodeId).parentId)).toBe(true);
  });
  it("diagonal-based thresholds grow with a larger shape, and enter is always nearer than exit", () => {
    const small = lodThresholds({ size: [4, 4, 2] });
    const large = lodThresholds({ size: [10, 8, 2] });
    expect(large.enter).toBeGreaterThan(small.enter);
    expect(small.enter).toBeLessThan(small.exit);
  });
});

describe("sameLod", () => {
  it("compares set membership, not reference", () => {
    const a = { cabinets: new Set(["x"]), ciocs: new Set(), baseplates: new Set() };
    const b = { cabinets: new Set(["x"]), ciocs: new Set(), baseplates: new Set() };
    expect(sameLod(a, b)).toBe(true);
    expect(sameLod(a, emptyLod())).toBe(false);
  });
});
