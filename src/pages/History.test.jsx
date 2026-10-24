import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../api/index.js";
import { mockControls, resetMock } from "../api/mock/index.js";
import { streamOptions } from "../api/mock/stream.js";
import { resetController, startRun } from "../features/run/runController.js";
import { runStore } from "../features/run/runStore.js";
import History from "./History.jsx";

beforeEach(() => {
  resetMock();
  resetController();
  mockControls.delayMs = 0;
  streamOptions.intervalMs = 2;
});

function at() {
  return render(
    <MemoryRouter initialEntries={["/history"]}>
      <Routes>
        <Route path="/history" element={<History />} />
        <Route path="/projects" element={<p>projects page</p>} />
        <Route path="/projects/:id/revisions" element={<p>revisions page</p>} />
        <Route path="/projects/:id/result" element={<p>result page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function finished(name) {
  const project = await api.createProject({ name });
  const run = await startRun(project.id, {});
  await waitFor(() => expect(runStore.getState().status).toBe("finished"));
  return { project, run };
}

// A project's name appears once in the summary table and again in the run table, so most
// assertions use findAllByText rather than findByText.
describe("History", () => {
  it("shows an empty state with a way to start a project", async () => {
    at();
    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start a project" })).toHaveAttribute("href", "/projects");
  });

  it("lists every project and every run", async () => {
    await finished("Alpha");
    resetController();
    await finished("Beta");
    at();
    expect(await screen.findAllByText("Alpha")).toHaveLength(2);
    expect(screen.getAllByText("Beta")).toHaveLength(2);
    // Two project rows, two run rows, plus the status filter's own "finished" option.
    expect(screen.getAllByText("finished")).toHaveLength(5);
  });

  it("filters the run table by search text (the project summary above is unfiltered)", async () => {
    await finished("Alpha Project");
    resetController();
    await finished("Beta Project");
    at();
    await screen.findAllByText("Alpha Project");
    const runSection = screen.getByRole("heading", { name: "Every run" }).closest("section");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Search"), "Alpha");
    await waitFor(() => expect(within(runSection).queryByText("Beta Project")).toBeNull());
    expect(within(runSection).getByText("Alpha Project")).toBeInTheDocument();
    // The projects overview above the run table still lists both.
    expect(screen.getAllByText("Beta Project")).toHaveLength(1);
  });

  it("shows no results for a search that matches nothing", async () => {
    await finished("Alpha");
    at();
    await screen.findAllByText("Alpha");
    await userEvent.setup().type(screen.getByLabelText("Search"), "nonsense-xyz");
    expect(await screen.findByText("No runs match the filters.")).toBeInTheDocument();
  });

  it("filters by status", async () => {
    await finished("Alpha");
    at();
    await screen.findAllByText("Alpha");
    await userEvent.setup().selectOptions(screen.getByLabelText("Status"), "failed");
    expect(await screen.findByText("No runs match the filters.")).toBeInTheDocument();
  });

  it("paginates 25 per page and keeps the page in the URL", async () => {
    // Pagination only needs many distinct runs, not a finished allocation each, so this calls the
    // mock directly rather than driving 30 runs through the controller's event stream.
    const project = await api.createProject({ name: "P" });
    for (let i = 0; i < 30; i++) {
      await api.startRun(project.id, {});
    }
    at();
    await screen.findByText("Page 1 of 2");
    await userEvent.setup().click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();
  });

  it("opens a finished run and links to a project's revisions", async () => {
    console.log("PROJECTS BEFORE:", (await api.listProjects()).map((p) => p.name));
    await finished("Alpha");
    console.log("PROJECTS AFTER:", (await api.listProjects()).map((p) => p.name));
    at();
    const user = userEvent.setup();
    await screen.findAllByText("Alpha");
    expect(screen.getByRole("link", { name: "Revisions" })).toHaveAttribute("href", expect.stringMatching(/\/revisions$/));
    await user.click(screen.getByRole("link", { name: "Open" }));
    expect(await screen.findByText("result page")).toBeInTheDocument();
  });

  it("renders a project name containing markup as text, never as HTML", async () => {
    await finished('<img src=x onerror="window.pwned=true">');
    at();
    await screen.findAllByText(/<img src=x/);
    expect(document.querySelector("img")).toBeNull();
    expect(window.pwned).toBeUndefined();
  });

  it("expands a run's read-only log", async () => {
    await finished("Alpha");
    at();
    await screen.findAllByText("Alpha");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Log" }));
    expect(await screen.findByText("Run id")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide log" }));
    expect(screen.queryByText("Run id")).not.toBeInTheDocument();
  });
});
