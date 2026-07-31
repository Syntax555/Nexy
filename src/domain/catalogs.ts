import type { NexyOptions } from "./data.js";

type MissingCatalogNames<Names extends readonly PropertyKey[]> = Exclude<keyof NexyOptions, Names[number]>;

function defineCatalogNames<const Names extends readonly (keyof NexyOptions)[]>(
  names: Names,
  ..._missingNames: [MissingCatalogNames<Names>] extends [never]
    ? []
    : ["Missing NexyOptions catalog names", MissingCatalogNames<Names>]
): Names {
  return names;
}

/**
 * Canonical catalog contract shared by content tooling and the rules engine.
 * The helper makes additions to `NexyOptions` a compile-time error here until
 * the new catalog is deliberately included.
 */
export const CATALOG_NAMES = defineCatalogNames([
  "ability_modifiers",
  "acrobatics_degrees",
  "attack_durability_tiers",
  "attacks",
  "classifications",
  "derived_power_rules",
  "equipment",
  "genders",
  "intelligence_tiers",
  "lifting_strength_tiers",
  "magic_levels",
  "magic_natures",
  "martial_arts_degrees",
  "media",
  "origins",
  "power_types",
  "powers",
  "range_tiers",
  "resistance_levels",
  "resistances",
  "speed_tiers",
  "stamina_tiers",
  "stat_modifiers",
  "striking_strength_tiers",
  "verses"
] as const);

export type CatalogName = (typeof CATALOG_NAMES)[number];
