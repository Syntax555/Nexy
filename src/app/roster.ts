import type { AgeFilterValue, BattleSelection, CharacterEntry, CharacterProfile } from "../domain/index.js";
import type { GameContext } from "../engine/index.js";
import { getCharacterProfile } from "../engine/index.js";

export interface RosterCharacter {
  readonly id: string;
  readonly character: CharacterEntry;
  readonly defaultSelection: BattleSelection;
  readonly defaultProfile: CharacterProfile;
  readonly name: string;
  readonly identity: string;
  readonly formCount: number;
  readonly mediaId: string;
  readonly media: string;
  readonly originId: string;
  readonly origin: string;
  readonly verseId: string;
  readonly verse: string;
  readonly genderId: string;
  readonly gender: string;
  readonly ageFilterValues: readonly AgeFilterValue[];
  readonly classificationIds: readonly string[];
  readonly classificationNames: readonly string[];
  readonly classificationFilterIds: readonly string[];
  readonly classificationFilterNames: readonly string[];
  readonly tiers: readonly RosterTier[];
  readonly tier: string;
  readonly tierRank: number;
  readonly searchText: string;
}

export interface RosterTier {
  readonly value: string;
  readonly rank: number;
}

function characterId(character: CharacterEntry, index: number): string {
  return character.entry_id || character.id || `character-${index + 1}`;
}

function catalogName(entries: readonly { readonly id: string; readonly name: string }[], id: string): string {
  return entries.find((entry) => entry.id === id)?.name ?? id;
}

function tierFromProfile(profile: CharacterProfile): {
  readonly value: string;
  readonly rank: number;
} {
  const tier = profile.stats.find((stat) => stat.id === "tier");
  return {
    value: tier?.value ?? "Unranked",
    rank: tier?.rank ?? 0
  };
}

function addAgeRange(values: Set<number>, start: number, end: number): void {
  for (let age = start; age <= end; age += 1) values.add(age);
}

function addDecadeAgeRange(values: Set<number>, decade: number, qualifier: string): void {
  if (!Number.isInteger(decade) || decade < 0) return;

  if (qualifier === "early") {
    addAgeRange(values, decade, decade + 3);
  } else if (qualifier === "mid" || qualifier === "middle") {
    addAgeRange(values, decade + 4, decade + 6);
  } else if (qualifier === "late") {
    addAgeRange(values, decade + 7, decade + 9);
  } else {
    addAgeRange(values, decade, decade + 9);
  }
}

function derivedAgeFilterValues(character: CharacterEntry): readonly AgeFilterValue[] {
  if (character.age_filter_values?.length) {
    return [...new Set(character.age_filter_values)];
  }

  const values = new Set<number>();
  if (
    character.age.value !== null &&
    character.age.value !== undefined &&
    Number.isInteger(character.age.value) &&
    character.age.value >= 0
  ) {
    values.add(character.age.value);
  }

  const text = (character.age.display ?? "").toLowerCase();
  const decadePattern = /\b(early|mid|middle|late)?\s*-?\s*(\d{1,3})\s*'?\s*s\b/g;
  const teenPattern = /\b(early|mid|middle|late)?\s*-?\s*teens?\b/g;
  const exactPattern = /\b(\d{1,3})(?!\s*'?\s*s)\b/g;

  for (const match of text.matchAll(decadePattern)) {
    addDecadeAgeRange(values, Number(match[2]), match[1] ?? "");
  }

  for (const match of text.matchAll(teenPattern)) {
    const qualifier = match[1] ?? "";
    if (qualifier === "early") {
      addAgeRange(values, 13, 15);
    } else if (qualifier === "mid" || qualifier === "middle") {
      addAgeRange(values, 15, 17);
    } else if (qualifier === "late") {
      addAgeRange(values, 17, 19);
    } else {
      addAgeRange(values, 13, 19);
    }
  }

  for (const match of text.matchAll(exactPattern)) {
    const age = Number(match[1]);
    if (Number.isInteger(age) && age >= 0) values.add(age);
  }

  return values.size > 0 ? [...values].sort((left, right) => left - right) : character.age.unknown ? ["unknown"] : [];
}

function classificationIdsWithParents(
  classificationIds: readonly string[],
  classificationsById: ReadonlyMap<
    string,
    {
      readonly id: string;
      readonly parent_ids?: readonly string[] | null;
    }
  >
): readonly string[] {
  const resolved = new Set<string>();

  const addWithParents = (id: string): void => {
    if (resolved.has(id)) return;
    resolved.add(id);
    classificationsById.get(id)?.parent_ids?.forEach(addWithParents);
  };

  classificationIds.forEach(addWithParents);
  return [...resolved];
}

export function buildRoster(context: GameContext): readonly RosterCharacter[] {
  const classificationsById = new Map(
    context.data.options.classifications.map((classification) => [classification.id, classification])
  );

  return context.characters.map((character, index) => {
    const id = characterId(character, index);
    const defaultForm = character.keys[0];
    if (!defaultForm) {
      throw new Error(`${character.name} has no playable forms.`);
    }

    const defaultSelection: BattleSelection = {
      characterId: id,
      formId: defaultForm.key
    };
    const defaultProfile = getCharacterProfile(context, defaultSelection);
    const tiers = character.keys
      .map((form) =>
        tierFromProfile(
          form.key === defaultForm.key
            ? defaultProfile
            : getCharacterProfile(context, {
                characterId: id,
                formId: form.key
              })
        )
      )
      .filter((candidate) => candidate.value !== "Unranked");
    const tier = tiers.reduce(
      (strongest, candidate) => (candidate.rank > strongest.rank ? candidate : strongest),
      tierFromProfile(defaultProfile)
    );
    const uniqueTiers = [
      ...tiers
        .reduce((byValue, candidate) => {
          const current = byValue.get(candidate.value);
          if (!current || candidate.rank < current.rank) {
            byValue.set(candidate.value, candidate);
          }
          return byValue;
        }, new Map<string, RosterTier>())
        .values()
    ];
    const verseOption = context.data.options.verses.find((candidate) => candidate.id === character.verse_id);
    const originId = verseOption?.source_id ?? "";
    const originOption = context.data.options.origins.find((candidate) => candidate.id === originId);
    const mediaId = verseOption?.media_id ?? originOption?.media_id ?? "";
    const media = mediaId ? catalogName(context.data.options.media, mediaId) : "Unspecified media";
    const origin = originId ? catalogName(context.data.options.origins, originId) : "Unspecified origin";
    const verse = catalogName(context.data.options.verses, character.verse_id);
    const gender = catalogName(context.data.options.genders, character.gender_id);
    const classificationNames = character.classification_ids.map((classificationId) =>
      catalogName(context.data.options.classifications, classificationId)
    );
    const classificationFilterIds = classificationIdsWithParents(
      character.classification_ids,
      classificationsById
    ).filter((classificationId) => classificationsById.get(classificationId)?.filterable !== false);
    const classificationFilterNames = classificationFilterIds.map((classificationId) =>
      catalogName(context.data.options.classifications, classificationId)
    );
    const ageFilterValues = derivedAgeFilterValues(character);
    const formNames = character.keys.flatMap((form) => [form.name ?? "", ...form.names]);

    return {
      id,
      character,
      defaultSelection,
      defaultProfile,
      name: character.name,
      identity: defaultForm.names[0] || character.name,
      formCount: character.keys.length,
      mediaId,
      media,
      originId,
      origin,
      verseId: character.verse_id,
      verse,
      genderId: character.gender_id,
      gender,
      ageFilterValues,
      classificationIds: character.classification_ids,
      classificationNames,
      classificationFilterIds,
      classificationFilterNames,
      tiers: uniqueTiers,
      tier: tier.value,
      tierRank: tier.rank,
      searchText: [
        character.name,
        character.age.display ?? "",
        ...ageFilterValues.map(String),
        media,
        origin,
        verse,
        gender,
        ...classificationFilterNames,
        ...uniqueTiers.map((candidate) => candidate.value),
        ...formNames
      ].join(" ")
    };
  });
}

export function validSelection(context: GameContext, selection: BattleSelection | null): BattleSelection | null {
  if (!selection) return null;
  const character = context.charactersById.get(selection.characterId);
  if (!character) return null;

  const requestedForm = selection.formId || selection.keyId;
  const form = requestedForm ? character.keys.find((candidate) => candidate.key === requestedForm) : character.keys[0];
  if (!form) return null;

  return {
    characterId: selection.characterId,
    formId: form.key
  };
}
