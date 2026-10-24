import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../api/index.js";
import { mockControls, resetMock } from "../api/mock/index.js";
import Mapping from "./Mapping.jsx";
import Rules from "./Rules.jsx";

let pid;
beforeEach(async () => {
  resetMock();
  mockControls.delayMs = 0;
  sessionStorage.clear();
  pid = (await api.createProject({ name: "T" })).id;
  await api.uploadFile(pid, new File([new Uint8Array([1])], "a.xlsx"));
});

function at(path, element, route) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={element} />
        <Route path="*" element={<p>elsewhere</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Mapping screen", () => {
  it("shows badges with text, blocks a duplicate and a missing field", async () => {
    at(`/projects/${pid}/mapping`, <Mapping />, "/projects/:id/mapping");
    const user = userEvent.setup();
    expect(await screen.findByText("Low 60%")).toBeInTheDocument();
    expect(screen.getByText(/Unmapped columns \(3\)/)).toBeInTheDocument();
    expect(screen.getByText("(blank column 8)")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Field for Cable No"), "tag");
    expect(await screen.findByText(/Mapped more than once: tag/)).toBeInTheDocument();
    expect(screen.getByText(/Required and not mapped: cable/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Field for Cable No"), "cable");
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());
  });

  it("keeps the previous value when saving fails", async () => {
    at(`/projects/${pid}/mapping`, <Mapping />, "/projects/:id/mapping");
    const user = userEvent.setup();
    const select = await screen.findByLabelText("Field for Area");
    mockControls.failNext = "server";
    await user.selectOptions(select, "service");
    expect(await screen.findByText(/Could not save/)).toBeInTheDocument();
    expect(screen.getByLabelText("Field for Area")).toHaveValue("area");
  });

  it("blocks values on an unknown IO type until it is ignored", async () => {
    at(`/projects/${pid}/mapping`, <Mapping />, "/projects/:id/mapping");
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText("Field for Cable No"), "cable");
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Unknown: assign or ignore")).toBeInTheDocument();
    expect(screen.getByText("DO-SOV").closest("tr")).toHaveTextContent("SOV");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Base type for XQ"), "ignore");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(within(screen.getByText("A-CONTROL").closest("tr")).getByText("CONTROL")).toBeInTheDocument();
  });
});

describe("Rules screen", () => {
  const open = () => at(`/projects/${pid}/rules`, <Rules />, "/projects/:id/rules");

  it("lists cards, toggles, marks not enforced and saves the level once", async () => {
    open();
    const user = userEvent.setup();
    expect(await screen.findByRole("article", { name: "Segregation separation" })).toBeInTheDocument();
    expect(screen.getByText("Not enforced")).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Enable Spare capacity" }));
    await waitFor(async () => expect((await api.getRules(pid)).rules.find((r) => r.id === "spare-pct").enabled).toBe(false));
    const card = screen.getByRole("article", { name: "Segregation separation" });
    await user.selectOptions(within(card).getByLabelText("level"), "cabinet");
    await waitFor(async () => expect((await api.getRules(pid)).rules[0].parameters.level).toBe("cabinet"));
  });

  it("rejects an invalid number inline and does not save it", async () => {
    open();
    const user = userEvent.setup();
    const card = await screen.findByRole("article", { name: "Spare capacity" });
    const field = within(card).getByLabelText("percent");
    await user.clear(field);
    await user.type(field, "101");
    expect(await within(card).findByText(/0 to 100/)).toBeInTheDocument();
    expect((await api.getRules(pid)).rules[1].parameters.percent).toBe(10);
  });

  it("deletes only after confirmation", async () => {
    open();
    const user = userEvent.setup();
    await screen.findByRole("article", { name: "Baseplate capacity" });
    await user.click(screen.getByRole("button", { name: "Delete Baseplate capacity" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("article", { name: "Baseplate capacity" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete Baseplate capacity" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryByRole("article", { name: "Baseplate capacity" })).not.toBeInTheDocument();
  });

  it("shows lint findings on the right card and dry-run counts", async () => {
    open();
    const user = userEvent.setup();
    await screen.findByRole("article", { name: "Segregation separation" });
    await user.click(screen.getByRole("button", { name: "Lint" }));
    await user.click(screen.getByRole("button", { name: "Dry-run" }));
    expect(await screen.findByLabelText("Dry-run result")).toHaveTextContent("189");
    expect(screen.getByText("Lint found no problems.")).toBeInTheDocument();
  });

  it("renders an unknown rule type read-only", async () => {
    await api.saveRules(pid, { rules: [{ id: "x1", name: "Mystery", enabled: true, primitive: "x", scope: "all", strength: "hard", parameters: {} }] });
    open();
    expect(await screen.findByText(/Unknown rule type\. Shown read-only/)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Enable Mystery" })).toBeDisabled();
  });

  it("compiles a rule, applies only on click, and discards", async () => {
    open();
    const user = userEvent.setup();
    await screen.findByRole("article", { name: "Spare capacity" });
    await user.type(screen.getByLabelText("Rule in plain English"), "never put A and B in the same CIOC");
    await user.click(screen.getByRole("button", { name: "Compile" }));
    expect(await screen.findByText("AI-generated")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getAllByRole("article")).toHaveLength(4);
    await user.type(screen.getByLabelText("Rule in plain English"), "never put A and B in the same CIOC");
    await user.click(screen.getByRole("button", { name: "Compile" }));
    await user.click(await screen.findByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(5));
  });

  it("explains nonsense and failures", async () => {
    open();
    const user = userEvent.setup();
    await screen.findByRole("article", { name: "Spare capacity" });
    await user.type(screen.getByLabelText("Rule in plain English"), "asdf");
    await user.click(screen.getByRole("button", { name: "Compile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not understand/);
    mockControls.failNext = "server";
    await user.click(screen.getByRole("button", { name: "Compile" }));
    expect(await screen.findByText("AI unavailable. Use the form above.")).toBeInTheDocument();
  });

  it("saves, reloads and warns before loading over unsaved changes", async () => {
    open();
    const user = userEvent.setup();
    await screen.findByRole("article", { name: "Spare capacity" });
    await user.type(screen.getByLabelText("Set name"), "A");
    await user.click(screen.getByRole("button", { name: "Save as" }));
    expect(screen.getByText("A", { selector: "strong" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Set name"), "A");
    await user.click(screen.getByRole("button", { name: "Save as" }));
    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Enable Spare capacity" }));
    expect(await screen.findByText("Unsaved changes")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Load rule set"), "A");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load" }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Enable Spare capacity" })).toHaveAttribute("aria-checked", "true"));
  });
});
