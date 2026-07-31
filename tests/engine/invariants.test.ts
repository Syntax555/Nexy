import { describe, expect, it } from "vitest";

import { nexyData } from "../../src/data/nexy.js";
import { CATALOG_NAMES } from "../../src/domain/catalogs.js";
import type {
  BattleSelection,
  CharacterProfile,
  PowerRef,
  ProfileCapability,
  ResistanceRef
} from "../../src/domain/index.js";
import { activeImage, powerRefKey, resistanceRefKey } from "../../src/engine/capabilities.js";
import { createGameContext, simulateBattle } from "../../src/engine/index.js";

const context = createGameContext(nexyData);
const selections: readonly BattleSelection[] = context.characters.flatMap((character) =>
  character.keys.map((form) => ({
    characterId: character.entry_id || character.id || "",
    formId: form.key
  }))
);

function assertStatusCauseIsResolved(profile: CharacterProfile, opponent: CharacterProfile, matchup: string): void {
  const items = profile.sections.flatMap((section) => section.items);
  for (const item of items) {
    const cause = item.status?.causedBy;
    if (!cause) continue;

    const causeIsResolved =
      cause.kind === "power"
        ? opponent.powerRefs.some((ref) => ref.id === cause.id)
        : cause.kind === "resistance"
          ? opponent.resistanceRefs.some((ref) => ref.id === cause.id)
          : true;
    expect(causeIsResolved, `${matchup}: ${item.kind} ${item.id} cites inactive ${cause.kind} ${cause.id}`).toBe(true);
  }
}

function assertFinalImage(profile: CharacterProfile, matchup: string, side: "left" | "right"): void {
  expect(profile.image, `${matchup}: ${side} image must be derived from final effects`).toEqual(
    activeImage(profile.key, profile.effects)
  );
}

function capabilityRefKey(item: ProfileCapability): string | undefined {
  if (item.kind === "power" && item.ref && "id" in item.ref) {
    return powerRefKey(item.ref as PowerRef);
  }
  if (item.kind === "resistance" && item.ref && "id" in item.ref) {
    return resistanceRefKey(item.ref as ResistanceRef);
  }
  return undefined;
}

describe("current roster engine invariants", () => {
  it("initializes every catalog from the shared domain contract", () => {
    expect(Object.keys(context.catalogs)).toEqual(CATALOG_NAMES);
    expect(Object.keys(context.catalogIndexes)).toEqual(CATALOG_NAMES);
  });

  it("keeps authored capability scopes unique", () => {
    for (const character of context.characters) {
      for (const form of character.keys) {
        const powerKeys = (form.power_refs ?? []).map(powerRefKey);
        const resistanceKeys = (form.resistance_refs ?? []).map(resistanceRefKey);
        expect(new Set(powerKeys).size, `${character.entry_id}~${form.key}: duplicate authored power scope`).toBe(
          powerKeys.length
        );
        expect(
          new Set(resistanceKeys).size,
          `${character.entry_id}~${form.key}: duplicate authored resistance scope`
        ).toBe(resistanceKeys.length);
      }
    }
  });

  it("keeps all ordered battle reports consistent with their resolved state", () => {
    for (const leftSelection of selections) {
      for (const rightSelection of selections) {
        const matchup =
          `${leftSelection.characterId}~${leftSelection.formId}` +
          `::${rightSelection.characterId}~${rightSelection.formId}`;
        const report = simulateBattle(context, leftSelection, rightSelection);

        assertFinalImage(report.left, matchup, "left");
        assertFinalImage(report.right, matchup, "right");
        assertStatusCauseIsResolved(report.left, report.right, matchup);
        assertStatusCauseIsResolved(report.right, report.left, matchup);

        for (const profile of [report.left, report.right]) {
          const sectionKeys = new Set(
            profile.sections.flatMap((section) => section.items.map(capabilityRefKey).filter(Boolean))
          );
          for (const ref of profile.powerRefs) {
            expect(
              sectionKeys.has(powerRefKey(ref)),
              `${matchup}: resolved power ${powerRefKey(ref)} is missing from sections`
            ).toBe(true);
          }
          for (const ref of profile.resistanceRefs) {
            expect(
              sectionKeys.has(resistanceRefKey(ref)),
              `${matchup}: resolved resistance ${resistanceRefKey(ref)} is missing from sections`
            ).toBe(true);
          }
        }
      }
    }
  });
});
