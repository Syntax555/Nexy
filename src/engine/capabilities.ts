import type {
  CharacterForm,
  Effect,
  ImageRef,
  PowerRef,
  PowerTargetRef,
  RankedStatInput,
  RankedStatName,
  ResistanceRef
} from "../domain/index.js";
import {
  arrayField,
  booleanField,
  byId,
  numberField,
  objectField,
  optionalStringField,
  stringField,
  type CatalogRecord,
  type GameContext
} from "./context.js";
import { record, type ResolvedCatalogItem } from "./internal.js";
import {
  abilityModifier,
  abilityModifierRank,
  applyStatEffect,
  compositeRank,
  degreeRank,
  formatStat,
  humanizeId,
  magicLevelRank,
  raiseStatModifier,
  resistanceLevelRank,
  statCatalogs
} from "./rank.js";

export type EffectPredicate = (effect: Effect) => boolean;
export type PowerPredicate = (ref: PowerRef) => boolean;
export type ItemPredicate = (item: ResolvedCatalogItem) => boolean;

const includeEveryEffect: EffectPredicate = () => true;
const includeEveryPower: PowerPredicate = () => true;
const includeEveryItem: ItemPredicate = () => true;

function asEffects(value: unknown): readonly Effect[] {
  return Array.isArray(value) ? value as readonly Effect[] : [];
}

function powerRefsField(value: object | null | undefined, field: string): readonly PowerRef[] {
  return arrayField<PowerRef>(value, field).filter((ref) => Boolean(ref?.id));
}

function resistanceRefsField(
  value: object | null | undefined,
  field: string
): readonly ResistanceRef[] {
  return arrayField<ResistanceRef>(value, field).filter((ref) => Boolean(ref?.id));
}

export function idListKey(ids: readonly string[] | null | undefined): string {
  return [...(Array.isArray(ids) ? ids : [])].sort().join(",");
}

export function powerVariant(
  power: CatalogRecord,
  ref: PowerRef
): CatalogRecord | undefined {
  const variantId = optionalStringField(ref, "source_variant");
  return variantId
    ? arrayField<CatalogRecord>(power, "variants").find((variant) => variant.id === variantId)
    : undefined;
}

export function powerRefContext(
  context: GameContext,
  ref: PowerRef
): {
  readonly power?: CatalogRecord;
  readonly variant?: CatalogRecord;
  readonly includeBase: boolean;
} {
  const power = byId(context, "powers", ref.id);
  const variant = power ? powerVariant(power, ref) : undefined;
  return {
    ...(power ? { power } : {}),
    ...(variant ? { variant } : {}),
    includeBase: !variant || Reflect.get(variant, "inherits_base_grants") !== false
  };
}

export function inheritedCatalogEntries(
  context: GameContext,
  ids: readonly string[] | null | undefined,
  catalogName: "magic_levels" | "magic_natures",
  inheritsField: "inherits_level_ids" | "inherits_nature_ids"
): readonly CatalogRecord[] {
  const result: CatalogRecord[] = [];
  const seen = new Set<string>();
  const queue = [...(Array.isArray(ids) ? ids : [])];

  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    if (!id || seen.has(id)) continue;
    const entry = byId(context, catalogName, id);
    if (!entry) continue;

    seen.add(id);
    result.push(entry);
    queue.push(...arrayField<string>(entry, inheritsField));
  }

  return result;
}

export function magicLevelsFromIds(
  context: GameContext,
  ids: readonly string[] | null | undefined
): readonly CatalogRecord[] {
  return inheritedCatalogEntries(context, ids, "magic_levels", "inherits_level_ids");
}

export function magicNaturesFromIds(
  context: GameContext,
  ids: readonly string[] | null | undefined
): readonly CatalogRecord[] {
  return inheritedCatalogEntries(context, ids, "magic_natures", "inherits_nature_ids");
}

function refsFromGrants<T extends PowerRef | ResistanceRef>(
  context: GameContext,
  grants: object | null | undefined,
  directField: "power_refs" | "resistance_refs",
  magicLevelField: "power_refs" | "resistance_refs"
): readonly T[] {
  return [
    ...arrayField<T>(grants, directField),
    ...magicLevelsFromIds(context, arrayField<string>(grants, "magic_level_ids"))
      .flatMap((level) => arrayField<T>(level, magicLevelField))
  ];
}

export function powerRefsFromGrants(
  context: GameContext,
  grants: object | null | undefined
): readonly PowerRef[] {
  return refsFromGrants<PowerRef>(context, grants, "power_refs", "power_refs");
}

export function resistanceRefsFromGrants(
  context: GameContext,
  grants: object | null | undefined
): readonly ResistanceRef[] {
  return refsFromGrants<ResistanceRef>(context, grants, "resistance_refs", "resistance_refs");
}

export function grantedPowerRefsFromEffects(
  context: GameContext,
  effects: readonly Effect[] | null | undefined,
  includeEffect: EffectPredicate = includeEveryEffect
): readonly PowerRef[] {
  return (Array.isArray(effects) ? effects : [])
    .filter(includeEffect)
    .flatMap((effect) => powerRefsFromGrants(context, objectField(effect, "grants")));
}

export function grantedResistanceRefsFromEffects(
  context: GameContext,
  effects: readonly Effect[] | null | undefined,
  includeEffect: EffectPredicate = includeEveryEffect
): readonly ResistanceRef[] {
  return (Array.isArray(effects) ? effects : [])
    .filter(includeEffect)
    .flatMap((effect) => resistanceRefsFromGrants(context, objectField(effect, "grants")));
}

export function powerRefEffects(context: GameContext, ref: PowerRef): readonly Effect[] {
  const { power, variant, includeBase } = powerRefContext(context, ref);
  const magicNatureEffects = magicNaturesFromIds(
    context,
    arrayField<string>(ref, "magic_nature_ids")
  ).flatMap((nature) => asEffects(Reflect.get(nature, "effects")));
  const localEffects = Reflect.get(ref, "effects");

  if (Array.isArray(localEffects)) {
    return [...localEffects as Effect[], ...magicNatureEffects];
  }

  return [
    ...(includeBase ? asEffects(Reflect.get(power ?? {}, "effects")) : []),
    ...asEffects(Reflect.get(variant ?? {}, "effects")),
    ...magicNatureEffects
  ];
}

export function grantedPowerRefsFromPowerRef(
  context: GameContext,
  ref: PowerRef,
  includeEffect: EffectPredicate = includeEveryEffect
): readonly PowerRef[] {
  const { power, variant, includeBase } = powerRefContext(context, ref);
  const magicNatures = magicNaturesFromIds(context, arrayField<string>(ref, "magic_nature_ids"));

  return [
    ...(includeBase
      ? powerRefsFromGrants(context, objectField(power, "grants"))
      : []),
    ...powerRefsFromGrants(context, objectField(variant, "grants")),
    ...magicNatures.flatMap((nature) => powerRefsField(nature, "power_refs")),
    ...grantedPowerRefsFromEffects(context, powerRefEffects(context, ref), includeEffect)
  ];
}

export function grantedResistanceRefsFromPowerRef(
  context: GameContext,
  ref: PowerRef,
  includeEffect: EffectPredicate = includeEveryEffect
): readonly ResistanceRef[] {
  const { power, variant, includeBase } = powerRefContext(context, ref);
  const magicNatures = magicNaturesFromIds(context, arrayField<string>(ref, "magic_nature_ids"));

  return [
    ...(includeBase
      ? resistanceRefsFromGrants(context, objectField(power, "grants"))
      : []),
    ...resistanceRefsFromGrants(context, objectField(variant, "grants")),
    ...magicNatures.flatMap((nature) => resistanceRefsField(nature, "resistance_refs")),
    ...grantedResistanceRefsFromEffects(context, powerRefEffects(context, ref), includeEffect)
  ];
}

export function powerRefKey(ref: PowerRef): string {
  return [
    ref.id,
    optionalStringField(ref, "source_variant") || "",
    idListKey(arrayField<string>(ref, "type_ids")),
    idListKey(arrayField<string>(ref, "magic_nature_ids")),
    optionalStringField(ref, "condition") || ""
  ].join("|");
}

export function resistanceRefKey(ref: ResistanceRef): string {
  return [
    ref.id,
    optionalStringField(ref, "source_variant") || "",
    idListKey(arrayField<string>(ref, "type_ids")),
    idListKey(arrayField<string>(ref, "magic_nature_ids")),
    optionalStringField(ref, "condition") || ""
  ].join("|");
}

function compareRankTuples<T>(
  left: T,
  right: T,
  ranker: (value: T) => readonly number[]
): number {
  const leftRanks = ranker(left);
  const rightRanks = ranker(right);
  const length = Math.max(leftRanks.length, rightRanks.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftRanks[index] ?? 0) - (rightRanks[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function refStrength(context: GameContext, ref: PowerRef): readonly number[] {
  return [
    magicLevelRank(context, ref),
    abilityModifierRank(context, ref),
    degreeRank(context, ref),
    Array.isArray(Reflect.get(ref, "effects"))
      ? (Reflect.get(ref, "effects") as readonly unknown[]).length
      : 0
  ];
}

export function compareRefStrength(
  context: GameContext,
  left: PowerRef,
  right: PowerRef
): number {
  return compareRankTuples(left, right, (ref) => refStrength(context, ref));
}

export function resistanceRefStrength(
  context: GameContext,
  ref: ResistanceRef
): readonly number[] {
  return [
    resistanceLevelRank(context, ref),
    magicLevelRank(context, ref),
    abilityModifierRank(context, ref)
  ];
}

export function compareResistanceRefStrength(
  context: GameContext,
  left: ResistanceRef,
  right: ResistanceRef
): number {
  return compareRankTuples(left, right, (ref) => resistanceRefStrength(context, ref));
}

export function powerTypeCovers(
  context: GameContext,
  ownedTypeId: string | null | undefined,
  requiredTypeId: string | null | undefined,
  seen: Set<string> = new Set()
): boolean {
  if (!requiredTypeId || ownedTypeId === requiredTypeId) return true;
  if (!ownedTypeId || seen.has(ownedTypeId)) return false;

  seen.add(ownedTypeId);
  const ownedType = byId(context, "power_types", ownedTypeId);
  const requiredType = byId(context, "power_types", requiredTypeId);
  if (
    !ownedType
    || !requiredType
    || stringField(ownedType, "power_id") !== stringField(requiredType, "power_id")
  ) {
    return false;
  }
  if (booleanField(ownedType, "covers_all")) return true;

  return arrayField<string>(ownedType, "covers_type_ids").some(
    (coveredId) =>
      coveredId === requiredTypeId
      || powerTypeCovers(context, coveredId, requiredTypeId, seen)
  );
}

export function powerTypesCover(
  context: GameContext,
  ownedTypeIds: readonly string[] | null | undefined,
  requiredTypeIds: readonly string[] | null | undefined
): boolean {
  const required = Array.isArray(requiredTypeIds) ? requiredTypeIds : [];
  if (required.length === 0) return true;
  const owned = Array.isArray(ownedTypeIds) ? ownedTypeIds : [];
  if (owned.length === 0) return false;

  return required.every((requiredId) =>
    owned.some((ownedId) => powerTypeCovers(context, ownedId, requiredId))
  );
}

export function powerTypeRank(context: GameContext, ref?: PowerRef | null): number {
  if (!ref) return 0;
  return Math.max(
    0,
    ...arrayField<string>(ref, "type_ids").map((id) =>
      numberField(byId(context, "power_types", id), "rank")
    )
  );
}

export function powerTargetRefMatches(
  context: GameContext,
  powerRef: PowerRef | null | undefined,
  targetRef: PowerTargetRef | null | undefined
): boolean {
  if (!powerRef || !targetRef || powerRef.id !== targetRef.id) return false;
  const targetVariant = optionalStringField(targetRef, "source_variant");
  if (targetVariant && optionalStringField(powerRef, "source_variant") !== targetVariant) return false;
  if (magicLevelRank(context, powerRef) < magicLevelRank(context, targetRef)) return false;
  return powerTypesCover(
    context,
    arrayField<string>(powerRef, "type_ids"),
    arrayField<string>(targetRef, "type_ids")
  );
}

export function powerRefMeetsRequirement(
  context: GameContext,
  ownedRef: PowerRef | null | undefined,
  requiredRef: PowerRef | null | undefined
): boolean {
  if (!ownedRef || !requiredRef || ownedRef.id !== requiredRef.id) return false;
  const requiredVariant = optionalStringField(requiredRef, "source_variant");
  if (requiredVariant && optionalStringField(ownedRef, "source_variant") !== requiredVariant) return false;
  if (abilityModifierRank(context, ownedRef) < abilityModifierRank(context, requiredRef)) return false;
  if (magicLevelRank(context, ownedRef) < magicLevelRank(context, requiredRef)) return false;
  if (degreeRank(context, ownedRef) < degreeRank(context, requiredRef)) return false;
  return powerTypesCover(
    context,
    arrayField<string>(ownedRef, "type_ids"),
    arrayField<string>(requiredRef, "type_ids")
  );
}

export function powerRefsMeetRequirements(
  context: GameContext,
  ownedRefs: readonly PowerRef[],
  requiredRefs: readonly PowerRef[] | null | undefined
): boolean {
  return (Array.isArray(requiredRefs) ? requiredRefs : []).every((required) =>
    ownedRefs.some((owned) => powerRefMeetsRequirement(context, owned, required))
  );
}

function requirementStat(requirement: object): RankedStatInput {
  return {
    value: stringField(requirement, "value"),
    modifier: optionalStringField(requirement, "modifier") || "normal"
  };
}

function meetsStatRequirement(
  context: GameContext,
  form: CharacterForm,
  requirement: object
): boolean {
  const statName = stringField(requirement, "stat") as RankedStatName;
  const catalogName = statCatalogs[statName];
  if (!catalogName) return false;
  const actual = Reflect.get(form, statName) as RankedStatInput | null | undefined;
  if (!actual) return false;

  const actualRank = compositeRank(context, actual, catalogName);
  const requiredRank = compositeRank(context, requirementStat(requirement), catalogName);
  if (!actualRank || !requiredRank) return false;

  const comparison = stringField(requirement, "comparison");
  if (comparison === "at-most") return actualRank <= requiredRank;
  if (comparison === "exact") return actualRank === requiredRank;
  return actualRank >= requiredRank;
}

export function derivedPowerRefs(
  context: GameContext,
  form: CharacterForm
): readonly PowerRef[] {
  return context.catalogs.derived_power_rules
    .filter((rule) => {
      const requirements = arrayField<object>(rule, "requirements");
      const configuredMinimum = Reflect.get(rule, "min_matches");
      const minimum = Number.isInteger(configuredMinimum)
        ? Number(configuredMinimum)
        : requirements.length;
      return requirements.filter((requirement) =>
        meetsStatRequirement(context, form, requirement)
      ).length >= minimum;
    })
    .map((rule) => ({
      id: stringField(rule, "power_id"),
      modifier: "normal",
      type_ids: [],
      derived: true,
      derived_rule_id: rule.id
    } as PowerRef));
}

export function itemRefs(
  ids: readonly string[] | null | undefined,
  refs: readonly Readonly<Record<string, unknown>>[] | null | undefined
): readonly Readonly<Record<string, unknown>>[] {
  return [
    ...(Array.isArray(ids) ? ids.map((id) => ({ id })) : []),
    ...(Array.isArray(refs) ? refs : [])
  ].filter((ref) => Boolean(optionalStringField(ref, "id")));
}

export function catalogItemFromRef(
  context: GameContext,
  ref: Readonly<Record<string, unknown>>,
  catalogName: "equipment" | "attacks"
): ResolvedCatalogItem | undefined {
  const item = byId(context, catalogName, optionalStringField(ref, "id"));
  if (!item) return undefined;

  const localEffects = Reflect.get(ref, "effects");
  return {
    ...item,
    effects: Array.isArray(localEffects)
      ? localEffects as readonly Effect[]
      : asEffects(Reflect.get(item, "effects")),
    ref
  };
}

export function catalogItemsFromRefs(
  context: GameContext,
  refs: readonly Readonly<Record<string, unknown>>[],
  catalogName: "equipment" | "attacks"
): readonly ResolvedCatalogItem[] {
  return refs
    .map((ref) => catalogItemFromRef(context, ref, catalogName))
    .filter((item): item is ResolvedCatalogItem => Boolean(item));
}

export function usableItems(
  context: GameContext,
  ids: readonly string[] | null | undefined,
  refs: readonly Readonly<Record<string, unknown>>[] | null | undefined,
  catalogName: "equipment" | "attacks",
  ownedPowerRefs: readonly PowerRef[],
  includeItem: ItemPredicate = includeEveryItem
): readonly ResolvedCatalogItem[] {
  return catalogItemsFromRefs(context, itemRefs(ids, refs), catalogName)
    .filter((item) =>
      powerRefsMeetRequirements(
        context,
        ownedPowerRefs,
        arrayField<PowerRef>(item, "required_power_refs")
      )
    )
    .filter(includeItem);
}

export function activeItemEffectsForPowerRefs(
  context: GameContext,
  form: CharacterForm,
  ownedPowerRefs: readonly PowerRef[],
  includeItem: ItemPredicate = includeEveryItem
): readonly Effect[] {
  const standardEquipmentIds = arrayField<string>(form, "standard_equipment_ids");
  const standardEquipmentRefs = arrayField<Readonly<Record<string, unknown>>>(
    form,
    "standard_equipment_refs"
  );
  const attackIds = arrayField<string>(form, "attack_ids");
  return [
    ...usableItems(
      context,
      standardEquipmentIds,
      standardEquipmentRefs,
      "equipment",
      ownedPowerRefs,
      includeItem
    ),
    ...usableItems(context, attackIds, [], "attacks", ownedPowerRefs, includeItem)
  ].flatMap((item) => item.effects ?? []);
}

export function powerRefs(
  context: GameContext,
  form: CharacterForm,
  itemEffects: readonly Effect[] = [],
  includeRef: PowerPredicate = includeEveryPower,
  includeEffect: EffectPredicate = includeEveryEffect
): readonly PowerRef[] {
  const refs: PowerRef[] = [];
  const indexes = new Map<string, number>();
  const queue: PowerRef[] = [
    ...arrayField<PowerRef>(form, "power_refs"),
    ...derivedPowerRefs(context, form),
    ...grantedPowerRefsFromEffects(context, itemEffects, includeEffect)
  ];

  for (let index = 0; index < queue.length; index += 1) {
    const ref = queue[index];
    if (!ref?.id || !includeRef(ref)) continue;

    const key = powerRefKey(ref);
    const existingIndex = indexes.get(key);
    if (existingIndex !== undefined) {
      const existing = refs[existingIndex];
      if (!existing || compareRefStrength(context, ref, existing) <= 0) continue;
      refs[existingIndex] = ref;
    } else {
      indexes.set(key, refs.length);
      refs.push(ref);
    }
    queue.push(...grantedPowerRefsFromPowerRef(context, ref, includeEffect));
  }

  return refs;
}

export function activeItemEffects(
  context: GameContext,
  form: CharacterForm
): readonly Effect[] {
  return activeItemEffectsForPowerRefs(context, form, powerRefs(context, form));
}

export function resistanceRefs(
  context: GameContext,
  form: CharacterForm,
  resolvedPowerRefs: readonly PowerRef[] = powerRefs(context, form),
  itemEffects: readonly Effect[] = activeItemEffects(context, form),
  includeEffect: EffectPredicate = includeEveryEffect
): readonly ResistanceRef[] {
  const resolved: ResistanceRef[] = [];
  const indexes = new Map<string, number>();
  const queue: ResistanceRef[] = [
    ...arrayField<ResistanceRef>(form, "resistance_refs"),
    ...grantedResistanceRefsFromEffects(context, itemEffects, includeEffect),
    ...resolvedPowerRefs.flatMap((ref) =>
      grantedResistanceRefsFromPowerRef(context, ref, includeEffect)
    )
  ];

  for (let index = 0; index < queue.length; index += 1) {
    const ref = queue[index];
    if (!ref?.id) continue;

    const key = resistanceRefKey(ref);
    const existingIndex = indexes.get(key);
    if (existingIndex !== undefined) {
      const existing = resolved[existingIndex];
      if (!existing || compareResistanceRefStrength(context, ref, existing) <= 0) continue;
      resolved[existingIndex] = ref;
    } else {
      indexes.set(key, resolved.length);
      resolved.push(ref);
    }
  }

  return resolved;
}

export function activeEffects(
  context: GameContext,
  form: CharacterForm,
  refs: readonly PowerRef[] = powerRefs(context, form),
  itemEffects: readonly Effect[] = activeItemEffects(context, form),
  includeEffect: EffectPredicate = includeEveryEffect
): readonly Effect[] {
  return [
    ...itemEffects,
    ...refs.flatMap((ref) => powerRefEffects(context, ref))
  ].filter(includeEffect);
}

export function effectiveForm(
  context: GameContext,
  form: CharacterForm,
  refs: readonly PowerRef[] = powerRefs(context, form),
  itemEffects: readonly Effect[] = activeItemEffects(context, form),
  effects: readonly Effect[] = activeEffects(context, form, refs, itemEffects)
): CharacterForm {
  const result = { ...form };

  effects.forEach((effect) => {
    const statEffects = objectField(effect, "stat_effects");
    Object.entries(statEffects ?? {}).forEach(([name, stat]) => {
      const statName = name as RankedStatName;
      Reflect.set(
        result,
        statName,
        applyStatEffect(
          context,
          Reflect.get(result, statName) as RankedStatInput | null | undefined,
          statName,
          stat as RankedStatInput
        )
      );
    });

    arrayField<object>(effect, "stat_modifier_floor_effects").forEach((floor) => {
      const statName = stringField(floor, "stat") as RankedStatName;
      const catalogName = statCatalogs[statName];
      const floorModifier = stringField(floor, "modifier");
      if (!catalogName || !floorModifier) return;
      Reflect.set(
        result,
        statName,
        raiseStatModifier(
          context,
          Reflect.get(result, statName) as RankedStatInput | null | undefined,
          floorModifier,
          catalogName
        )
      );
    });
  });

  if (!refs.some((ref) => ref.id === "flight")) Reflect.set(result, "flight_speed", null);
  return result;
}

export function activeImage(
  form: CharacterForm,
  effects: readonly Effect[]
): ImageRef | undefined {
  const baseImage = arrayField<ImageRef>(form, "images")[0];
  const updates = effects
    .map((effect, sourceIndex) => ({
      ...record(objectField(effect, "image_update")),
      sourceIndex
    }))
    .filter((image) => optionalStringField(image, "image"));
  if (updates.length === 0) return baseImage;

  const winner = updates.reduce((current, image) => {
    const currentPriorityValue = Reflect.get(current, "priority");
    const imagePriorityValue = Reflect.get(image, "priority");
    const currentPriority = Number.isInteger(currentPriorityValue)
      ? Number(currentPriorityValue)
      : 0;
    const imagePriority = Number.isInteger(imagePriorityValue)
      ? Number(imagePriorityValue)
      : 0;
    if (imagePriority > currentPriority) return image;
    if (
      imagePriority === currentPriority
      && numberField(image, "sourceIndex") > numberField(current, "sourceIndex")
    ) {
      return image;
    }
    return current;
  });

  return {
    name: optionalStringField(winner, "name") || baseImage?.name || "",
    image: stringField(winner, "image")
  };
}

export function formatAbilityLabel(
  context: GameContext,
  label: string,
  ref: PowerRef | ResistanceRef
): string {
  const resolved = abilityModifier(context, ref);
  if (!resolved || resolved.id === "normal") return label;
  const displayPrefix = optionalStringField(resolved, "display_prefix");
  const prefix = displayPrefix ? `${displayPrefix} ` : "";
  return `${prefix}${label}${optionalStringField(resolved, "display_suffix") || ""}`;
}

export function powerTargetRefLabel(
  context: GameContext,
  ref: PowerTargetRef
): string {
  const power = byId(context, "powers", ref.id);
  const label = power ? stringField(power, "name") : humanizeId(ref.id);
  const typeNames = arrayField<string>(ref, "type_ids")
    .map((id) => stringField(byId(context, "power_types", id), "name"))
    .filter(Boolean);
  const baseLabel = typeNames.length ? `${label}: ${typeNames.join(", ")}` : label;
  const scope: string[] = [];
  const variantId = optionalStringField(ref, "source_variant");
  if (variantId) {
    const variant = power
      ? arrayField<CatalogRecord>(power, "variants")
          .find((entry) => entry.id === variantId)
      : undefined;
    scope.push(`Variant: ${stringField(variant, "name") || humanizeId(variantId)}`);
  }
  const magicLevelId = optionalStringField(ref, "magic_level_id");
  if (magicLevelId) {
    const magicLevel = byId(context, "magic_levels", magicLevelId);
    scope.push(
      `Magic level: ${stringField(magicLevel, "name") || humanizeId(magicLevelId)}`
    );
  }
  return scope.length ? `${baseLabel} (${scope.join("; ")})` : baseLabel;
}

function absorptionTargetName(context: GameContext, ref: PowerRef): string {
  const targets = powerRefEffects(context, ref)
    .flatMap((effect) =>
      arrayField<PowerTargetRef>(
        objectField(effect, "absorption"),
        "target_power_refs"
      )
    )
    .map((target) => powerTargetRefLabel(context, target));
  return targets.length === 1 ? (targets[0] ?? "").replace(/ Manipulation$/i, "") : "";
}

export function powerRefLabel(context: GameContext, ref: PowerRef): string {
  const power = byId(context, "powers", ref.id);
  if (!power) return humanizeId(ref.id);

  const martialDegree = byId(
    context,
    "martial_arts_degrees",
    optionalStringField(ref, "martial_arts_degree_id")
  );
  const acrobaticsDegree = byId(
    context,
    "acrobatics_degrees",
    optionalStringField(ref, "acrobatics_degree_id")
  );
  if (martialDegree) {
    return formatAbilityLabel(context, stringField(martialDegree, "name"), ref);
  }
  if (acrobaticsDegree) {
    return formatAbilityLabel(context, stringField(acrobaticsDegree, "name"), ref);
  }
  if (power.id === "absorption") {
    const target = absorptionTargetName(context, ref);
    if (target) return formatAbilityLabel(context, `${target} Absorption`, ref);
  }

  const variant = powerVariant(power, ref);
  if (variant && booleanField(variant, "display_as_power_name")) {
    return formatAbilityLabel(context, stringField(variant, "name"), ref);
  }
  const typeNames = arrayField<string>(ref, "type_ids")
    .map((id) => stringField(byId(context, "power_types", id), "name"))
    .filter(Boolean);
  const base = stringField(power, "name");
  const label = typeNames.length ? `${base}: ${typeNames.join(", ")}` : base;
  return formatAbilityLabel(context, label, ref);
}

export function resistanceRefLabel(context: GameContext, ref: ResistanceRef): string {
  const resistance = byId(context, "resistances", ref.id);
  const label = resistance ? stringField(resistance, "name") : humanizeId(ref.id);
  const level = byId(
    context,
    "resistance_levels",
    optionalStringField(ref, "level") || "resistant"
  );
  const levelLabel = level?.id === "immunity" ? `Immunity to ${label}` : label;
  return formatAbilityLabel(context, levelLabel, ref);
}

export function formatStatRequirement(
  context: GameContext,
  requirement: object
): string {
  const statName = stringField(requirement, "stat") as RankedStatName;
  const catalogName = statCatalogs[statName];
  const value = catalogName
    ? formatStat(context, requirementStat(requirement), catalogName)
    : "";
  if (!value) return "";
  const label = humanizeId(statName);
  const comparison = stringField(requirement, "comparison");
  if (comparison === "at-most") return `${label}: At most ${value}`;
  if (comparison === "exact") return `${label}: Exactly ${value}`;
  return `${label}: ${value}`;
}
