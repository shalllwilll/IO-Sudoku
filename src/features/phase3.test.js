import { describe, expect, it } from "vitest";
import { checkCompiled } from "./rules/PlainEnglishRule.jsx";
import { PRIMITIVES, newRule, validateRule } from "./rules/ruleSchema.js";
import { exportSet, importSet, validateSetName } from "./rulesets/ruleSets.js";
import { assignmentsFromWire, confirmedToWire } from "../api/live/wire.js";
import { confidenceLevel, initialAssignments, validateAssignments } from "./mapping/mappingState.js";
import { normaliseIoType } from "./values/normaliseIoType.js";
import { DEFAULT_GROUPING_RULE, parseGrouping } from "./values/parseGrouping.js";

describe("mapping state", () => {
  it("grades confidence with text levels", () => {
    expect(confidenceLevel(0.95)).toBe("High");
    expect(confidenceLevel(80)).toBe("Medium");
    expect(confidenceLevel(0.6)).toBe("Low");
  });
  it("flags missing and duplicate fields", () => {
    expect(validateAssignments({ 0: "tag", 1: "tag", 2: "io_type", 3: "pair" })).toEqual({ missing: ["cable"], duplicates: ["tag"] });
    expect(validateAssignments({ 0: "tag", 1: "io_type", 2: "cable", 3: "pair", 4: "" })).toEqual({ missing: [], duplicates: [] });
  });
  it("prefers the saved wire entry over automatic matches", () => {
    const sheet = { columns: ["A", "B", ""], matches: { A: { field: "tag", confidence: 1 } } };
    expect(initialAssignments(sheet, undefined)).toEqual({ 0: "tag", 1: "", 2: "" });
    expect(initialAssignments(sheet, { io_type: "A" })).toEqual({ 0: "io_type", 1: "", 2: "" });
    expect(initialAssignments(sheet, {})).toEqual({ 0: "", 1: "", 2: "" });
  });
});

describe("parseGrouping", () => {
  const p = (v, rule) => parseGrouping(v, rule);
  it("parses the sample values", () => {
    expect(p("-")).toMatchObject({ group: null, segregation: null });
    expect(p("A")).toMatchObject({ group: null, segregation: "A" });
    expect(p("B")).toMatchObject({ group: null, segregation: "B" });
    expect(p("A-CONTROL")).toMatchObject({ group: "CONTROL", segregation: "A" });
    expect(p("B-ALARM")).toMatchObject({ group: "ALARM", segregation: "B" });
    expect(p("C")).toMatchObject({ group: "C", segregation: null });
    expect(p("E")).toMatchObject({ group: "E", segregation: null });
  });
  it("re-parses when prefixes change", () => {
    const rule = { ...DEFAULT_GROUPING_RULE, prefixes: ["A"] };
    expect(p("B", rule)).toMatchObject({ group: "B", segregation: null });
    expect(p("B-ALARM", rule)).toMatchObject({ group: "B-ALARM", segregation: null });
  });
  it("is deterministic on odd input", () => {
    for (const v of ["AB", "a-control", "A-", "A-B-C", "", "x".repeat(10000), "<b>A</b>"]) {
      expect(p(v)).toEqual(p(v));
    }
    expect(p("x".repeat(10000)).status).toBe("unparsed");
    expect(p("a-control")).toMatchObject({ segregation: "A", group: "CONTROL" });
    expect(p("A-B-C")).toMatchObject({ segregation: "A", group: "B-C" });
    expect(p("<b>A</b>").group).toBe("<B>A</B>");
  });
});

describe("normaliseIoType", () => {
  it("maps legacy spellings and splits duty", () => {
    expect(normaliseIoType("AI")).toEqual({ base: "AIR", duty: null });
    expect(normaliseIoType("DO-SOV")).toEqual({ base: "DOR", duty: "SOV" });
    expect(normaliseIoType("XQ").base).toBeNull();
  });
});

describe("rule schema", () => {
  it("validates parameters", () => {
    const rule = newRule("reserve");
    expect(validateRule(rule)).toEqual({});
    for (const bad of [-1, 101, "abc"]) expect(validateRule({ ...rule, parameters: { percent: bad } }).percent).toBeTruthy();
    expect(validateRule({ primitive: "x", parameters: {} })).toHaveProperty("primitive");
    expect(Object.keys(PRIMITIVES)).toHaveLength(9);
  });
});

describe("rule sets", () => {
  const rules = [newRule("separate")];
  it("round-trips through export and import", () => {
    const result = importSet(exportSet("A", rules));
    expect(result.ok).toBe(true);
    expect(result.set.rules).toEqual(rules);
  });
  it("rejects malformed, wrong version, poisoned and oversize files", () => {
    expect(importSet("{").ok).toBe(false);
    expect(importSet(JSON.stringify({ name: "A", version: 99, rules: [] })).error).toMatch(/version/);
    expect(importSet('{"name":"A","version":1,"rules":[],"__proto__":{"polluted":1}}').ok).toBe(false);
    expect(({}).polluted).toBeUndefined();
    expect(importSet("x".repeat(1024 * 1024 + 1)).error).toMatch(/1 MB/);
    expect(importSet(JSON.stringify({ name: "A", version: 1, rules: [], extra: 1 })).ok).toBe(false);
  });
  it("validates names", () => {
    expect(validateSetName("", [])).toBeTruthy();
    expect(validateSetName("x".repeat(61), [])).toBeTruthy();
    expect(validateSetName("A", ["a"])).toMatch(/already exists/);
    expect(validateSetName("<b>x</b>", [])).toBe("");
  });
});

describe("compiled rule check", () => {
  it("accepts one valid rule", () => {
    expect(checkCompiled({ rule: { ...newRule("separate") }, message: "ok" }).ok).toBe(true);
  });
  it("rejects unknown types, missing rule and list outputs", () => {
    expect(checkCompiled({ rule: { primitive: "x", parameters: {} } }).ok).toBe(false);
    expect(checkCompiled({ rule: null, message: "Could not understand" }).ok).toBe(false);
    expect(checkCompiled({ rule: newRule("separate"), rules: [] }).ok).toBe(false);
  });
});

describe("mapping wire codec", () => {
  const sheet = { file: "a.xlsx", columns: ["Tag No", "Type", "", "Cable"] };
  it("sends { file: { field: columnName } }, never column indexes", () => {
    expect(confirmedToWire([sheet], [{ 0: "tag", 1: "io_type", 2: "pair", 3: "" }])).toEqual({ "a.xlsx": { tag: "Tag No", io_type: "Type" } });
  });
  it("keeps the first column of a duplicated field and merges sheets of one file", () => {
    const second = { file: "a.xlsx", columns: ["Other"] };
    expect(confirmedToWire([sheet, second], [{ 0: "tag", 1: "tag", 2: "", 3: "cable" }, { 0: "area" }])).toEqual({ "a.xlsx": { tag: "Tag No", cable: "Cable", area: "Other" } });
  });
  it("round-trips through the wire shape", () => {
    const assignments = { 0: "tag", 1: "io_type", 2: "", 3: "cable" };
    const wire = confirmedToWire([sheet], [assignments]);
    expect(assignmentsFromWire(sheet, wire["a.xlsx"])).toEqual(assignments);
  });
});
