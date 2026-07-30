import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within
} from "@testing-library/preact";
import { useMemo, useState } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildRoster, type RosterCharacter } from "../../src/app/roster.js";
import { FighterPicker } from "../../src/components/FighterPicker.js";
import { nexyData } from "../../src/data/nexy.js";
import type { BattleSelection } from "../../src/domain/index.js";
import {
  createGameContext,
  getCharacterProfile
} from "../../src/engine/index.js";

const context = createGameContext(nexyData);
const roster = buildRoster(context);

function rosterCharacter(name: string): RosterCharacter {
  const character = roster.find((candidate) => candidate.name === name);
  if (!character) throw new Error(`Expected ${name} in the test roster.`);
  return character;
}

interface ControlledPickerProps {
  readonly initialSelection?: BattleSelection | null;
  readonly onRandom?: (candidates: readonly RosterCharacter[]) => void;
}

function ControlledPicker({
  initialSelection = null,
  onRandom = () => undefined
}: ControlledPickerProps) {
  const [selection, setSelection] = useState<BattleSelection | null>(
    initialSelection
  );
  const profile = useMemo(
    () => selection ? getCharacterProfile(context, selection) : null,
    [selection]
  );

  return (
    <FighterPicker
      side="left"
      roster={roster}
      selection={selection}
      profile={profile}
      onSelect={setSelection}
      onClear={() => setSelection(null)}
      onRandom={onRandom}
      onOpenImage={() => undefined}
    />
  );
}

describe("fighter selection flow", () => {
  afterEach(cleanup);

  it("turns the full roster gallery into a focused profile without duplicating fighters", async () => {
    const { container } = render(<ControlledPicker />);
    const picker = within(container as HTMLElement);
    const pickerElement = container.querySelector<HTMLElement>(".fighter-picker");
    const characterList = picker.getByRole("list", { name: "Characters" });
    const captainAmerica = picker.getByRole("button", {
      name: /^Captain America,/
    });

    expect(pickerElement?.dataset.view).toBe("gallery");
    expect(within(characterList).getAllByRole("button")).toHaveLength(roster.length);
    expect(
      picker.getAllByRole("button", { name: /^Captain America,/ })
    ).toHaveLength(1);

    captainAmerica.focus();
    fireEvent.click(captainAmerica);

    await waitFor(() => {
      expect(pickerElement?.dataset.view).toBe("profile");
      expect(captainAmerica.getAttribute("aria-pressed")).toBe("true");
      expect(document.activeElement).toBe(captainAmerica);
    });
    expect(
      picker.getByRole("heading", { name: "Captain America", level: 3 })
    ).toBeTruthy();

    fireEvent.click(
      picker.getByRole("button", { name: "Remove fighter" })
    );
    await waitFor(() => {
      expect(pickerElement?.dataset.view).toBe("gallery");
      expect(
        picker.getByRole("searchbox", { name: "Search characters" })
      ).toBe(document.activeElement);
    });
  });

  it("pins the selected fighter above results when it is outside the active filters", async () => {
    const captainAmerica = rosterCharacter("Captain America");
    const { container } = render(
      <ControlledPicker initialSelection={captainAmerica.defaultSelection} />
    );
    const picker = within(container as HTMLElement);
    const search = picker.getByRole("searchbox", {
      name: "Search characters"
    });

    fireEvent.input(search, { target: { value: "Wonder Girl" } });
    await waitFor(() => {
      expect(
        container.querySelector(".roster-meta [role='status']")?.textContent
      ).toContain("1 of 20 fighters");
    });

    const cards = [
      ...container.querySelectorAll<HTMLButtonElement>(".roster-card")
    ];
    expect(cards).toHaveLength(2);
    expect(cards[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(cards[0]?.getAttribute("aria-label")).toMatch(/^Captain America,/);
    expect(cards[1]?.getAttribute("aria-label")).toMatch(/^Wonder Girl,/);
  });

  it("passes only the currently filtered candidates to Random", async () => {
    const onRandom = vi.fn<(candidates: readonly RosterCharacter[]) => void>();
    const { container } = render(<ControlledPicker onRandom={onRandom} />);
    const picker = within(container as HTMLElement);

    fireEvent.input(
      picker.getByRole("searchbox", { name: "Search characters" }),
      { target: { value: "Wonder Girl" } }
    );
    await waitFor(() => {
      expect(
        container.querySelector(".roster-meta [role='status']")?.textContent
      ).toContain("1 of 20 fighters");
    });
    fireEvent.click(picker.getByRole("button", { name: "Random" }));

    expect(onRandom).toHaveBeenCalledTimes(1);
    const candidates = onRandom.mock.calls[0]?.[0];
    expect(candidates?.map((candidate) => candidate.name)).toEqual([
      "Wonder Girl"
    ]);
  });

  it("disables Random when the only filtered candidate is already selected", async () => {
    const captainAmerica = rosterCharacter("Captain America");
    const { container } = render(
      <ControlledPicker initialSelection={captainAmerica.defaultSelection} />
    );
    const picker = within(container as HTMLElement);

    fireEvent.input(
      picker.getByRole("searchbox", { name: "Search characters" }),
      { target: { value: "Captain America" } }
    );

    await waitFor(() => {
      expect(
        (picker.getByRole("button", { name: "Random" }) as HTMLButtonElement)
          .disabled
      ).toBe(true);
    });
  });

  it("returns the roster to the top when search or ordering changes", async () => {
    const { container } = render(<ControlledPicker />);
    const picker = within(container as HTMLElement);
    const list = picker.getByRole("list", { name: "Characters" });

    list.scrollTop = 240;
    fireEvent.change(picker.getByLabelText("Order"), {
      target: { value: "name-desc" }
    });
    await waitFor(() => expect(list.scrollTop).toBe(0));

    list.scrollTop = 240;
    fireEvent.input(
      picker.getByRole("searchbox", { name: "Search characters" }),
      { target: { value: "Captain America" } }
    );
    await waitFor(() => expect(list.scrollTop).toBe(0));
  });

  it("does not reset an alternate form when the selected roster card is clicked again", async () => {
    const { container } = render(<ControlledPicker />);
    const picker = within(container as HTMLElement);

    fireEvent.click(
      picker.getByRole("button", { name: /^Captain America,/ })
    );
    const form = await picker.findByRole("combobox", {
      name: "Form for Captain America"
    }) as HTMLSelectElement;
    form.focus();
    fireEvent.change(form, {
      target: { value: "post-alchemax-enhancement" }
    });
    await waitFor(() => {
      expect(
        (picker.getByRole("combobox", {
          name: "Form for Captain America"
        }) as HTMLSelectElement).value
      ).toBe("post-alchemax-enhancement");
    });
    expect(document.activeElement).toBe(form);

    const selectedCard = container.querySelector<HTMLButtonElement>(
      '.roster-card[aria-pressed="true"]'
    );
    if (!selectedCard) throw new Error("Expected Captain America to remain selected.");
    fireEvent.click(selectedCard);

    expect(
      (picker.getByRole("combobox", {
        name: "Form for Captain America"
      }) as HTMLSelectElement).value
    ).toBe("post-alchemax-enhancement");
  });
});
