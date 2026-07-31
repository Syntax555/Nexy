import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/preact";
import { useMemo, useState } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildRoster, type RosterCharacter } from "../../src/app/roster.js";
import { FighterPicker } from "../../src/components/FighterPicker.js";
import { nexyData } from "../../src/data/nexy.js";
import type { BattleSelection } from "../../src/domain/index.js";
import { createGameContext, getCharacterProfile } from "../../src/engine/index.js";

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
  readonly rosterItems?: readonly RosterCharacter[];
}

function ControlledPicker({
  initialSelection = null,
  onRandom = () => undefined,
  rosterItems = roster
}: ControlledPickerProps) {
  const [selection, setSelection] = useState<BattleSelection | null>(initialSelection);
  const profile = useMemo(() => (selection ? getCharacterProfile(context, selection) : null), [selection]);

  return (
    <FighterPicker
      side="left"
      roster={rosterItems}
      selection={selection}
      profile={profile}
      onSelect={setSelection}
      onClear={() => setSelection(null)}
      onRandom={onRandom}
      onOpenImage={() => undefined}
    />
  );
}

function RandomizingPicker() {
  const [selection, setSelection] = useState<BattleSelection | null>(null);
  const profile = useMemo(() => (selection ? getCharacterProfile(context, selection) : null), [selection]);

  return (
    <FighterPicker
      side="left"
      roster={roster}
      selection={selection}
      profile={profile}
      onSelect={setSelection}
      onClear={() => setSelection(null)}
      onRandom={(candidates) => {
        const candidate = candidates[1] ?? candidates[0];
        if (candidate) setSelection(candidate.defaultSelection);
      }}
      onOpenImage={() => undefined}
    />
  );
}

describe("fighter selection flow", () => {
  afterEach(cleanup);

  it("previews the circular spotlight carousel before committing a fighter", async () => {
    const { container } = render(<ControlledPicker />);
    const picker = within(container as HTMLElement);
    const carousel = picker.getByRole("region", {
      name: "Cyan corner character carousel"
    });
    const featuredCard = () => container.querySelector<HTMLButtonElement>('.roster-card[aria-current="true"]');

    await waitFor(() => {
      expect(featuredCard()?.getAttribute("aria-label")).toMatch(/^Agent Venom,/);
    });
    expect(picker.getByRole("heading", { name: "Select fighter", level: 2 })).toBeTruthy();
    expect(container.querySelector('.roster-card[aria-pressed="true"]')).toBeNull();

    const next = within(carousel).getByRole("button", {
      name: "Next fighter: Aurora"
    });
    next.focus();
    fireEvent.click(next);
    await waitFor(() => {
      expect(featuredCard()?.getAttribute("aria-label")).toMatch(/^Aurora,/);
      expect(document.activeElement).toBe(next);
    });
    expect(container.querySelector('.roster-card[aria-pressed="true"]')).toBeNull();

    fireEvent.click(
      within(carousel).getByRole("button", {
        name: "Previous fighter: Agent Venom"
      })
    );
    fireEvent.click(
      within(carousel).getByRole("button", {
        name: "Previous fighter: Wonder Girl"
      })
    );
    await waitFor(() => {
      expect(featuredCard()?.getAttribute("aria-label")).toMatch(/^Wonder Girl,/);
      expect(carousel.textContent).toContain("20 of 20");
    });

    const wonderGirl = featuredCard();
    if (!wonderGirl) throw new Error("Expected Wonder Girl to be featured.");
    wonderGirl.focus();
    fireEvent.keyDown(wonderGirl, { key: "ArrowRight" });
    await waitFor(() => {
      expect(featuredCard()?.getAttribute("aria-label")).toMatch(/^Agent Venom,/);
      expect(document.activeElement).toBe(featuredCard());
    });

    fireEvent.keyDown(featuredCard() as HTMLButtonElement, { key: "End" });
    await waitFor(() => {
      expect(featuredCard()?.getAttribute("aria-label")).toMatch(/^Wonder Girl,/);
    });
    fireEvent.keyDown(featuredCard() as HTMLButtonElement, { key: "Home" });
    await waitFor(() => {
      expect(featuredCard()?.getAttribute("aria-label")).toMatch(/^Agent Venom,/);
    });
  });

  it("supports swipe previews and disables navigation for one matching fighter", async () => {
    const { container } = render(<ControlledPicker />);
    const picker = within(container as HTMLElement);
    const list = picker.getByRole("list", { name: "Characters" });
    const featuredName = () =>
      container.querySelector<HTMLButtonElement>('.roster-card[aria-current="true"]')?.getAttribute("aria-label");

    await waitFor(() => expect(featuredName()).toMatch(/^Agent Venom,/));
    fireEvent.pointerDown(list, {
      pointerId: 1,
      clientX: 250,
      clientY: 200
    });
    fireEvent.pointerUp(list, {
      pointerId: 1,
      clientX: 150,
      clientY: 205
    });
    await waitFor(() => expect(featuredName()).toMatch(/^Aurora,/));
    expect(container.querySelector('.roster-card[aria-pressed="true"]')).toBeNull();

    fireEvent.pointerDown(list, {
      pointerId: 2,
      clientX: 180,
      clientY: 180
    });
    fireEvent.pointerUp(list, {
      pointerId: 2,
      clientX: 170,
      clientY: 90
    });
    expect(featuredName()).toMatch(/^Aurora,/);

    fireEvent.input(picker.getByRole("searchbox", { name: "Search characters" }), { target: { value: "Wonder Girl" } });
    await waitFor(() => {
      expect(featuredName()).toMatch(/^Wonder Girl,/);
      expect(
        picker.getByRole("button", { name: "Previous fighter: Wonder Girl" }).getAttribute("disabled")
      ).not.toBeNull();
      expect(picker.getByRole("button", { name: "Next fighter: Wonder Girl" }).getAttribute("disabled")).not.toBeNull();
    });
  });

  it("turns the spotlight carousel into a focused profile without duplicating fighters", async () => {
    const { container } = render(<ControlledPicker />);
    const picker = within(container as HTMLElement);
    const pickerElement = container.querySelector<HTMLElement>(".fighter-picker");
    const characterList = picker.getByRole("list", { name: "Characters" });
    const captainAmerica = picker.getByRole("button", {
      name: /^Captain America,/
    });

    expect(pickerElement?.dataset.view).toBe("gallery");
    expect(within(characterList).getAllByRole("button")).toHaveLength(roster.length);
    expect(picker.getAllByRole("button", { name: /^Captain America,/ })).toHaveLength(1);

    captainAmerica.focus();
    fireEvent.click(captainAmerica);

    await waitFor(() => {
      expect(pickerElement?.dataset.view).toBe("profile");
      expect(captainAmerica.getAttribute("aria-pressed")).toBe("true");
      expect(document.activeElement).toBe(captainAmerica);
    });
    expect(picker.getByRole("heading", { name: "Captain America", level: 3 })).toBeTruthy();

    fireEvent.click(picker.getByRole("button", { name: "Remove fighter" }));
    await waitFor(() => {
      expect(pickerElement?.dataset.view).toBe("gallery");
      expect(picker.getByRole("searchbox", { name: "Search characters" })).toBe(document.activeElement);
    });
  });

  it("keeps focus on Random when that control changes the selection", async () => {
    const { container } = render(<RandomizingPicker />);
    const picker = within(container as HTMLElement);
    const random = picker.getByRole("button", { name: "Random" });

    random.focus();
    fireEvent.click(random);

    await waitFor(() => {
      expect(container.querySelector(".fighter-picker")?.getAttribute("data-view")).toBe("profile");
      expect(document.activeElement).toBe(random);
    });
  });

  it("renders explicitly published unverified roster artwork with responsive candidates", () => {
    const { container } = render(<ControlledPicker />);
    const featured = roster[0];
    const imageRecord = featured?.defaultProfile.image;
    if (!featured || !imageRecord) {
      throw new Error("Expected the featured fighter to have an image record.");
    }
    expect(imageRecord.rights_status).toBe("unverified-third-party");
    expect(imageRecord.publish_unverified).toBe(true);

    const image = container.querySelector<HTMLImageElement>('.roster-card[aria-current="true"] img');
    if (!image) throw new Error("Expected explicitly published artwork for the featured fighter.");

    expect(image.getAttribute("src")).toBe("/images/generated/agent-venom-marvel-mainstream/agent-venom-160.webp");
    expect(image.getAttribute("srcset")).toBe(
      "/images/generated/agent-venom-marvel-mainstream/agent-venom-160.webp 160w, " +
        "/images/generated/agent-venom-marvel-mainstream/agent-venom-640.webp 640w"
    );
    expect(image.getAttribute("sizes")).toContain("84vw");
    expect(container.querySelector('.roster-card[aria-current="true"] .image-fallback')).toBeNull();
  });

  it("provides responsive candidates for display-approved roster artwork", () => {
    const first = roster[0];
    const imageRecord = first?.defaultProfile.image;
    if (!first || !imageRecord) {
      throw new Error("Expected a roster character with an image record.");
    }
    const displayApprovedRoster: readonly RosterCharacter[] = [
      {
        ...first,
        defaultProfile: {
          ...first.defaultProfile,
          image: {
            ...imageRecord,
            rights_status: "licensed"
          }
        }
      }
    ];
    const { container } = render(<ControlledPicker rosterItems={displayApprovedRoster} />);
    const image = container.querySelector<HTMLImageElement>('.roster-card[aria-current="true"] img');
    if (!image) throw new Error("Expected the featured roster image.");

    expect(image.getAttribute("src")).toMatch(/-160\.webp$/);
    expect(image.getAttribute("srcset")).toMatch(/-160\.webp 160w/);
    expect(image.getAttribute("srcset")).toMatch(/-640\.webp 640w/);
    expect(image.getAttribute("sizes")).toContain("84vw");
  });

  it("exposes one live result count", () => {
    const { container } = render(<ControlledPicker />);

    const visibleCount = container.querySelector(".roster-meta [role='status']");
    const descriptiveCount = container.querySelector("#left-rendered-roster-count");
    expect(visibleCount).toBeTruthy();
    expect(descriptiveCount?.hasAttribute("role")).toBe(false);
    expect(descriptiveCount?.hasAttribute("aria-live")).toBe(false);
  });

  it("pins the selected fighter above results when it is outside the active filters", async () => {
    const captainAmerica = rosterCharacter("Captain America");
    const { container } = render(<ControlledPicker initialSelection={captainAmerica.defaultSelection} />);
    const picker = within(container as HTMLElement);
    const search = picker.getByRole("searchbox", {
      name: "Search characters"
    });

    fireEvent.input(search, { target: { value: "Wonder Girl" } });
    await waitFor(() => {
      expect(container.querySelector(".roster-meta [role='status']")?.textContent).toContain("1 of 20 fighters");
    });

    const cards = [...container.querySelectorAll<HTMLButtonElement>(".roster-card")];
    expect(cards).toHaveLength(2);
    expect(cards[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(cards[0]?.getAttribute("aria-label")).toMatch(/^Captain America,/);
    expect(cards[1]?.getAttribute("aria-label")).toMatch(/^Wonder Girl,/);
  });

  it("passes only the currently filtered candidates to Random", async () => {
    const onRandom = vi.fn<(candidates: readonly RosterCharacter[]) => void>();
    const { container } = render(<ControlledPicker onRandom={onRandom} />);
    const picker = within(container as HTMLElement);

    fireEvent.input(picker.getByRole("searchbox", { name: "Search characters" }), { target: { value: "Wonder Girl" } });
    await waitFor(() => {
      expect(container.querySelector(".roster-meta [role='status']")?.textContent).toContain("1 of 20 fighters");
    });
    fireEvent.click(picker.getByRole("button", { name: "Random" }));

    expect(onRandom).toHaveBeenCalledTimes(1);
    const candidates = onRandom.mock.calls[0]?.[0];
    expect(candidates?.map((candidate) => candidate.name)).toEqual(["Wonder Girl"]);
  });

  it("disables Random when the only filtered candidate is already selected", async () => {
    const captainAmerica = rosterCharacter("Captain America");
    const { container } = render(<ControlledPicker initialSelection={captainAmerica.defaultSelection} />);
    const picker = within(container as HTMLElement);

    fireEvent.input(picker.getByRole("searchbox", { name: "Search characters" }), {
      target: { value: "Captain America" }
    });

    await waitFor(() => {
      expect((picker.getByRole("button", { name: "Random" }) as HTMLButtonElement).disabled).toBe(true);
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
    fireEvent.input(picker.getByRole("searchbox", { name: "Search characters" }), {
      target: { value: "Captain America" }
    });
    await waitFor(() => expect(list.scrollTop).toBe(0));
  });

  it("does not reset an alternate form when the selected roster card is clicked again", async () => {
    const { container } = render(<ControlledPicker />);
    const picker = within(container as HTMLElement);

    fireEvent.click(picker.getByRole("button", { name: /^Captain America,/ }));
    const form = (await picker.findByRole("combobox", {
      name: "Combat form for Captain America"
    })) as HTMLSelectElement;
    form.focus();
    fireEvent.change(form, {
      target: { value: "post-alchemax-enhancement" }
    });
    await waitFor(() => {
      expect(
        (
          picker.getByRole("combobox", {
            name: "Combat form for Captain America"
          }) as HTMLSelectElement
        ).value
      ).toBe("post-alchemax-enhancement");
    });
    expect(document.activeElement).toBe(form);

    const selectedCard = container.querySelector<HTMLButtonElement>('.roster-card[aria-pressed="true"]');
    if (!selectedCard) throw new Error("Expected Captain America to remain selected.");
    fireEvent.click(selectedCard);

    expect(
      (
        picker.getByRole("combobox", {
          name: "Combat form for Captain America"
        }) as HTMLSelectElement
      ).value
    ).toBe("post-alchemax-enhancement");
  });
});
