import type {
  Effect,
  PowerRef,
  PowerTargetRef,
  RankedStatInput,
  ResistanceRef
} from "../domain/index.js";
import {
  activeEffects,
  activeItemEffectsForPowerRefs,
  effectiveForm,
  powerRefEffects,
  powerRefKey,
  powerRefLabel,
  powerRefMeetsRequirement,
  powerRefs,
  powerRefsMeetRequirements,
  powerTargetRefMatches,
  powerTypeCovers,
  powerTypeRank,
  powerTypesCover,
  resistanceRefKey,
  resistanceRefLabel,
  resistanceRefs,
  type ItemPredicate
} from "./capabilities.js";
import {
  arrayField,
  booleanField,
  byId,
  objectField,
  optionalStringField,
  type GameContext
} from "./context.js";
import {
  status,
  type CapabilityIdentity,
  type CapabilityItem,
  type EngineStatus,
  type EngineView,
  type ResolvedCatalogItem
} from "./internal.js";
import {
  abilityModifierRank,
  magicLevelRank,
  normalizeStat,
  resistanceLevelRank,
  statsForForm
} from "./rank.js";

function identity(kind: CapabilityIdentity["kind"], id: string): CapabilityIdentity {
  return { kind, id };
}

export function effectNullifiesPower(
  context: GameContext,
  effect: Effect,
  ref: PowerRef
): boolean {
  const nullification = objectField(effect, "power_nullification");
  if (!nullification) return false;

  const targetIds = arrayField<string>(nullification, "target_power_ids");
  const targetRefs = arrayField<PowerTargetRef>(
    nullification,
    "target_power_refs"
  );
  const hasTargets = targetIds.length > 0 || targetRefs.length > 0;
  const targetMatches = hasTargets
    ? targetIds.includes(ref.id)
      || targetRefs.some((target) => powerTargetRefMatches(context, ref, target))
    : true;
  const maximumModifier = byId(
    context,
    "ability_modifiers",
    optionalStringField(nullification, "max_target_modifier")
  );
  const modifierMatches = !maximumModifier
    || abilityModifierRank(context, ref) <= Number(Reflect.get(maximumModifier, "coverage_rank") || 0);
  const maximumTypeRank = Number(Reflect.get(nullification, "max_target_type_rank"));
  const typeMatches = !Number.isFinite(maximumTypeRank)
    || powerTypeRank(context, ref) <= maximumTypeRank;
  return targetMatches && modifierMatches && typeMatches;
}

export function effectAbsorbsPower(
  context: GameContext,
  effect: Effect,
  ref: PowerRef,
  sourceRef?: PowerRef
): boolean {
  const absorption = objectField(effect, "absorption");
  if (!absorption) return false;
  return arrayField<PowerTargetRef>(absorption, "target_power_refs")
    .some((target) => powerTargetRefMatches(context, ref, target))
    && abilityModifierRank(context, sourceRef) >= abilityModifierRank(context, ref);
}

function effectPowerBlockStatus(
  context: GameContext,
  effect: Effect,
  ref: PowerRef,
  sourceRef?: PowerRef
): EngineStatus | undefined {
  if (effectNullifiesPower(context, effect, ref)) return status("nullified");
  if (effectAbsorbsPower(context, effect, ref, sourceRef)) return status("absorbed");
  return undefined;
}

export function effectNegatesResistance(
  context: GameContext,
  effect: Effect,
  ref: ResistanceRef
): boolean {
  const negation = objectField(effect, "resistance_negation");
  if (!negation) return false;
  const level = byId(
    context,
    "resistance_levels",
    optionalStringField(ref, "level") || "resistant"
  );
  const targets = arrayField<string>(negation, "target_resistance_ids");
  const immunityTargets = arrayField<string>(negation, "target_immunity_ids");
  if (level?.id === "immunity") return immunityTargets.includes(ref.id);
  return targets.length === 0 || targets.includes(ref.id);
}

export function powerNullifiedBy(
  context: GameContext,
  ref: PowerRef,
  opponent: EngineView
): EngineStatus | undefined {
  const nullifyingPower = opponent.powerRefs.find((opponentRef) =>
    powerRefEffects(context, opponentRef)
      .some((effect) => effectPowerBlockStatus(context, effect, ref, opponentRef))
  );

  if (nullifyingPower) {
    const block = powerRefEffects(context, nullifyingPower)
      .map((effect) => effectPowerBlockStatus(context, effect, ref, nullifyingPower))
      .find((candidate) => candidate);
    const code = block?.code || "nullified";
    const verb = code === "absorbed" ? "absorbs" : "blocks";
    return status(
      code,
      `${powerRefLabel(context, nullifyingPower)} ${verb} this power`,
      identity("power", nullifyingPower.id)
    );
  }

  const itemBlock = opponent.itemEffects
    .map((effect) => effectPowerBlockStatus(context, effect, ref))
    .find((candidate) => candidate);
  if (itemBlock) {
    const verb = itemBlock.code === "absorbed" ? "absorbs" : "targets";
    return status(
      itemBlock.code,
      `Opponent equipment or attack ${verb} this power`
    );
  }
  return undefined;
}

export function resistanceNegatedBy(
  context: GameContext,
  ref: ResistanceRef,
  opponent: EngineView
): EngineStatus | undefined {
  const negatingPower = opponent.powerRefs.find((opponentRef) =>
    powerRefEffects(context, opponentRef)
      .some((effect) => effectNegatesResistance(context, effect, ref))
  );
  if (negatingPower) {
    return status(
      "negated",
      `${powerRefLabel(context, negatingPower)} targets this resistance`,
      identity("power", negatingPower.id)
    );
  }
  if (opponent.itemEffects.some((effect) => effectNegatesResistance(context, effect, ref))) {
    return status("negated", "Opponent equipment or attack targets this resistance");
  }
  return undefined;
}

function effectiveResistanceRefsFor(
  context: GameContext,
  view: EngineView,
  opponent: EngineView
): readonly ResistanceRef[] {
  return view.resistanceRefs.filter((ref) => !resistanceNegatedBy(context, ref, opponent));
}

export function resistanceBlocksWeaponType(
  context: GameContext,
  weaponTypeId: string,
  resistanceRef: ResistanceRef
): boolean {
  const resistance = byId(context, "resistances", resistanceRef.id);
  return arrayField<string>(resistance, "resists_weapon_type_ids")
    .some((resistedTypeId) => powerTypeCovers(context, resistedTypeId, weaponTypeId));
}

export function weaponItemResistedBy(
  context: GameContext,
  item: ResolvedCatalogItem,
  owner: EngineView,
  opponent: EngineView
): EngineStatus | undefined {
  const weaponTypeIds = arrayField<string>(item, "weapon_type_ids");
  if (weaponTypeIds.length === 0) return undefined;
  const resistingRef = effectiveResistanceRefsFor(context, opponent, owner)
    .find((ref) =>
      weaponTypeIds.some((typeId) => resistanceBlocksWeaponType(context, typeId, ref))
    );
  return resistingRef
    ? status(
        "resisted",
        `${resistanceRefLabel(context, resistingRef)} blocks this weapon`,
        identity("resistance", resistingRef.id)
      )
    : undefined;
}

export function resistanceBlocksPower(
  context: GameContext,
  powerRef: PowerRef,
  resistanceRef: ResistanceRef
): boolean {
  const resistance = byId(context, "resistances", resistanceRef.id);
  if (!arrayField<string>(resistance, "resists_power_ids").includes(powerRef.id)) return false;
  const resistanceVariant = optionalStringField(resistanceRef, "source_variant");
  if (
    resistanceVariant
    && optionalStringField(powerRef, "source_variant") !== resistanceVariant
  ) {
    return false;
  }
  if (magicLevelRank(context, resistanceRef) < magicLevelRank(context, powerRef)) return false;

  const resistanceTypes = arrayField<string>(resistanceRef, "type_ids");
  const powerTypes = arrayField<string>(powerRef, "type_ids");
  if (resistanceTypes.length > 0) {
    if (powerTypes.length === 0) {
      const coversAll = resistanceTypes.some((id) =>
        booleanField(byId(context, "power_types", id), "covers_all")
      );
      if (!coversAll) return false;
    } else if (!powerTypesCover(context, resistanceTypes, powerTypes)) {
      return false;
    }
  }

  const level = byId(
    context,
    "resistance_levels",
    optionalStringField(resistanceRef, "level") || "resistant"
  );
  return level?.id === "immunity"
    || abilityModifierRank(context, resistanceRef) >= abilityModifierRank(context, powerRef);
}

export function resistanceRefMeetsRequirement(
  context: GameContext,
  ownedRef: ResistanceRef,
  requiredRef: ResistanceRef
): boolean {
  if (ownedRef.id !== requiredRef.id) return false;
  const requiredVariant = optionalStringField(requiredRef, "source_variant");
  if (
    requiredVariant
    && optionalStringField(ownedRef, "source_variant") !== requiredVariant
  ) {
    return false;
  }
  if (resistanceLevelRank(context, ownedRef) < resistanceLevelRank(context, requiredRef)) {
    return false;
  }
  if (abilityModifierRank(context, ownedRef) < abilityModifierRank(context, requiredRef)) {
    return false;
  }
  if (magicLevelRank(context, ownedRef) < magicLevelRank(context, requiredRef)) return false;
  return powerTypesCover(
    context,
    arrayField<string>(ownedRef, "type_ids"),
    arrayField<string>(requiredRef, "type_ids")
  );
}

export function powerResistedBy(
  context: GameContext,
  ref: PowerRef,
  owner: EngineView,
  opponent: EngineView
): EngineStatus | undefined {
  const resistingRef = effectiveResistanceRefsFor(context, opponent, owner)
    .find((candidate) => resistanceBlocksPower(context, ref, candidate));
  return resistingRef
    ? status(
        "resisted",
        `${resistanceRefLabel(context, resistingRef)} blocks this power`,
        identity("resistance", resistingRef.id)
      )
    : undefined;
}

export function effectBlockedBy(
  context: GameContext,
  effect: Effect,
  owner: EngineView,
  opponent: EngineView
): EngineStatus | undefined {
  const rules = objectField(effect, "nullified_by");
  if (!rules) return undefined;

  const blockingResistance = effectiveResistanceRefsFor(context, opponent, owner)
    .find((opponentRef) =>
      arrayField<ResistanceRef>(rules, "resistance_refs")
        .some((requiredRef) =>
          resistanceRefMeetsRequirement(context, opponentRef, requiredRef)
        )
    );
  if (blockingResistance) {
    return status(
      "resisted",
      `${resistanceRefLabel(context, blockingResistance)} stops this effect`,
      identity("resistance", blockingResistance.id)
    );
  }

  const blockingPower = opponent.powerRefs.find((opponentRef) =>
    arrayField<PowerRef>(rules, "power_refs")
      .some((requiredRef) =>
        powerRefMeetsRequirement(context, opponentRef, requiredRef)
      )
  );
  if (blockingPower) {
    return status(
      "nullified",
      `${powerRefLabel(context, blockingPower)} stops this effect`,
      identity("power", blockingPower.id)
    );
  }
  return undefined;
}

function powerEffectsBlockedBy(
  context: GameContext,
  ref: PowerRef,
  owner: EngineView,
  opponent: EngineView
): EngineStatus | undefined {
  const effects = powerRefEffects(context, ref);
  const blocked = effects
    .map((effect) => effectBlockedBy(context, effect, owner, opponent))
    .filter((candidate): candidate is EngineStatus => Boolean(candidate));
  return effects.length > 0 && blocked.length === effects.length ? blocked[0] : undefined;
}

function itemStatusForPowerRefs(
  context: GameContext,
  item: ResolvedCatalogItem,
  ownedPowers: readonly PowerRef[],
  detail?: string
): EngineStatus | undefined {
  const required = arrayField<PowerRef>(item, "required_power_refs");
  if (required.length === 0 || powerRefsMeetRequirements(context, ownedPowers, required)) {
    return undefined;
  }
  return status(
    "disabled",
    detail || `Missing ${required.map((ref) => powerRefLabel(context, ref)).join(", ")}`
  );
}

function hasMatchingPowerRef(ref: PowerRef, refs: readonly PowerRef[]): boolean {
  const key = powerRefKey(ref);
  return refs.some((candidate) => powerRefKey(candidate) === key);
}

function hasMatchingResistanceRef(
  ref: ResistanceRef,
  refs: readonly ResistanceRef[]
): boolean {
  const key = resistanceRefKey(ref);
  return refs.some((candidate) => resistanceRefKey(candidate) === key);
}

export function battleCapabilityStatus(
  context: GameContext,
  item: CapabilityItem,
  owner: EngineView,
  opponent: EngineView,
  ownerBattleView: EngineView = owner,
  opponentBattleView: EngineView = opponent
): EngineStatus {
  if (item.status?.code === "disabled") return item.status;

  if (item.kind === "power" && item.ref) {
    const ref = item.ref as PowerRef;
    return powerNullifiedBy(context, ref, opponent)
      ?? powerResistedBy(context, ref, ownerBattleView, opponentBattleView)
      ?? powerEffectsBlockedBy(context, ref, ownerBattleView, opponentBattleView)
      ?? (
        hasMatchingPowerRef(ref, ownerBattleView.powerRefs)
          ? undefined
          : status("disabled", "Source power is inactive in this battle")
      )
      ?? status("active");
  }

  if (item.kind === "resistance" && item.ref) {
    const ref = item.ref as ResistanceRef;
    return resistanceNegatedBy(context, ref, opponentBattleView)
      ?? (
        hasMatchingResistanceRef(ref, ownerBattleView.resistanceRefs)
          ? undefined
          : status("disabled", "Source power is inactive in this battle")
      )
      ?? status("active");
  }

  if (
    (item.kind === "equipment" || item.kind === "attack")
    && item.catalogItem
  ) {
    return weaponItemResistedBy(
      context,
      item.catalogItem,
      ownerBattleView,
      opponentBattleView
    )
      ?? itemStatusForPowerRefs(
        context,
        item.catalogItem,
        ownerBattleView.powerRefs,
        "Required power is inactive in this battle"
      )
      ?? item.status
      ?? status("active");
  }

  return item.status ?? status("active");
}

export function withBattleStatuses(
  context: GameContext,
  base: EngineView,
  opponentBase: EngineView,
  battleView: EngineView,
  opponentBattleView: EngineView = opponentBase
): EngineView {
  return {
    ...battleView,
    sections: base.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({
        ...item,
        status: battleCapabilityStatus(
          context,
          item,
          base,
          opponentBase,
          battleView,
          opponentBattleView
        )
      }))
    }))
  };
}

export function powerBlockedInBattle(
  context: GameContext,
  ref: PowerRef,
  owner: EngineView,
  opponent: EngineView
): EngineStatus | undefined {
  return powerNullifiedBy(context, ref, opponent)
    ?? powerResistedBy(context, ref, owner, opponent);
}

function nonResistibleStatEffect(effect: Effect): Effect | undefined {
  const statEffects = Object.fromEntries(
    Object.entries(objectField(effect, "stat_effects") ?? {})
      .filter(([, stat]) => normalizeStat(stat as RankedStatInput)?.resistible === false)
  );
  return Object.keys(statEffects).length > 0
    ? { stat_effects: statEffects }
    : undefined;
}

export function battleEffectiveView(
  context: GameContext,
  view: EngineView,
  opponent: EngineView,
  ownerState: EngineView = view
): EngineView {
  const includeEffect = (effect: Effect) =>
    !effectBlockedBy(context, effect, ownerState, opponent);
  const includeItem: ItemPredicate = (item) =>
    !weaponItemResistedBy(context, item, ownerState, opponent);
  const requirementPowerRefs = powerRefs(
    context,
    view.key,
    [],
    (ref) => !powerBlockedInBattle(context, ref, ownerState, opponent),
    includeEffect
  );
  const itemEffects = activeItemEffectsForPowerRefs(
    context,
    view.key,
    requirementPowerRefs,
    includeItem
  );
  const resolvedPowerRefs = powerRefs(
    context,
    view.key,
    itemEffects,
    (ref) => !powerBlockedInBattle(context, ref, ownerState, opponent),
    includeEffect
  );
  const nonResistibleEffects = view.powerRefs
    .filter((ref) =>
      !powerNullifiedBy(context, ref, opponent)
      && Boolean(powerResistedBy(context, ref, ownerState, opponent))
    )
    .flatMap((ref) => powerRefEffects(context, ref))
    .filter(includeEffect)
    .map(nonResistibleStatEffect)
    .filter((effect): effect is Effect => Boolean(effect));
  const effects = [
    ...activeEffects(context, view.key, resolvedPowerRefs, itemEffects, includeEffect),
    ...nonResistibleEffects
  ];
  const effectiveKey = effectiveForm(
    context,
    view.key,
    resolvedPowerRefs,
    itemEffects,
    effects
  );
  return {
    ...view,
    effectiveKey,
    powerRefs: resolvedPowerRefs,
    resistanceRefs: resistanceRefs(
      context,
      view.key,
      resolvedPowerRefs,
      itemEffects,
      includeEffect
    ),
    itemEffects,
    effects,
    stats: statsForForm(context, effectiveKey)
  };
}
