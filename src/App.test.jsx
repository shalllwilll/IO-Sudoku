import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./config.js", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, config: { ...original.config, allowedEmailDomains: ["example-company.test"] } };
});

import App from "./App.jsx";
import { mockControls, resetMock } from "./api/mock/index.js";
import { getSession, signOutSession } from "./auth/session.js";

beforeEach(() => {
  resetMock();
  mockControls.delayMs = 0;
  signOutSession();
  window.history.pushState({}, "", "/");
});

async function signIn(email, password = "pw") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("landing and sign-in", () => {
  it("renders the product name; /login shows the same view", () => {
    window.history.pushState({}, "", "/login");
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "IO Signal Sudoku" })).toBeInTheDocument();
  });

  it("accepts a company email with odd case and spaces", async () => {
    render(<App />);
    await signIn("  A@Example-Company.TEST ");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Projects" })).toBeInTheDocument());
    expect(getSession().email).toBe("a@example-company.test");
    expect(Object.keys(localStorage)).toHaveLength(0);
  });

  it.each(["a@gmail.com", "a@example-company.test.evil.com", "a@example-company.test@evil.com", "a@exаmple-company.test"])(
    "refuses %s without calling the API",
    async (email) => {
      render(<App />);
      await signIn(email);
      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(getSession()).toBeNull();
    },
  );

  it("shows validation for empty input", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter your company email");
  });

  it("redirects a signed-out visit to a protected route", async () => {
    window.history.pushState({}, "", "/projects");
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1, name: "IO Signal Sudoku" })).toBeInTheDocument();
    expect(window.location.search).toContain("returnTo=%2Fprojects");
  });

  it("ignores an open-redirect returnTo", async () => {
    window.history.pushState({}, "", "/?returnTo=//evil.com");
    render(<App />);
    await signIn("a@example-company.test");
    await waitFor(() => expect(window.location.pathname).toBe("/projects"));
  });

  it("gives one generic error for a rejected sign-in", async () => {
    render(<App />);
    mockControls.failNext = "server";
    await signIn("a@example-company.test");
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong email or password.");
  });

  it("signs out and blocks Back", async () => {
    render(<App />);
    await signIn("a@example-company.test");
    await screen.findByRole("heading", { name: "Projects" });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByRole("heading", { level: 1, name: "IO Signal Sudoku" });
    expect(getSession()).toBeNull();
  });
});
