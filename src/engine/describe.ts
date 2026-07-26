import type {
  CharacterForm,
  Effect,
  PowerRef,
  PowerTargetRef,
  RankedStatInput,
  RankedStatName,
  ResistanceRef
} from "../domain/index.js";
import {
  formatStatRequirement,
  powerRefEffects,
  powerRefLabel,
  powerTargetRefLabel,
  powerVariant,
  resistanceRefLabel
} from "./capabilities.js";
import {
  arrayField,
  booleanField,
  byId,
  numberField,
  objectField,
  optionalStringField,
  stringField,
  type CatalogName,
  type CatalogRecord,
  type GameContext
} from "./context.js";
import type { ResolvedCatalogItem } from "./internal.js";
import {
  compositeRank,
  formatStat,
  humanizeId,
  joinText,
  modifier,
  normalizeStat,
  statCatalogs
} from "./rank.js";

const statLabels: Readonly<Record<RankedStatName, string>> = {
  attack_potency: "Attack Potency",
  attack_speed: "Attack Speed",
  combat_speed: "Speed",
  reaction_speed: "Reaction Speed",
  travel_speed: "Travel Speed",
  flight_speed: "Flight Speed",
  lifting_strength: "Lifting Strength",
  striking_strength: "Striking Strength",
  durability: "Durability",
  stamina: "Stamina",
  range: "Range",
  intelligence: "Intelligence"
};

function catalogNames(
  context: GameContext,
  ids: readonly string[] | null | undefined,
  catalogName: CatalogName
): readonly string[] {
  return (Array.isArray(ids) ? ids : [])
    .map((id) => stringField(byId(context, catalogName, id), "name"))
    .filter(Boolean);
}

function grantDetails(
  context: GameContext,
  grants: object | null | undefined
): readonly string[] {
  const lines: string[] = [];
  const powers = arrayField<PowerRef>(grants, "power_refs")
    .map((ref) => powerRefLabel(context, ref));
  const resistances = arrayField<ResistanceRef>(grants, "resistance_refs")
    .map((ref) => resistanceRefLabel(context, ref));
  const magicLevels = catalogNames(
    context,
    arrayField<string>(grants, "magic_level_ids"),
    "magic_levels"
  );
  if (powers.length) lines.push(`Grants: ${joinText(powers)}`);
  if (resistances.length) lines.push(`Grants resistances: ${joinText(resistances)}`);
  if (magicLevels.length) lines.push(`Grants magic: ${joinText(magicLevels)}`);
  return lines;
}

function typeDetails(
  context: GameContext,
  typeIds: readonly string[] | null | undefined,
  label = "Types"
): readonly string[] {
  const types = (Array.isArray(typeIds) ? typeIds : [])
    .map((id) => byId(context, "power_types", id))
    .filter((entry): entry is CatalogRecord => Boolean(entry));
  const names = types.map((type) => stringField(type, "name"));
  return [
    ...(names.length ? [`${label}: ${joinText(names)}`] : []),
    ...types.flatMap((type) => {
      const description = optionalStringField(type, "description");
      return description ? [`${stringField(type, "name")}: ${description}`] : [];
    })
  ];
}

function refScopeDetails(
  context: GameContext,
  ref: PowerRef | ResistanceRef,
  variant?: CatalogRecord
): readonly string[] {
  const lines: string[] = [];
  const magicLevel = byId(
    context,
    "magic_levels",
    optionalStringField(ref, "magic_level_id")
  );
  const magicNatures = catalogNames(
    context,
    arrayField<string>(ref, "magic_nature_ids"),
    "magic_natures"
  );
  if (magicLevel) lines.push(`Magic level: ${stringField(magicLevel, "name")}`);
  if (magicNatures.length) lines.push(`Magic nature: ${joinText(magicNatures)}`);
  const sourceVariant = optionalStringField(ref, "source_variant");
  if (variant || sourceVariant) {
    lines.push(`Variant: ${variant ? stringField(variant, "name") : humanizeId(sourceVariant || "")}`);
  }
  const condition = optionalStringField(ref, "condition");
  if (condition) lines.push(`Condition: ${condition}`);
  return lines;
}

function powerTargetTypeLimit(
  context: GameContext,
  nullification: object,
  targetRefs: readonly PowerTargetRef[]
): string {
  const maximum = Number(Reflect.get(nullification, "max_target_type_rank"));
  if (!Number.isFinite(maximum)) return "";
  const targetId = [
    ...arrayField<string>(nullification, "target_power_ids"),
    ...targetRefs.map((ref) => ref.id)
  ].find(Boolean);
  const matching = context.catalogs.power_types
    .filter((type) =>
      Reflect.get(type, "power_id") === targetId
      && numberField(type, "rank") <= maximum
    )
    .sort((left, right) => numberField(right, "rank") - numberField(left, "rank"))[0];
  return matching ? ` up to ${stringField(matching, "name")}` : ` up to type rank ${maximum}`;
}

export function describeEffect(
  context: GameContext,
  effect: Effect,
  form?: CharacterForm
): readonly string[] {
  const lines: string[] = [];
  Object.entries(objectField(effect, "stat_effects") ?? {}).forEach(([field, value]) => {
    const statName = field as RankedStatName;
    const catalogName = statCatalogs[statName];
    if (!catalogName) return;
    const stat = value as RankedStatInput;
    const display = formatStat(context, stat, catalogName);
    if (!display) return;
    const resistanceNote = normalizeStat(stat)?.resistible === false
      ? " (ignores resistance)"
      : "";
    if (form) {
      const current = Reflect.get(form, statName) as RankedStatInput | undefined;
      const currentRank = compositeRank(context, current, catalogName);
      const effectRank = compositeRank(context, stat, catalogName);
      const currentDisplay = formatStat(context, current, catalogName);
      lines.push(
        effectRank > currentRank || !currentDisplay
          ? `${statLabels[statName]}: ${display}${resistanceNote}`
          : `${statLabels[statName]}: Already ${currentDisplay}`
      );
    } else {
      lines.push(`${statLabels[statName]}: ${display}${resistanceNote}`);
    }
  });

  const floorGroups = new Map<string, string[]>();
  arrayField<object>(effect, "stat_modifier_floor_effects").forEach((floor) => {
    const statName = stringField(floor, "stat") as RankedStatName;
    const modifierId = stringField(floor, "modifier");
    const catalogName = statCatalogs[statName];
    if (!catalogName || !modifierId) return;
    if (form) {
      const currentStat = Reflect.get(form, statName) as RankedStatInput | undefined;
      if (!currentStat) return;
      const floorEntry = byId(context, "stat_modifiers", modifierId);
      const currentModifier = modifier(context, currentStat);
      const modifierName = stringField(floorEntry, "name") || humanizeId(modifierId);
      lines.push(
        floorEntry
        && numberField(currentModifier, "rank") >= numberField(floorEntry, "rank")
          ? `${statLabels[statName]}: Already ${stringField(currentModifier, "name")}`
          : `${statLabels[statName]}: Raises modifier to ${modifierName}`
      );
      return;
    }
    floorGroups.set(
      modifierId,
      [...(floorGroups.get(modifierId) ?? []), statLabels[statName]]
    );
  });
  floorGroups.forEach((stats, modifierId) => {
    const modifierName = stringField(
      byId(context, "stat_modifiers", modifierId),
      "name"
    ) || humanizeId(modifierId);
    lines.push(`Raises modifier: ${joinText(stats)} to ${modifierName}`);
  });

  const swap = objectField(effect, "opponent_stat_swap");
  if (swap) {
    const statNames = arrayField<RankedStatName>(swap, "stat_names")
      .map((name) => statLabels[name]);
    const caps = Object.entries(objectField(swap, "max_target_stats") ?? {})
      .flatMap(([field, stat]) => {
        const name = field as RankedStatName;
        const catalogName = statCatalogs[name];
        const value = catalogName
          ? formatStat(context, stat as RankedStatInput, catalogName)
              .replace(/ level(?=\+?$)/i, "")
          : "";
        return value ? [`${statLabels[name]} ${value}`] : [];
      });
    const range = Reflect.get(swap, "max_target_range") as RankedStatInput | undefined;
    const rangeLimit = range ? formatStat(context, range, "range_tiers") : "";
    if (statNames.length) lines.push(`Swaps stronger opponent stats: ${joinText(statNames)}`);
    if (rangeLimit) lines.push(`Requires opponent range: ${rangeLimit} or lower`);
    if (caps.length) lines.push(`Transfer limits: ${joinText(caps)}`);
    arrayField<object>(swap, "on_success_stat_modifier_floor_effects").forEach((floor) => {
      const name = stringField(floor, "stat") as RankedStatName;
      const modifierId = stringField(floor, "modifier");
      const modifierName = stringField(
        byId(context, "stat_modifiers", modifierId),
        "name"
      ) || humanizeId(modifierId);
      lines.push(`On use: Raises ${statLabels[name]} modifier to ${modifierName}`);
    });
  }

  const imageUpdate = objectField(effect, "image_update");
  const imageName = optionalStringField(imageUpdate, "name");
  if (imageName) lines.push(`Changes image: ${imageName}`);
  lines.push(...grantDetails(context, objectField(effect, "grants")));

  const nullification = objectField(effect, "power_nullification");
  if (nullification) {
    const targetRefs = arrayField<PowerTargetRef>(
      nullification,
      "target_power_refs"
    );
    const targets = [
      ...catalogNames(
        context,
        arrayField<string>(nullification, "target_power_ids"),
        "powers"
      ),
      ...targetRefs.map((ref) => powerTargetRefLabel(context, ref))
    ];
    const maximumModifier = byId(
      context,
      "ability_modifiers",
      optionalStringField(nullification, "max_target_modifier")
    );
    const modifierLimit = maximumModifier
      ? ` up to ${stringField(maximumModifier, "name")}`
      : "";
    const typeLimit = powerTargetTypeLimit(context, nullification, targetRefs);
    lines.push(
      targets.length
        ? `Nullifies: ${joinText(targets)}${modifierLimit}${typeLimit}`
        : `Nullifies powers${modifierLimit}${typeLimit}`
    );
  }

  const absorption = objectField(effect, "absorption");
  if (absorption) {
    const targets = arrayField<PowerTargetRef>(absorption, "target_power_refs")
      .map((ref) => powerTargetRefLabel(context, ref));
    if (targets.length) lines.push(`Absorbs: ${joinText(targets)}`);
  }
  const negation = objectField(effect, "resistance_negation");
  if (negation) {
    const targets = catalogNames(
      context,
      arrayField<string>(negation, "target_resistance_ids"),
      "resistances"
    );
    const immunities = catalogNames(
      context,
      arrayField<string>(negation, "target_immunity_ids"),
      "resistances"
    );
    lines.push(targets.length ? `Negates resistances: ${joinText(targets)}` : "Negates resistances");
    if (immunities.length) lines.push(`Negates immunities: ${joinText(immunities)}`);
  }
  const interaction = objectField(effect, "non_physical_interaction");
  if (interaction) {
    const targets = arrayField<PowerTargetRef>(interaction, "target_power_refs")
      .map((ref) => powerTargetRefLabel(context, ref));
    lines.push(
      targets.length
        ? `Can affect: ${joinText(targets)}`
        : "Can affect non-physical targets"
    );
  }
  const nullifiedBy = objectField(effect, "nullified_by");
  if (nullifiedBy) {
    const sources = [
      ...arrayField<PowerRef>(nullifiedBy, "power_refs")
        .map((ref) => powerRefLabel(context, ref)),
      ...arrayField<ResistanceRef>(nullifiedBy, "resistance_refs")
        .map((ref) => resistanceRefLabel(context, ref))
    ];
    if (sources.length) lines.push(`Stopped by: ${joinText(sources)}`);
  }
  return lines;
}

export function describePower(
  context: GameContext,
  form: CharacterForm,
  ref: PowerRef
): readonly string[] {
  const power = byId(context, "powers", ref.id);
  if (!power) return [];
  const variant = powerVariant(power, ref);
  const placeholderValue = Reflect.get(ref, "placeholder");
  const placeholder = typeof placeholderValue === "boolean"
    ? placeholderValue
    : booleanField(power, "placeholder");
  const lines: string[] = [];
  if (placeholder) lines.push("Placeholder: no game effect yet");
  if (ref.id === "flight") lines.push("Game effect: enables Flight Speed");
  if (ref.id === "regeneration") {
    lines.push("Game effect: first tie-breaker when battle points are tied");
  }
  if (ref.id === "martial-arts-mastery") {
    lines.push("Game effect: fallback tie-breaker if battle points and Regeneration are tied");
  }
  const refTypes = arrayField<string>(ref, "type_ids");
  lines.push(...typeDetails(
    context,
    refTypes.length ? refTypes : arrayField<string>(power, "type_ids")
  ));
  lines.push(...refScopeDetails(context, ref, variant));

  const derivedRuleId = optionalStringField(ref, "derived_rule_id");
  const derivedRule = byId(context, "derived_power_rules", derivedRuleId);
  if (derivedRule) {
    const requirements = arrayField<object>(derivedRule, "requirements");
    const configuredMinimum = Reflect.get(derivedRule, "min_matches");
    const minimum = Number.isInteger(configuredMinimum)
      ? Number(configuredMinimum)
      : requirements.length;
    const requirementTexts = requirements
      .map((requirement) => formatStatRequirement(context, requirement))
      .filter(Boolean);
    lines.push(`Requires ${minimum}/${requirements.length} stats`);
    if (requirementTexts.length) lines.push(`Needed: ${joinText(requirementTexts)}`);
  }

  const includeBase = !variant || Reflect.get(variant, "inherits_base_grants") !== false;
  if (includeBase) lines.push(...grantDetails(context, objectField(power, "grants")));
  if (variant) lines.push(...grantDetails(context, objectField(variant, "grants")));
  lines.push(...powerRefEffects(context, ref).flatMap((effect) =>
    describeEffect(context, effect, form)
  ));
  return lines;
}

export function describeResistance(
  context: GameContext,
  ref: ResistanceRef
): readonly string[] {
  const resistance = byId(context, "resistances", ref.id);
  if (!resistance) return [];
  const lines: string[] = [
    ...typeDetails(context, arrayField<string>(ref, "type_ids")),
    ...refScopeDetails(context, ref)
  ];
  const powers = catalogNames(
    context,
    arrayField<string>(resistance, "resists_power_ids"),
    "powers"
  );
  const effects = arrayField<string>(resistance, "resists_effect_ids").map(humanizeId);
  const weapons = catalogNames(
    context,
    arrayField<string>(resistance, "resists_weapon_type_ids"),
    "power_types"
  );
  if (powers.length) lines.push(`Resists: ${joinText(powers)}`);
  if (effects.length) lines.push(`Resists effects: ${joinText(effects)}`);
  if (weapons.length) lines.push(`Resists weapon types: ${joinText(weapons)}`);
  return lines;
}

export function describeItem(
  context: GameContext,
  item: ResolvedCatalogItem,
  form: CharacterForm
): readonly string[] {
  const lines: string[] = [];
  if (booleanField(item, "placeholder")) lines.push("Placeholder: no game effect yet");
  lines.push(...typeDetails(
    context,
    arrayField<string>(item, "weapon_type_ids"),
    "Weapon types"
  ));
  const requirements = arrayField<PowerRef>(item, "required_power_refs")
    .map((ref) => powerRefLabel(context, ref));
  if (requirements.length) lines.push(`Requires powers: ${joinText(requirements)}`);
  lines.push(...grantDetails(context, objectField(item, "grants")));
  lines.push(...(item.effects ?? []).flatMap((effect) =>
    describeEffect(context, effect, form)
  ));
  return lines;
}
