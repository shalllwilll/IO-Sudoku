import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import Button from "./Button.jsx";
import Switch from "./Switch.jsx";
import Tabs from "./Tabs.jsx";

describe("Button", () => {
  it("does not fire clicks while disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Switch", () => {
  it("flips aria-checked when toggled", () => {
    function Harness() {
      const [on, setOn] = useState(false);
      return <Switch label="Auto map" checked={on} onChange={setOn} />;
    }
    render(<Harness />);
    const toggle = screen.getByRole("switch", { name: "Auto map" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });
});

describe("Tabs", () => {
  const tabs = [
    { id: "a", label: "Alpha" },
    { id: "b", label: "Beta" },
    { id: "c", label: "Gamma" },
  ];

  function Harness() {
    const [value, setValue] = useState("a");
    return <Tabs tabs={tabs} value={value} onChange={setValue} idPrefix="t" />;
  }

  it("moves selection with arrows, Home and End", () => {
    render(<Harness />);
    const alpha = screen.getByRole("tab", { name: "Alpha" });
    alpha.focus();
    fireEvent.keyDown(alpha, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Beta" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "Gamma" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Gamma" }), { key: "Home" });
    expect(alpha).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(alpha, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Gamma" })).toHaveAttribute("aria-selected", "true");
  });
});
