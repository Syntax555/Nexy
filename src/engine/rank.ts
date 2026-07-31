import type {
  CharacterForm,
  PowerRef,
  RankedStat,
  RankedStatInput,
  RankedStatName,
  ResistanceRef,
  SpeedStatName
} from "../domain/index.js";
import {
  byId,
  numberField,
  optionalStringField,
  stringField,
  type CatalogName,
  type CatalogRecord,
  type GameContext
} from "./context.js";
import type { ResolvedStat } from "./internal.js";

export const speedDefinitions = [
  ["combat_speed", "Combat Speed"],
  ["attack_speed", "Attack Speed"],
  ["reaction_speed", "Reaction Speed"],
  ["travel_speed", "Travel Speed"],
  ["flight_speed", "Flight Speed"]
] as const satisfies readonly (readonly [SpeedStatName, string])[];

export const statCatalogs: Readonly<Partial<Record<RankedStatName, CatalogName>>> = {
  attack_potency: "attack_durability_tiers",
  attack_speed: "speed_tiers",
  combat_speed: "speed_tiers",
  reaction_speed: "speed_tiers",
  travel_speed: "speed_tiers",
  flight_speed: "speed_tiers",
  lifting_strength: "lifting_strength_tiers",
  striking_strength: "striking_strength_tiers",
  durability: "attack_durability_tiers",
  stamina: "stamina_tiers",
  range: "range_tiers",
  intelligence: "intelligence_tiers"
};

type ProfileStatDefinition =
  | readonly [string, string, "tier" | "speed", undefined]
  | readonly [string, string, RankedStatName, CatalogName];

export const profileStatDefinitions = [
  ["tier", "Tier", "tier", undefined],
  ["attack_potency", "Attack Potency", "attack_potency", "attack_durability_tiers"],
  ["speed", "Speed", "speed", undefined],
  ["lifting_strength", "Lifting Strength", "lifting_strength", "lifting_strength_tiers"],
  ["striking_strength", "Striking Strength", "striking_strength", "striking_strength_tiers"],
  ["durability", "Durability", "durability", "attack_durability_tiers"],
  ["stamina", "Stamina", "stamina", "stamina_tiers"],
  ["range", "Range", "range", "range_tiers"],
  ["intelligence", "Intelligence", "intelligence", "intelligence_tiers"]
] as const satisfies readonly ProfileStatDefinition[];

function rankedRecord(stat: RankedStatInput | null | undefined): Readonly<Record<string, unknown>> {
  if (typeof stat === "string") return { value: stat, modifier: "normal" };
  return typeof stat === "object" && stat !== null ? (stat as unknown as Readonly<Record<string, unknown>>) : {};
}

export function normalizeStat(stat: RankedStatInput | null | undefined): RankedStat | undefined {
  const source = rankedRecord(stat);
  const value = optionalStringField(source, "value");
  if (!value) return undefined;

  const modifier = optionalStringField(source, "modifier") || "normal";
  const label = optionalStringField(source, "label");
  const note = optionalStringField(source, "note");
  const resistibleValue = Reflect.get(source, "resistible");

  return {
    value,
    modifier,
    ...(label ? { label } : {}),
    ...(note ? { note } : {}),
    ...(typeof resistibleValue === "boolean" ? { resistible: resistibleValue } : {})
  };
}

export function modifier(
  context: GameContext,
  stat: RankedStatInput | null | undefined,
  entry?: CatalogRecord
): CatalogRecord | undefined {
  if (stringField(entry, "modifier_behavior") === "locked_to_normal") {
    return byId(context, "stat_modifiers", "normal");
  }

  const normalized = normalizeStat(stat);
  return byId(context, "stat_modifiers", normalized?.modifier || "normal") ?? byId(context, "stat_modifiers", "normal");
}

export function abilityModifier(
  context: GameContext,
  ref: PowerRef | ResistanceRef | Readonly<Record<string, unknown>> | null | undefined
): CatalogRecord | undefined {
  return (
    byId(context, "ability_modifiers", optionalStringField(ref, "modifier") || "normal") ??
    byId(context, "ability_modifiers", "normal")
  );
}

export function abilityModifierRank(
  context: GameContext,
  ref: PowerRef | ResistanceRef | Readonly<Record<string, unknown>> | null | undefined
): number {
  return numberField(abilityModifier(context, ref), "coverage_rank");
}

export function magicLevelRank(
  context: GameContext,
  ref: PowerRef | ResistanceRef | Readonly<Record<string, unknown>> | null | undefined
): number {
  return numberField(byId(context, "magic_levels", optionalStringField(ref, "magic_level_id")), "rank");
}

export function degreeRank(
  context: GameContext,
  ref: PowerRef | Readonly<Record<string, unknown>> | null | undefined
): number {
  const martial = numberField(
    byId(context, "martial_arts_degrees", optionalStringField(ref, "martial_arts_degree_id")),
    "rank"
  );
  const acrobatics = numberField(
    byId(context, "acrobatics_degrees", optionalStringField(ref, "acrobatics_degree_id")),
    "rank"
  );
  return Math.max(martial, acrobatics);
}

export function resistanceLevelRank(
  context: GameContext,
  ref: ResistanceRef | Readonly<Record<string, unknown>> | null | undefined
): number {
  return numberField(byId(context, "resistance_levels", optionalStringField(ref, "level") || "resistant"), "rank");
}

export function statEntry(
  context: GameContext,
  stat: RankedStatInput | null | undefined,
  catalogName: CatalogName
): CatalogRecord | undefined {
  return byId(context, catalogName, normalizeStat(stat)?.value);
}

export function compositeRank(
  context: GameContext,
  stat: RankedStatInput | null | undefined,
  catalogName: CatalogName
): number {
  const entry = statEntry(context, stat, catalogName);
  if (!entry) return 0;

  const resolvedModifier = modifier(context, stat, entry);
  return (numberField(entry, "rank") - 1) * context.statModifierStride + numberField(resolvedModifier, "rank");
}

export function formStat(form: CharacterForm, statName: RankedStatName): RankedStatInput | null | undefined {
  return Reflect.get(form, statName) as RankedStatInput | null | undefined;
}

export function tierRank(context: GameContext, form: CharacterForm): number {
  return compositeRank(context, form.attack_potency, "attack_durability_tiers");
}

export function speedRank(context: GameContext, form: CharacterForm): number {
  return Math.max(
    0,
    ...speedDefinitions.map(([field]) => compositeRank(context, formStat(form, field), "speed_tiers"))
  );
}

export function rankedStatRank(
  context: GameContext,
  form: CharacterForm,
  field: RankedStatName | "tier" | "speed",
  catalogName?: CatalogName
): number {
  if (field === "tier") return tierRank(context, form);
  if (field === "speed") return speedRank(context, form);
  const resolvedCatalog = catalogName ?? statCatalogs[field];
  return resolvedCatalog ? compositeRank(context, formStat(form, field), resolvedCatalog) : 0;
}

function statDisplayValue(entry: CatalogRecord, catalogName: CatalogName, valueField: string): string {
  const value = stringField(entry, valueField);
  if (catalogName !== "striking_strength_tiers" || valueField !== "name") return value;

  return value.replace(/ level\+$/i, "+").replace(/ level$/i, "");
}

export function formatStat(
  context: GameContext,
  stat: RankedStatInput | null | undefined,
  catalogName: CatalogName,
  valueField = "name"
): string {
  const entry = statEntry(context, stat, catalogName);
  if (!entry) return "";

  const resolvedModifier = modifier(context, stat, entry);
  const displayPrefix = optionalStringField(resolvedModifier, "display_prefix");
  const prefix = displayPrefix ? `${displayPrefix} ` : "";
  const suffix = optionalStringField(resolvedModifier, "display_suffix") || "";
  return `${prefix}${statDisplayValue(entry, catalogName, valueField)}${suffix}`;
}

export function formatTier(context: GameContext, form: CharacterForm): string {
  const entry = statEntry(context, form.attack_potency, "attack_durability_tiers");
  return entry ? statDisplayValue(entry, "attack_durability_tiers", "tier") : "";
}

export function humanizeId(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function joinText(items: readonly string[]): string {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function speedComparisonLabel(field: RankedStatName, fallbackLabel = ""): string {
  const definition = speedDefinitions.find(([candidate]) => candidate === field);
  return definition?.[1] ?? humanizeId(fallbackLabel || field);
}

export function formatSpeed(context: GameContext, form: CharacterForm): string {
  const entries = speedDefinitions
    .filter(([field]) => Boolean(formStat(form, field)))
    .map(([field, label]) => {
      const stat = formStat(form, field);
      return {
        field,
        label,
        value: formatStat(context, stat, "speed_tiers")
      };
    })
    .filter((entry) => entry.value);

  if (entries.length === 0) return "";
  const first = entries[0];
  if (entries.length === 1 && first?.field === "combat_speed") {
    return first.value;
  }

  return entries.map((entry) => `${entry.label}: ${entry.value}`).join(" / ");
}

function profileSpeedNote(form: CharacterForm): string | undefined {
  const entries = speedDefinitions.flatMap(([field, label]) => {
    const note = normalizeStat(formStat(form, field))?.note;
    return note ? [{ field, label, note }] : [];
  });
  const first = entries[0];
  if (!first) return undefined;
  if (entries.length === 1 && first.field === "combat_speed") return first.note;

  return entries.map((entry) => `${entry.label}: ${entry.note}`).join(" / ");
}

export function statsForForm(context: GameContext, form: CharacterForm): readonly ResolvedStat[] {
  return profileStatDefinitions.map(([id, label, field, catalogName]) => {
    const value =
      field === "tier"
        ? formatTier(context, form)
        : field === "speed"
          ? formatSpeed(context, form)
          : formatStat(context, formStat(form, field), catalogName);
    const note =
      field === "tier"
        ? undefined
        : field === "speed"
          ? profileSpeedNote(form)
          : normalizeStat(formStat(form, field))?.note;
    return {
      id,
      label,
      value,
      rank: rankedStatRank(context, form, field, catalogName),
      ...(note ? { note } : {})
    };
  });
}

export function applyStatEffect(
  context: GameContext,
  current: RankedStatInput | null | undefined,
  statName: RankedStatName,
  effect: RankedStatInput | null | undefined
): RankedStatInput | null | undefined {
  const catalogName = statCatalogs[statName];
  if (!catalogName || effect == null) return current;

  return compositeRank(context, effect, catalogName) > compositeRank(context, current, catalogName)
    ? normalizeStat(effect)
    : current;
}

export function raiseStatModifier(
  context: GameContext,
  stat: RankedStatInput | null | undefined,
  modifierId: string,
  catalogName: CatalogName
): RankedStatInput | null | undefined {
  const normalized = normalizeStat(stat);
  if (!normalized) return stat;

  const entry = statEntry(context, normalized, catalogName);
  if (stringField(entry, "modifier_behavior") === "locked_to_normal") {
    return { ...normalized, modifier: "normal" };
  }

  const floor = byId(context, "stat_modifiers", modifierId);
  const current = modifier(context, normalized);
  if (!floor || numberField(current, "rank") >= numberField(floor, "rank")) return normalized;

  return { ...normalized, modifier: floor.id };
}
