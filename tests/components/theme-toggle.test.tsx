import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useTheme } from "../../src/app/use-theme.js";
import { ThemeToggle } from "../../src/components/ThemeToggle.js";

function ThemeHarness() {
  const [theme, toggleTheme] = useTheme();
  return (
    <button type="button" onClick={toggleTheme}>
      Current theme: {theme}
    </button>
  );
}

afterEach(() => {
  cleanup();
  document.querySelector('meta[data-theme-test="true"]')?.remove();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  localStorage.clear();
});

describe("theme toggle", () => {
  it("uses an action label without contradictory pressed-state semantics", () => {
    const { rerender } = render(<ThemeToggle theme="dark" onToggle={vi.fn()} />);
    const lightAction = screen.getByRole("button", {
      name: "Switch to light mode"
    });
    expect(lightAction.hasAttribute("aria-pressed")).toBe(false);

    rerender(<ThemeToggle theme="light" onToggle={vi.fn()} />);
    expect(
      screen
        .getByRole("button", {
          name: "Switch to dark mode"
        })
        .hasAttribute("aria-pressed")
    ).toBe(false);
  });

  it("reflects the initial document theme in browser chrome metadata", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = "#090b12";
    meta.dataset.themeTest = "true";
    document.head.append(meta);
    document.documentElement.dataset.theme = "light";

    render(<ThemeHarness />);

    expect(meta.content).toBe("#f5f3ee");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Current theme: light"
      })
    );
    expect(meta.content).toBe("#090b12");
    expect(localStorage.getItem("nexy-theme")).toBe("dark");
  });
});
