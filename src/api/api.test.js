import { beforeEach, describe, expect, it } from "vitest";
import { ConfigError, parseDomains, resolveMode } from "../config.js";
import { api } from "./index.js";
import { NetworkError, ServerError, ValidationError } from "./errors.js";
import { liveApi } from "./live/index.js";
import { mockApi, mockControls, resetMock } from "./mock/index.js";

beforeEach(() => {
  resetMock();
  mockControls.delayMs = 0;
});

describe("mode selection", () => {
  it("defaults to mock", () => {
    expect(resolveMode(undefined)).toBe("mock");
    expect(api).toBe(mockApi);
  });
  it("throws a clear error for an unknown mode", () => {
    expect(() => resolveMode("banana")).toThrow(ConfigError);
  });
  it("parses the domain list", () => {
    expect(parseDomains(" A.test , b.test,,")).toEqual(["a.test", "b.test"]);
    expect(parseDomains("")).toEqual([]);
  });
});

describe("live stub", () => {
  it("reports not implemented", async () => {
    await expect(liveApi.listProjects()).rejects.toThrow(ServerError);
  });
});

describe("mock responses", () => {
  it("validates against the schema", async () => {
    const created = await api.createProject({ name: "Demo" });
    expect(created.name).toBe("Demo");
    expect(await api.listProjects()).toHaveLength(1);
  });
  it("names the bad field on a contract mismatch", async () => {
    mockControls.corruptNext = true;
    const error = await api.createProject({ name: "X" }).catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.field).toBe("id");
  });
  it("surfaces a network failure", async () => {
    mockControls.failNext = "network";
    await expect(api.listProjects()).rejects.toThrow(NetworkError);
  });
});
