/**
 * Data-only types for the JSON payload emitted by the content compiler.
 *
 * Source data intentionally keeps its snake_case field names. The rules engine
 * can therefore consume the payload without a lossy conversion layer.
 */

export type Id = string;

export type RankedStatName =
  | "attack_potency"
  | "attack_speed"
  | "combat_speed"
  | "reaction_speed"
  | "travel_speed"
  | "flight_speed"
  | "lifting_strength"
  | "striking_strength"
  | "durability"
  | "stamina"
  | "range"
  | "intelligence";

export type SpeedStatName = "attack_speed" | "combat_speed" | "reaction_speed" | "travel_speed" | "flight_speed";

export type OptionalSpeedStatName = Exclude<SpeedStatName, "combat_speed">;

export type CoreRankedStatName = Exclude<
  RankedStatName,
  "attack_speed" | "reaction_speed" | "travel_speed" | "flight_speed"
>;

export interface RankedStat {
  readonly value: Id;
  readonly modifier?: Id | null;
  readonly label?: string | null;
  readonly note?: string | null;
  readonly resistible?: boolean | null;
}

/** The YAML schema permits a tier id as shorthand for a full ranked stat. */
export type RankedStatInput = Id | RankedStat;

export type RankedStatEffects = Partial<Readonly<Record<RankedStatName, RankedStatInput | null>>>;

export type ImageRightsStatus = "original" | "licensed" | "public-domain" | "permission" | "unverified-third-party";

export interface ImageRef {
  readonly name: string;
  readonly image: string;
  readonly source_url: string;
  readonly rights_status: ImageRightsStatus;
  /**
   * Explicit operator choice to display an unverified image with a warning.
   * This is a publication setting, not evidence of a licence or permission.
   */
  readonly publish_unverified?: boolean;
  readonly creator?: string | null;
  readonly rights_holder?: string | null;
  readonly license?: string | null;
  readonly reviewed_on?: string | null;
}

export interface ImageUpdate extends ImageRef {
  readonly priority?: number | null;
}

export interface ContentSource {
  readonly id: Id;
  readonly name: string;
  readonly url: string;
  readonly publisher: string;
  readonly license: string;
  readonly accessed_on: string;
}

export interface StatModifierFloorEffect {
  readonly stat: RankedStatName;
  readonly modifier: Id;
}

export interface EffectGrants {
  readonly power_refs?: readonly PowerRef[] | null;
  readonly resistance_refs?: readonly ResistanceRef[] | null;
  readonly magic_level_ids?: readonly Id[] | null;
}

/**
 * A capability selector used by nullification, absorption, and non-physical
 * interaction effects. Target selectors deliberately cannot carry ownership
 * fields such as modifiers, degrees, conditions, grants, or local effects.
 */
export interface PowerTargetRef {
  readonly id: Id;
  readonly type_ids?: readonly Id[] | null;
  readonly source_variant?: Id | null;
  readonly magic_level_id?: Id | null;
}

export interface PowerNullificationEffect {
  readonly target_power_ids?: readonly Id[] | null;
  readonly target_power_refs?: readonly PowerTargetRef[] | null;
  readonly max_target_modifier?: Id | null;
  readonly max_target_type_rank?: number | null;
}

export interface AbsorptionEffect {
  readonly target_power_refs?: readonly PowerTargetRef[] | null;
}

export interface ResistanceNegationEffect {
  readonly target_resistance_ids?: readonly Id[] | null;
  readonly target_immunity_ids?: readonly Id[] | null;
}

export interface NonPhysicalInteractionEffect {
  readonly target_power_refs?: readonly PowerTargetRef[] | null;
}

export interface EffectNullifiers {
  readonly power_refs?: readonly PowerRef[] | null;
  readonly resistance_refs?: readonly ResistanceRef[] | null;
}

export interface OpponentStatSwapEffect {
  readonly stat_names?: readonly RankedStatName[] | null;
  readonly max_target_range?: RankedStatInput | null;
  readonly max_target_stats?: Partial<Readonly<Record<RankedStatName, RankedStatInput | null>>> | null;
  readonly on_success_stat_modifier_floor_effects?: readonly StatModifierFloorEffect[] | null;
}

/**
 * A single effect payload. All branches are optional because effects may carry
 * any supported combination (for example, stat changes and grants together).
 */
export interface Effect {
  readonly stat_effects?: RankedStatEffects | null;
  readonly stat_modifier_floor_effects?: readonly StatModifierFloorEffect[] | null;
  readonly opponent_stat_swap?: OpponentStatSwapEffect | null;
  readonly image_update?: ImageUpdate | null;
  readonly grants?: EffectGrants | null;
  readonly power_nullification?: PowerNullificationEffect | null;
  readonly absorption?: AbsorptionEffect | null;
  readonly resistance_negation?: ResistanceNegationEffect | null;
  readonly non_physical_interaction?: NonPhysicalInteractionEffect | null;
  readonly nullified_by?: EffectNullifiers | null;
}

export interface PowerRef {
  readonly id: Id;
  readonly placeholder?: boolean | null;
  readonly modifier?: Id | null;
  readonly type_ids?: readonly Id[] | null;
  readonly martial_arts_degree_id?: Id | null;
  readonly acrobatics_degree_id?: Id | null;
  readonly magic_level_id?: Id | null;
  readonly magic_nature_ids?: readonly Id[] | null;
  readonly source_variant?: Id | null;
  readonly condition?: string | null;
  readonly effects?: readonly Effect[] | null;

  /** Set only on powers synthesized from a derived-power catalog rule. */
  readonly derived?: boolean;
  readonly derived_rule_id?: Id;
}

export interface ResistanceRef {
  readonly id: Id;
  readonly level?: Id | null;
  readonly modifier?: Id | null;
  readonly type_ids?: readonly Id[] | null;
  readonly magic_level_id?: Id | null;
  readonly magic_nature_ids?: readonly Id[] | null;
  readonly source_variant?: Id | null;
  readonly condition?: string | null;
}

export interface EquipmentRef {
  readonly id: Id;
  readonly effects?: readonly Effect[] | null;
}

export interface CharacterAge {
  readonly value?: number | null;
  readonly unknown: boolean;
  readonly display?: string | null;
}

export interface CharacterForm {
  /** Stable form id; called `key` in the persisted YAML format. */
  readonly key: Id;
  readonly name?: string | null;
  readonly names: readonly string[];
  readonly images: readonly ImageRef[];
  readonly source_ids: readonly Id[];

  readonly power_refs?: readonly PowerRef[] | null;
  readonly resistance_refs?: readonly ResistanceRef[] | null;

  readonly attack_potency: RankedStatInput;
  readonly attack_speed?: RankedStatInput | null;
  readonly combat_speed: RankedStatInput;
  readonly reaction_speed?: RankedStatInput | null;
  readonly travel_speed?: RankedStatInput | null;
  readonly flight_speed?: RankedStatInput | null;
  readonly lifting_strength: RankedStatInput;
  readonly striking_strength: RankedStatInput;
  readonly durability: RankedStatInput;
  readonly stamina: RankedStatInput;
  readonly range: RankedStatInput;
  readonly intelligence: RankedStatInput;

  readonly standard_equipment_ids?: readonly Id[] | null;
  readonly standard_equipment_refs?: readonly EquipmentRef[] | null;
  readonly optional_equipment_ids?: readonly Id[] | null;
  readonly optional_equipment_refs?: readonly EquipmentRef[] | null;
  readonly attack_ids?: readonly Id[] | null;
}

export type AgeFilterValue = number | "unknown";

export interface CharacterEntry {
  /**
   * Older source data was keyed by entry id and omitted this field. The
   * compiler fills it, while the engine keeps the fallback for imported data.
   */
  readonly entry_id?: Id;
  readonly id?: Id;
  readonly name: string;
  readonly verse_id: Id;
  readonly gender_id: Id;
  readonly age: CharacterAge;
  readonly classification_ids: readonly Id[];
  readonly sources: readonly ContentSource[];
  readonly keys: readonly CharacterForm[];
  readonly age_filter_values?: readonly AgeFilterValue[];
}

export interface NamedOption {
  readonly id: Id;
  readonly name: string;
}

export interface MediaOption extends NamedOption {}

export interface GenderOption extends NamedOption {}

export interface OriginOption extends NamedOption {
  readonly media_id: Id;
}

export interface VerseOption extends NamedOption {
  readonly media_id: Id;
  readonly source_id: Id;
}

export interface ClassificationOption extends NamedOption {
  readonly parent_ids?: readonly Id[] | null;
  readonly filterable?: boolean | null;
}

export interface AbilityModifierOption extends NamedOption {
  readonly display_prefix?: string | null;
  readonly display_suffix?: string | null;
  readonly coverage_rank: number;
  readonly availability?: string | null;
}

export interface StatModifierOption extends NamedOption {
  readonly display_prefix?: string | null;
  readonly display_suffix?: string | null;
  readonly rank: number;
}

export interface DegreeOption extends NamedOption {
  readonly rank: number;
  readonly display_as_power_name?: boolean | null;
}

export interface ResistanceLevelOption extends NamedOption {
  readonly rank: number;
  readonly bypasses_ability_modifier_coverage?: boolean | null;
}

export interface RankedTierOption extends NamedOption {
  readonly rank: number;
  readonly tier?: string | null;
  readonly comparison_class?: string | null;
  readonly modifier_behavior?: string | null;
  readonly description?: string | null;
}

export interface DerivedPowerRequirement {
  readonly stat: RankedStatName;
  readonly value: Id;
  readonly modifier?: Id | null;
  readonly comparison?: "at-least" | "at-most" | "exact" | null;
}

export type DerivedPowerEvaluationStage = "base" | "effective";

export interface DerivedPowerRule {
  readonly id: Id;
  readonly power_id: Id;
  /**
   * Ruleset v1 evaluates derived powers from the authored base form. The
   * optional shape preserves compatibility with imported pre-v1 payloads,
   * which are interpreted as `base`.
   */
  readonly evaluation_stage?: DerivedPowerEvaluationStage | null;
  readonly min_matches?: number | null;
  readonly requirements: readonly DerivedPowerRequirement[];
}

export interface PowerTypeOption extends NamedOption {
  readonly power_id: Id;
  readonly covers_all?: boolean | null;
  readonly covers_type_ids?: readonly Id[] | null;
  readonly description?: string | null;
  readonly rank?: number | null;
}

export interface PowerVariant {
  readonly id: Id;
  readonly name: string;
  readonly display_as_power_name?: boolean | null;
  readonly inherits_base_grants?: boolean | null;
  readonly grants?: EffectGrants | null;
  readonly effects?: readonly Effect[] | null;
}

export interface PowerOption extends NamedOption {
  readonly placeholder?: boolean | null;
  readonly aliases?: readonly string[] | null;
  readonly variants?: readonly PowerVariant[] | null;
  readonly tags?: readonly string[] | null;
  readonly type_ids?: readonly Id[] | null;
  readonly degree_ids?: readonly Id[] | null;
  readonly grants?: EffectGrants | null;
  readonly effects?: readonly Effect[] | null;
}

export interface ResistanceOption extends NamedOption {
  readonly placeholder?: boolean | null;
  readonly resists_power_ids?: readonly Id[] | null;
  readonly resists_effect_ids?: readonly Id[] | null;
  readonly resists_weapon_type_ids?: readonly Id[] | null;
}

export interface MagicLevelOption extends NamedOption {
  readonly rank: number;
  readonly inherits_level_ids?: readonly Id[] | null;
  readonly power_refs?: readonly PowerRef[] | null;
  readonly resistance_refs?: readonly ResistanceRef[] | null;
}

export interface MagicNatureOption extends NamedOption {
  readonly aliases?: readonly string[] | null;
  readonly description?: string | null;
  readonly display?: string | null;
  readonly applies_to?: string | null;
  readonly ownership?: string | null;
  readonly inherits_nature_ids?: readonly Id[] | null;
  readonly power_refs?: readonly PowerRef[] | null;
  readonly resistance_refs?: readonly ResistanceRef[] | null;
  readonly effects?: readonly Effect[] | null;
}

export interface BattleItemOption extends NamedOption {
  readonly placeholder?: boolean | null;
  readonly weapon_type_ids?: readonly Id[] | null;
  readonly required_power_refs?: readonly PowerRef[] | null;
  readonly effects?: readonly Effect[] | null;
}

export interface EquipmentOption extends BattleItemOption {}

export interface AttackOption extends BattleItemOption {}

export interface NexyOptions {
  readonly media: readonly MediaOption[];
  readonly origins: readonly OriginOption[];
  readonly verses: readonly VerseOption[];
  readonly genders: readonly GenderOption[];
  readonly classifications: readonly ClassificationOption[];
  readonly derived_power_rules: readonly DerivedPowerRule[];
  readonly ability_modifiers: readonly AbilityModifierOption[];
  readonly powers: readonly PowerOption[];
  readonly power_types: readonly PowerTypeOption[];
  readonly martial_arts_degrees: readonly DegreeOption[];
  readonly acrobatics_degrees: readonly DegreeOption[];
  readonly resistance_levels: readonly ResistanceLevelOption[];
  readonly resistances: readonly ResistanceOption[];
  readonly magic_levels: readonly MagicLevelOption[];
  readonly magic_natures: readonly MagicNatureOption[];
  readonly equipment: readonly EquipmentOption[];
  readonly attacks: readonly AttackOption[];
  readonly stat_modifiers: readonly StatModifierOption[];
  readonly attack_durability_tiers: readonly RankedTierOption[];
  readonly speed_tiers: readonly RankedTierOption[];
  readonly lifting_strength_tiers: readonly RankedTierOption[];
  readonly striking_strength_tiers: readonly RankedTierOption[];
  readonly stamina_tiers: readonly RankedTierOption[];
  readonly range_tiers: readonly RankedTierOption[];
  readonly intelligence_tiers: readonly RankedTierOption[];
}

export type CharacterCollection = readonly CharacterEntry[] | Readonly<Record<Id, CharacterEntry>>;

export interface NexyDataMeta {
  readonly schema_version: 1;
  readonly content_revision: string;
}

export interface NexyData {
  readonly meta: NexyDataMeta;
  readonly options: NexyOptions;
  readonly baseurl?: string | null;
  readonly characters: CharacterCollection;
}
