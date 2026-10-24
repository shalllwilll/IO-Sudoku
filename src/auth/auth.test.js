import { describe, expect, it } from "vitest";
import { isCompanyEmail } from "./isCompanyEmail.js";
import { safeReturnTo } from "./returnTo.js";

const domains = ["example-company.test"];

describe("isCompanyEmail", () => {
  it("accepts exact domain, ignoring case and spaces", () => {
    expect(isCompanyEmail("  A@Example-Company.TEST ", domains)).toBe(true);
  });
  it("rejects tricks", () => {
    expect(isCompanyEmail("a@example-company.test.evil.com", domains)).toBe(false);
    expect(isCompanyEmail("a@example-company.test@evil.com", domains)).toBe(false);
    expect(isCompanyEmail("a@exаmple-company.test", domains)).toBe(false);
    expect(isCompanyEmail("a@sub.example-company.test", domains)).toBe(false);
    expect(isCompanyEmail("", domains)).toBe(false);
    expect(isCompanyEmail("abc", domains)).toBe(false);
  });
  it("fails closed with an empty list", () => {
    expect(isCompanyEmail("a@example-company.test", [])).toBe(false);
  });
});

describe("safeReturnTo", () => {
  it("keeps same-origin paths", () => {
    expect(safeReturnTo("/projects/p1/rules?x=1")).toBe("/projects/p1/rules?x=1");
  });
  it("falls back for anything else", () => {
    for (const bad of ["//evil.com", "https://evil.com", "/" + String.fromCharCode(92) + "evil.com", "javascript:alert(1)", null, undefined, ""]) {
      expect(safeReturnTo(bad)).toBe("/projects");
    }
  });
});
