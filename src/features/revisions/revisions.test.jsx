import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/index.js";
import { mockControls, resetMock } from "../../api/mock/index.js";
import { streamOptions } from "../../api/mock/stream.js";
import { resetController, startRun } from "../run/runController.js";
import { runStore } from "../run/runStore.js";
import Revisions from "../../pages/project/Revisions.jsx";
import CompareView from "./CompareView.jsx";
import RevisionChain from "./RevisionChain.jsx";

const xlsx = (name) => new File([new Uint8Array([0x50, 0x4b, 3, 4])], name);

/** Runs a project through its first finished run, outside any page, so a baseline can be taken. */
async function finishedRun(pid) {
  const run = await startRun(pid, {});
  await waitFor(() => expect(runStore.getState().status).toBe("finished"), { timeout: 3000 });
  return run;
}

beforeEach(() => {
  resetMock();
  resetController();
  mockControls.delayMs = 0;
  streamOptions.intervalMs = 2;
});

describe("mock revision endpoints", () => {
  it("builds a chain from a baseline and successive revisions", async () => {
    const project = await api.createProject({ name: "P" });
    const run = await finishedRun(project.id);

    await expect(api.getRevisions(project.id)).resolves.toEqual([]);
    const baseline = await api.baseline(project.id, { run_id: run.id });
    expect(baseline).toMatchObject({ chain_run_id: run.id, label: "00" });

    const revised = await api.startRevision(project.id, { label: "B" });
    const chain = await api.getRevisions(project.id);
    expect(chain.map((c) => c.label)).toEqual(["00", "B"]);
    expect(chain[1].run_id).toBe(revised.id);
    expect(chain[1].impact.moved).toBeGreaterThan(0);
  });

  it("refuses a second baseline, and a revision before any baseline", async () => {
    const project = await api.createProject({ name: "P" });
    const run = await finishedRun(project.id);
    await api.baseline(project.id, { run_id: run.id });
    await expect(api.baseline(project.id, { run_id: run.id })).rejects.toThrow(/already/);

    const other = await api.createProject({ name: "Q" });
    await expect(api.startRevision(other.id, {})).rejects.toThrow(/baseline/);
  });

  it("deletes and lists uploads", async () => {
    const project = await api.createProject({ name: "P" });
    const upload = await api.uploadFile(project.id, xlsx("a.xlsx"));
    expect(await api.listUploads(project.id)).toHaveLength(1);
    await api.deleteUpload(project.id, upload.id);
    expect(await api.listUploads(project.id)).toHaveLength(0);
    await expect(api.deleteUpload(project.id, upload.id)).rejects.toThrow(/not found/);
  });

  it("compares two revisions, with a naive count never lower than the stable one (T-7.2-6)", async () => {
    const project = await api.createProject({ name: "P" });
    const run = await finishedRun(project.id);
    await api.baseline(project.id, { run_id: run.id });
    await api.startRevision(project.id, { label: "B" });

    const comparison = await api.compareRevisions(project.id, { from: "00", to: "B" });
    expect(comparison.moved).toBeGreaterThan(0);
    expect(comparison.naive_moved).toBeGreaterThanOrEqual(comparison.moved);
    expect(comparison.deltas.length).toBe(comparison.added + comparison.removed + comparison.moved + comparison.modified);
  });

  it("reports an impact only for a revision run, not an ordinary one", async () => {
    const project = await api.createProject({ name: "P" });
    const run = await finishedRun(project.id);
    expect((await api.getImpact(project.id, run.id)).available).toBe(false);

    await api.baseline(project.id, { run_id: run.id });
    const revised = await api.startRevision(project.id, { label: "B" });
    const impact = await api.getImpact(project.id, revised.id);
    expect(impact.available).toBe(true);
    expect(impact.impact.label).toBe("B");
  });
});

describe("RevisionChain", () => {
  const chain = [
    { seq: 1, label: "00", parent_label: null, run_id: "r1", created_at: new Date().toISOString(), impact: null },
    { seq: 2, label: "B", parent_label: "00", run_id: "r2", created_at: new Date().toISOString(), impact: { moved: 4 } },
  ];

  it("shows both nodes and moves focus with the arrow keys", async () => {
    render(<RevisionChain chain={chain} onSelect={() => {}} />);
    const user = userEvent.setup();
    const first = screen.getByRole("button", { name: /Rev 00/ });
    const second = screen.getByRole("button", { name: /Rev B/ });
    expect(within(second).getByText("4 moved")).toBeInTheDocument();
    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(second);
  });

  it("selects a node on click", async () => {
    const onSelect = vi.fn();
    render(<RevisionChain chain={chain} onSelect={onSelect} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Rev B/ }));
    expect(onSelect).toHaveBeenCalledWith(chain[1]);
  });
});

describe("Revisions page", () => {
  const at = (pid) => (
    <MemoryRouter initialEntries={[`/projects/${pid}/revisions`]}>
      <Routes>
        <Route path="/projects/:id/revisions" element={<Revisions />} />
        <Route path="/projects/:id/result" element={<p>result page</p>} />
      </Routes>
    </MemoryRouter>
  );

  it("blocks Revise with a reason when the project has no finished run", async () => {
    const project = await api.createProject({ name: "P" });
    render(at(project.id));
    expect(await screen.findByText("Run this project once before revising it.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revise" })).toBeDisabled();
  });

  it("revises end to end: baselines, swaps the upload, starts the run and opens the result", async () => {
    const project = await api.createProject({ name: "P" });
    await finishedRun(project.id);
    await api.uploadFile(project.id, xlsx("original.xlsx"));

    render(at(project.id));
    const user = userEvent.setup();
    const reviseButton = await screen.findByRole("button", { name: "Revise" });
    expect(reviseButton).toBeEnabled();
    await user.click(reviseButton);

    await user.upload(screen.getByTestId("revise-file-input"), xlsx("revised.xlsx"));
    await screen.findByText("revised.xlsx");
    await user.type(screen.getByLabelText("Revision label (optional)"), "B");
    await user.click(screen.getByRole("button", { name: "Start revision" }));

    expect(await screen.findByText("result page")).toBeInTheDocument();
    await waitFor(async () => expect((await api.getRevisions(project.id)).map((c) => c.label)).toEqual(["00", "B"]));
    expect(await api.listUploads(project.id)).toEqual([expect.objectContaining({ name: "revised.xlsx" })]);
  });

  it("shows the chain and lets a single run compare with a hint", async () => {
    const project = await api.createProject({ name: "P" });
    const run = await finishedRun(project.id);
    await api.baseline(project.id, { run_id: run.id });

    render(at(project.id));
    expect(await screen.findByText(/Rev 00/)).toBeInTheDocument();
    expect(screen.getByText(/A single run has nothing to compare/)).toBeInTheDocument();
  });
});

describe("CompareView", () => {
  async function chainOf(project) {
    const run = await finishedRun(project.id);
    await api.baseline(project.id, { run_id: run.id });
    await api.startRevision(project.id, { label: "B" });
    return api.getRevisions(project.id);
  }

  it("shows counts, the naive toggle, and blocks comparing a revision to itself", async () => {
    const project = await api.createProject({ name: "P" });
    const chain = await chainOf(project);
    render(
      <MemoryRouter>
        <CompareView projectId={project.id} chain={chain} />
      </MemoryRouter>,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Compare" }));
    // The tile's label is first in the DOM; the badges on the delta list repeat the same words.
    expect((await screen.findAllByText("Added"))[0]).toBeInTheDocument();
    const movedTile = screen.getAllByText("Moved")[0].closest("div").querySelector("dd");
    const stableCount = movedTile.textContent;

    await user.click(screen.getByRole("switch", { name: "Show the naive re-allocation count" }));
    expect(movedTile.textContent).not.toBe(stableCount);
    expect(Number(movedTile.textContent)).toBeGreaterThanOrEqual(Number(stableCount));

    await user.selectOptions(screen.getByLabelText("From"), "B");
    await user.selectOptions(screen.getByLabelText("To"), "B");
    await user.click(screen.getByRole("button", { name: "Compare" }));
    expect(screen.getByText("Pick two different revisions.")).toBeInTheDocument();
  });

  it("links a changed signal to the grid with a highlight", async () => {
    const project = await api.createProject({ name: "P" });
    const chain = await chainOf(project);
    render(
      <MemoryRouter>
        <CompareView projectId={project.id} chain={chain} />
      </MemoryRouter>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Compare" }));
    const link = await screen.findAllByRole("link", { name: "Show on grid" });
    expect(link[0]).toHaveAttribute("href", expect.stringContaining(`/projects/${project.id}/result?run=`));
    expect(link[0]).toHaveAttribute("href", expect.stringContaining("highlight="));
  });
});
