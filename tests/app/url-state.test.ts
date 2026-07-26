import { describe, expect, it } from "vitest";

import { readMatchupUrl, writeMatchupUrl } from "../../src/app/url-state.js";

describe("matchup URL state", () => {
  it("round-trips complete battle state", () => {
    const state = {
      left: { characterId: "agent-venom", formId: "base" },
      right: { characterId: "ms-marvel", formId: "destined-one" },
      showBattle: true
    };

    expect(readMatchupUrl(writeMatchupUrl(state))).toEqual(state);
  });

  it("ignores malformed selections and impossible battle state", () => {
    expect(readMatchupUrl("?left=broken&battle=1")).toEqual({
      left: null,
      right: null,
      showBattle: true
    });
    expect(writeMatchupUrl({ left: null, right: null, showBattle: true })).toBe("");
  });
});
