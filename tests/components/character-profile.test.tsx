import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildRoster } from "../../src/app/roster.js";
import { CharacterProfile } from "../../src/components/CharacterProfile.js";
import { nexyData } from "../../src/data/nexy.js";
import { createGameContext } from "../../src/engine/index.js";

afterEach(() => {
  cleanup();
});

describe("CharacterProfile", () => {
  it("renders authored stat notes as visible text without a large live region", () => {
    const rosterCharacter = buildRoster(createGameContext(nexyData))[0];
    const firstStat = rosterCharacter?.defaultProfile.stats[0];
    if (!rosterCharacter || !firstStat) {
      throw new Error("The component test requires a roster character with statistics.");
    }

    const note = "Only while the character is fully powered.";
    const profile = {
      ...rosterCharacter.defaultProfile,
      stats: rosterCharacter.defaultProfile.stats.map((stat) =>
        stat.id === firstStat.id ? { ...stat, note } : stat
      )
    };
    const { container } = render(
      <CharacterProfile
        side="left"
        rosterCharacter={rosterCharacter}
        profile={profile}
        onFormChange={vi.fn()}
        onOpenImage={vi.fn()}
      />
    );

    expect(screen.getByText(note).classList.contains("profile-stat__note")).toBe(true);
    expect(container.querySelector(".fighter-profile[aria-live]")).toBeNull();
  });
});
