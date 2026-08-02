import { describe, expect, it } from "vitest";
import type { CharacterEntry, CharacterForm, NexyData, RankedStat } from "../../src/domain/index.js";
import { createGameContext, getCharacterProfile, simulateBattle } from "../../src/engine/index.js";
import generatedData from "../../src/generated/nexy-data.json";

const data = generatedData as unknown as NexyData;
const context = createGameContext(data);

function rankedStat(value: string, note: string): RankedStat {
  return { value, modifier: "normal", note };
}

function notedCharacter(id: string, name: string, statOverrides: Partial<CharacterForm>): CharacterEntry {
  const template = context.characters.find((character) => character.name === "Dagger");
  const templateForm = template?.keys[0];
  if (!template || !templateForm) {
    throw new Error("Dagger test template is unavailable");
  }

  return {
    ...structuredClone(template),
    entry_id: id,
    name,
    keys: [
      {
        ...structuredClone(templateForm),
        ...statOverrides,
        key: id,
        names: [name],
        power_refs: [],
        resistance_refs: [],
        standard_equipment_ids: [],
        standard_equipment_refs: [],
        optional_equipment_ids: [],
        optional_equipment_refs: [],
        attack_ids: []
      }
    ]
  };
}

describe("authored ranked-stat notes", () => {
  it("keeps notes in profile stats, including the aggregated speed row", () => {
    const character = notedCharacter("noted-profile", "Noted Profile", {
      attack_potency: rankedStat("athlete", "Only at close range"),
      combat_speed: rankedStat("hypersonic", "Short bursts"),
      attack_speed: rankedStat("hypersonic", "Light daggers only")
    });
    const testContext = createGameContext({
      ...data,
      characters: [...context.characters, character]
    });
    const profile = getCharacterProfile(testContext, {
      characterId: "noted-profile"
    });

    expect(profile.stats.find((stat) => stat.id === "tier")?.note).toBeUndefined();
    expect(profile.stats.find((stat) => stat.id === "attack_potency")?.note).toBe("Only at close range");
    expect(profile.stats.find((stat) => stat.id === "speed")?.note).toBe(
      "Combat Speed: Short bursts / Attack Speed: Light daggers only"
    );
    expect(profile.stats.find((stat) => stat.id === "speed")?.value).toBe(
      "Combat Speed: Hypersonic / Attack Speed: Hypersonic"
    );
    expect(profile.stats.find((stat) => stat.id === "speed")?.value).not.toContain("Short bursts");
    expect(profile.stats.find((stat) => stat.id === "speed")?.value).not.toContain("Light daggers only");
  });

  it("keeps both combatants' notes on paired speed comparisons", () => {
    const left = notedCharacter("noted-left", "Noted Left", {
      attack_potency: rankedStat("athlete", "Left attack condition"),
      combat_speed: rankedStat("hypersonic", "Left combat condition"),
      attack_speed: rankedStat("hypersonic", "Left projectile condition")
    });
    const right = notedCharacter("noted-right", "Noted Right", {
      attack_potency: rankedStat("athlete", "Right attack condition"),
      combat_speed: rankedStat("hypersonic", "Right combat condition"),
      attack_speed: rankedStat("hypersonic", "Right projectile condition")
    });
    const testContext = createGameContext({
      ...data,
      characters: [...context.characters, left, right]
    });
    const report = simulateBattle(testContext, { characterId: "noted-left" }, { characterId: "noted-right" });
    const attackPotency = report.comparisons.find((comparison) => comparison.id === "attack_potency");
    const combatSpeed = report.comparisons.find((comparison) => comparison.id === "combat_speed");
    const attackSpeed = report.comparisons.find((comparison) => comparison.id === "attack_speed");

    expect(attackPotency?.left?.note).toBe("Left attack condition");
    expect(attackPotency?.right?.note).toBe("Right attack condition");
    expect(combatSpeed?.left?.note).toBe("Left combat condition");
    expect(combatSpeed?.right?.note).toBe("Right combat condition");
    expect(attackSpeed?.left?.note).toBe("Left projectile condition");
    expect(attackSpeed?.right?.note).toBe("Right projectile condition");
    expect(attackSpeed?.left?.value).not.toContain("Left projectile condition");
    expect(attackSpeed?.right?.value).not.toContain("Right projectile condition");
  });

  it("does not overwrite a combat-speed note with an unpaired speed summary", () => {
    const left = notedCharacter("noted-unpaired-left", "Noted Unpaired Left", {
      combat_speed: rankedStat("hypersonic", "Combat bursts"),
      travel_speed: rankedStat("hypersonic", "Long-distance only")
    });
    const right = notedCharacter("noted-unpaired-right", "Noted Unpaired Right", {
      combat_speed: rankedStat("hypersonic", "Steady combat pace"),
      travel_speed: null
    });
    const testContext = createGameContext({
      ...data,
      characters: [...context.characters, left, right]
    });
    const report = simulateBattle(
      testContext,
      { characterId: "noted-unpaired-left" },
      { characterId: "noted-unpaired-right" }
    );
    const combatSpeed = report.comparisons.find((comparison) => comparison.id === "combat_speed");

    expect(combatSpeed?.left?.note).toBe(
      "Combat bursts · Shown only here: Travel Speed - Hypersonic (Long-distance only)"
    );
    expect(combatSpeed?.right?.note).toBe("Steady combat pace");
    expect(report.comparisons.some((comparison) => comparison.id === "travel_speed")).toBe(false);
    expect(report.score.rows.some((row) => row.id === "travel_speed")).toBe(false);
    expect(report.score.leftScore).toBe(report.score.rightScore);
    expect(report.score.pointWinner).toBe("tie");
  });

  it("scores an optional speed category only when both fighters author it", () => {
    const left = notedCharacter("paired-speed-left", "Paired Speed Left", {
      combat_speed: rankedStat("hypersonic", "Equal combat pace"),
      travel_speed: rankedStat("hypersonic", "Faster travel")
    });
    const right = notedCharacter("paired-speed-right", "Paired Speed Right", {
      combat_speed: rankedStat("hypersonic", "Equal combat pace"),
      travel_speed: rankedStat("supersonic", "Slower travel")
    });
    const testContext = createGameContext({
      ...data,
      characters: [...context.characters, left, right]
    });
    const report = simulateBattle(
      testContext,
      { characterId: "paired-speed-left" },
      { characterId: "paired-speed-right" }
    );
    const travelSpeed = report.comparisons.find((comparison) => comparison.id === "travel_speed");
    const travelScore = report.score.rows.find((row) => row.id === "travel_speed");

    expect(travelSpeed?.includedInScore).toBe(true);
    expect(travelSpeed?.winner).toBe("left");
    expect(travelScore?.winner).toBe("left");
    expect(travelScore?.leftRank).toBeGreaterThan(travelScore?.rightRank ?? 0);
    expect(report.score.leftScore - report.score.rightScore).toBe(
      (travelScore?.leftRank ?? 0) - (travelScore?.rightRank ?? 0)
    );
  });
});
