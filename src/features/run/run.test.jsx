import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/index.js";
import { mockControls, resetMock } from "../../api/mock/index.js";
import { streamOptions } from "../../api/mock/stream.js";
import { getSession, signInSession } from "../../auth/session.js";
import Run from "../../pages/Run.jsx";
import { cancelRun, controllerOptions, resetController, startRun } from "./runController.js";
import { initialRunState, reduce, runStore } from "./runStore.js";

const ev = (seq, type, data = {}) => ({ seq, type, data });
const fold = (events) => events.reduce(reduce, initialRunState);

describe("reduce", () => {
  const events = [
    ev(1, "run.started"),
    ev(2, "run.stage", { name: "A", index: 1, total: 3 }),
    ev(3, "placement", { count: 5 }),
    ev(4, "run.stage", { name: "B", index: 2, total: 3 }),
    ev(5, "tq.raised", { tq_id: "t1", code: "X" }),
    ev(6, "run.completed"),
  ];
  it("applies a duplicate once", () => {
    const state = fold([...events, events[2], events[2]]);
    expect(state.placed).toBe(5);
    expect(state.status).toBe("completed");
  });
  it("gives the same result when events arrive out of order", () => {
    const a = fold(events);
    const b = fold([events[0], events[1], events[3], events[2], events[5], events[4]]);
    expect({ ...b, seen: 0, log: 0 }).toEqual({ ...a, seen: 0, log: 0 });
    expect(b.stage).toBe("B");
    expect(b.log.map((l) => l.seq)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("does not leave a terminal state", () => {
    expect(fold([ev(1, "run.failed", { message: "boom" }), ev(2, "run.started")]).status).toBe("failed");
  });
});

describe("run controller with the mock stream", () => {
  let pid;
  beforeEach(async () => {
    resetMock();
    resetController();
    mockControls.delayMs = 0;
    streamOptions.intervalMs = 2;
    controllerOptions.backoff = [5];
    controllerOptions.silenceMs = 30000;
    pid = (await api.createProject({ name: "R" })).id;
  });
  afterEach(() => {
    cancelRun();
    vi.useRealTimers();
  });

  it("runs to completion", async () => {
    await startRun(pid, { fileNames: ["a.xlsx"] });
    await waitFor(() => expect(runStore.getState().status).toBe("completed"), { timeout: 3000 });
    expect(runStore.getState().placed).toBe(190);
    expect(runStore.getState().tqs).toHaveLength(1);
  });

  it("ignores a second start while running", async () => {
    const first = await startRun(pid);
    expect(await startRun(pid)).toBeNull();
    expect(first.id).toBeTruthy();
    expect((await api.listRuns(pid)).length).toBe(1);
  });

  it("survives a dropped stream and duplicate, reordered and malformed events", async () => {
    Object.assign(streamOptions, { dropAfter: 6, duplicateSeq: 4, malformed: true });
    await startRun(pid);
    await waitFor(() => expect(runStore.getState().status).toBe("completed"), { timeout: 3000 });
    expect(runStore.getState().placed).toBe(190);
  });

  it("shows run.failed and allows another run", async () => {
    streamOptions.failWith = "Engine error";
    await startRun(pid);
    await waitFor(() => expect(runStore.getState().status).toBe("failed"), { timeout: 3000 });
    expect(runStore.getState().error).toBe("Engine error");
    streamOptions.failWith = null;
    expect(await startRun(pid)).not.toBeNull();
  });

  it("cancels and closes the stream", async () => {
    streamOptions.intervalMs = 50;
    await startRun(pid);
    cancelRun();
    const placed = runStore.getState().placed;
    await new Promise((r) => setTimeout(r, 120));
    expect(runStore.getState().status).toBe("cancelled");
    expect(runStore.getState().placed).toBe(placed);
  });

  it("shows a notice after silence", async () => {
    controllerOptions.silenceMs = 20;
    streamOptions.silent = true;
    await startRun(pid);
    await waitFor(() => expect(runStore.getState().notice).toMatch(/Still working/), { timeout: 2000 });
  });

  it("signs out when the stream reports an expired session", async () => {
    signInSession({ email: "a@example-company.test" });
    streamOptions.unauthorized = true;
    await startRun(pid).catch(() => {});
    await waitFor(() => expect(getSession()).toBeNull());
  });

  it("refuses to start while offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await expect(startRun(pid)).rejects.toThrow(/offline/);
    expect((await api.listRuns(pid)).length).toBe(0);
    vi.restoreAllMocks();
  });
});

describe("Run page", () => {
  let pid;
  beforeEach(async () => {
    resetMock();
    resetController();
    mockControls.delayMs = 0;
    streamOptions.intervalMs = 2;
    pid = (await api.createProject({ name: "R" })).id;
    await api.uploadFile(pid, new File([new Uint8Array([1])], "a.xlsx"));
  });

  const open = () =>
    render(
      <MemoryRouter initialEntries={[`/projects/${pid}/run`]}>
        <Routes>
          <Route path="/projects/:id/run" element={<Run />} />
          <Route path="/projects/:id/result" element={<p>result page</p>} />
        </Routes>
      </MemoryRouter>,
    );

  it("blocks Run while mapping is incomplete", async () => {
    await api.saveMapping(pid, { "a.xlsx": { 2: "" } });
    open();
    expect(await screen.findByText("Mapping is incomplete.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
  });

  it("starts once and moves to the result page", async () => {
    await api.saveMapping(pid, { "a.xlsx": { 0: "tag", 1: "io_type", 2: "cable", 3: "pair" } });
    open();
    const user = userEvent.setup();
    const button = await screen.findByRole("button", { name: "Run" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.dblClick(button);
    expect(await screen.findByText("result page", {}, { timeout: 3000 })).toBeInTheDocument();
    expect((await api.listRuns(pid)).length).toBe(1);
  });
});
