import { describe, expect, it } from "vitest";
import { redact, sourceLine } from "./chat/redact.js";
import { faqAnswer } from "./chat/faq.js";
import { changedPreferences, DEFAULT_PREFERENCES, validatePreferences } from "./preferences/schema.js";
import { mergeFiles, validateFile } from "./upload/validateFile.js";

const file = (name, bytes, size = bytes.length) => {
  const f = new File([new Uint8Array(bytes)], name);
  if (size !== bytes.length) Object.defineProperty(f, "size", { value: size });
  return f;
};

describe("validateFile", () => {
  it("accepts xlsx magic bytes", async () => {
    expect((await validateFile(file("a.xlsx", [0x50, 0x4b, 3, 4, 0, 0]))).ok).toBe(true);
  });
  it("accepts xls magic bytes", async () => {
    expect((await validateFile(file("a.xls", [0xd0, 0xcf, 0x11, 0xe0, 0]))).ok).toBe(true);
  });
  it("refuses a renamed text file", async () => {
    expect((await validateFile(file("a.xlsx", [104, 105]))).ok).toBe(false);
  });
  it("refuses wrong type, empty and oversize", async () => {
    expect((await validateFile(file("a.pdf", [1]))).ok).toBe(false);
    expect((await validateFile(file("a.xlsx", []))).ok).toBe(false);
    expect((await validateFile(file("a.xlsx", [0x50, 0x4b, 3, 4], 3 * 1048576), { maxMb: 1 })).reason).toMatch(/1 MB/);
  });
  it("refuses a CSV with NUL bytes", async () => {
    expect((await validateFile(file("a.csv", [97, 0, 98]))).ok).toBe(false);
    expect((await validateFile(file("a.csv", [97, 44, 98]))).ok).toBe(true);
  });
});

describe("mergeFiles", () => {
  it("sorts, drops duplicates and caps", () => {
    const a = file("b.xlsx", [1]);
    const b = file("a.xlsx", [1, 2]);
    const dup = file("b.xlsx", [1]);
    const merged = mergeFiles([a], [b, dup], 10);
    expect(merged.files.map((f) => f.name)).toEqual(["a.xlsx", "b.xlsx"]);
    expect(merged.notes).toHaveLength(1);
    const many = Array.from({ length: 12 }, (_, i) => file(`f${String(i).padStart(2, "0")}.csv`, [i + 1]));
    expect(mergeFiles([], many, 10).files).toHaveLength(10);
  });
});

describe("preferences", () => {
  it("validates the spare percentage", () => {
    for (const bad of ["-5", "51", "abc", "10.55", ""]) {
      expect(validatePreferences({ ...DEFAULT_PREFERENCES, sparePercent: bad }).sparePercent).toBeTruthy();
    }
    expect(validatePreferences({ ...DEFAULT_PREFERENCES, sparePercent: "12.5" })).toEqual({});
  });
  it("sends only changed values", () => {
    expect(changedPreferences(DEFAULT_PREFERENCES)).toEqual({});
    expect(changedPreferences({ ...DEFAULT_PREFERENCES, sparePercent: "12" })).toEqual({ sparePercent: "12" });
  });
});

describe("chat helpers", () => {
  it("redacts everything outside the allow-list", () => {
    const out = redact({ rows: 190, tag: "320-FT-1", cells: [["x"]], columnNames: ["Tag", 5, "x".repeat(80)], tqCodes: ["MISSING_CABLE"] });
    expect(out).toEqual({ rows: 190, columnNames: ["Tag"], tqCodes: ["MISSING_CABLE"] });
    expect(sourceLine(out)).toContain("rows");
  });
  it("falls back to canned answers", () => {
    expect(faqAnswer("what does the mapping step do?")).toMatch(/Mapping/);
    expect(faqAnswer("zzz")).toMatch(/unavailable/);
  });
});
