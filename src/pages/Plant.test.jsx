import { act, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/index.js";
import { mockControls, resetMock } from "../api/mock/index.js";
import { useTour } from "../scene/Tour.jsx";
import { hasWebgl, latestFinishedRun, loadScene, resolveRun, SAMPLE_RUN } from "../scene/loadScene.js";
import { tourSteps } from "../scene/tourScript.js";
import PlantStage from "./PlantStage.jsx";

describe("which run the stage shows", () => {
  beforeEach(() => {
    resetMock();
    mockControls.delayMs = 0;
  });

  it("keeps an explicit project and run", async () => {
    await expect(resolveRun({ projectId: "p1", runId: "r1" })).resolves.toEqual({ projectId: "p1", runId: "r1" });
  });

  it("falls back to the built-in sample when no run has finished", async () => {
    expect(await latestFinishedRun()).toBeNull();
    const project = await api.createProject({ name: "P" });
    await api.startRun(project.id, {});
    expect(await latestFinishedRun()).toBeNull(); // the run is still running
    await expect(resolveRun({})).resolves.toEqual(SAMPLE_RUN);
  });

  it("builds the scene from the run data", async () => {
    const { scene, tqs } = await loadScene(SAMPLE_RUN);
    expect(scene.counts).toMatchObject({ cabinets: 3, ciocs: 12, positions: 1152 });
    expect(tqs.length).toBeGreaterThan(0);
  });
});

describe("the stage without WebGL", () => {
  beforeEach(() => {
    resetMock();
    mockControls.delayMs = 0;
  });

  it("reports that this browser has none", () => {
    expect(hasWebgl()).toBe(false); // jsdom gives no WebGL context
  });

  it("shows the seven levels as a still diagram and a way back", async () => {
    render(
      <MemoryRouter initialEntries={["/plant"]}>
        <Routes>
          <Route path="/plant" element={<PlantStage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("3D plant view is unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Level 1: Plant/)).toBeInTheDocument();
    expect(screen.getByText(/Level 7: Channel/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the dashboard" })).toHaveAttribute("href", "/projects");
    // The stage carries no navigation of its own.
    expect(screen.queryByRole("navigation", { name: "Camera levels" })).not.toBeInTheDocument();
  });
});

describe("tour", () => {
  afterEach(() => vi.useRealTimers());

  it("visits every level in order and rests on the last step", () => {
    vi.useFakeTimers();
    const jumpTo = vi.fn();
    renderHook(() => useTour(jumpTo, { autoStart: true }));
    for (const step of tourSteps) {
      expect(jumpTo).toHaveBeenLastCalledWith(step.level);
      act(() => vi.advanceTimersByTime(step.dwellMs + 10));
    }
    expect(jumpTo.mock.calls.map(([l]) => l)).toEqual(tourSteps.map((s) => s.level));
  });

  it("stops where it is and replays from the start", () => {
    vi.useFakeTimers();
    const jumpTo = vi.fn();
    const { result } = renderHook(() => useTour(jumpTo, { autoStart: true }));
    act(() => vi.advanceTimersByTime(tourSteps[0].dwellMs + 10));
    expect(result.current.running).toBe(true);

    act(() => result.current.stop());
    expect(result.current.running).toBe(false);
    const callsWhenStopped = jumpTo.mock.calls.length;
    act(() => vi.advanceTimersByTime(60000));
    expect(jumpTo.mock.calls).toHaveLength(callsWhenStopped);

    act(() => result.current.replay());
    expect(result.current.running).toBe(true);
    expect(jumpTo).toHaveBeenLastCalledWith(1);
  });

  it("pauses while the tab is hidden and keeps the time the step had left", () => {
    vi.useFakeTimers();
    const jumpTo = vi.fn();
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    renderHook(() => useTour(jumpTo, { autoStart: true }));

    act(() => vi.advanceTimersByTime(1000)); // part way through the first step
    hidden.mockReturnValue(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => vi.advanceTimersByTime(10000)); // away for ten seconds
    expect(jumpTo).toHaveBeenLastCalledWith(1); // no level was skipped

    hidden.mockReturnValue(false);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => vi.advanceTimersByTime(tourSteps[0].dwellMs - 1000 + 10));
    expect(jumpTo).toHaveBeenLastCalledWith(2);
    hidden.mockRestore();
  });
});

describe("the dashboard card", () => {
  it("still points at the stage", async () => {
    resetMock();
    mockControls.delayMs = 0;
    const { default: Projects } = await import("./Projects.jsx");
    render(
      <MemoryRouter initialEntries={["/projects"]}>
        <Routes>
          <Route path="/projects" element={<Projects />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("link", { name: /3D plant view/ })).toHaveAttribute("href", "/plant");
  });
});
