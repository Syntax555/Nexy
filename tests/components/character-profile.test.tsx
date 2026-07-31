import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
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
      stats: rosterCharacter.defaultProfile.stats.map((stat) => (stat.id === firstStat.id ? { ...stat, note } : stat))
    };
    const onOpenImage = vi.fn();
    const { container } = render(
      <CharacterProfile
        side="left"
        rosterCharacter={rosterCharacter}
        profile={profile}
        onFormChange={vi.fn()}
        onOpenImage={onOpenImage}
      />
    );

    expect(screen.getByText(note).classList.contains("profile-stat__note")).toBe(true);
    expect(container.querySelector(".fighter-profile[aria-live]")).toBeNull();
    expect(screen.getByText(`Media: ${rosterCharacter.media}`)).toBeTruthy();
    expect(screen.getByText(`Publisher: ${rosterCharacter.origin}`)).toBeTruthy();
    expect(screen.getByText(`Universe: ${rosterCharacter.verse}`)).toBeTruthy();

    const source = profile.sources[0];
    if (!source) {
      throw new Error("The component test requires a resolved profile source.");
    }
    const sourceDisclosure = container.querySelector(".profile-sources");
    const sourceLink = sourceDisclosure?.querySelector<HTMLAnchorElement>(`a[href="${source.url}"]`);
    expect(sourceLink?.textContent).toBe(source.name);
    expect(sourceDisclosure?.textContent).toContain(`License: ${source.license}`);
    expect(sourceDisclosure?.textContent).toContain(`Accessed ${source.accessed_on}`);
    expect(sourceDisclosure?.textContent).toContain(`Rights status: Unverified Third Party`);
    expect(sourceDisclosure?.textContent).toContain(`Rights holder record: ${profile.image?.rights_holder}`);

    const imageRecord = profile.image;
    if (!imageRecord) {
      throw new Error("The component test requires a resolved profile image.");
    }
    expect(imageRecord.rights_status).toBe("unverified-third-party");
    expect(imageRecord.publish_unverified).toBe(true);

    const image = screen.getByRole<HTMLImageElement>("img", {
      name: `${profile.character.name} \u2014 ${imageRecord.name}`
    });
    expect(image.getAttribute("src")).toBe("/images/generated/aaron-fischer-marvel-mainstream/original-640.webp");
    expect(container.querySelector(".profile-visual .image-fallback")).toBeNull();

    const artworkDisclosure = container.querySelector<HTMLAnchorElement>(".profile-artwork-disclosure");
    expect(artworkDisclosure?.dataset.rightsStatus).toBe("unverified-third-party");
    expect(artworkDisclosure?.getAttribute("href")).toBe(imageRecord.source_url);
    expect(artworkDisclosure?.textContent).toContain("Rights unverified \u00b7 no image licence claimed");

    const expandImage = screen.getByRole("button", {
      name: `View full image of ${profile.character.name}`
    });
    fireEvent.click(expandImage);
    expect(onOpenImage).toHaveBeenCalledWith({
      src: "/images/generated/aaron-fischer-marvel-mainstream/original-640.webp",
      alt: `${profile.character.name} \u2014 ${imageRecord.name}`,
      title: `${profile.character.name} \u2014 ${imageRecord.name}`,
      rightsRecord: imageRecord
    });
  });
});
