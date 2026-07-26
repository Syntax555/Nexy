import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "../../src/components/ThemeToggle.js";

afterEach(cleanup);

describe("theme toggle", () => {
  it("uses an action label without contradictory pressed-state semantics", () => {
    const { rerender } = render(
      <ThemeToggle theme="dark" onToggle={vi.fn()} />
    );
    const lightAction = screen.getByRole("button", {
      name: "Switch to light mode"
    });
    expect(lightAction.hasAttribute("aria-pressed")).toBe(false);

    rerender(<ThemeToggle theme="light" onToggle={vi.fn()} />);
    expect(screen.getByRole("button", {
      name: "Switch to dark mode"
    }).hasAttribute("aria-pressed")).toBe(false);
  });
});
