import { describe, expect, it } from "vitest";

import { matchupVersionWarning, readMatchupUrl, writeMatchupUrl } from "../../src/app/url-state.js";

describe("matchup URL state", () => {
  it("round-trips complete battle state", () => {
    const state = {
      left: { characterId: "agent-venom", formId: "base" },
      right: { characterId: "ms-marvel", formId: "destined-one" },
      showBattle: true,
      rulesetVersion: "1",
      contentRevision: "abc123"
    };

    expect(readMatchupUrl(writeMatchupUrl(state))).toEqual(state);
  });

  it("ignores malformed selections and impossible battle state", () => {
    expect(readMatchupUrl("?left=broken&battle=1")).toEqual({
      left: null,
      right: null,
      showBattle: true,
      rulesetVersion: null,
      contentRevision: null
    });
    expect(writeMatchupUrl({ left: null, right: null, showBattle: true })).toBe("");
  });

  it("warns about legacy and incompatible shared revisions", () => {
    const current = {
      rulesetVersion: "1",
      contentRevision: "current123"
    };
    expect(
      matchupVersionWarning(
        {
          left: { characterId: "agent-venom", formId: "base" },
          right: null,
          showBattle: false
        },
        current
      )
    ).toContain("legacy matchup link");
    expect(
      matchupVersionWarning(
        {
          left: { characterId: "agent-venom", formId: "base" },
          right: null,
          showBattle: false,
          rulesetVersion: "2",
          contentRevision: "older123"
        },
        current
      )
    ).toContain("ruleset 2");
    expect(
      matchupVersionWarning(
        {
          left: { characterId: "agent-venom", formId: "base" },
          right: null,
          showBattle: false,
          rulesetVersion: "1"
        },
        current
      )
    ).toContain("no content revision");
    expect(
      matchupVersionWarning(
        {
          left: { characterId: "agent-venom", formId: "base" },
          right: null,
          showBattle: false,
          rulesetVersion: "1",
          contentRevision: "current123"
        },
        current
      )
    ).toBeNull();
  });
});
