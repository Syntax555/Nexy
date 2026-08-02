import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
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
    media: "(max-width: 1180px)",
    onchange: null,
    addEventListener: (type: string, listener: (event: MediaQueryListEvent) => void): void => {
      if (type === "change") listeners.add(listener);
    },
    removeEventListener: (type: string, listener: (event: MediaQueryListEvent) => void): void => {
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

  it("embeds one pressed-button switcher in the active picker and preserves each side's state", async () => {
    installMatchMedia(true);
    const { container } = render(<App />);
    const leftPanel = container.querySelector<HTMLElement>("#mobile-fighter-left-panel");
    const rightPanel = container.querySelector<HTMLElement>("#mobile-fighter-right-panel");
    if (!leftPanel || !rightPanel) {
      throw new Error("Expected the mobile matchup flow.");
    }

    const activeSwitcher = () => screen.getByRole("group", { name: "Choose a fighter to edit" });
    const leftSwitch = () =>
      screen.getByRole("button", {
        name: /fighter 01:/i
      });
    const rightSwitch = () =>
      screen.getByRole("button", {
        name: /fighter 02:/i
      });
    const leftSearch = within(leftPanel).getByRole("searchbox", {
      name: "Search characters"
    }) as HTMLInputElement;
    const rightSearch = rightPanel.querySelector<HTMLInputElement>('input[type="search"]');
    if (!rightSearch) throw new Error("Expected the right-side roster search.");

    expect(container.querySelectorAll(".mobile-matchup-navigator")).toHaveLength(1);
    expect(leftPanel.contains(activeSwitcher())).toBe(true);
    expect(rightPanel.querySelector(".mobile-matchup-navigator")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(container.querySelector(".mobile-matchup-status")).toBeNull();
    expect(leftSwitch().getAttribute("aria-pressed")).toBe("true");
    expect(rightSwitch().getAttribute("aria-pressed")).toBe("false");
    expect(leftSwitch().tabIndex).toBe(0);
    expect(rightSwitch().tabIndex).toBe(0);
    expect(leftPanel.hidden).toBe(false);
    expect(rightPanel.hidden).toBe(true);
    expect(leftPanel.querySelector(".roster-carousel")?.getAttribute("data-roster-view")).toBe("carousel");

    fireEvent.input(leftSearch, { target: { value: "Captain America" } });
    await waitFor(() => {
      expect(leftPanel.querySelectorAll(".roster-card")).toHaveLength(1);
    });
    const leftFighter = leftPanel.querySelector<HTMLButtonElement>(".roster-card");
    if (!leftFighter) throw new Error("Expected a left-side roster entry.");
    leftFighter.focus();
    fireEvent.click(leftFighter);

    await waitFor(() => {
      expect(leftSwitch().getAttribute("aria-label")).toMatch(/fighter 01: captain america, chosen/i);
      expect(leftPanel.querySelector(".roster-carousel")?.getAttribute("data-roster-view")).toBe("grid");
    });
    expect(leftPanel.hidden).toBe(false);
    expect(rightPanel.hidden).toBe(true);
    expect(leftSwitch().getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(leftFighter);
    expect(within(leftPanel).getByRole("region", { name: "Cyan corner character portrait grid" })).toBeTruthy();
    expect(leftPanel.querySelector(".roster-carousel__arrow")).toBeNull();
    expect(leftPanel.querySelector("#left-carousel-status")).toBeNull();
    expect(leftPanel.querySelector(".roster-card__grid-selected")).toBeTruthy();

    fireEvent.click(rightSwitch());
    await waitFor(() => {
      expect(rightPanel.hidden).toBe(false);
      expect(leftPanel.hidden).toBe(true);
      expect(container.querySelectorAll(".mobile-matchup-navigator")).toHaveLength(1);
      expect(rightPanel.contains(activeSwitcher())).toBe(true);
      expect(leftPanel.querySelector(".mobile-matchup-navigator")).toBeNull();
      expect(rightSwitch().getAttribute("aria-pressed")).toBe("true");
      expect(document.activeElement).toBe(rightSwitch());
      expect(rightPanel.querySelector(".roster-carousel")?.getAttribute("data-roster-view")).toBe("grid");
      expect(screen.getByRole("button", { name: "Portrait grid view" }).getAttribute("aria-pressed")).toBe("true");
    });

    fireEvent.input(rightSearch, { target: { value: "Dagger" } });
    await waitFor(() => {
      expect(rightPanel.querySelectorAll(".roster-card")).toHaveLength(1);
    });
    const rightFighter = rightPanel.querySelector<HTMLButtonElement>(".roster-card");
    if (!rightFighter) throw new Error("Expected a right-side roster entry.");
    fireEvent.click(rightFighter);

    await waitFor(() => {
      expect(rightSwitch().getAttribute("aria-label")).toMatch(/fighter 02: dagger, chosen/i);
    });
    const analyzeButtons = screen.getAllByRole("button", {
      name: /^Analyze battle/i
    });
    expect(analyzeButtons).toHaveLength(1);
    const analyze = analyzeButtons[0] as HTMLButtonElement;
    expect(analyze.disabled).toBe(false);

    fireEvent.click(leftSwitch());
    await waitFor(() => {
      expect(leftPanel.hidden).toBe(false);
      expect(rightPanel.hidden).toBe(true);
      expect(document.activeElement).toBe(leftSwitch());
    });
    expect(leftSearch.value).toBe("Captain America");
    expect(leftPanel.querySelector('.roster-card[aria-pressed="true"]')).toBeTruthy();

    leftSwitch().focus();
    fireEvent.keyDown(leftSwitch(), { key: "ArrowRight" });
    await waitFor(() => {
      expect(rightPanel.hidden).toBe(false);
      expect(document.activeElement).toBe(rightSwitch());
    });
    expect(rightSearch.value).toBe("Dagger");
    expect(rightPanel.querySelector('.roster-card[aria-pressed="true"]')).toBeTruthy();
  });

  it("preserves picker state across viewport changes and focus on mobile entry", async () => {
    const media = installMatchMedia(false);
    const { container } = render(<App />);
    const leftPanel = container.querySelector<HTMLElement>("#mobile-fighter-left-panel");
    const rightPanel = container.querySelector<HTMLElement>("#mobile-fighter-right-panel");
    if (!leftPanel || !rightPanel) {
      throw new Error("Expected the responsive matchup structure.");
    }
    const rightSearch = within(rightPanel).getByRole("searchbox", {
      name: "Search characters"
    }) as HTMLInputElement;

    expect(container.querySelector(".mobile-matchup-navigator")).toBeNull();
    expect(screen.queryByRole("group", { name: "Choose a fighter to edit" })).toBeNull();
    expect(leftPanel.hidden).toBe(false);
    expect(rightPanel.hidden).toBe(false);
    fireEvent.input(rightSearch, { target: { value: "Dagger" } });
    const rightMediaFilter = within(rightPanel).getByRole("button", { name: "Media: All media" });
    rightMediaFilter.focus();
    expect(document.activeElement).toBe(rightMediaFilter);

    act(() => media.setMatches(true));
    await waitFor(() => {
      expect(container.querySelectorAll(".mobile-matchup-navigator")).toHaveLength(1);
      expect(screen.getAllByRole("button", { name: /fighter 0[12]:/i })).toHaveLength(2);
      expect(leftPanel.hidden).toBe(true);
      expect(rightPanel.hidden).toBe(false);
      expect(screen.getByRole("button", { name: /fighter 02:/i }).getAttribute("aria-pressed")).toBe("true");
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /fighter 02:/i }));
    });
    expect(rightSearch.value).toBe("Dagger");
    const mobileBrowse = rightPanel.querySelector<HTMLDetailsElement>("details.roster-path");
    expect(mobileBrowse).toBeTruthy();
    expect(mobileBrowse?.open).toBe(false);

    act(() => media.setMatches(false));
    await waitFor(() => {
      expect(container.querySelector(".mobile-matchup-navigator")).toBeNull();
      expect(leftPanel.hidden).toBe(false);
      expect(rightPanel.hidden).toBe(false);
      expect(document.activeElement).toBe(rightPanel.querySelector("#right-picker-title"));
    });
    expect(rightSearch.value).toBe("Dagger");
    expect(rightPanel.querySelector("details.roster-path")).toBeNull();
    expect(rightPanel.querySelector("fieldset.roster-path")).toBeTruthy();
  });

  it("collapses universe browsing on mobile without resetting its filters", async () => {
    installMatchMedia(true);
    const { container } = render(<App />);
    const leftPanel = container.querySelector<HTMLElement>("#mobile-fighter-left-panel");
    if (!leftPanel) throw new Error("Expected the left mobile fighter panel.");

    const picker = within(leftPanel);
    const browse = leftPanel.querySelector<HTMLDetailsElement>("details.roster-path");
    const summary = browse?.querySelector<HTMLElement>("summary");
    const count = leftPanel.querySelector<HTMLElement>(".roster-meta [role='status']");
    if (!browse || !summary || !count) throw new Error("Expected the mobile browse disclosure and result count.");

    expect(browse.open).toBe(false);
    expect(summary.textContent).toContain("Browse by universe");
    expect(summary.textContent).toContain("All universes");
    fireEvent.click(summary);
    expect(browse.open).toBe(true);
    expect(picker.getByRole("group", { name: "Browse by universe" })).toBeTruthy();

    const choosePathOption = (label: RegExp, option: string): void => {
      const control = picker.getByRole("button", { name: label });
      fireEvent.click(control);
      fireEvent.click(picker.getByRole("option", { name: option }));
    };
    choosePathOption(/^Media:/, "Comics");
    choosePathOption(/^Publisher \/ origin:/, "DC Comics");
    await waitFor(() => {
      expect(count.textContent).toContain("2 of 20 fighters");
    });
    expect(summary.textContent).toContain("DC Comics");

    fireEvent.click(summary);
    expect(browse.open).toBe(false);
    expect(summary.textContent).toContain("DC Comics");
    expect(count.textContent).toContain("2 of 20 fighters");

    fireEvent.click(summary);
    expect(browse.open).toBe(true);
    expect(picker.getByRole("button", { name: "Media: Comics" })).toBeTruthy();
    expect(picker.getByRole("button", { name: "Publisher / origin: DC Comics" })).toBeTruthy();
  });
});
