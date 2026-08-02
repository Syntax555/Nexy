import { describe, expect, it } from "vitest";

import { profileCoverage } from "../../src/app/profile-coverage.js";
import { nexyData } from "../../src/data/nexy.js";
import { rankedStatNames } from "../../src/domain/index.js";
import { createGameContext, getCharacterProfile } from "../../src/engine/index.js";

describe("profileCoverage", () => {
  it("reports resolved ranked fields without treating missing optional speeds as zero", () => {
    const context = createGameContext(nexyData);
    const character = context.characters[0];
    const form = character?.keys[0];
    if (!character?.entry_id || !form) throw new Error("Expected a playable fixture character.");

    const coverage = profileCoverage(
      getCharacterProfile(context, { characterId: character.entry_id, formId: form.key })
    );

    expect(coverage.total).toBe(rankedStatNames.length);
    expect(coverage.authored + coverage.missing.length).toBe(coverage.total);
    expect(coverage.missing).toContain("Attack Speed");
  });
});
