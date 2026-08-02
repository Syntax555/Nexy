import type { CatalogName } from "./catalogs.js";
import type { OptionalSpeedStatName, RankedStatName, SpeedStatName } from "./data.js";

interface CoreRankedStatDefinition {
  readonly label: string;
  readonly catalog: CatalogName;
  readonly speedOrder?: never;
  readonly optionalSpeed?: never;
}

interface SpeedRankedStatDefinition {
  readonly label: string;
  readonly catalog: "speed_tiers";
  readonly speedOrder: number;
  readonly optionalSpeed: boolean;
}

export type RankedStatDefinition = CoreRankedStatDefinition | SpeedRankedStatDefinition;

/** Canonical runtime contract for every ranked field used by data, tooling, and UI coverage. */
export const rankedStatDefinitions = {
  attack_potency: { label: "Attack Potency", catalog: "attack_durability_tiers" },
  attack_speed: { label: "Attack Speed", catalog: "speed_tiers", speedOrder: 1, optionalSpeed: true },
  combat_speed: { label: "Combat Speed", catalog: "speed_tiers", speedOrder: 0, optionalSpeed: false },
  reaction_speed: { label: "Reaction Speed", catalog: "speed_tiers", speedOrder: 2, optionalSpeed: true },
  travel_speed: { label: "Travel Speed", catalog: "speed_tiers", speedOrder: 3, optionalSpeed: true },
  flight_speed: { label: "Flight Speed", catalog: "speed_tiers", speedOrder: 4, optionalSpeed: true },
  lifting_strength: { label: "Lifting Strength", catalog: "lifting_strength_tiers" },
  striking_strength: { label: "Striking Strength", catalog: "striking_strength_tiers" },
  durability: { label: "Durability", catalog: "attack_durability_tiers" },
  stamina: { label: "Stamina", catalog: "stamina_tiers" },
  range: { label: "Range", catalog: "range_tiers" },
  intelligence: { label: "Intelligence", catalog: "intelligence_tiers" }
} as const satisfies Readonly<Record<RankedStatName, RankedStatDefinition>>;

export const rankedStatNames = Object.freeze(Object.keys(rankedStatDefinitions)) as readonly RankedStatName[];

export const rankedStatCatalogs = Object.freeze(
  Object.fromEntries(rankedStatNames.map((id) => [id, rankedStatDefinitions[id].catalog]))
) as Readonly<Record<RankedStatName, CatalogName>>;

export const rankedStatLabels = Object.freeze(
  Object.fromEntries(rankedStatNames.map((id) => [id, rankedStatDefinitions[id].label]))
) as Readonly<Record<RankedStatName, string>>;

export const speedDefinitions = Object.freeze(
  rankedStatNames
    .flatMap((id) => {
      const definition = rankedStatDefinitions[id];
      return "speedOrder" in definition ? [{ id: id as SpeedStatName, ...definition }] : [];
    })
    .sort((left, right) => left.speedOrder - right.speedOrder)
    .map(({ id, label }) => [id, label] as const)
) as readonly (readonly [SpeedStatName, string])[];

export const optionalSpeedStatNames = Object.freeze(
  rankedStatNames.filter((id): id is OptionalSpeedStatName => {
    const definition = rankedStatDefinitions[id];
    return "optionalSpeed" in definition && definition.optionalSpeed;
  })
) as readonly OptionalSpeedStatName[];
