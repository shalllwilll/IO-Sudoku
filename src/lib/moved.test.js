import { describe, expect, it } from "vitest";
import { classify, moved, parseSlot, slotOf, tally } from "./moved.js";

describe("parseSlot and slotOf", () => {
  it("round-trips a position through its slot string", () => {
    const pos = { cabinet: 1, cioc: 3, baseplate: 2, channel: 7 };
    expect(parseSlot(slotOf(pos))).toEqual(pos);
  });
  it("rejects anything that is not four numbers", () => {
    expect(parseSlot("1/2/3")).toBeNull();
    expect(parseSlot("1/2/3/x")).toBeNull();
    expect(parseSlot(null)).toBeNull();
    expect(parseSlot(undefined)).toBeNull();
  });
});

describe("moved", () => {
  const a = { cabinet: 1, cioc: 1, baseplate: 1, channel: 1 };
  it("is false for the same position", () => {
    expect(moved(a, { ...a })).toBe(false);
  });
  it("is true when any part of the position differs", () => {
    expect(moved(a, { ...a, channel: 2 })).toBe(true);
    expect(moved(a, { ...a, baseplate: 2 })).toBe(true);
    expect(moved(a, { ...a, cioc: 2 })).toBe(true);
    expect(moved(a, { ...a, cabinet: 2 })).toBe(true);
  });
  it("counts an add or a remove as moved too", () => {
    expect(moved(null, a)).toBe(true);
    expect(moved(a, null)).toBe(true);
    expect(moved(null, null)).toBe(false);
  });
});

describe("classify", () => {
  it("is added, removed, moved or stationary by slot alone", () => {
    expect(classify({ old_slot: null, new_slot: "1/1/1/1" })).toBe("added");
    expect(classify({ old_slot: "1/1/1/1", new_slot: null })).toBe("removed");
    expect(classify({ old_slot: "1/1/1/1", new_slot: "1/1/1/2" })).toBe("moved");
    expect(classify({ old_slot: "1/1/1/1", new_slot: "1/1/1/1" })).toBe("stationary");
  });
  it("a field-only change (a CHARM type) is stationary, not moved (T-7.2-8)", () => {
    expect(classify({ old_slot: "2/3/4/5", new_slot: "2/3/4/5", fields: ["charm_part"] })).toBe("stationary");
  });
  it("gives null when neither side has a slot", () => {
    expect(classify({ old_slot: null, new_slot: null })).toBeNull();
    expect(classify({})).toBeNull();
  });
});

describe("tally", () => {
  it("counts each kind across a list of deltas", () => {
    const deltas = [
      { old_slot: null, new_slot: "1/1/1/1" },
      { old_slot: "1/1/1/2", new_slot: null },
      { old_slot: "1/1/1/3", new_slot: "1/1/1/4" },
      { old_slot: "1/1/1/5", new_slot: "1/1/1/5" },
    ];
    expect(tally(deltas)).toEqual({ added: 1, removed: 1, moved: 1, stationary: 1 });
  });
  it("is empty for no deltas", () => {
    expect(tally([])).toEqual({ added: 0, removed: 0, moved: 0, stationary: 0 });
  });
});
