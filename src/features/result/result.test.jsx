import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { buildResult } from "../../api/mock/resultFixture.js";
import { mockControls, resetMock } from "../../api/mock/index.js";
import { normaliseTag } from "../../lib/tagKey.js";
import Result from "../../pages/Result.jsx";
import { brief } from "./brief.js";
import { cellState, STATES } from "./cellState.js";
import { crossCheck } from "./crossCheck.js";
import { aggregate, buildModel, locateTq } from "./resultModel.js";

const signal = (io) => ({ kind: "field", signal: { tag: "T1", io_type: io } });

describe("cellState", () => {
  it("covers every state", () => {
    expect(cellState({ placement: signal("AIR"), baseplateUsed: true })).toBe("input");
    expect(cellState({ placement: signal("DI"), baseplateUsed: true })).toBe("input");
    expect(cellState({ placement: signal("AOR"), baseplateUsed: true })).toBe("output");
    expect(cellState({ placement: signal("DO-SOV"), baseplateUsed: true })).toBe("output");
    expect(cellState({ placement: null, baseplateUsed: true })).toBe("spareSlot");
    expect(cellState({ placement: null, baseplateUsed: false })).toBe("emptyBaseplate");
    expect(cellState({ placement: { kind: "wired_spare", io_type: "AIR" }, baseplateUsed: true })).toBe("wiredSpare");
    expect(cellState({ placement: { kind: "cabinet_alarm", signal: { tag: "A1", io_type: "DIR" } }, baseplateUsed: true })).toBe("reservedAlarm");
    expect(cellState({ placement: { kind: "field", io_type: "AIR", signal: { tag: "X" } }, baseplateUsed: true })).toBe("unknown"); // IO type is read from the signal only
    expect(cellState({ placement: null, baseplateUsed: false, reserved: true })).toBe("reservedAlarm");
    expect(cellState({ placement: signal("AIR"), baseplateUsed: true, hasTq: true })).toBe("tq");
    expect(cellState({ placement: signal("??"), baseplateUsed: true })).toBe("unknown");
    expect(STATES).toHaveLength(8);
  });
});

describe("brief", () => {
  const base = { ciocName: "CIOC-01", bpName: "BP-1", channel: 3 };
  it("describes each state from the data", () => {
    const p = { signal: { tag: "T1", io_type: "AIR", cable: "C1", pair: 2 } };
    expect(brief({ kind: "cell", state: "input", placement: p, ...base })).toBe("AIR signal T1 on cable C1, pair 2, placed in CIOC-01, BP-1, channel 3.");
    expect(brief({ kind: "cell", state: "wiredSpare", placement: { kind: "wired_spare", io_type: "AIR", pair: 4 }, ...base })).toContain("pair 4");
    expect(brief({ kind: "cell", state: "spareSlot", placement: null, ...base })).toContain("Free position");
    expect(brief({ kind: "cell", state: "emptyBaseplate", placement: null, ...base })).toContain("cabinet spare");
    expect(brief({ kind: "cell", state: "reservedAlarm", placement: null, ...base })).toContain("alarms");
    expect(brief({ kind: "cell", state: "tq", placement: p, ...base })).toMatch(/^Open TQ on/);
    expect(brief({ kind: "cioc", name: "C", cabinetName: "K", signals: 1, inputs: 1, outputs: 0, spares: 2, tqs: 0 })).toContain("1 signals");
  });
});

describe("model and report", () => {
  const r = buildResult();
  const model = buildModel(r.layout, r.allocation, r.tqs);
  it("matches the sample counts", () => {
    expect(model.layout.cabinets).toHaveLength(3);
    expect(model.layout.ciocs).toHaveLength(12);
    expect(model.signalCount).toBe(189);
    expect(model.usedBaseplates.size).toBe(18);
  });
  it("cross-check passes on consistent data and fails on a mismatch", () => {
    expect(crossCheck(r.report, model)).toEqual([]);
    const bad = structuredClone(r.report);
    bad.report.kpi.allocated = 5;
    expect(crossCheck(bad, model)).toHaveLength(1);
  });
  it("aggregates and locates TQs by normalised tag", () => {
    const counts = aggregate(model, { ciocs: [1] });
    expect(counts.signals).toBeGreaterThan(0);
    expect(counts.inputs + counts.outputs).toBe(counts.signals);
    expect(locateTq(model, r.tqs[0]).signal.tag).toBe("MOCK-DOR-0007");
    expect(locateTq(model, r.tqs[3])).toBeNull();
    expect(locateTq({ ...model, byKey: new Map() }, r.tqs[0])).toBeNull();
    expect(normaliseTag("320-FT   -20645-A")).toBe(normaliseTag("320FT20645A"));
  });
});

describe("Result page", () => {
  beforeEach(() => {
    resetMock();
    mockControls.delayMs = 0;
  });
  const open = () =>
    render(
      <MemoryRouter initialEntries={["/projects/p1/result?run=r1"]}>
        <Routes>
          <Route path="/projects/:id/result" element={<Result />} />
          <Route path="/projects/:id/run" element={<p>run page</p>} />
        </Routes>
      </MemoryRouter>,
    );

  it("redirects to the run page when there is no run", () => {
    render(
      <MemoryRouter initialEntries={["/projects/p1/result"]}>
        <Routes>
          <Route path="/projects/:id/result" element={<Result />} />
          <Route path="/projects/:id/run" element={<p>run page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("run page")).toBeInTheDocument();
  });

  it("renders the grid, report numbers and legend", async () => {
    open();
    expect(await screen.findByText("Cabinets needed")).toBeInTheDocument();
    expect(screen.getByText("189 of 190")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /CIOC-01 BP-1 channel/ })).toHaveLength(12);
    expect(screen.getByText(/Legend/)).toBeInTheDocument();
    expect(screen.queryByText("Report and view disagree")).not.toBeInTheDocument();
  });

  it("opens an info box on click, flips none, closes on Escape", async () => {
    open();
    const user = userEvent.setup();
    const cell = await screen.findByRole("button", { name: "CIOC-01 BP-1 channel 1: Input" });
    await user.click(cell);
    const box = await screen.findByRole("dialog");
    expect(within(box).getAllByText(/MOCK-/).length).toBeGreaterThan(0);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("moves between cells with arrow keys", async () => {
    open();
    const user = userEvent.setup();
    const first = await screen.findByRole("button", { name: /CIOC-01 BP-1 channel 1:/ });
    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toHaveAttribute("data-pos", "1:1:2");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toHaveAttribute("data-pos", "1:2:2");
  });

  it("shows TQs, jumps to a position and answers one", async () => {
    open();
    const user = userEvent.setup();
    await screen.findByText("Cabinets needed");
    await user.click(screen.getByRole("tab", { name: "TQs" }));
    expect(await screen.findByText(/Every signal is either placed or in the TQ list/)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Show in view" })[0]);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    const card = screen.getByText("TQ-VALUE").closest("li");
    await user.click(within(card).getByRole("button", { name: "Show in view" }));
    expect(await screen.findByText("This TQ has no position in the view.")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Answer" })[0]);
    await waitFor(() => expect(screen.getAllByText("answered").length).toBeGreaterThan(1));
  });

  it("filters TQs and shows the declaration and chat", async () => {
    open();
    const user = userEvent.setup();
    await screen.findByText("Cabinets needed");
    await user.click(screen.getByRole("tab", { name: "TQs" }));
    await user.selectOptions(screen.getByLabelText("Severity filter"), "blocking");
    expect(screen.queryByText("TQ-CAP")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Declaration" }));
    expect(screen.getByText("The AI never places a signal.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Chat" }));
    await user.type(screen.getByLabelText("Message"), "how many TQs?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/Answered from: .*tqCount/)).toBeInTheDocument();
  });
});

describe("report and answer wire shapes", () => {
  const r = buildResult();
  it("rule rows use rule, description, enforced and strength; spares use the backend field names", () => {
    expect(r.report.report.rules.every((x) => typeof x.rule === "string" && typeof x.description === "string" && "passed" in x)).toBe(true);
    expect(Object.keys(r.report.report.kpi.spares.cabinets[0]).sort()).toEqual(["cabinet", "empty_baseplates", "free_slots_on_used_baseplates", "required_empty_baseplates", "wired_spare_pairs"]);
  });
  it("the chat context carries rule ids, not descriptions", async () => {
    const { buildRunContext } = await import("../chat/buildRunContext.js");
    const ctx = buildRunContext(r.report, r.tqs);
    expect(ctx.ruleNames).toContain("R-ONCE");
    expect(ctx.ruleNames.every((n) => n.length > 0)).toBe(true);
  });
  it("builds an answer body from the TQ's own options and falls back from unavailable scopes", async () => {
    const { buildAnswerBody, scopesFor } = await import("../../api/live/wire.js");
    const tq = r.tqs[0];
    expect(scopesFor(tq)).toEqual(["everywhere", "cable", "row"]);
    expect(buildAnswerBody(tq, { option: tq.options[0].label, scope: "row" })).toMatchObject({ option: tq.options[0].label, scope: "row", target: tq.signal_keys[0], value: null });
    expect(buildAnswerBody(tq, { option: "x", scope: "cable", value: " 3 " })).toMatchObject({ scope: "cable", target: "CBL-2", value: "3" });
    expect(scopesFor(r.tqs[3])).toEqual(["everywhere"]);
    expect(buildAnswerBody(r.tqs[3], { option: "x", scope: "row" })).toMatchObject({ scope: "everywhere", target: null });
  });
  it("the mock rejects an option the TQ does not offer", async () => {
    resetMock();
    mockControls.delayMs = 0;
    const { api } = await import("../../api/index.js");
    const started = await api.createProject({ name: "T" });
    const run = await api.startRun(started.id, {});
    await api.getRunTqs(started.id, run.id);
    await expect(api.answerTq(started.id, "TQ-0001", { option: "Not an option" })).rejects.toThrow(/not an option/);
  });
});
