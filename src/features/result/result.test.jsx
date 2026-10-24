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

const signal = (io) => ({ kind: "signal", io_type: io, signal: { tag: "T1" } });

describe("cellState", () => {
  it("covers every state", () => {
    expect(cellState({ placement: signal("AIR"), baseplateUsed: true })).toBe("input");
    expect(cellState({ placement: signal("DI"), baseplateUsed: true })).toBe("input");
    expect(cellState({ placement: signal("AOR"), baseplateUsed: true })).toBe("output");
    expect(cellState({ placement: signal("DO-SOV"), baseplateUsed: true })).toBe("output");
    expect(cellState({ placement: null, baseplateUsed: true })).toBe("spareSlot");
    expect(cellState({ placement: null, baseplateUsed: false })).toBe("emptyBaseplate");
    expect(cellState({ placement: { kind: "wired_spare" }, baseplateUsed: true })).toBe("wiredSpare");
    expect(cellState({ placement: null, baseplateUsed: false, reserved: true })).toBe("reservedAlarm");
    expect(cellState({ placement: signal("AIR"), baseplateUsed: true, hasTq: true })).toBe("tq");
    expect(cellState({ placement: signal("??"), baseplateUsed: true })).toBe("unknown");
    expect(STATES).toHaveLength(8);
  });
});

describe("brief", () => {
  const base = { ciocName: "CIOC-01", bpName: "BP-1", channel: 3 };
  it("describes each state from the data", () => {
    const p = { io_type: "AIR", signal: { tag: "T1", cable: "C1", pair: 2 } };
    expect(brief({ kind: "cell", state: "input", placement: p, ...base })).toBe("AIR signal T1 on cable C1, pair 2, placed in CIOC-01, BP-1, channel 3.");
    expect(brief({ kind: "cell", state: "wiredSpare", placement: { cable: "C9", pair: 4 }, ...base })).toContain("cable C9, pair 4");
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
    expect(locateTq(model, r.tqs[0])).not.toBeNull();
    expect(locateTq(model, r.tqs[3])).toBeNull();
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
    const card = screen.getByText("UNKNOWN_IO_TYPE").closest("li");
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
    await user.selectOptions(screen.getByLabelText("Severity filter"), "error");
    expect(screen.queryByText("BASEPLATE_FULL")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Declaration" }));
    expect(screen.getByText("The AI never places a signal.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Chat" }));
    await user.type(screen.getByLabelText("Message"), "how many TQs?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/Answered from: .*tqCount/)).toBeInTheDocument();
  });
});
