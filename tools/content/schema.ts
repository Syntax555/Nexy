import { z } from "zod";

import type { CatalogName } from "../../src/domain/catalogs.js";

import type { Effect, EffectGrants, EquipmentRef, PowerRef, ResistanceRef } from "../../src/domain/data.js";

export const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must use lowercase letters, numbers, and single hyphens");

const nonEmptyStringSchema = z.string().min(1);
const nullableStringSchema = nonEmptyStringSchema.nullable();
const optionalNullableStringSchema = nullableStringSchema.optional();
const optionalDisplayAffixSchema = z.string().nullable().optional();
const slugListSchema = z.array(slugSchema);
const optionalSlugListSchema = slugListSchema.nullable().optional();
const stringListSchema = z.array(nonEmptyStringSchema);
const optionalStringListSchema = stringListSchema.nullable().optional();
const optionalBooleanSchema = z.boolean().nullable().optional();
const integerSchema = z.number().int();
const nonnegativeIntegerSchema = integerSchema.nonnegative();
const positiveIntegerSchema = integerSchema.positive();
const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", "must use HTTPS");
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must use YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === (month ?? 0) - 1 && date.getUTCDate() === day;
  }, "must be a valid calendar date");

export const rankedStatNames = [
  "attack_potency",
  "attack_speed",
  "combat_speed",
  "reaction_speed",
  "travel_speed",
  "flight_speed",
  "lifting_strength",
  "striking_strength",
  "durability",
  "stamina",
  "range",
  "intelligence"
] as const;

export const rankedStatNameSchema = z.enum(rankedStatNames);

export const rankedStatSchema = z.union([
  slugSchema,
  z.strictObject({
    value: slugSchema,
    modifier: optionalNullableStringSchema,
    label: optionalNullableStringSchema,
    note: optionalNullableStringSchema,
    resistible: optionalBooleanSchema
  })
]);

const imageRightsStatusSchema = z.enum([
  "original",
  "licensed",
  "public-domain",
  "permission",
  "unverified-third-party"
]);

const imageFields = {
  name: nonEmptyStringSchema,
  image: nonEmptyStringSchema,
  source_url: httpsUrlSchema,
  rights_status: imageRightsStatusSchema,
  publish_unverified: z.boolean().optional(),
  creator: optionalNullableStringSchema,
  rights_holder: optionalNullableStringSchema,
  license: optionalNullableStringSchema,
  reviewed_on: isoDateSchema
} as const;

function validateImageRights(
  image: {
    readonly rights_status: z.infer<typeof imageRightsStatusSchema>;
    readonly publish_unverified?: boolean | undefined;
    readonly creator?: string | null | undefined;
    readonly rights_holder?: string | null | undefined;
    readonly license?: string | null | undefined;
  },
  context: z.RefinementCtx
): void {
  if ((image.rights_status === "licensed" || image.rights_status === "public-domain") && !image.license) {
    context.addIssue({
      code: "custom",
      path: ["license"],
      message: `is required when rights_status is ${image.rights_status}`
    });
  }
  if (image.rights_status === "unverified-third-party" && !image.rights_holder) {
    context.addIssue({
      code: "custom",
      path: ["rights_holder"],
      message: "is required when rights_status is unverified-third-party"
    });
  }
  if (image.publish_unverified !== undefined && image.rights_status !== "unverified-third-party") {
    context.addIssue({
      code: "custom",
      path: ["publish_unverified"],
      message: "is only valid when rights_status is unverified-third-party"
    });
  }
  if (image.rights_status === "permission" && !image.rights_holder) {
    context.addIssue({
      code: "custom",
      path: ["rights_holder"],
      message: "is required when rights_status is permission"
    });
  }
  if (image.rights_status === "permission" && !image.license) {
    context.addIssue({
      code: "custom",
      path: ["license"],
      message: "must identify the documented permission when rights_status is permission"
    });
  }
  if (image.rights_status === "original" && !image.creator) {
    context.addIssue({
      code: "custom",
      path: ["creator"],
      message: "is required when rights_status is original"
    });
  }
}

export const imageRefSchema = z.strictObject(imageFields).superRefine(validateImageRights);

const imageUpdateSchema = z
  .strictObject({
    ...imageFields,
    priority: integerSchema.nullable().optional()
  })
  .superRefine(validateImageRights);

export const contentSourceSchema = z.strictObject({
  id: slugSchema,
  name: nonEmptyStringSchema,
  url: httpsUrlSchema,
  publisher: nonEmptyStringSchema,
  license: nonEmptyStringSchema,
  accessed_on: isoDateSchema
});

const statEffectsSchema = z.strictObject({
  attack_potency: rankedStatSchema.nullable().optional(),
  attack_speed: rankedStatSchema.nullable().optional(),
  combat_speed: rankedStatSchema.nullable().optional(),
  reaction_speed: rankedStatSchema.nullable().optional(),
  travel_speed: rankedStatSchema.nullable().optional(),
  flight_speed: rankedStatSchema.nullable().optional(),
  lifting_strength: rankedStatSchema.nullable().optional(),
  striking_strength: rankedStatSchema.nullable().optional(),
  durability: rankedStatSchema.nullable().optional(),
  stamina: rankedStatSchema.nullable().optional(),
  range: rankedStatSchema.nullable().optional(),
  intelligence: rankedStatSchema.nullable().optional()
});

const statModifierFloorSchema = z.strictObject({
  stat: rankedStatNameSchema,
  modifier: slugSchema
});

const powerTargetSchema = z.strictObject({
  id: slugSchema,
  type_ids: optionalSlugListSchema,
  source_variant: optionalNullableStringSchema,
  magic_level_id: optionalNullableStringSchema
});

export const effectSchema = z.lazy(() =>
  z
    .strictObject({
      stat_effects: statEffectsSchema.nullable().optional(),
      stat_modifier_floor_effects: z.array(statModifierFloorSchema).nullable().optional(),
      opponent_stat_swap: z
        .strictObject({
          stat_names: z.array(rankedStatNameSchema).nullable().optional(),
          max_target_range: rankedStatSchema.nullable().optional(),
          max_target_stats: statEffectsSchema.nullable().optional(),
          on_success_stat_modifier_floor_effects: z.array(statModifierFloorSchema).nullable().optional()
        })
        .nullable()
        .optional(),
      image_update: imageUpdateSchema.nullable().optional(),
      grants: effectGrantsSchema.nullable().optional(),
      power_nullification: z
        .strictObject({
          target_power_ids: optionalSlugListSchema,
          target_power_refs: z.array(powerTargetSchema).nullable().optional(),
          max_target_modifier: optionalNullableStringSchema,
          max_target_type_rank: nonnegativeIntegerSchema.nullable().optional()
        })
        .nullable()
        .optional(),
      absorption: z
        .strictObject({
          target_power_refs: z.array(powerTargetSchema).nullable().optional()
        })
        .nullable()
        .optional(),
      resistance_negation: z
        .strictObject({
          target_resistance_ids: optionalSlugListSchema,
          target_immunity_ids: optionalSlugListSchema
        })
        .nullable()
        .optional(),
      non_physical_interaction: z
        .strictObject({
          target_power_refs: z.array(powerTargetSchema).nullable().optional()
        })
        .nullable()
        .optional(),
      nullified_by: z
        .strictObject({
          power_refs: z.array(powerRefSchema).nullable().optional(),
          resistance_refs: z.array(resistanceRefSchema).nullable().optional()
        })
        .nullable()
        .optional()
    })
    .refine(
      (effect) => Object.values(effect).some((value) => value !== null && value !== undefined),
      "effect must contain at least one supported branch"
    )
) as unknown as z.ZodType<Effect>;

export const effectGrantsSchema = z.lazy(() =>
  z.strictObject({
    power_refs: z.array(powerRefSchema).nullable().optional(),
    resistance_refs: z.array(resistanceRefSchema).nullable().optional(),
    magic_level_ids: optionalSlugListSchema
  })
) as unknown as z.ZodType<EffectGrants>;

export const powerRefSchema = z.lazy(() =>
  z.strictObject({
    id: slugSchema,
    placeholder: optionalBooleanSchema,
    modifier: optionalNullableStringSchema,
    type_ids: optionalSlugListSchema,
    martial_arts_degree_id: optionalNullableStringSchema,
    acrobatics_degree_id: optionalNullableStringSchema,
    magic_level_id: optionalNullableStringSchema,
    magic_nature_ids: optionalSlugListSchema,
    source_variant: optionalNullableStringSchema,
    condition: optionalNullableStringSchema,
    effects: z.array(effectSchema).nullable().optional()
  })
) as unknown as z.ZodType<PowerRef>;

export const resistanceRefSchema = z.lazy(() =>
  z.strictObject({
    id: slugSchema,
    level: optionalNullableStringSchema,
    modifier: optionalNullableStringSchema,
    type_ids: optionalSlugListSchema,
    magic_level_id: optionalNullableStringSchema,
    magic_nature_ids: optionalSlugListSchema,
    source_variant: optionalNullableStringSchema,
    condition: optionalNullableStringSchema
  })
) as unknown as z.ZodType<ResistanceRef>;

export const equipmentRefSchema = z.lazy(() =>
  z.strictObject({
    id: slugSchema,
    effects: z.array(effectSchema).nullable().optional()
  })
) as unknown as z.ZodType<EquipmentRef>;

export const characterFormSchema = z.strictObject({
  key: slugSchema,
  name: optionalNullableStringSchema,
  names: stringListSchema.min(1),
  images: z.array(imageRefSchema),
  source_ids: slugListSchema.min(1),
  power_refs: z.array(powerRefSchema).nullable().optional(),
  resistance_refs: z.array(resistanceRefSchema).nullable().optional(),
  attack_potency: rankedStatSchema,
  attack_speed: rankedStatSchema.nullable().optional(),
  combat_speed: rankedStatSchema,
  reaction_speed: rankedStatSchema.nullable().optional(),
  travel_speed: rankedStatSchema.nullable().optional(),
  flight_speed: rankedStatSchema.nullable().optional(),
  lifting_strength: rankedStatSchema,
  striking_strength: rankedStatSchema,
  durability: rankedStatSchema,
  stamina: rankedStatSchema,
  range: rankedStatSchema,
  standard_equipment_ids: optionalSlugListSchema,
  standard_equipment_refs: z.array(equipmentRefSchema).nullable().optional(),
  optional_equipment_ids: optionalSlugListSchema,
  optional_equipment_refs: z.array(equipmentRefSchema).nullable().optional(),
  intelligence: rankedStatSchema,
  attack_ids: optionalSlugListSchema
});

export const characterSchema = z.strictObject({
  name: nonEmptyStringSchema,
  verse_id: slugSchema,
  gender_id: slugSchema,
  age: z.strictObject({
    value: nonnegativeIntegerSchema.nullable().optional(),
    unknown: z.boolean(),
    display: optionalNullableStringSchema
  }),
  classification_ids: slugListSchema,
  sources: z.array(contentSourceSchema).min(1),
  keys: z.array(characterFormSchema).min(1)
});

const namedOptionFields = {
  id: slugSchema,
  name: nonEmptyStringSchema
} as const;

const mediaSchema = z.strictObject(namedOptionFields);

const originSchema = z.strictObject({
  ...namedOptionFields,
  media_id: slugSchema
});

const verseSchema = z.strictObject({
  ...namedOptionFields,
  media_id: slugSchema,
  source_id: slugSchema
});

const classificationSchema = z.strictObject({
  ...namedOptionFields,
  parent_ids: optionalSlugListSchema,
  filterable: optionalBooleanSchema
});

const abilityModifierSchema = z.strictObject({
  ...namedOptionFields,
  display_prefix: optionalDisplayAffixSchema,
  display_suffix: optionalDisplayAffixSchema,
  coverage_rank: positiveIntegerSchema,
  availability: z.enum(["always", "condition_required", "irregular"]).nullable().optional()
});

const statModifierSchema = z.strictObject({
  ...namedOptionFields,
  display_prefix: optionalDisplayAffixSchema,
  display_suffix: optionalDisplayAffixSchema,
  rank: positiveIntegerSchema
});

const degreeSchema = z.strictObject({
  ...namedOptionFields,
  rank: nonnegativeIntegerSchema,
  display_as_power_name: optionalBooleanSchema
});

const resistanceLevelSchema = z.strictObject({
  ...namedOptionFields,
  rank: positiveIntegerSchema,
  bypasses_ability_modifier_coverage: optionalBooleanSchema
});

const rankedTierSchema = z.strictObject({
  ...namedOptionFields,
  tier: optionalNullableStringSchema,
  rank: positiveIntegerSchema,
  comparison_class: z.enum(["transcendent"]).nullable().optional(),
  modifier_behavior: z.enum(["locked_to_normal"]).nullable().optional(),
  description: optionalNullableStringSchema
});

const derivedPowerRequirementSchema = z.strictObject({
  stat: rankedStatNameSchema,
  value: slugSchema,
  modifier: optionalNullableStringSchema,
  comparison: z.enum(["at-least", "at-most", "exact"]).nullable().optional()
});

const derivedPowerRuleSchema = z.strictObject({
  id: slugSchema,
  power_id: slugSchema,
  evaluation_stage: z.enum(["base", "effective"]).nullable().optional(),
  min_matches: positiveIntegerSchema.nullable().optional(),
  requirements: z.array(derivedPowerRequirementSchema).min(1)
});

const powerTypeSchema = z.strictObject({
  id: slugSchema,
  power_id: slugSchema,
  name: nonEmptyStringSchema,
  covers_all: optionalBooleanSchema,
  covers_type_ids: optionalSlugListSchema,
  description: optionalNullableStringSchema,
  rank: positiveIntegerSchema.nullable().optional()
});

const powerVariantSchema = z.strictObject({
  id: slugSchema,
  name: nonEmptyStringSchema,
  display_as_power_name: optionalBooleanSchema,
  inherits_base_grants: optionalBooleanSchema,
  grants: effectGrantsSchema.nullable().optional(),
  effects: z.array(effectSchema).nullable().optional()
});

const powerSchema = z.strictObject({
  ...namedOptionFields,
  aliases: optionalStringListSchema,
  variants: z.array(powerVariantSchema).nullable().optional(),
  tags: optionalStringListSchema,
  placeholder: optionalBooleanSchema,
  type_ids: optionalSlugListSchema,
  degree_ids: optionalSlugListSchema,
  grants: effectGrantsSchema.nullable().optional(),
  effects: z.array(effectSchema).nullable().optional()
});

const resistanceSchema = z.strictObject({
  ...namedOptionFields,
  placeholder: optionalBooleanSchema,
  resists_power_ids: optionalSlugListSchema,
  resists_effect_ids: optionalSlugListSchema,
  resists_weapon_type_ids: optionalSlugListSchema
});

const magicLevelSchema = z.strictObject({
  ...namedOptionFields,
  rank: positiveIntegerSchema,
  inherits_level_ids: optionalSlugListSchema,
  power_refs: z.array(powerRefSchema).nullable().optional(),
  resistance_refs: z.array(resistanceRefSchema).nullable().optional()
});

const magicNatureSchema = z.strictObject({
  ...namedOptionFields,
  aliases: optionalStringListSchema,
  description: optionalNullableStringSchema,
  display: optionalNullableStringSchema,
  applies_to: z.enum(["raw_magic"]).nullable().optional(),
  ownership: z.enum(["effect_payload"]).nullable().optional(),
  inherits_nature_ids: optionalSlugListSchema,
  power_refs: z.array(powerRefSchema).nullable().optional(),
  resistance_refs: z.array(resistanceRefSchema).nullable().optional(),
  effects: z.array(effectSchema).nullable().optional()
});

const battleItemSchema = z.strictObject({
  ...namedOptionFields,
  placeholder: optionalBooleanSchema,
  weapon_type_ids: optionalSlugListSchema,
  required_power_refs: z.array(powerRefSchema).nullable().optional(),
  effects: z.array(effectSchema).nullable().optional()
});

const nonEmptyCatalog = <T extends z.ZodType>(schema: T) => z.array(schema).min(1);

export const catalogSchemas = {
  ability_modifiers: nonEmptyCatalog(abilityModifierSchema),
  acrobatics_degrees: nonEmptyCatalog(degreeSchema),
  attack_durability_tiers: nonEmptyCatalog(rankedTierSchema),
  attacks: nonEmptyCatalog(battleItemSchema),
  classifications: nonEmptyCatalog(classificationSchema),
  derived_power_rules: nonEmptyCatalog(derivedPowerRuleSchema),
  equipment: nonEmptyCatalog(battleItemSchema),
  genders: nonEmptyCatalog(mediaSchema),
  intelligence_tiers: nonEmptyCatalog(rankedTierSchema),
  lifting_strength_tiers: nonEmptyCatalog(rankedTierSchema),
  magic_levels: nonEmptyCatalog(magicLevelSchema),
  magic_natures: nonEmptyCatalog(magicNatureSchema),
  martial_arts_degrees: nonEmptyCatalog(degreeSchema),
  media: nonEmptyCatalog(mediaSchema),
  origins: nonEmptyCatalog(originSchema),
  power_types: nonEmptyCatalog(powerTypeSchema),
  powers: nonEmptyCatalog(powerSchema),
  range_tiers: nonEmptyCatalog(rankedTierSchema),
  resistance_levels: nonEmptyCatalog(resistanceLevelSchema),
  resistances: nonEmptyCatalog(resistanceSchema),
  speed_tiers: nonEmptyCatalog(rankedTierSchema),
  stamina_tiers: nonEmptyCatalog(rankedTierSchema),
  stat_modifiers: nonEmptyCatalog(statModifierSchema),
  striking_strength_tiers: nonEmptyCatalog(rankedTierSchema),
  verses: nonEmptyCatalog(verseSchema)
} as const satisfies Readonly<Record<CatalogName, z.ZodType>>;

type CatalogArraySource = z.infer<(typeof catalogSchemas)[keyof typeof catalogSchemas]>;
export type CatalogEntrySource = CatalogArraySource extends readonly (infer Entry)[] ? Entry : never;
export type RankedStatSource = z.infer<typeof rankedStatSchema>;
export type PowerRefSource = z.infer<typeof powerRefSchema>;
export type ResistanceRefSource = z.infer<typeof resistanceRefSchema>;
export type EquipmentRefSource = z.infer<typeof equipmentRefSchema>;
export type CharacterFormSource = z.infer<typeof characterFormSchema>;
export type CharacterSource = z.infer<typeof characterSchema>;
