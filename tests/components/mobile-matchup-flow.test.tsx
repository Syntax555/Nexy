import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/app/App.js";

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");

interface MatchMediaController {
  readonly setMatches: (matches: boolean) => void;
}

function installMatchMedia(initialMatches: boolean): MatchMediaController {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const legacyListeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    matches: initialMatches,
    media: "(max-width: 819px)",
    onchange: null,
    addEventListener: (
      type: string,
      listener: (event: MediaQueryListEvent) => void
    ): void => {
      if (type === "change") listeners.add(listener);
    },
    removeEventListener: (
      type: string,
      listener: (event: MediaQueryListEvent) => void
    ): void => {
      if (type === "change") listeners.delete(listener);
    },
    addListener: (listener: (event: MediaQueryListEvent) => void): void => {
      legacyListeners.add(listener);
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void): void => {
      legacyListeners.delete(listener);
    },
    dispatchEvent: () => true
  } as MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => mediaQuery)
  });

  return {
    setMatches(matches: boolean): void {
      Object.defineProperty(mediaQuery, "matches", {
        configurable: true,
        value: matches
      });
      const event = { matches, media: mediaQuery.media } as MediaQueryListEvent;
      for (const listener of [...listeners, ...legacyListeners]) listener(event);
    }
  };
}

describe("mobile matchup flow", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/Nexy/");
    document.documentElement.dataset.theme = "dark";
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    if (originalMatchMedia) {
      Object.defineProperty(window, "matchMedia", originalMatchMedia);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });

  it("stages the two pickers, advances automatically, and exposes the ready action", async () => {
    installMatchMedia(true);
    const { container } = render(<App />);
    const leftPanel = container.querySelector<HTMLElement>("#mobile-fighter-left-panel");
    const rightPanel = container.querySelector<HTMLElement>("#mobile-fighter-right-panel");
    const flowStatus = container.querySelector<HTMLElement>(".mobile-matchup-status");
    if (!leftPanel || !rightPanel || !flowStatus) {
      throw new Error("Expected the mobile matchup flow.");
    }

    const leftTab = screen.getByRole("tab", { name: /fighter 01: not selected/i });
    const rightTab = screen.getByRole("tab", { name: /fighter 02: not selected/i });
    expect(leftTab.getAttribute("aria-selected")).toBe("true");
    expect(leftPanel.hidden).toBe(false);
    expect(rightPanel.hidden).toBe(true);

    const leftFighter = leftPanel.querySelector<HTMLButtonElement>(".roster-card");
    if (!leftFighter) throw new Error("Expected a left-side roster entry.");
    fireEvent.click(leftFighter);

    await waitFor(() => {
      expect(rightPanel.hidden).toBe(false);
      expect(leftPanel.hidden).toBe(true);
      expect(rightTab.getAttribute("aria-selected")).toBe("true");
      expect(document.activeElement).toBe(rightTab);
    });
    expect(flowStatus.textContent).toMatch(
      /fighter 01 selected\. choose fighter 02/i
    );

    const rightFighter = rightPanel.querySelector<HTMLButtonElement>(".roster-card");
    if (!rightFighter) throw new Error("Expected a right-side roster entry.");
    fireEvent.click(rightFighter);

    await waitFor(() => {
      expect(flowStatus.textContent).toMatch(/matchup ready/i);
    });
    const analyze = screen.getByRole("button", { name: /analyze battle/i }) as HTMLButtonElement;
    expect(analyze.disabled).toBe(false);

    fireEvent.click(screen.getByRole("tab", { name: /fighter 01:/i }));
    expect(leftPanel.hidden).toBe(false);
    expect(rightPanel.hidden).toBe(true);
    expect(leftPanel.querySelector('.roster-card[aria-pressed="true"]')).toBeTruthy();

    const selectedLeftTab = screen.getByRole("tab", { name: /fighter 01:/i });
    selectedLeftTab.focus();
    fireEvent.keyDown(selectedLeftTab, { key: "ArrowRight" });
    await waitFor(() => {
      expect(rightPanel.hidden).toBe(false);
      expect(document.activeElement).toBe(
        screen.getByRole("tab", { name: /fighter 02:/i })
      );
    });
  });

  it("adds and removes the staged presentation when the viewport changes", async () => {
    const media = installMatchMedia(false);
    const { container } = render(<App />);
    const navigator = container.querySelector<HTMLElement>(".mobile-matchup-navigator");
    const leftPanel = container.querySelector<HTMLElement>("#mobile-fighter-left-panel");
    const rightPanel = container.querySelector<HTMLElement>("#mobile-fighter-right-panel");
    if (!navigator || !leftPanel || !rightPanel) {
      throw new Error("Expected the responsive matchup structure.");
    }

    expect(navigator.hidden).toBe(true);
    expect(leftPanel.hidden).toBe(false);
    expect(rightPanel.hidden).toBe(false);

    act(() => media.setMatches(true));
    await waitFor(() => {
      expect(navigator.hidden).toBe(false);
      expect(screen.getAllByRole("tab")).toHaveLength(2);
      expect(leftPanel.hidden).toBe(false);
      expect(rightPanel.hidden).toBe(true);
    });

    act(() => media.setMatches(false));
    await waitFor(() => {
      expect(navigator.hidden).toBe(true);
      expect(leftPanel.hidden).toBe(false);
      expect(rightPanel.hidden).toBe(false);
    });
  });
});
