import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import generatedData from "../../src/generated/nexy-data.json";
import type {
  BattleReport,
  CharacterEntry,
  CharacterProfile,
  NexyData,
  PowerRef,
  PowerTargetRef,
  ResistanceRef
} from "../../src/domain/index.js";
import {
  powerTargetRefLabel,
  powerTargetRefMatches
} from "../../src/engine/capabilities.js";
import {
  createGameContext,
  getCharacterProfile,
  simulateBattle
} from "../../src/engine/index.js";
import legacyFixtureJson from "../fixtures/legacy-parity.json";

interface LegacyMatchupExpectation {
  readonly winner: "left" | "right" | "tie";
  readonly leftScore: number;
  readonly rightScore: number;
  readonly interaction: string | null;
  readonly tieBreaker: string | null;
  readonly digest: string;
}

interface LegacyParityFixture {
  readonly schemaVersion: number;
  readonly ruleset: string;
  readonly provenance: {
    readonly sourceCommit: string;
    readonly capturedFrom: string;
    readonly generationNote: string;
  };
  readonly formCount: number;
  readonly matchupCount: number;
  readonly forms: Readonly<Record<string, string>>;
  readonly matchups: Readonly<Record<string, LegacyMatchupExpectation>>;
}

const data = generatedData as unknown as NexyData;
const legacyFixture = legacyFixtureJson as LegacyParityFixture;
const context = createGameContext(data);

const scopedPowerTarget = {
  id: "flight",
  source_variant: "gliding",
  magic_level_id: "master-sorcerers"
} satisfies PowerTargetRef;

const provenanceOnlyFields = new Set([
  "source_ids",
  "source_url",
  "rights_status",
  "creator",
  "rights_holder",
  "license",
  "reviewed_on"
]);

function selectionFromId(id: string) {
  const [characterId, formId, ...unexpected] = id.split("~");
  if (!characterId || !formId || unexpected.length > 0) {
    throw new Error(`Invalid legacy form id: ${id}`);
  }
  return { characterId, formId };
}

function semanticCanonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => semanticCanonicalize(item));
  }
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.keys(value)
      .filter((key) =>
        !provenanceOnlyFields.has(key)
        && Reflect.get(value, key) !== undefined
      )
      .sort()
      .map((key) => [
        key,
        semanticCanonicalize(Reflect.get(value, key))
      ])
  );
}

function profileSnapshot(profile: CharacterProfile) {
  return {
    effectiveKey: profile.effectiveKey,
    powerRefs: profile.powerRefs,
    resistanceRefs: profile.resistanceRefs,
    itemEffects: profile.itemEffects,
    effects: profile.effects,
    opponentStatSwap: profile.opponentStatSwap
  };
}

function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(semanticCanonicalize(value)))
    .digest("hex");
}

function semanticProfileDigest(profile: CharacterProfile): string {
  return digest(profileSnapshot(profile));
}

function legacyComparedStat(
  stat: BattleReport["comparisons"][number]["left"],
  includeLegacyDisplayFields: boolean
) {
  return stat
    ? {
        label: stat.label,
        value: stat.value,
        rank: stat.rank,
        ...(includeLegacyDisplayFields ? { html: "", wide: false } : {}),
        ...(stat.note ? { note: stat.note } : {})
      }
    : stat;
}

function matchupDigest(report: BattleReport): string {
  const speedIds = new Set([
    "attack_speed",
    "combat_speed",
    "reaction_speed",
    "travel_speed",
    "flight_speed"
  ]);
  const statPairs = report.comparisons.map((comparison) => {
    const includeLegacyDisplayFields = !speedIds.has(comparison.id);
    return {
      label: comparison.label,
      left: legacyComparedStat(comparison.left, includeLegacyDisplayFields),
      right: legacyComparedStat(comparison.right, includeLegacyDisplayFields),
      leftClass: comparison.leftClass,
      rightClass: comparison.rightClass
    };
  });
  const tieBreaker = report.score.tieBreaker;
  const score = {
    rows: report.score.rows.map((row) => ({
      label: row.label,
      leftValue: row.leftValue,
      rightValue: row.rightValue,
      leftRank: row.leftRank,
      rightRank: row.rightRank,
      rankGap: row.rankGap,
      winner: row.winner
    })),
    leftScore: report.score.leftScore,
    rightScore: report.score.rightScore,
    scoreGap: report.score.scoreGap,
    statCount: report.score.statCount,
    winner: report.score.winner,
    tieBreaker: report.score.interaction || report.score.pointWinner !== "tie"
      ? null
      : tieBreaker
        ? {
            label: tieBreaker.label,
            leftValue: tieBreaker.leftValue,
            rightValue: tieBreaker.rightValue,
            leftRank: tieBreaker.leftRank,
            rightRank: tieBreaker.rightRank,
            rankGap: tieBreaker.rankGap,
            winner: tieBreaker.winner
          }
        : undefined,
    interaction: report.score.interaction
  };

  return digest({
    left: profileSnapshot(report.left),
    right: profileSnapshot(report.right),
    statPairs,
    score
  });
}

function isolatedCharacter(
  id: string,
  name: string,
  powers: readonly PowerRef[] = [],
  resistances: readonly ResistanceRef[] = []
): CharacterEntry {
  const template = context.characters.find((character) => character.name === "Dagger");
  const templateForm = template?.keys[0];
  if (!template || !templateForm) throw new Error("Dagger test template is unavailable");
  const character = structuredClone(template);
  const form = structuredClone(templateForm);

  return {
    ...character,
    entry_id: id,
    name,
    keys: [{
      ...form,
      key: id,
      names: [name],
      power_refs: powers,
      resistance_refs: resistances,
      standard_equipment_ids: [],
      standard_equipment_refs: [],
      optional_equipment_ids: [],
      optional_equipment_refs: [],
      attack_ids: []
    }]
  };
}

function withIdentity(
  character: CharacterEntry,
  identity: string
): CharacterEntry {
  const form = character.keys[0];
  if (!form) throw new Error(`Test character ${character.entry_id} has no form`);
  return {
    ...character,
    keys: [{
      ...form,
      names: [identity]
    }]
  };
}

describe("ruleset-v1 parity", () => {
  it("keeps the immutable legacy snapshot tied to its source revision", () => {
    expect(legacyFixture.provenance.sourceCommit).toBe(
      "66e22416331bbeced0554e85112f6992eeff41ab"
    );
    expect(legacyFixture.provenance.generationNote).toContain("Never regenerate");
  });

  it("resolves all 21 legacy forms deterministically", () => {
    expect(Object.keys(legacyFixture.forms)).toHaveLength(legacyFixture.formCount);
    expect(legacyFixture.formCount).toBe(21);

    for (const [formId, legacyDigest] of Object.entries(legacyFixture.forms)) {
      const selection = selectionFromId(formId);
      const first = getCharacterProfile(context, selection);
      const second = getCharacterProfile(context, selection);

      expect(first.selection).toEqual(selection);
      expect(first.character.entry_id).toBe(selection.characterId);
      expect(first.key.key).toBe(selection.formId);
      expect(first.stats.every((stat) => Number.isFinite(stat.rank))).toBe(true);
      expect(semanticProfileDigest(first)).toBe(semanticProfileDigest(second));
      expect(semanticProfileDigest(first), formId).toBe(legacyDigest);
    }
  });

  it("preserves all 441 ordered legacy matchup outcomes", () => {
    expect(Object.keys(legacyFixture.matchups)).toHaveLength(legacyFixture.matchupCount);
    expect(legacyFixture.matchupCount).toBe(441);
    const inputBefore = JSON.stringify(data);

    for (const [matchupId, expected] of Object.entries(legacyFixture.matchups)) {
      const [leftId, rightId, ...unexpected] = matchupId.split("::");
      if (!leftId || !rightId || unexpected.length > 0) {
        throw new Error(`Invalid legacy matchup id: ${matchupId}`);
      }
      const report = simulateBattle(
        context,
        selectionFromId(leftId),
        selectionFromId(rightId)
      );

      expect({
        winner: report.score.winner,
        leftScore: report.score.leftScore,
        rightScore: report.score.rightScore,
        interaction: report.score.interaction?.summary ?? null,
        tieBreaker: report.score.tieBreaker?.label ?? null
      }, matchupId).toEqual({
        winner: expected.winner,
        leftScore: expected.leftScore,
        rightScore: expected.rightScore,
        interaction: expected.interaction,
        tieBreaker: expected.tieBreaker
      });
      expect(matchupDigest(report), matchupId).toBe(expected.digest);
    }

    expect(JSON.stringify(data)).toBe(inputBefore);
  });
});

describe("contextual combatant names", () => {
  it("distinguishes same-name legacy characters in verdicts", () => {
    const report = simulateBattle(
      context,
      {
        characterId: "falcon-marvel-mainstream",
        formId: "falcon"
      },
      {
        characterId: "falcon-sam-wilson-marvel-mainstream",
        formId: "falcon"
      }
    );

    expect(report.verdict.headline).toBe("Falcon (Sam Wilson) wins");
    expect(report.verdict.summary).toBe(
      "Falcon (Sam Wilson) wins - +417 pts"
    );
  });

  it("distinguishes same-name characters in interaction prose", () => {
    const alpha = withIdentity(
      isolatedCharacter("test-echo-alpha", "Echo"),
      "Alpha"
    );
    const beta = withIdentity(
      isolatedCharacter("test-echo-beta", "Echo", [{
        id: "intangibility",
        type_ids: ["elemental-intangibility-type-3-liquids"]
      }]),
      "Beta"
    );
    const testContext = createGameContext({
      ...data,
      characters: [...context.characters, alpha, beta]
    });
    const report = simulateBattle(
      testContext,
      { characterId: "test-echo-alpha" },
      { characterId: "test-echo-beta" }
    );

    expect(report.score.interaction?.summary).toBe(
      "Echo (Alpha) cannot affect Echo (Beta)"
    );
    expect(report.verdict.headline).toBe("Echo (Beta) wins");
    expect(report.verdict.summary).toBe(
      "Echo (Beta) wins - Automatic win"
    );
  });

  it("preserves names byte-for-byte when character names do not collide", () => {
    const report = simulateBattle(
      context,
      {
        characterId: "agent-venom-marvel-mainstream",
        formId: "agent-venom"
      },
      {
        characterId: "ms-marvel-marvel-mainstream",
        formId: "ms-marvel"
      }
    );

    expect(report.score.interaction?.summary).toBe(
      "Agent Venom cannot affect Ms. Marvel"
    );
    expect(report.verdict.headline).toBe("Ms. Marvel wins");
    expect(report.verdict.summary).toBe(
      "Ms. Marvel wins - Automatic win"
    );
  });

  it("preserves legacy prose when both sides are the same identity", () => {
    const report = simulateBattle(
      context,
      {
        characterId: "ms-marvel-marvel-mainstream",
        formId: "ms-marvel"
      },
      {
        characterId: "ms-marvel-marvel-mainstream",
        formId: "ms-marvel"
      }
    );

    expect(report.score.interaction).toEqual({
      winner: "tie",
      summary: "Neither combatant can affect the other",
      detail:
        "Ms. Marvel is blocked by Intangibility: Elemental Type 3 (Liquids); " +
        "Ms. Marvel is blocked by Intangibility: Elemental Type 3 (Liquids)"
    });
    expect(report.verdict.headline).toBe("Draw");
    expect(report.verdict.summary).toBe("Draw - Stalemate");
  });
});

describe("power target references", () => {
  it("matches only the requested variant, magic level, and covered types", () => {
    expect(powerTargetRefMatches(
      context,
      {
        id: "flight",
        source_variant: "gliding",
        magic_level_id: "sorcerer-supreme-level"
      },
      scopedPowerTarget
    )).toBe(true);
    expect(powerTargetRefMatches(
      context,
      {
        id: "flight",
        magic_level_id: "sorcerer-supreme-level"
      },
      scopedPowerTarget
    )).toBe(false);
    expect(powerTargetRefMatches(
      context,
      {
        id: "flight",
        source_variant: "gliding",
        magic_level_id: "basic-level-magic-users"
      },
      scopedPowerTarget
    )).toBe(false);

    const typedTarget = {
      id: "intangibility",
      type_ids: ["elemental-intangibility-type-3-liquids"]
    } satisfies PowerTargetRef;
    expect(powerTargetRefMatches(
      context,
      {
        id: "intangibility",
        type_ids: ["intangibility-all"]
      },
      typedTarget
    )).toBe(true);
    expect(powerTargetRefMatches(
      context,
      {
        id: "intangibility",
        type_ids: ["elemental-intangibility-type-1-solids"]
      },
      typedTarget
    )).toBe(false);
  });

  it("makes variant and magic-level targeting explicit in labels", () => {
    expect(powerTargetRefLabel(context, scopedPowerTarget)).toBe(
      "Flight (Variant: Gliding; Magic level: Master Sorcerers)"
    );
  });
});

describe("counter fixed-point regressions", () => {
  it("suppresses both capabilities in a reciprocal nullification cycle", () => {
    const fire = isolatedCharacter("test-fire", "Fire", [{
      id: "fire-manipulation",
      effects: [{
        power_nullification: {
          target_power_ids: ["ice-manipulation"]
        }
      }]
    }]);
    const ice = isolatedCharacter("test-ice", "Ice", [{
      id: "ice-manipulation",
      effects: [{
        power_nullification: {
          target_power_ids: ["fire-manipulation"]
        }
      }]
    }]);
    const testContext = createGameContext({
      ...data,
      characters: [...context.characters, fire, ice]
    });
    const report = simulateBattle(
      testContext,
      { characterId: "test-fire" },
      { characterId: "test-ice" }
    );

    expect(report.left.powerRefs.some((ref) => ref.id === "fire-manipulation")).toBe(false);
    expect(report.right.powerRefs.some((ref) => ref.id === "ice-manipulation")).toBe(false);
    expect(report.resolution).toEqual({
      mode: "cycle-suppressed",
      rounds: 2
    });
  });

  it("reevaluates a resistance granted by a power that is later removed", () => {
    const attacker = isolatedCharacter("test-attacker", "Attacker", [
      {
        id: "mind-manipulation",
        effects: [{
          stat_effects: {
            attack_potency: {
              value: "multi-city-block",
              modifier: "normal"
            }
          }
        }]
      },
      {
        id: "power-nullification",
        effects: [{
          power_nullification: {
            target_power_ids: ["forcefield-creation"]
          }
        }]
      }
    ]);
    const defender = isolatedCharacter("test-defender", "Defender", [{
      id: "forcefield-creation",
      effects: [{
        grants: {
          resistance_refs: [{
            id: "mind-manipulation-resistance"
          }]
        }
      }]
    }]);
    const testContext = createGameContext({
      ...data,
      characters: [...context.characters, attacker, defender]
    });
    const report = simulateBattle(
      testContext,
      { characterId: "test-attacker" },
      { characterId: "test-defender" }
    );

    expect(
      report.right.powerRefs.some((ref) => ref.id === "forcefield-creation")
    ).toBe(false);
    expect(
      report.right.resistanceRefs.some(
        (ref) => ref.id === "mind-manipulation-resistance"
      )
    ).toBe(false);
    expect(
      report.left.powerRefs.some((ref) => ref.id === "mind-manipulation")
    ).toBe(true);
    expect(report.left.effectiveKey.attack_potency).toEqual({
      value: "multi-city-block",
      modifier: "normal"
    });
    expect(report.resolution).toEqual({
      mode: "stable",
      rounds: 3
    });
  });

  it("reactivates a resistance when its negator is itself nullified", () => {
    const attacker = isolatedCharacter("test-negator", "Negator", [
      {
        id: "mind-manipulation"
      },
      {
        id: "resistance-negation",
        effects: [{
          resistance_negation: {
            target_resistance_ids: ["mind-manipulation-resistance"]
          }
        }]
      }
    ]);
    const defender = isolatedCharacter(
      "test-counter-nullifier",
      "Counter Nullifier",
      [{
        id: "power-nullification",
        effects: [{
          power_nullification: {
            target_power_ids: ["resistance-negation"]
          }
        }]
      }],
      [{
        id: "mind-manipulation-resistance"
      }]
    );
    const testContext = createGameContext({
      ...data,
      characters: [...context.characters, attacker, defender]
    });
    const report = simulateBattle(
      testContext,
      { characterId: "test-negator" },
      { characterId: "test-counter-nullifier" }
    );
    const attackerPowers = report.left.sections
      .find((section) => section.id === "powers")?.items;
    const defenderResistances = report.right.sections
      .find((section) => section.id === "resistances")?.items;

    expect(
      report.left.powerRefs.some((ref) => ref.id === "resistance-negation")
    ).toBe(false);
    expect(
      report.left.powerRefs.some((ref) => ref.id === "mind-manipulation")
    ).toBe(false);
    expect(
      report.right.resistanceRefs.some(
        (ref) => ref.id === "mind-manipulation-resistance"
      )
    ).toBe(true);
    expect(
      attackerPowers?.find((item) => item.id === "resistance-negation")?.status?.code
    ).toBe("nullified");
    expect(
      attackerPowers?.find((item) => item.id === "mind-manipulation")?.status?.code
    ).toBe("resisted");
    expect(
      defenderResistances
        ?.find((item) => item.id === "mind-manipulation-resistance")
        ?.status?.code
    ).toBe("active");
    expect(report.resolution).toEqual({
      mode: "stable",
      rounds: 3
    });
  });
});
