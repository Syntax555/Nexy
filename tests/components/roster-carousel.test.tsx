import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildRoster, type RosterCharacter } from "../../src/app/roster.js";
import { RosterCarousel, type RosterView } from "../../src/components/RosterCarousel.js";
import { nexyData } from "../../src/data/nexy.js";
import type { BattleSelection } from "../../src/domain/index.js";
import { createGameContext } from "../../src/engine/index.js";

const roster = buildRoster(createGameContext(nexyData));

function renderRoster(
  items: readonly RosterCharacter[],
  rosterView: RosterView,
  onSelect = vi.fn<(selection: BattleSelection) => void>()
) {
  const result = render(
    <RosterCarousel
      side="left"
      accentName="Cyan corner"
      items={items}
      selection={null}
      rosterView={rosterView}
      shownRosterCount={items.length}
      visibleRosterCount={items.length}
      remainingRosterCount={0}
      nextPageSize={0}
      resetKey="initial"
      describedBy="roster-description"
      onSelect={onSelect}
      onResetFilters={() => undefined}
      onShowMore={() => undefined}
    />
  );
  return { ...result, onSelect };
}

function renderGrid(items: readonly RosterCharacter[], onSelect = vi.fn<(selection: BattleSelection) => void>()) {
  return renderRoster(items, "grid", onSelect);
}

function mockColumns(container: Element, columnCount: number): void {
  const entries = [...container.querySelectorAll<HTMLElement>(".roster-entry")];
  for (const [index, entry] of entries.entries()) {
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    vi.spyOn(entry, "getBoundingClientRect").mockReturnValue({
      x: column * 80,
      y: row * 100,
      top: row * 100,
      right: column * 80 + 72,
      bottom: row * 100 + 92,
      left: column * 80,
      width: 72,
      height: 92,
      toJSON: () => ({})
    });
  }
}

function tabStop(cards: readonly HTMLButtonElement[]): HTMLButtonElement | undefined {
  return cards.find((card) => card.tabIndex === 0);
}

describe("roster portrait grid", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("uses one tab stop and supports spatial arrow, Home, and End navigation", async () => {
    const items = roster.slice(0, 8);
    const { container } = renderGrid(items);
    const cards = [...container.querySelectorAll<HTMLButtonElement>(".roster-card")];
    mockColumns(container, 3);

    expect(cards.filter((card) => card.tabIndex === 0)).toHaveLength(1);
    expect(tabStop(cards)).toBe(cards[0]);
    expect(container.querySelector(".roster-list")?.getAttribute("aria-describedby")).toContain(
      "left-grid-instructions"
    );
    expect(container.querySelector("#left-grid-instructions")?.textContent).toContain("Arrow keys");

    cards[0]?.focus();
    fireEvent.keyDown(cards[0] as HTMLButtonElement, { key: "ArrowRight" });
    await waitFor(() => expect(document.activeElement).toBe(cards[1]));

    fireEvent.keyDown(cards[1] as HTMLButtonElement, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(cards[4]));

    fireEvent.keyDown(cards[4] as HTMLButtonElement, { key: "ArrowUp" });
    await waitFor(() => expect(document.activeElement).toBe(cards[1]));

    fireEvent.keyDown(cards[1] as HTMLButtonElement, { key: "ArrowLeft" });
    await waitFor(() => expect(document.activeElement).toBe(cards[0]));

    fireEvent.keyDown(cards[0] as HTMLButtonElement, { key: "End" });
    await waitFor(() => expect(document.activeElement).toBe(cards.at(-1)));

    fireEvent.keyDown(cards.at(-1) as HTMLButtonElement, { key: "Home" });
    await waitFor(() => {
      expect(document.activeElement).toBe(cards[0]);
      expect(tabStop(cards)).toBe(cards[0]);
      expect(cards.filter((card) => card.tabIndex === 0)).toHaveLength(1);
    });
  });

  it("keeps vertical movement in-column when the final row is incomplete", async () => {
    const items = roster.slice(0, 8);
    const { container } = renderGrid(items);
    const cards = [...container.querySelectorAll<HTMLButtonElement>(".roster-card")];
    mockColumns(container, 3);

    cards[4]?.focus();
    fireEvent.keyDown(cards[4] as HTMLButtonElement, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(cards[7]));

    cards[5]?.focus();
    fireEvent.keyDown(cards[5] as HTMLButtonElement, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(cards[5]));
    fireEvent.keyDown(cards[5] as HTMLButtonElement, { key: "ArrowRight" });
    await waitFor(() => expect(document.activeElement).toBe(cards[5]));
  });

  it("keeps movement inside the grid at either boundary", async () => {
    const items = roster.slice(0, 4);
    const { container } = renderGrid(items);
    const cards = [...container.querySelectorAll<HTMLButtonElement>(".roster-card")];
    mockColumns(container, 2);

    cards[0]?.focus();
    fireEvent.keyDown(cards[0] as HTMLButtonElement, { key: "ArrowLeft" });
    await waitFor(() => expect(document.activeElement).toBe(cards[0]));

    fireEvent.keyDown(cards[0] as HTMLButtonElement, { key: "End" });
    await waitFor(() => expect(document.activeElement).toBe(cards[3]));
    fireEvent.keyDown(cards[3] as HTMLButtonElement, { key: "ArrowDown" });
    await waitFor(() => {
      expect(document.activeElement).toBe(cards[3]);
      expect(tabStop(cards)).toBe(cards[3]);
    });
  });

  it("shows identities for fighters that share the same display name", () => {
    const falcons = roster.filter((item) => item.name === "Falcon");
    expect(falcons).toHaveLength(2);
    const { container } = renderGrid(falcons);
    const visibleIdentities = [...container.querySelectorAll<HTMLElement>(".roster-card__grid-identity")].map(
      (identity) => identity.textContent
    );

    expect(new Set(visibleIdentities)).toEqual(new Set(falcons.map((item) => item.identity)));
    expect(visibleIdentities.every(Boolean)).toBe(true);
    expect(container.querySelectorAll<HTMLButtonElement>('.roster-card[aria-label^="Falcon,"]')).toHaveLength(2);
  });

  it("disambiguates duplicate names in carousel controls and status", () => {
    const falcons = roster.filter((item) => item.name === "Falcon");
    expect(falcons).toHaveLength(2);
    const { container } = renderRoster(falcons, "carousel");

    expect(container.querySelector(".roster-carousel__status strong")?.textContent).toBe(
      `Falcon — ${falcons[0]?.identity}`
    );
    expect(
      container.querySelector<HTMLButtonElement>(".roster-carousel__arrow--previous")?.getAttribute("aria-label")
    ).toBe(`Previous fighter: Falcon — ${falcons[1]?.identity}`);
    expect(
      container.querySelector<HTMLButtonElement>(".roster-carousel__arrow--next")?.getAttribute("aria-label")
    ).toBe(`Next fighter: Falcon — ${falcons[1]?.identity}`);
  });

  it("selects the focused grid card through its native button action", () => {
    const items = roster.slice(0, 2);
    const { container, onSelect } = renderGrid(items);
    const secondCard = container.querySelectorAll<HTMLButtonElement>(".roster-card")[1];
    if (!secondCard || !items[1]) throw new Error("Expected a second roster card.");

    secondCard.focus();
    secondCard.click();

    expect(onSelect).toHaveBeenCalledWith(items[1].defaultSelection);
    expect(secondCard.type).toBe("button");
  });
});
