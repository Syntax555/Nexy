import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/app/App.js";
import { nexyData } from "../../src/data/nexy.js";

function firstTwoSelections(): readonly [
  { readonly characterId: string; readonly formId: string },
  { readonly characterId: string; readonly formId: string }
] {
  const leftCharacter = Array.isArray(nexyData.characters)
    ? nexyData.characters[0]
    : Object.values(nexyData.characters)[0];
  const rightCharacter = Array.isArray(nexyData.characters)
    ? nexyData.characters[1]
    : Object.values(nexyData.characters)[1];
  const leftForm = leftCharacter?.keys[0];
  const rightForm = rightCharacter?.keys[0];

  if (!leftCharacter || !rightCharacter || !leftForm || !rightForm) {
    throw new Error("The integration test requires at least two playable characters.");
  }

  return [
    {
      characterId: leftCharacter.entry_id || leftCharacter.id || "",
      formId: leftForm.key
    },
    {
      characterId: rightCharacter.entry_id || rightCharacter.id || "",
      formId: rightForm.key
    }
  ];
}

describe("Nexy application", () => {
  beforeEach(() => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true
    }));
    window.history.replaceState(null, "", "/Nexy/");
    document.documentElement.dataset.theme = "dark";
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("selects two roster entries and produces a battle report", async () => {
    const { container } = render(<App />);
    expect((screen.getByRole("main") as HTMLElement).tabIndex).toBe(-1);
    const pickers = container.querySelectorAll<HTMLElement>(".fighter-picker");
    const [leftSelection, rightSelection] = firstTwoSelections();
    const characters = Array.isArray(nexyData.characters) ? nexyData.characters : Object.values(nexyData.characters);
    const leftCharacter = characters.find(
      (character) => (character.entry_id || character.id) === leftSelection.characterId
    );
    const rightCharacter = characters.find(
      (character) => (character.entry_id || character.id) === rightSelection.characterId
    );

    expect(pickers).toHaveLength(2);
    if (!pickers[0] || !pickers[1] || !leftCharacter || !rightCharacter) {
      throw new Error("Expected both fighter pickers and fixture characters.");
    }
    const leftPicker = pickers[0];
    const rightPicker = pickers[1];

    fireEvent.click(within(leftPicker).getByRole("button", { name: new RegExp(leftCharacter.name, "i") }));
    fireEvent.click(within(rightPicker).getByRole("button", { name: new RegExp(rightCharacter.name, "i") }));

    const analyze = screen.getByRole("button", { name: /analyze battle/i }) as HTMLButtonElement;
    expect(analyze.disabled).toBe(false);
    fireEvent.click(analyze);

    const battleHeading = await screen.findByRole("heading", { name: "Battle report" });
    await waitFor(() => {
      expect(document.activeElement).toBe(battleHeading);
    });
    expect(container.querySelector(".capability-tag details")).toBeTruthy();
    await waitFor(() => {
      expect(window.location.search).toContain("battle=1");
      expect(window.location.search).toContain("ruleset=1");
      expect(window.location.search).toContain(`data=${nexyData.meta.content_revision}`);
    });

    analyze.focus();
    fireEvent.click(analyze);
    expect(document.activeElement).toBe(battleHeading);

    fireEvent.click(screen.getByRole("button", { name: /edit matchup/i }));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Battle report" })).toBeNull();
      expect(document.activeElement).toBe(within(leftPicker).getByRole("heading", { level: 2 }));
    });
  });

  it("restores a shared battle directly from the URL", async () => {
    const [left, right] = firstTwoSelections();
    const query = new URLSearchParams({
      left: `${left.characterId}~${left.formId}`,
      right: `${right.characterId}~${right.formId}`,
      battle: "1"
    });
    window.history.replaceState(null, "", `/Nexy/?${query.toString()}`);

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Battle report" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy battle link/i })).toBeTruthy();
    expect(screen.getByText("Shared-link compatibility notice")).toBeTruthy();
    expect(screen.getByText(/legacy matchup link/i)).toBeTruthy();
    expect(window.location.search).not.toContain("ruleset=");
  });

  it("shows the legal notice and links to the rights-holder page", () => {
    render(<App />);

    expect(screen.getByText(/unofficial, non-commercial fan project/i)).toBeTruthy();
    const legalLink = screen.getByRole("link", {
      name: /legal & removal requests/i
    });
    expect(legalLink.getAttribute("href")).toMatch(/\/legal\.html$/);
  });

  it("browses media, publisher, and universe progressively before filtering metadata", async () => {
    const { container } = render(<App />);
    const leftPicker = container.querySelector<HTMLElement>('.fighter-picker[data-side="left"]');
    if (!leftPicker) throw new Error("Expected the left fighter picker.");

    const picker = within(leftPicker);
    const count = leftPicker.querySelector<HTMLElement>(".roster-meta [role='status']");
    if (!count) throw new Error("Expected the live roster result count.");

    expect(count.getAttribute("aria-live")).toBe("polite");
    expect(count.textContent).toContain("20 of 20 fighters");

    const mediaSelect = picker.getByRole("button", {
      name: /^Media:/
    }) as HTMLButtonElement;
    const originSelect = picker.getByRole("button", {
      name: /^Publisher \/ origin:/
    }) as HTMLButtonElement;
    const universeSelect = picker.getByRole("button", {
      name: /^Universe \/ verse:/
    }) as HTMLButtonElement;
    const choosePathOption = (control: HTMLButtonElement, option: string): void => {
      fireEvent.click(control);
      fireEvent.click(picker.getByRole("option", { name: option }));
    };
    const openChoiceLabels = (label: string): readonly string[] =>
      within(picker.getByRole("listbox", { name: label }))
        .getAllByRole("option")
        .map((option) => option.textContent?.replace("✓", "") ?? "");
    const browsePath = leftPicker.querySelector<HTMLElement>("[data-browse-path]");
    const browseStatus = leftPicker.querySelector<HTMLElement>("[data-browse-path-status]");
    if (!browsePath || !browseStatus) throw new Error("Expected the progressive browse path.");

    expect(browsePath.tagName).toBe("FIELDSET");
    expect(picker.getByRole("group", { name: "Browse by universe" })).toBe(browsePath);
    expect(leftPicker.querySelector("details.roster-path")).toBeNull();
    expect(originSelect.disabled).toBe(true);
    expect(universeSelect.disabled).toBe(true);
    expect(originSelect.textContent).toBe("Choose media first");
    expect(universeSelect.textContent).toBe("Choose publisher / origin first");
    expect(browsePath.dataset.browseLevel).toBe("all");

    choosePathOption(mediaSelect, "Comics");
    expect(originSelect.disabled).toBe(false);
    expect(universeSelect.disabled).toBe(true);
    expect(browseStatus.textContent).toContain("Comics selected");
    expect(browsePath.dataset.browseLevel).toBe("media");
    fireEvent.click(originSelect);
    expect(openChoiceLabels("Publisher / origin")).toEqual([
      "All Comics publishers / origins",
      "DC Comics",
      "Marvel Comics"
    ]);

    fireEvent.click(picker.getByRole("option", { name: "DC Comics" }));
    expect(universeSelect.disabled).toBe(false);
    expect(browseStatus.textContent).toContain("Comics → DC Comics");
    expect(browsePath.dataset.browseLevel).toBe("publisher");
    fireEvent.click(universeSelect);
    expect(openChoiceLabels("Universe / verse")).toEqual(["All DC Comics universes", "Post-Crisis", "Post-Flashpoint"]);
    await waitFor(() => {
      expect(count.textContent).toContain("2 of 20 fighters");
    });

    fireEvent.click(picker.getByRole("option", { name: "Post-Flashpoint" }));
    expect(browseStatus.textContent).toBe("Comics → DC Comics → Post-Flashpoint");
    expect(browsePath.dataset.browseLevel).toBe("universe");
    await waitFor(() => {
      expect(count.textContent).toContain("1 of 20 fighters");
    });
    const filteredFighter = leftPicker.querySelector<HTMLButtonElement>(".roster-card");
    expect(filteredFighter?.getAttribute("aria-label")).toMatch(/^Wonder Girl,/);
    expect(filteredFighter?.getAttribute("aria-label")).toContain("Comics, DC Comics, Post-Flashpoint");
    expect(filteredFighter?.textContent).toContain("DC Comics / Post-Flashpoint");

    fireEvent.click(picker.getByRole("button", { name: "Clear Media" }));
    expect(originSelect.textContent).toBe("Choose media first");
    expect(originSelect.disabled).toBe(true);
    expect(universeSelect.textContent).toBe("Choose publisher / origin first");
    expect(universeSelect.disabled).toBe(true);
    await waitFor(() => {
      expect(count.textContent).toContain("20 of 20 fighters");
    });

    const filterSummary = picker.getByText("More filters").closest("summary");
    if (!filterSummary) throw new Error("Expected the filter disclosure.");
    fireEvent.click(filterSummary);

    fireEvent.change(picker.getByLabelText("Age"), { target: { value: "teen" } });
    await waitFor(() => {
      expect(count.textContent).toContain("3 of 20 fighters");
    });
    expect(leftPicker.querySelector<HTMLButtonElement>('.roster-card[aria-label*="Joaqu"]')).toBeTruthy();
    expect(leftPicker.querySelector<HTMLButtonElement>('.roster-card[aria-label^="Ms. Marvel"]')).toBeTruthy();

    fireEvent.change(picker.getByLabelText("Age"), { target: { value: "all" } });
    fireEvent.change(picker.getByLabelText("Classification"), {
      target: { value: "human" }
    });
    await waitFor(() => {
      expect(leftPicker.querySelector<HTMLButtonElement>('.roster-card[aria-label*="Joaqu"]')).toBeTruthy();
    });

    fireEvent.change(picker.getByLabelText("Classification"), {
      target: { value: "all" }
    });
    fireEvent.change(picker.getByLabelText("Tier"), { target: { value: "9-C" } });
    await waitFor(() => {
      expect(leftPicker.querySelector<HTMLButtonElement>('.roster-card[aria-label^="Captain America"]')).toBeTruthy();
    });

    fireEvent.change(picker.getByLabelText("Tier"), { target: { value: "2-A" } });
    await waitFor(() => {
      expect(count.textContent).toContain("1 of 20 fighters");
    });
    expect(leftPicker.querySelector<HTMLButtonElement>(".roster-card")?.getAttribute("aria-label")).toMatch(
      /^Wonder Girl,/
    );

    fireEvent.change(picker.getByLabelText("Tier"), { target: { value: "all" } });
    choosePathOption(mediaSelect, "Comics");
    choosePathOption(originSelect, "DC Comics");
    await waitFor(() => {
      expect(count.textContent).toContain("2 of 20 fighters");
    });
    fireEvent.click(universeSelect);
    expect(openChoiceLabels("Universe / verse")).toEqual(["All DC Comics universes", "Post-Crisis", "Post-Flashpoint"]);
    fireEvent.keyDown(universeSelect, { key: "Escape" });

    fireEvent.click(picker.getByRole("button", { name: "Clear Publisher / origin" }));
    expect(universeSelect.disabled).toBe(true);
    fireEvent.change(picker.getByLabelText("Order"), {
      target: { value: "name-desc" }
    });
    await waitFor(() => {
      expect(leftPicker.querySelector<HTMLButtonElement>(".roster-card")?.getAttribute("aria-label")).toMatch(
        /^Wonder Girl,/
      );
    });
  });

  it("keeps the selected fighter while the browse path changes", () => {
    const { container } = render(<App />);
    const leftPicker = container.querySelector<HTMLElement>('.fighter-picker[data-side="left"]');
    if (!leftPicker) throw new Error("Expected the left fighter picker.");

    const picker = within(leftPicker);
    const firstFighter = leftPicker.querySelector<HTMLButtonElement>(".roster-card");
    if (!firstFighter) throw new Error("Expected a roster entry.");

    fireEvent.click(firstFighter);
    const selectedName = picker.getByRole("heading", { level: 2 }).textContent;

    const media = picker.getByRole("button", { name: /^Media:/ });
    fireEvent.click(media);
    fireEvent.click(picker.getByRole("option", { name: "Comics" }));
    const publisher = picker.getByRole("button", {
      name: /^Publisher \/ origin:/
    });
    fireEvent.click(publisher);
    fireEvent.click(picker.getByRole("option", { name: "DC Comics" }));

    expect(picker.getByRole("heading", { level: 2 }).textContent).toBe(selectedName);
    expect(picker.getByRole("button", { name: "Remove fighter" })).toBeTruthy();
  });

  it("keeps focus in a picker when clear and reset controls unmount", async () => {
    const { container } = render(<App />);
    const leftPicker = container.querySelector<HTMLElement>('.fighter-picker[data-side="left"]');
    if (!leftPicker) throw new Error("Expected the left fighter picker.");

    const picker = within(leftPicker);
    const search = picker.getByRole("searchbox", {
      name: "Search characters"
    }) as HTMLInputElement;
    const firstFighter = leftPicker.querySelector<HTMLButtonElement>(".roster-card");
    if (!firstFighter) throw new Error("Expected a roster entry.");

    fireEvent.click(firstFighter);
    fireEvent.click(picker.getByRole("button", { name: "Remove fighter" }));
    await waitFor(() => {
      expect(picker.queryByRole("button", { name: "Remove fighter" })).toBeNull();
      expect(document.activeElement).toBe(search);
    });

    fireEvent.input(search, { target: { value: "no-such-fighter" } });
    fireEvent.click(picker.getByRole("button", { name: "Reset filters" }));
    await waitFor(() => {
      expect(search.value).toBe("");
      expect(document.activeElement).toBe(search);
    });
  });
});
