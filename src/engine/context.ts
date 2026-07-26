import type { CharacterEntry, NexyData } from "../domain/index.js";

export interface CatalogRecord {
  readonly id: string;
  readonly [field: string]: unknown;
}

export type CatalogName =
  | "media"
  | "origins"
  | "verses"
  | "genders"
  | "classifications"
  | "derived_power_rules"
  | "ability_modifiers"
  | "powers"
  | "power_types"
  | "martial_arts_degrees"
  | "acrobatics_degrees"
  | "resistance_levels"
  | "resistances"
  | "magic_levels"
  | "magic_natures"
  | "equipment"
  | "attacks"
  | "stat_modifiers"
  | "attack_durability_tiers"
  | "speed_tiers"
  | "lifting_strength_tiers"
  | "striking_strength_tiers"
  | "stamina_tiers"
  | "range_tiers"
  | "intelligence_tiers";

export interface GameContext {
  readonly data: NexyData;
  readonly characters: readonly CharacterEntry[];
  readonly charactersById: ReadonlyMap<string, CharacterEntry>;
  readonly catalogs: Readonly<Record<CatalogName, readonly CatalogRecord[]>>;
  readonly catalogIndexes: Readonly<Record<CatalogName, ReadonlyMap<string, CatalogRecord>>>;
  readonly statModifierStride: number;
}

const catalogNames: readonly CatalogName[] = [
  "media",
  "origins",
  "verses",
  "genders",
  "classifications",
  "derived_power_rules",
  "ability_modifiers",
  "powers",
  "power_types",
  "martial_arts_degrees",
  "acrobatics_degrees",
  "resistance_levels",
  "resistances",
  "magic_levels",
  "magic_natures",
  "equipment",
  "attacks",
  "stat_modifiers",
  "attack_durability_tiers",
  "speed_tiers",
  "lifting_strength_tiers",
  "striking_strength_tiers",
  "stamina_tiers",
  "range_tiers",
  "intelligence_tiers"
];

function asCatalog(value: unknown): readonly CatalogRecord[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (entry): entry is CatalogRecord =>
      typeof entry === "object"
      && entry !== null
      && typeof Reflect.get(entry, "id") === "string"
  );
}

function entryId(character: CharacterEntry, index: number): string {
  const source = character as CharacterEntry & { readonly entry_id?: string; readonly id?: string };
  return source.entry_id || source.id || `character-${index + 1}`;
}

function normalizedCharacters(data: NexyData): readonly CharacterEntry[] {
  const source = (data as NexyData & {
    readonly characters:
      | readonly CharacterEntry[]
      | Readonly<Record<string, CharacterEntry>>;
  }).characters;

  if (Array.isArray(source)) {
    return source.map((character, index) => ({
      ...character,
      entry_id: entryId(character, index)
    }));
  }

  return Object.entries(source ?? {}).map(([id, character]) => ({
    ...character,
    entry_id: id
  }));
}

/**
 * Build all lookup tables once. The returned context is the only state required
 * by the rules engine; no browser globals or DOM objects are consulted.
 */
export function createGameContext(data: NexyData): GameContext {
  const optionSource = Reflect.get(data as object, "options") as Record<string, unknown> | undefined;
  const catalogEntries = Object.fromEntries(
    catalogNames.map((name) => [name, asCatalog(optionSource?.[name])])
  ) as Record<CatalogName, readonly CatalogRecord[]>;
  const catalogIndexes = Object.fromEntries(
    catalogNames.map((name) => [
      name,
      new Map(catalogEntries[name].map((entry) => [entry.id, entry]))
    ])
  ) as unknown as Record<CatalogName, ReadonlyMap<string, CatalogRecord>>;
  const characters = normalizedCharacters(data);
  const charactersById = new Map(
    characters.map((character, index) => [entryId(character, index), character])
  );
  const modifierRanks = catalogEntries.stat_modifiers.map((entry) => numberField(entry, "rank"));
  const statModifierStride = Math.max(1, ...modifierRanks);

  return {
    data,
    characters,
    charactersById,
    catalogs: catalogEntries,
    catalogIndexes,
    statModifierStride
  };
}

export function catalog(
  context: GameContext,
  name: CatalogName
): readonly CatalogRecord[] {
  return context.catalogs[name];
}

export function byId(
  context: GameContext,
  name: CatalogName,
  id: string | null | undefined
): CatalogRecord | undefined {
  return id ? context.catalogIndexes[name].get(id) : undefined;
}

export function list<T>(value: readonly T[] | null | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

export function stringField(record: object | null | undefined, field: string): string {
  const value = record ? Reflect.get(record, field) : undefined;
  return typeof value === "string" ? value : "";
}

export function optionalStringField(
  record: object | null | undefined,
  field: string
): string | undefined {
  const value = record ? Reflect.get(record, field) : undefined;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function numberField(record: object | null | undefined, field: string): number {
  const value = record ? Number(Reflect.get(record, field)) : 0;
  return Number.isFinite(value) ? value : 0;
}

export function booleanField(record: object | null | undefined, field: string): boolean {
  return record ? Reflect.get(record, field) === true : false;
}

export function objectField(
  record: object | null | undefined,
  field: string
): Readonly<Record<string, unknown>> | undefined {
  const value = record ? Reflect.get(record, field) : undefined;
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

export function arrayField<T = unknown>(
  record: object | null | undefined,
  field: string
): readonly T[] {
  const value = record ? Reflect.get(record, field) : undefined;
  return Array.isArray(value) ? value as readonly T[] : [];
}
