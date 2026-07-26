import { describe, expect, it } from "vitest";

import {
  createSearchIndex,
  normalizeSearchText,
  searchIndex
} from "../../src/search/search.js";

const fighters = [
  { id: "agent-venom", text: 'Agent Venom Eugene "Flash" Thompson Symbiote' },
  { id: "ms-marvel", text: "Ms. Marvel Kamala Khan Inhuman" },
  { id: "quicksilver", text: "Quicksilver Pietro Lensherr Speed" }
] as const;

describe("roster search", () => {
  const index = createSearchIndex(fighters, (fighter) => fighter.text);

  it("normalizes accents", () => {
    expect(normalizeSearchText("Joaquín Torres")).toBe("joaquin torres");
  });

  it("preserves letters and numbers from non-Latin writing systems", () => {
    const international = [
      { id: "cyrillic", text: "Жанна" },
      { id: "cjk", text: "孙悟空" },
      { id: "arabic", text: "ليلى ٢" }
    ];
    const internationalIndex = createSearchIndex(
      international,
      (fighter) => fighter.text
    );

    expect(searchIndex(internationalIndex, "Жанна")[0]?.id).toBe("cyrillic");
    expect(searchIndex(internationalIndex, "悟空")[0]?.id).toBe("cjk");
    expect(searchIndex(internationalIndex, "ليلى ٢")[0]?.id).toBe("arabic");
  });

  it("matches names, metadata, and small typos", () => {
    expect(searchIndex(index, "Kamala").map(({ id }) => id)).toEqual(["ms-marvel"]);
    expect(searchIndex(index, "agt venm").map(({ id }) => id)).toEqual(["agent-venom"]);
    expect(searchIndex(index, "speed").map(({ id }) => id)).toEqual(["quicksilver"]);
  });

  it("keeps source order for an empty query", () => {
    expect(searchIndex(index, "")).toEqual(fighters);
  });
});
