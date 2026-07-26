import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { cleanup } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
    window.history.replaceState(null, "", "/Nexy/");
    document.documentElement.dataset.theme = "dark";
  });

  afterEach(() => {
    cleanup();
  });

  it("selects two roster entries and produces a battle report", async () => {
    const { container } = render(<App />);
    expect((screen.getByRole("main") as HTMLElement).tabIndex).toBe(-1);
    const pickers = container.querySelectorAll<HTMLElement>(".fighter-picker");
    const [leftSelection, rightSelection] = firstTwoSelections();
    const characters = Array.isArray(nexyData.characters)
      ? nexyData.characters
      : Object.values(nexyData.characters);
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

    fireEvent.click(
      within(leftPicker).getByRole("button", { name: new RegExp(leftCharacter.name, "i") })
    );
    fireEvent.click(
      within(rightPicker).getByRole("button", { name: new RegExp(rightCharacter.name, "i") })
    );

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
    });

    analyze.focus();
    fireEvent.click(analyze);
    expect(document.activeElement).toBe(battleHeading);

    fireEvent.click(screen.getByRole("button", { name: /edit matchup/i }));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Battle report" })).toBeNull();
      expect(document.activeElement).toBe(
        within(leftPicker).getByRole("heading", { level: 2 })
      );
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
  });

  it("filters the roster by legacy metadata and supports descending names", async () => {
    const { container } = render(<App />);
    const leftPicker = container.querySelector<HTMLElement>('.fighter-picker[data-side="left"]');
    if (!leftPicker) throw new Error("Expected the left fighter picker.");

    const picker = within(leftPicker);
    const count = leftPicker.querySelector<HTMLElement>(".roster-meta [role='status']");
    if (!count) throw new Error("Expected the live roster result count.");

    expect(count.getAttribute("aria-live")).toBe("polite");
    expect(count.textContent).toContain("20 of 20 fighters");

    const filterSummary = picker.getByText("More filters").closest("summary");
    if (!filterSummary) throw new Error("Expected the filter disclosure.");
    fireEvent.click(filterSummary);

    fireEvent.change(picker.getByLabelText("Age"), { target: { value: "teen" } });
    await waitFor(() => {
      expect(count.textContent).toContain("3 of 20 fighters");
    });
    expect(
      leftPicker.querySelector<HTMLButtonElement>(
        '.roster-card[aria-label*="Joaqu"]'
      )
    ).toBeTruthy();
    expect(
      leftPicker.querySelector<HTMLButtonElement>(
        '.roster-card[aria-label^="Ms. Marvel"]'
      )
    ).toBeTruthy();

    fireEvent.change(picker.getByLabelText("Age"), { target: { value: "all" } });
    fireEvent.change(picker.getByLabelText("Classification"), {
      target: { value: "human" }
    });
    await waitFor(() => {
      expect(
        leftPicker.querySelector<HTMLButtonElement>(
          '.roster-card[aria-label*="Joaqu"]'
        )
      ).toBeTruthy();
    });

    fireEvent.change(picker.getByLabelText("Classification"), {
      target: { value: "all" }
    });
    fireEvent.change(picker.getByLabelText("Tier"), { target: { value: "9-C" } });
    await waitFor(() => {
      expect(
        leftPicker.querySelector<HTMLButtonElement>(
          '.roster-card[aria-label^="Captain America"]'
        )
      ).toBeTruthy();
    });

    fireEvent.change(picker.getByLabelText("Tier"), { target: { value: "2-A" } });
    await waitFor(() => {
      expect(count.textContent).toContain("1 of 20 fighters");
    });
    expect(
      leftPicker.querySelector<HTMLButtonElement>(".roster-card")?.getAttribute("aria-label")
    ).toMatch(/^Wonder Girl,/);

    fireEvent.change(picker.getByLabelText("Tier"), { target: { value: "all" } });
    fireEvent.change(picker.getByLabelText("Media"), {
      target: { value: "comics" }
    });
    fireEvent.change(picker.getByLabelText("Origin"), {
      target: { value: "dc-comics" }
    });
    await waitFor(() => {
      expect(count.textContent).toContain("2 of 20 fighters");
    });
    expect(
      [...(picker.getByLabelText("Universe") as HTMLSelectElement).options]
        .map((option) => option.textContent)
    ).toEqual(["All universes", "Post-Crisis", "Post-Flashpoint"]);

    fireEvent.change(picker.getByLabelText("Origin"), { target: { value: "all" } });
    fireEvent.change(picker.getByLabelText("Order"), {
      target: { value: "name-desc" }
    });
    await waitFor(() => {
      expect(
        leftPicker.querySelector<HTMLButtonElement>(".roster-card")?.getAttribute("aria-label")
      ).toMatch(/^Wonder Girl,/);
    });
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
    fireEvent.click(picker.getByRole("button", { name: "Clear" }));
    await waitFor(() => {
      expect(picker.queryByRole("button", { name: "Clear" })).toBeNull();
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
