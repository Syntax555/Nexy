import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";

import { buildRoster, type RosterCharacter } from "../../src/app/roster.js";
import { FighterPicker } from "../../src/components/FighterPicker.js";
import { nexyData } from "../../src/data/nexy.js";
import { createGameContext } from "../../src/engine/index.js";

function largeRoster(size: number): readonly RosterCharacter[] {
  const source = buildRoster(createGameContext(nexyData))[0];
  if (!source) throw new Error("The test fixture requires one roster character.");

  return Array.from({ length: size }, (_, index) => {
    const number = String(index + 1).padStart(3, "0");
    const id = `scale-fighter-${number}`;
    return {
      ...source,
      id,
      name: `Scale Fighter ${number}`,
      identity: `Identity ${number}`,
      defaultSelection: {
        ...source.defaultSelection,
        characterId: id
      },
      searchText: `Scale Fighter ${number} Identity ${number}`
    };
  });
}

function Picker({
  roster,
  selectedId
}: {
  readonly roster: readonly RosterCharacter[];
  readonly selectedId?: string;
}) {
  const selection = selectedId
    ? roster.find((item) => item.id === selectedId)?.defaultSelection ?? null
    : null;
  return (
    <FighterPicker
      side="left"
      roster={roster}
      selection={selection}
      profile={selection
        ? roster.find((item) => item.id === selectedId)?.defaultProfile ?? null
        : null}
      onSelect={() => undefined}
      onClear={() => undefined}
      onRandom={() => undefined}
      onOpenImage={() => undefined}
    />
  );
}

describe("large roster rendering", () => {
  afterEach(cleanup);

  it("renders roster pages progressively and resets the page after sorting", async () => {
    const roster = largeRoster(125);
    const { container } = render(<Picker roster={roster} />);
    const cards = () => container.querySelectorAll(".roster-card");

    expect(cards()).toHaveLength(60);
    fireEvent.click(screen.getByRole("button", { name: "Show next 60 fighters" }));
    expect(cards()).toHaveLength(120);
    fireEvent.click(screen.getByRole("button", { name: "Show next 5 fighters" }));
    expect(cards()).toHaveLength(125);

    fireEvent.change(screen.getByLabelText("Order"), {
      target: { value: "name-desc" }
    });
    await waitFor(() => expect(cards()).toHaveLength(60));
    expect(
      container.querySelector<HTMLButtonElement>(".roster-card")?.getAttribute("aria-label")
    ).toMatch(/^Scale Fighter 125,/);
  });

  it("keeps a matching selected fighter represented beyond the first page", () => {
    const roster = largeRoster(125);
    const selected = roster[124];
    if (!selected) throw new Error("Expected the last generated fighter.");
    const { container } = render(<Picker roster={roster} selectedId={selected.id} />);

    expect(container.querySelectorAll(".roster-card")).toHaveLength(60);
    const selectedCard = container.querySelector<HTMLButtonElement>(
      '.roster-card[aria-pressed="true"]'
    );
    expect(selectedCard?.getAttribute("aria-label")).toMatch(/^Scale Fighter 125,/);
    expect(container.querySelector(".roster-card")).toBe(selectedCard);
  });
});
