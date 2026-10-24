import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { mockControls, resetMock } from "../api/mock/index.js";
import Projects from "./Projects.jsx";

beforeEach(() => {
  resetMock();
  mockControls.delayMs = 0;
});

function setup() {
  render(
    <MemoryRouter>
      <Projects />
    </MemoryRouter>,
  );
}

const xlsx = (name) => new File([new Uint8Array([0x50, 0x4b, 3, 4])], name);

describe("Projects dashboard", () => {
  it("lists a chosen file and removes it", async () => {
    setup();
    const user = userEvent.setup();
    await user.upload(screen.getByTestId("file-input"), xlsx("a.xlsx"));
    expect(await screen.findByText("a.xlsx")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove a.xlsx" }));
    expect(screen.queryByText("a.xlsx")).not.toBeInTheDocument();
  });

  it("shows an AI-labelled reply with its source line", async () => {
    setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Message"), "What does the mapping step do?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/Answered from/)).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
  });

  it("renders HTML in a reply as text", async () => {
    mockControls.chatReply = { text: "<img src=x onerror=alert(1)>" };
    setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Message"), "hello");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/<img src=x/)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("uses the FAQ when the model returns an invalid shape", async () => {
    mockControls.chatReply = { wrong: true };
    setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Message"), "tell me about rules");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByText(/built-in help/)).toBeInTheDocument());
  });

  it("refuses an over-long message with a count", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Message"));
    await user.paste("x".repeat(600));
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("600 characters");
  });

  it("blocks upload while a preference is invalid", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Preferences/ }));
    const field = await screen.findByLabelText("Spare percentage");
    await user.clear(field);
    await user.type(field, "99");
    expect(await screen.findByText("Enter a number from 0 to 50.")).toBeInTheDocument();
    await user.upload(screen.getByTestId("file-input"), xlsx("a.xlsx"));
    await screen.findByText("a.xlsx");
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
  });
});
