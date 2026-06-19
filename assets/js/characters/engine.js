(() => {
  const {
    data,
    options,
    statModifiers,
    statDefinitions,
    battleScoreExcludedLabels,
    speedDefinitions,
    statCatalogs,
    statLabels,
    statusDefinitions,
    byId,
    title,
    list,
    idListKey,
    escapeHtml,
    assetUrl
  } = window.NexyCharacters;
  function normalizedStat(stat) {
    return typeof stat === "string" ? { value: stat, modifier: "normal" } : stat;
  }

  function modifier(stat) {
    const normalized = normalizedStat(stat);
    return byId(statModifiers, normalized?.modifier || "normal") || byId(statModifiers, "normal");
  }

  function abilityModifier(ref = {}) {
    return byId(options.ability_modifiers, ref.modifier || "normal") || byId(options.ability_modifiers, "normal");
  }

  function abilityModifierRank(ref = {}) {
    return abilityModifier(ref)?.coverage_rank || 0;
  }

  function magicLevelRank(ref = {}) {
    if (!ref.magic_level_id) return 0;

    return byId(options.magic_levels, ref.magic_level_id)?.rank || 0;
  }

  function degreeRank(ref = {}) {
    ref = ref || {};
    const martialRank = ref.martial_arts_degree_id
      ? byId(options.martial_arts_degrees, ref.martial_arts_degree_id)?.rank || 0
      : 0;
    const acrobaticsRank = ref.acrobatics_degree_id
      ? byId(options.acrobatics_degrees, ref.acrobatics_degree_id)?.rank || 0
      : 0;

    return Math.max(martialRank, acrobaticsRank);
  }

  function resistanceLevelRank(ref = {}) {
    return byId(options.resistance_levels, ref.level || "resistant")?.rank || 0;
  }

  function statEntry(stat, catalogName) {
    const normalized = normalizedStat(stat);
    return byId(options[catalogName], normalized?.value);
  }

  function compositeRank(stat, catalogName) {
    const entry = statEntry(stat, catalogName);
    const mod = modifier(stat);
    return entry ? ((entry.rank - 1) * 8) + mod.rank : 0;
  }

  function tierRank(key) {
    return compositeRank(key.attack_potency, "attack_durability_tiers");
  }

  function speedRank(key) {
    return Math.max(...speedDefinitions.map(([field]) => compositeRank(key[field], "speed_tiers")));
  }

  function statRank(key, field, catalogName) {
    if (field === "tier") return tierRank(key);
    if (field === "speed") return speedRank(key);

    return compositeRank(key[field], catalogName);
  }

  function statDisplayValue(entry, catalogName, valueField) {
    const value = entry[valueField] || "";
    if (catalogName !== "striking_strength_tiers" || valueField !== "name") return value;

    return value
      .replace(/ level\+$/i, "+")
      .replace(/ level$/i, "");
  }

  function formatStat(stat, catalogName, valueField = "name") {
    const entry = statEntry(stat, catalogName);
    if (!entry) return "";

    const mod = modifier(stat);
    const prefix = mod.display_prefix ? `${mod.display_prefix} ` : "";
    const suffix = mod.display_suffix || "";
    return `${prefix}${statDisplayValue(entry, catalogName, valueField)}${suffix}`;
  }

  function formatTier(key) {
    const entry = statEntry(key.attack_potency, "attack_durability_tiers");

    return entry ? statDisplayValue(entry, "attack_durability_tiers", "tier") : "";
  }

  function joinText(items) {
    if (items.length <= 1) return items[0] || "";
    if (items.length === 2) return `${items[0]} and ${items[1]}`;

    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  }

  function speedComparisonLabel(field, fallbackLabel) {
    if (field === "combat_speed") return "Combat Speed";
    if (field === "attack_speed") return "Attack Speed";
    if (field === "reaction_speed") return "Reaction Speed";
    if (field === "travel_speed") return "Travel Speed";
    if (field === "flight_speed") return "Flight Speed";

    return humanizeId(fallbackLabel || field);
  }

  function speedNote(stat) {
    const normalized = normalizedStat(stat);
    return normalized?.note ? ` (${normalized.note})` : "";
  }

  function speedEntries(key) {
    return speedDefinitions
      .filter(([field]) => key[field])
      .map(([field, fallbackLabel]) => ({
        field,
        label: speedComparisonLabel(field, fallbackLabel),
        note: speedNote(key[field]),
        value: formatStat(key[field], "speed_tiers")
      }))
      .filter((entry) => entry.value);
  }

  function formatSpeed(key) {
    const entries = speedEntries(key);
    if (entries.length === 0) return "";
    if (entries.length === 1 && entries[0].field === "combat_speed") {
      return `${entries[0].value}${entries[0].note}`;
    }

    return entries.map((entry) => `${entry.label}: ${entry.value}${entry.note}`).join(" / ");
  }

  function speedStatValueHtml(key) {
    const entries = speedEntries(key);
    if (entries.length === 0) return "";
    if (entries.length === 1 && entries[0].field === "combat_speed") {
      return escapeHtml(`${entries[0].value}${entries[0].note}`);
    }

    return `
      <span class="speed-value-list" aria-label="${escapeHtml(formatSpeed(key))}">
        ${entries.map((entry) => `
          <span class="speed-value-row">
            <span class="speed-value-type">${escapeHtml(entry.label)}</span>
            <span class="speed-value-rank">${escapeHtml(entry.value)}${entry.note ? `<span class="speed-value-note">${escapeHtml(entry.note)}</span>` : ""}</span>
          </span>
        `).join("")}
      </span>
    `;
  }

  function formatAbilityLabel(label, ref = {}) {
    const mod = abilityModifier(ref);
    if (!mod || mod.id === "normal") return label;

    const prefix = mod.display_prefix ? `${mod.display_prefix} ` : "";
    const suffix = mod.display_suffix || "";
    return `${prefix}${label}${suffix}`;
  }

  function humanizeId(value) {
    return String(value || "")
      .replace(/[_-]/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function absorptionTargetName(ref) {
    const targets = powerRefEffects(ref)
      .flatMap((effect) => list(effect.absorption?.target_power_refs))
      .map(powerTargetRefLabel);

    if (targets.length !== 1) return "";

    return targets[0].replace(/ Manipulation$/i, "");
  }

  function powerRefLabel(ref) {
    const power = byId(options.powers, ref.id);
    if (!power) return humanizeId(ref.id);

    const martialDegree = ref.martial_arts_degree_id
      ? byId(options.martial_arts_degrees, ref.martial_arts_degree_id)
      : null;
    const acrobaticsDegree = ref.acrobatics_degree_id
      ? byId(options.acrobatics_degrees, ref.acrobatics_degree_id)
      : null;

    if (martialDegree) return formatAbilityLabel(martialDegree.name, ref);
    if (acrobaticsDegree) return formatAbilityLabel(acrobaticsDegree.name, ref);
    if (power.id === "absorption") {
      const targetName = absorptionTargetName(ref);
      if (targetName) return formatAbilityLabel(`${targetName} Absorption`, ref);
    }

    const variant = powerVariant(power, ref);
    if (variant?.display_as_power_name) return formatAbilityLabel(variant.name, ref);

    const typeNames = list(ref.type_ids)
      .map((id) => byId(options.power_types, id))
      .filter(Boolean)
      .map((type) => type.name);

    const label = typeNames.length ? `${power.name}: ${typeNames.join(", ")}` : power.name;
    return formatAbilityLabel(label, ref);
  }

  function resistanceRefLabel(ref) {
    const resistance = byId(options.resistances, ref.id);
    const label = resistance ? resistance.name : humanizeId(ref.id);
    const level = byId(options.resistance_levels, ref.level || "resistant");
    const levelLabel = level?.id === "immunity" ? `Immunity to ${label}` : label;

    return formatAbilityLabel(levelLabel, ref);
  }

  function catalogItems(ids, catalogName) {
    return list(ids)
      .map((id) => byId(options[catalogName], id))
      .filter(Boolean);
  }

  function nameList(ids, catalogName) {
    return catalogItems(ids, catalogName)
      .map((item) => item.name);
  }

  function statLabel(statName) {
    return statLabels[statName] || humanizeId(statName);
  }

  function formatStatRequirement(requirement) {
    const catalog = statCatalogs[requirement.stat];
    const value = catalog ? formatStat(requirementStat(requirement), catalog) : "";
    if (!value) return "";

    if (requirement.comparison === "at-most") return `${statLabel(requirement.stat)}: At most ${value}`;
    if (requirement.comparison === "exact") return `${statLabel(requirement.stat)}: Exactly ${value}`;

    return `${statLabel(requirement.stat)}: ${value}`;
  }

  function powerNames(ids) {
    return nameList(ids, "powers");
  }

  function powerTargetRefLabel(ref) {
    const power = byId(options.powers, ref.id);
    const label = power ? power.name : humanizeId(ref.id);
    const typeNames = nameList(ref.type_ids, "power_types");

    return typeNames.length ? `${label}: ${typeNames.join(", ")}` : label;
  }

  function powerTargetTypeLimitLabel(nullification, targetRefs = []) {
    const maxRank = Number(nullification?.max_target_type_rank);
    if (!Number.isFinite(maxRank)) return "";

    const targetPowerIds = [
      ...list(nullification.target_power_ids),
      ...targetRefs.map((ref) => ref.id)
    ];
    const targetPowerId = targetPowerIds.find(Boolean);
    const matchingType = list(options.power_types)
      .filter((type) => type.power_id === targetPowerId && Number(type.rank) <= maxRank)
      .sort((a, b) => Number(b.rank) - Number(a.rank))[0];

    return matchingType ? ` up to ${matchingType.name}` : ` up to type rank ${maxRank}`;
  }

  function powerTargetRefMatches(powerRef, targetRef) {
    if (!powerRef || !targetRef || powerRef.id !== targetRef.id) return false;
    if (targetRef.source_variant && powerRef.source_variant !== targetRef.source_variant) return false;
    if (magicLevelRank(powerRef) < magicLevelRank(targetRef)) return false;

    return powerTypesCover(powerRef.type_ids, targetRef.type_ids);
  }

  function powerTypeCovers(ownedTypeId, requiredTypeId, seen = new Set()) {
    if (!requiredTypeId || ownedTypeId === requiredTypeId) return true;
    if (!ownedTypeId || seen.has(ownedTypeId)) return false;

    seen.add(ownedTypeId);
    const ownedType = byId(options.power_types, ownedTypeId);
    const requiredType = byId(options.power_types, requiredTypeId);

    if (!ownedType || !requiredType || ownedType.power_id !== requiredType.power_id) return false;
    if (ownedType.covers_all) return true;

    return list(ownedType.covers_type_ids).some((coveredTypeId) => (
      coveredTypeId === requiredTypeId || powerTypeCovers(coveredTypeId, requiredTypeId, seen)
    ));
  }

  function powerTypesCover(ownedTypeIds, requiredTypeIds) {
    const requiredTypes = list(requiredTypeIds);
    if (!requiredTypes.length) return true;

    const ownedTypes = list(ownedTypeIds);
    if (!ownedTypes.length) return false;

    return requiredTypes.every((requiredTypeId) => (
      ownedTypes.some((ownedTypeId) => powerTypeCovers(ownedTypeId, requiredTypeId))
    ));
  }

  function powerTypeRank(ref = {}) {
    const ranks = list(ref?.type_ids)
      .map((typeId) => Number(byId(options.power_types, typeId)?.rank))
      .filter(Number.isFinite);

    return ranks.length ? Math.max(...ranks) : 0;
  }

  function powerRefMeetsRequirement(ownedRef, requiredRef) {
    if (!ownedRef || !requiredRef || ownedRef.id !== requiredRef.id) return false;
    if (requiredRef.source_variant && ownedRef.source_variant !== requiredRef.source_variant) return false;
    if (abilityModifierRank(ownedRef) < abilityModifierRank(requiredRef)) return false;
    if (magicLevelRank(ownedRef) < magicLevelRank(requiredRef)) return false;
    if (degreeRank(ownedRef) < degreeRank(requiredRef)) return false;

    return powerTypesCover(ownedRef.type_ids, requiredRef.type_ids);
  }

  function powerRefsMeetRequirements(ownedRefs, requiredRefs) {
    return list(requiredRefs).every((requiredRef) => (
      list(ownedRefs).some((ownedRef) => powerRefMeetsRequirement(ownedRef, requiredRef))
    ));
  }

  function status(id, detail = "") {
    const definition = statusDefinitions[id] || statusDefinitions.active;

    return { ...definition, detail };
  }

  function resistanceNames(ids) {
    return nameList(ids, "resistances");
  }

  function characterKey(character, keyId = null) {
    const keys = list(character.keys);
    return keys.find((key) => key.key === keyId) || keys[0] || {};
  }

  function classifications(character) {
    return list(character.classification_ids)
      .map((id) => byId(options.classifications, id))
      .filter(Boolean);
  }

  function gender(character) {
    return byId(options.genders, character.gender_id);
  }

  function ageText(character) {
    const age = character.age || {};
    if (age.display) return age.display;
    if (age.value !== null && age.value !== undefined) return String(age.value);
    return age.unknown ? "Unknown" : "";
  }

  function characterDetails(character) {
    const details = [];
    const genderEntry = gender(character);
    const age = ageText(character);

    if (genderEntry) details.push(`Gender: ${genderEntry.name}`);
    if (age) details.push(`Age: ${age}`);
    classifications(character).forEach((classification) => details.push(classification.name));

    return details;
  }

  function requirementStat(requirement) {
    return {
      value: requirement.value,
      modifier: requirement.modifier || "normal"
    };
  }

  function meetsStatRequirement(key, requirement) {
    const catalog = statCatalogs[requirement.stat];
    if (!catalog) return false;

    const actual = key[requirement.stat];
    if (!actual) return false;

    const actualRank = compositeRank(actual, catalog);
    const requiredRank = compositeRank(requirementStat(requirement), catalog);
    if (!actualRank || !requiredRank) return false;

    if (requirement.comparison === "at-most") return actualRank <= requiredRank;
    if (requirement.comparison === "exact") return actualRank === requiredRank;

    return actualRank >= requiredRank;
  }

  function derivedPowerRefs(key) {
    return list(options.derived_power_rules).filter((rule) => {
      const requirements = list(rule.requirements);
      const minMatches = Number.isInteger(rule.min_matches) ? rule.min_matches : requirements.length;
      const metCount = requirements.filter((requirement) => meetsStatRequirement(key, requirement)).length;

      return metCount >= minMatches;
    }).map((rule) => ({
      id: rule.power_id,
      modifier: "normal",
      type_ids: [],
      derived: true,
      derived_rule_id: rule.id
    }));
  }

  function itemRefs(ids = [], refs = []) {
    return [
      ...list(ids).map((id) => ({ id })),
      ...list(refs)
    ].filter((ref) => ref?.id);
  }

  function catalogItemFromRef(ref, catalogName) {
    const item = byId(options[catalogName], ref.id);
    if (!item) return null;

    return {
      ...item,
      effects: Array.isArray(ref.effects) ? ref.effects : item.effects,
      ref
    };
  }

  function catalogItemsFromRefs(refs, catalogName) {
    return list(refs)
      .map((ref) => catalogItemFromRef(ref, catalogName))
      .filter(Boolean);
  }

  function usableItemEffects(ids, refs, catalogName, ownedPowerRefs) {
    return catalogItemsFromRefs(itemRefs(ids, refs), catalogName)
      .filter((item) => powerRefsMeetRequirements(ownedPowerRefs, item.required_power_refs))
      .flatMap((item) => list(item.effects));
  }

  function activeItemEffectsForPowerRefs(key, ownedPowerRefs) {
    return [
      ...usableItemEffects(key.standard_equipment_ids, key.standard_equipment_refs, "equipment", ownedPowerRefs),
      ...usableItemEffects(key.attack_ids, [], "attacks", ownedPowerRefs)
    ];
  }

  function activeItemEffects(key) {
    return activeItemEffectsForPowerRefs(key, powerRefs(key, []));
  }

  function itemStatusForPowerRefs(item, ownedPowerRefs, detail = null) {
    const requiredRefs = list(item.required_power_refs);
    if (!requiredRefs.length) return null;

    if (powerRefsMeetRequirements(ownedPowerRefs, requiredRefs)) return null;

    return status("disabled", detail || `Missing ${joinText(requiredRefs.map(powerRefLabel))}`);
  }

  function itemStatus(item, key) {
    return itemStatusForPowerRefs(item, powerRefs(key, []));
  }

  function inheritedCatalogEntries(ids, catalogName, inheritsField) {
    const entries = [];
    const seen = new Set();
    const queue = list(ids);

    for (let index = 0; index < queue.length; index += 1) {
      const id = queue[index];
      if (!id || seen.has(id)) continue;

      const entry = byId(options[catalogName], id);
      if (!entry) continue;

      seen.add(id);
      entries.push(entry);
      queue.push(...list(entry[inheritsField]));
    }

    return entries;
  }

  function magicLevelsFromIds(ids) {
    return inheritedCatalogEntries(ids, "magic_levels", "inherits_level_ids");
  }

  function magicNaturesFromIds(ids) {
    return inheritedCatalogEntries(ids, "magic_natures", "inherits_nature_ids");
  }

  function refsFromGrants(grants = {}, directField, magicLevelField) {
    const grantData = grants || {};

    return [
      ...list(grantData[directField]),
      ...magicLevelsFromIds(grantData.magic_level_ids).flatMap((level) => list(level[magicLevelField]))
    ];
  }

  function powerRefsFromGrants(grants = {}) {
    return refsFromGrants(grants, "power_refs", "power_refs");
  }

  function resistanceRefsFromGrants(grants = {}) {
    return refsFromGrants(grants, "resistance_refs", "resistance_refs");
  }

  function grantedPowerRefsFromEffects(effects, includeEffect = () => true) {
    return list(effects)
      .filter(includeEffect)
      .flatMap((effect) => powerRefsFromGrants(effect?.grants));
  }

  function grantedResistanceRefsFromEffects(effects, includeEffect = () => true) {
    return list(effects)
      .filter(includeEffect)
      .flatMap((effect) => resistanceRefsFromGrants(effect?.grants));
  }

  function powerRefContext(ref) {
    const power = byId(options.powers, ref.id);
    const variant = power ? powerVariant(power, ref) : null;

    return {
      power,
      variant,
      includeBase: !variant || variant.inherits_base_grants !== false
    };
  }

  function grantedPowerRefsFromPowerRef(ref, includeEffect = () => true) {
    const { power, variant, includeBase } = powerRefContext(ref);
    const magicNatures = magicNaturesFromIds(ref.magic_nature_ids);

    return [
      ...(includeBase ? powerRefsFromGrants(power?.grants) : []),
      ...powerRefsFromGrants(variant?.grants),
      ...magicNatures.flatMap((nature) => list(nature.power_refs)),
      ...grantedPowerRefsFromEffects(powerRefEffects(ref), includeEffect)
    ];
  }

  function powerRefKey(ref) {
    return [
      ref.id,
      ref.source_variant || "",
      idListKey(ref.type_ids),
      idListKey(ref.magic_nature_ids),
      ref.condition || ""
    ].join("|");
  }

  function refStrength(ref) {
    return [
      magicLevelRank(ref),
      abilityModifierRank(ref),
      degreeRank(ref),
      Array.isArray(ref.effects) ? ref.effects.length : 0
    ];
  }

  function compareRankTuples(a, b, ranker) {
    const left = ranker(a);
    const right = ranker(b);

    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return left[index] - right[index];
    }

    return 0;
  }

  function compareRefStrength(a, b) {
    return compareRankTuples(a, b, refStrength);
  }

  function powerRefs(key, itemEffects = activeItemEffects(key), includeRef = () => true, includeEffect = () => true) {
    const refs = [];
    const refIndexes = new Map();
    const queue = [
      ...list(key.power_refs),
      ...derivedPowerRefs(key),
      ...grantedPowerRefsFromEffects(itemEffects, includeEffect)
    ];

    for (let index = 0; index < queue.length; index += 1) {
      const ref = queue[index];
      if (!ref?.id) continue;
      if (!includeRef(ref)) continue;

      const refKey = powerRefKey(ref);
      const existingIndex = refIndexes.get(refKey);
      if (existingIndex !== undefined) {
        if (compareRefStrength(ref, refs[existingIndex]) <= 0) continue;

        refs[existingIndex] = ref;
      } else {
        refIndexes.set(refKey, refs.length);
        refs.push(ref);
      }

      queue.push(...grantedPowerRefsFromPowerRef(ref, includeEffect));
    }

    return refs;
  }

  function powerRefEffects(ref) {
    const { power, variant, includeBase } = powerRefContext(ref);
    const magicNatureEffects = magicNaturesFromIds(ref.magic_nature_ids).flatMap((nature) => list(nature.effects));

    if (Array.isArray(ref.effects)) return [...ref.effects, ...magicNatureEffects];

    return [
      ...(includeBase ? list(power?.effects) : []),
      ...list(variant?.effects),
      ...magicNatureEffects
    ];
  }

  function grantedResistanceRefsFromPowerRef(ref, includeEffect = () => true) {
    const { power, variant, includeBase } = powerRefContext(ref);
    const magicNatures = magicNaturesFromIds(ref.magic_nature_ids);

    return [
      ...(includeBase ? resistanceRefsFromGrants(power?.grants) : []),
      ...resistanceRefsFromGrants(variant?.grants),
      ...magicNatures.flatMap((nature) => list(nature.resistance_refs)),
      ...grantedResistanceRefsFromEffects(powerRefEffects(ref), includeEffect)
    ];
  }

  function resistanceRefKey(ref) {
    return [
      ref.id,
      ref.source_variant || "",
      idListKey(ref.type_ids),
      idListKey(ref.magic_nature_ids),
      ref.condition || ""
    ].join("|");
  }

  function resistanceRefStrength(ref) {
    return [
      resistanceLevelRank(ref),
      magicLevelRank(ref),
      abilityModifierRank(ref)
    ];
  }

  function compareResistanceRefStrength(a, b) {
    return compareRankTuples(a, b, resistanceRefStrength);
  }

  function resistanceRefs(key, refs = powerRefs(key), itemEffects = activeItemEffects(key), includeEffect = () => true) {
    const resolved = [];
    const refIndexes = new Map();
    const queue = [
      ...list(key.resistance_refs),
      ...grantedResistanceRefsFromEffects(itemEffects, includeEffect),
      ...refs.flatMap((ref) => grantedResistanceRefsFromPowerRef(ref, includeEffect))
    ];

    for (let index = 0; index < queue.length; index += 1) {
      const ref = queue[index];
      if (!ref?.id) continue;

      const refKey = resistanceRefKey(ref);
      const existingIndex = refIndexes.get(refKey);
      if (existingIndex !== undefined) {
        if (compareResistanceRefStrength(ref, resolved[existingIndex]) <= 0) continue;

        resolved[existingIndex] = ref;
      } else {
        refIndexes.set(refKey, resolved.length);
        resolved.push(ref);
      }
    }

    return resolved;
  }

  function raiseStatModifier(stat, modifierId) {
    const normalized = normalizedStat(stat);
    const floor = byId(statModifiers, modifierId);
    const current = modifier(normalized);

    if (!normalized || !floor || current.rank >= floor.rank) return normalized;

    return { ...normalized, modifier: floor.id };
  }

  function applyStatEffect(key, statName, stat) {
    const catalog = statCatalogs[statName];
    if (!catalog || stat == null) return key[statName];

    const currentRank = compositeRank(key[statName], catalog);
    const effectRank = compositeRank(stat, catalog);

    return effectRank > currentRank ? normalizedStat(stat) : key[statName];
  }

  function activeEffects(key, refs = powerRefs(key), itemEffects = activeItemEffects(key), includeEffect = () => true) {
    return [
      ...itemEffects,
      ...refs.flatMap(powerRefEffects)
    ].filter(includeEffect);
  }

  function effectiveKey(key, refs = powerRefs(key), itemEffects = activeItemEffects(key), effects = activeEffects(key, refs, itemEffects)) {
    const result = { ...key };

    effects.forEach((effect) => {
      if (!effect) return;

      Object.entries(effect.stat_effects || {}).forEach(([statName, stat]) => {
        result[statName] = applyStatEffect(result, statName, stat);
      });

      list(effect.stat_modifier_floor_effects).forEach((modifierFloor) => {
        const statName = modifierFloor.stat;
        if (!statCatalogs[statName]) return;

        result[statName] = raiseStatModifier(result[statName], modifierFloor.modifier);
      });
    });

    if (!refs.some((ref) => ref.id === "flight")) result.flight_speed = null;

    return result;
  }

  function activeImage(key, effects = []) {
    const baseImage = list(key.images)[0];
    const imageUpdates = effects
      .map((effect, index) => ({ ...(effect?.image_update || {}), sourceIndex: index }))
      .filter((image) => image.image);

    if (!imageUpdates.length) return baseImage;

    return imageUpdates.reduce((winner, image) => {
      const winnerPriority = Number.isInteger(winner.priority) ? winner.priority : 0;
      const imagePriority = Number.isInteger(image.priority) ? image.priority : 0;

      if (imagePriority > winnerPriority) return image;
      if (imagePriority === winnerPriority && image.sourceIndex > winner.sourceIndex) return image;

      return winner;
    });
  }

  function grantTooltipLines(grants = {}) {
    const lines = [];
    const grantedPowers = list(grants.power_refs).map(powerRefLabel);
    const grantedResistances = list(grants.resistance_refs).map(resistanceRefLabel);
    const grantedMagicLevels = nameList(grants.magic_level_ids, "magic_levels");

    if (grantedPowers.length) lines.push(`Grants: ${joinText(grantedPowers)}`);
    if (grantedResistances.length) lines.push(`Grants resistances: ${joinText(grantedResistances)}`);
    if (grantedMagicLevels.length) lines.push(`Grants magic: ${joinText(grantedMagicLevels)}`);

    return lines;
  }

  function typeTooltipLines(typeIds = [], label = "Types") {
    const types = list(typeIds)
      .map((id) => byId(options.power_types, id))
      .filter(Boolean);
    const typeNames = types.map((type) => type.name);

    return [
      ...(typeNames.length ? [`${label}: ${joinText(typeNames)}`] : []),
      ...types
        .filter((type) => type.description)
        .map((type) => `${type.name}: ${type.description}`)
    ];
  }

  function refScopeTooltipLines(ref = {}, variant = null) {
    const lines = [];
    const magicLevel = ref.magic_level_id ? byId(options.magic_levels, ref.magic_level_id) : null;
    const magicNatures = nameList(ref.magic_nature_ids, "magic_natures");

    if (magicLevel) lines.push(`Magic level: ${magicLevel.name}`);
    if (magicNatures.length) lines.push(`Magic nature: ${joinText(magicNatures)}`);
    if (variant || ref.source_variant) lines.push(`Variant: ${variant?.name || humanizeId(ref.source_variant)}`);
    if (ref.condition) lines.push(`Condition: ${ref.condition}`);

    return lines;
  }

  function requirementTooltipLines(requirements = {}) {
    const lines = [];
    const statMinimums = list(requirements.stat_minimums)
      .map(formatStatRequirement)
      .filter(Boolean);
    const requiredPowers = list(requirements.power_refs).map(powerRefLabel);
    const requiredEquipment = nameList(requirements.equipment_ids, "equipment");

    if (statMinimums.length) lines.push(`Requires stats: ${joinText(statMinimums)}`);
    if (requiredPowers.length) lines.push(`Requires powers: ${joinText(requiredPowers)}`);
    if (requiredEquipment.length) lines.push(`Requires equipment: ${joinText(requiredEquipment)}`);

    return lines;
  }

  function effectTooltipLines(effect = {}, key = null) {
    const lines = [];

    Object.entries(effect.stat_effects || {}).forEach(([statName, stat]) => {
      const catalog = statCatalogs[statName];
      const value = catalog ? formatStat(stat, catalog) : "";
      if (!value) return;

      const resistanceNote = normalizedStat(stat)?.resistible === false
        ? " (ignores resistance)"
        : "";

      if (key) {
        const currentRank = compositeRank(key[statName], catalog);
        const effectRank = compositeRank(stat, catalog);
        const currentValue = formatStat(key[statName], catalog);
        const label = statLabel(statName);

        lines.push(effectRank > currentRank || !currentValue
          ? `${label}: ${value}${resistanceNote}`
          : `${label}: Already ${currentValue}`);
        return;
      }

      lines.push(`${statLabel(statName)}: ${value}${resistanceNote}`);
    });

    const modifierFloorGroups = new Map();
    list(effect.stat_modifier_floor_effects).forEach((modifierFloor) => {
      const statName = modifierFloor.stat;
      const modifierId = modifierFloor.modifier;
      const catalog = statCatalogs[statName];
      if (!catalog || !modifierId) return;

      if (key) {
        if (!key[statName]) return;

        const floor = byId(statModifiers, modifierId);
        const current = modifier(key[statName]);
        const modifierName = floor?.name || humanizeId(modifierId);

        if (floor && current.rank >= floor.rank) {
          lines.push(`${statLabel(statName)}: Already ${current.name}`);
        } else {
          lines.push(`${statLabel(statName)}: Raises modifier to ${modifierName}`);
        }
        return;
      }

      const stats = modifierFloorGroups.get(modifierId) || [];
      stats.push(statLabel(statName));
      modifierFloorGroups.set(modifierId, stats);
    });

    modifierFloorGroups.forEach((stats, modifierId) => {
      const modifierName = byId(statModifiers, modifierId)?.name || humanizeId(modifierId);
      lines.push(`Raises modifier: ${joinText(stats)} to ${modifierName}`);
    });

    if (effect.image_update?.name) lines.push(`Changes image: ${effect.image_update.name}`);
    lines.push(...grantTooltipLines(effect.grants));
    lines.push(...requirementTooltipLines(effect.requirements));

    if (effect.power_nullification) {
      const targetRefs = list(effect.power_nullification.target_power_refs);
      const targets = [
        ...powerNames(effect.power_nullification.target_power_ids),
        ...targetRefs.map(powerTargetRefLabel)
      ];
      const maxModifier = byId(options.ability_modifiers, effect.power_nullification.max_target_modifier);
      const modifierLimit = maxModifier ? ` up to ${maxModifier.name}` : "";
      const typeLimit = powerTargetTypeLimitLabel(effect.power_nullification, targetRefs);
      lines.push(targets.length ? `Nullifies: ${joinText(targets)}${modifierLimit}${typeLimit}` : `Nullifies powers${modifierLimit}${typeLimit}`);
    }

    if (effect.absorption) {
      const targets = list(effect.absorption.target_power_refs).map(powerTargetRefLabel);
      if (targets.length) lines.push(`Absorbs: ${joinText(targets)}`);
    }

    if (effect.resistance_negation) {
      const resistanceTargets = resistanceNames(effect.resistance_negation.target_resistance_ids);
      const immunityTargets = resistanceNames(effect.resistance_negation.target_immunity_ids);

      lines.push(resistanceTargets.length ? `Negates resistances: ${joinText(resistanceTargets)}` : "Negates resistances");
      if (immunityTargets.length) lines.push(`Negates immunities: ${joinText(immunityTargets)}`);
    }

    if (effect.non_physical_interaction) {
      const targets = list(effect.non_physical_interaction.target_power_refs).map(powerTargetRefLabel);
      lines.push(targets.length ? `Can affect: ${joinText(targets)}` : "Can affect non-physical targets");
    }

    if (effect.nullified_by) {
      const nullifyingPowers = list(effect.nullified_by.power_refs).map(powerRefLabel);
      const nullifyingResistances = list(effect.nullified_by.resistance_refs).map(resistanceRefLabel);
      const sources = [...nullifyingPowers, ...nullifyingResistances];

      if (sources.length) lines.push(`Stopped by: ${joinText(sources)}`);
    }

    return lines;
  }

  function catalogEffectTooltipLines(item = {}, key = null) {
    const lines = [];

    if (item.placeholder) lines.push("Placeholder: no game effect yet");
    lines.push(...grantTooltipLines(item.grants));
    lines.push(...list(item.effects).flatMap((effect) => effectTooltipLines(effect, key)));

    return lines;
  }

  function powerVariant(power, ref) {
    return ref.source_variant
      ? list(power.variants).find((variant) => variant.id === ref.source_variant)
      : null;
  }

  function powerCatalogTooltipLines(power, ref, variant, key = null) {
    const lines = [];
    const includeBase = !variant || variant.inherits_base_grants !== false;
    const magicNatureEffects = magicNaturesFromIds(ref.magic_nature_ids).flatMap((nature) => list(nature.effects));

    if (includeBase) lines.push(...grantTooltipLines(power.grants));
    if (variant) lines.push(...grantTooltipLines(variant.grants));

    if (Array.isArray(ref.effects)) {
      lines.push(...ref.effects.flatMap((effect) => effectTooltipLines(effect, key)));
      lines.push(...magicNatureEffects.flatMap((effect) => effectTooltipLines(effect, key)));
      return lines;
    }

    if (includeBase) lines.push(...list(power.effects).flatMap((effect) => effectTooltipLines(effect, key)));
    if (variant) lines.push(...list(variant.effects).flatMap((effect) => effectTooltipLines(effect, key)));
    lines.push(...magicNatureEffects.flatMap((effect) => effectTooltipLines(effect, key)));

    return lines;
  }

  function derivedRuleTooltipLines(key, rule) {
    const requirements = list(rule.requirements);
    const minMatches = Number.isInteger(rule.min_matches) ? rule.min_matches : requirements.length;
    const requirementTexts = requirements.map(formatStatRequirement).filter(Boolean);
    const metStats = requirements
      .filter((requirement) => meetsStatRequirement(key, requirement))
      .map((requirement) => statLabel(requirement.stat));
    const lines = [`Requires ${minMatches}/${requirements.length} stats`];

    if (requirementTexts.length) lines.push(`Needed: ${joinText(requirementTexts)}`);
    if (metStats.length) lines.push(`Met: ${joinText(metStats)}`);

    return lines;
  }

  function powerTooltipLines(key, ref, power) {
    const lines = [];
    const variant = powerVariant(power, ref);

    if (power.placeholder) lines.push("Placeholder: no game effect yet");
    if (ref.id === "flight") lines.push("Game effect: enables Flight Speed");
    if (ref.id === "regeneration") lines.push("Game effect: first tie-breaker when battle points are tied");
    if (ref.id === "martial-arts-mastery") lines.push("Game effect: fallback tie-breaker if battle points and Regeneration are tied");
    lines.push(...typeTooltipLines(ref.type_ids?.length ? ref.type_ids : power.type_ids));
    lines.push(...refScopeTooltipLines(ref, variant));

    if (ref.derived_rule_id) {
      const rule = byId(options.derived_power_rules, ref.derived_rule_id);
      if (rule) lines.push(...derivedRuleTooltipLines(key, rule));
    }

    lines.push(...powerCatalogTooltipLines(power, ref, variant, key));

    return lines;
  }

  function powerTagItems(key, refs = powerRefs(key)) {
    return refs.map((ref) => {
      const power = byId(options.powers, ref.id);
      if (!power) return null;

      return {
        kind: "power",
        id: ref.id,
        label: powerRefLabel(ref),
        placeholder: Boolean(power.placeholder),
        ref,
        tooltipLines: powerTooltipLines(key, ref, power)
      };
    }).filter(Boolean);
  }

  function resistanceTooltipLines(ref, resistance) {
    const lines = [];
    const resistedPowers = powerNames(resistance.resists_power_ids);
    const resistedEffects = list(resistance.resists_effect_ids).map(humanizeId);

    lines.push(...typeTooltipLines(ref.type_ids));
    lines.push(...refScopeTooltipLines(ref));
    if (resistedPowers.length) lines.push(`Resists: ${joinText(resistedPowers)}`);
    if (resistedEffects.length) lines.push(`Resists effects: ${joinText(resistedEffects)}`);

    return lines;
  }

  function resistanceTagItems(refs) {
    return list(refs).map((ref) => {
      const resistance = byId(options.resistances, ref.id);
      if (!resistance) return null;

      return {
        kind: "resistance",
        id: ref.id,
        label: resistanceRefLabel(ref),
        placeholder: Boolean(resistance.placeholder),
        ref,
        tooltipLines: resistanceTooltipLines(ref, resistance)
      };
    }).filter(Boolean);
  }

  function itemTooltipLines(item, key = null) {
    const lines = [];
    const requiredPowers = list(item.required_power_refs).map(powerRefLabel);

    lines.push(...typeTooltipLines(item.weapon_type_ids, "Weapon types"));
    if (requiredPowers.length) lines.push(`Requires powers: ${joinText(requiredPowers)}`);
    lines.push(...catalogEffectTooltipLines(item, key));

    return lines;
  }

  function catalogTagItems(ids, refs, catalogName, kind, key = null) {
    return catalogItemsFromRefs(itemRefs(ids, refs), catalogName)
      .map((item) => ({
        kind,
        id: item.id,
        label: item.name,
        placeholder: Boolean(item.placeholder),
        catalogItem: item,
        status: key ? itemStatus(item, key) : null,
        tooltipLines: itemTooltipLines(item, key)
      }));
  }

  function equipmentTagItems(ids, refs, key = null) {
    return catalogTagItems(ids, refs, "equipment", "equipment", key);
  }

  function attackTagItems(key) {
    return catalogTagItems(key.attack_ids, [], "attacks", "attack", key);
  }

  function statsForKey(key) {
    return statDefinitions.map(([label, field, catalog, suffix = ""]) => {
      const value = field === "tier"
        ? formatTier(key)
        : field === "speed"
          ? formatSpeed(key)
          : `${formatStat(key[field], catalog)}${suffix}`;

      return {
        label,
        value,
        html: field === "speed" ? speedStatValueHtml(key) : "",
        wide: field === "speed" && speedEntries(key).length > 1,
        rank: statRank(key, field, catalog)
      };
    });
  }

  function tagItemHtml(item) {
    const statusLine = item.status
      ? `Status: ${item.status.label}${item.status.detail ? ` - ${item.status.detail}` : ""}`
      : "";
    const tooltipLines = [statusLine, ...list(item.tooltipLines)].filter(Boolean);
    const statusClass = item.status ? ` tag-status-${item.status.id}` : "";
    const placeholderClass = item.placeholder ? " is-placeholder" : "";
    const tooltipClass = tooltipLines.length ? " has-tooltip" : "";
    const statusIcon = item.status
      ? `<span class="status-icon" aria-hidden="true"></span>`
      : "";

    if (!tooltipLines.length) return `<li class="tag-item${placeholderClass}${statusClass}">${escapeHtml(item.label)}</li>`;

    const tooltipHtml = tooltipLines.map((line) => {
      const separatorIndex = line.indexOf(": ");
      if (separatorIndex === -1) {
        return `<span class="tooltip-summary">${escapeHtml(line)}</span>`;
      }

      const label = line.slice(0, separatorIndex);
      const value = line.slice(separatorIndex + 2);

      return `
        <span class="tooltip-row">
          <span class="tooltip-label">${escapeHtml(label)}</span>
          <span class="tooltip-value">${escapeHtml(value)}</span>
        </span>
      `;
    }).join("");

    return `
      <li class="tag-item${tooltipClass}${placeholderClass}${statusClass}" tabindex="0" aria-label="${escapeHtml(`${item.label}. ${tooltipLines.join(". ")}`)}">
        ${statusIcon}<span class="tag-text">${escapeHtml(item.label)}</span>
        <span class="tag-tooltip" role="tooltip">
          <span class="tooltip-title">${escapeHtml(item.label)}</span>
          ${tooltipHtml}
        </span>
      </li>
    `;
  }

  function characterView(character, keyId = null) {
    if (!character) return null;

    const displayCharacter = character;
    const baseKey = characterKey(character, keyId);
    const itemEffects = activeItemEffects(baseKey);
    const resolvedPowerRefs = powerRefs(baseKey, itemEffects);
    const effects = activeEffects(baseKey, resolvedPowerRefs, itemEffects);
    const key = effectiveKey(baseKey, resolvedPowerRefs, itemEffects, effects);
    const resolvedResistanceRefs = resistanceRefs(baseKey, resolvedPowerRefs, itemEffects);
    const image = activeImage(baseKey, effects);
    const names = list(baseKey.names);

    return {
      character: displayCharacter,
      key: baseKey,
      effectiveKey: key,
      itemEffects,
      powerRefs: resolvedPowerRefs,
      resistanceRefs: resolvedResistanceRefs,
      effects,
      image,
      names,
      details: characterDetails(displayCharacter),
      stats: statsForKey(key),
      sections: [
        ["Powers", powerTagItems(baseKey, resolvedPowerRefs)],
        ["Resistances", resistanceTagItems(resolvedResistanceRefs)],
        ["Standard Equipment", equipmentTagItems(baseKey.standard_equipment_ids, baseKey.standard_equipment_refs, baseKey)],
        ["Optional Equipment", equipmentTagItems(baseKey.optional_equipment_ids, baseKey.optional_equipment_refs, baseKey)],
        ["Attacks/Techniques", attackTagItems(baseKey)]
      ]
    };
  }

  function statGridHtml(stats) {
    return list(stats).map((stat) => `
      <li class="stat${stat.wide ? " stat--wide" : ""}">
        <span class="stat-label">${escapeHtml(stat.label)}</span>
        <span class="stat-value">${stat.html || escapeHtml(stat.value)}</span>
      </li>
    `).join("");
  }

  function tagSectionHtml(titleText, items) {
    const tags = list(items).map(tagItemHtml).join("");
    if (!tags) return "";

    return `<h4 class="section-title">${escapeHtml(titleText)}</h4><ul class="tag-list">${tags}</ul>`;
  }

  function detailFacts(details) {
    const facts = [];
    const classifications = [];

    list(details).forEach((detail) => {
      const separatorIndex = detail.indexOf(": ");
      if (separatorIndex === -1) {
        classifications.push(detail);
        return;
      }

      facts.push({
        label: detail.slice(0, separatorIndex),
        value: detail.slice(separatorIndex + 2)
      });
    });

    return { facts, classifications };
  }

  function detailFactItemHtml({ label, value }) {
    return `
      <li class="meta-fact-item">
        <span class="meta-label">${escapeHtml(label)}</span>
        <span class="meta-value">${escapeHtml(value)}</span>
      </li>
    `;
  }

  function detailClassificationGroupHtml(classifications) {
    if (!classifications.length) return "";

    const classificationItems = classifications
      .map((classification) => `<li>${escapeHtml(classification)}</li>`)
      .join("");

    return `
      <li class="meta-classification-group">
        <span class="meta-label">${classifications.length === 1 ? "Classification" : "Classifications"}</span>
        <ul class="meta-chip-list">
          ${classificationItems}
        </ul>
      </li>
    `;
  }

  function detailFactsHtml(details) {
    const { facts, classifications } = detailFacts(details);

    return [
      ...facts.map(detailFactItemHtml),
      detailClassificationGroupHtml(classifications)
    ].join("");
  }

  function detailListHtml(details, detailStyle = "chips") {
    const detailTags = detailStyle === "facts"
      ? detailFactsHtml(details)
      : list(details).map((detail) => `<li>${escapeHtml(detail)}</li>`).join("");
    if (!detailTags) return "";

    const styleClass = detailStyle === "facts" ? " meta-list--facts" : "";

    return `<ul class="meta-list${styleClass}" aria-label="Character details">${detailTags}</ul>`;
  }

  function characterProfileHtml(view, { includeStats = true, includeSections = true, imagePlacement = "hero", detailStyle = "chips" } = {}) {
    const sectionHtml = view.sections
      .map(([sectionTitle, items]) => tagSectionHtml(sectionTitle, items))
      .join("");
    const imageTitle = view.image ? `${title(view.character.name)} - ${view.image.name}` : "";
    const imageMarkup = view.image ? `
      <img
        src="${escapeHtml(assetUrl(view.image.image))}"
        alt="${escapeHtml(view.image.name)}"
        data-trim-image
        loading="lazy"
        decoding="async"
      >
    ` : `<div class="empty-image">?</div>`;
    const expandButton = view.image ? `
      <button
        class="image-expand-button"
        type="button"
        data-image-expand
        data-image-src="${escapeHtml(assetUrl(view.image.image))}"
        data-image-title="${escapeHtml(imageTitle)}"
        aria-controls="image-lightbox"
        aria-haspopup="dialog"
        aria-label="Open full-size image for ${escapeHtml(title(view.character.name))}"
      >
        <svg class="image-expand-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M15 3h6v6"></path>
          <path d="M21 3l-7 7"></path>
          <path d="M9 21H3v-6"></path>
          <path d="M3 21l7-7"></path>
        </svg>
        <span class="image-expand-label visually-hidden">Open full-size image</span>
      </button>
    ` : "";
    const heroImage = imagePlacement === "hero" ? `
      <div class="character-image">
        ${imageMarkup}
        ${expandButton}
      </div>
    ` : "";
    const identityImage = imagePlacement === "identity" ? `
      <div class="character-portrait" aria-label="${escapeHtml(imageTitle)}">
        ${imageMarkup}
        ${expandButton}
      </div>
    ` : "";

    return `
      ${heroImage}
      <div class="character-content">
        <div class="character-identity${identityImage ? " character-identity--with-image" : ""}">
          <div class="character-title-block">
            <div class="character-heading-row">
              <h3 class="character-heading">${escapeHtml(title(view.character.name))}</h3>
            </div>
            <p class="character-subtitle">${escapeHtml(view.names.join(" / "))}</p>
          </div>
          ${identityImage}
        </div>
        ${detailListHtml(view.details, detailStyle)}
        ${includeStats ? `<ul class="stat-grid">${statGridHtml(view.stats)}</ul>` : ""}
        ${includeSections ? sectionHtml : ""}
      </div>
    `;
  }

  function emptyCharacterCardHtml() {
    return `
      <div class="character-empty-state" aria-live="polite">
        <span class="character-empty-mark" aria-hidden="true">VS</span>
        <p>No character selected</p>
      </div>
    `;
  }

  function renderCard(card, character, keyId = null) {
    const view = characterView(character, keyId);
    card.classList.toggle("is-empty", !view);

    if (!view) {
      card.hidden = false;
      card.innerHTML = emptyCharacterCardHtml();
      return;
    }

    card.hidden = false;
    card.innerHTML = characterProfileHtml(view);
  }

  function effectNullifiesPower(effect, ref) {
    if (!effect?.power_nullification) return false;

    const targetIds = list(effect.power_nullification.target_power_ids);
    const targetRefs = list(effect.power_nullification.target_power_refs);
    const hasTargets = targetIds.length > 0 || targetRefs.length > 0;
    const targetMatches = hasTargets
      ? targetIds.includes(ref.id) || targetRefs.some((targetRef) => powerTargetRefMatches(ref, targetRef))
      : true;
    const maxTargetModifier = byId(options.ability_modifiers, effect.power_nullification.max_target_modifier);
    const modifierMatches = !maxTargetModifier || abilityModifierRank(ref) <= maxTargetModifier.coverage_rank;
    const maxTargetTypeRank = Number(effect.power_nullification.max_target_type_rank);
    const typeMatches = !Number.isFinite(maxTargetTypeRank) || powerTypeRank(ref) <= maxTargetTypeRank;

    return targetMatches && modifierMatches && typeMatches;
  }

  function effectAbsorbsPower(effect, ref, sourceRef = {}) {
    if (!effect?.absorption) return false;

    const targets = list(effect.absorption.target_power_refs);
    return targets.some((targetRef) => powerTargetRefMatches(ref, targetRef))
      && abilityModifierRank(sourceRef) >= abilityModifierRank(ref);
  }

  function effectPowerBlockStatus(effect, ref, sourceRef = {}) {
    if (effectNullifiesPower(effect, ref)) return status("nullified");
    if (effectAbsorbsPower(effect, ref, sourceRef)) return status("absorbed");

    return null;
  }

  function effectNegatesResistance(effect, ref) {
    if (!effect?.resistance_negation) return false;

    const level = byId(options.resistance_levels, ref.level || "resistant");
    const targetIds = list(effect.resistance_negation.target_resistance_ids);
    const immunityTargetIds = list(effect.resistance_negation.target_immunity_ids);

    if (level?.id === "immunity") return immunityTargetIds.includes(ref.id);

    return targetIds.length === 0 || targetIds.includes(ref.id);
  }

  function powerNullifiedBy(ref, opponentView) {
    const nullifyingPower = opponentView.powerRefs.find((opponentRef) => (
      powerRefEffects(opponentRef).some((effect) => effectPowerBlockStatus(effect, ref, opponentRef))
    ));

    if (nullifyingPower) {
      const blockStatus = powerRefEffects(nullifyingPower)
        .map((effect) => effectPowerBlockStatus(effect, ref, nullifyingPower))
        .find(Boolean);
      const verb = blockStatus?.id === "absorbed" ? "absorbs" : "blocks";

      return status(blockStatus?.id || "nullified", `${powerRefLabel(nullifyingPower)} ${verb} this power`);
    }

    const itemBlockStatus = opponentView.itemEffects
      .map((effect) => effectPowerBlockStatus(effect, ref))
      .find(Boolean);

    if (itemBlockStatus) {
      const verb = itemBlockStatus.id === "absorbed" ? "absorbs" : "targets";

      return status(itemBlockStatus.id, `Opponent equipment or attack ${verb} this power`);
    }

    return null;
  }

  function resistanceNegatedBy(ref, opponentView) {
    const negatingPower = opponentView.powerRefs.find((opponentRef) => (
      powerRefEffects(opponentRef).some((effect) => effectNegatesResistance(effect, ref))
    ));

    if (negatingPower) {
      return status("negated", `${powerRefLabel(negatingPower)} targets this resistance`);
    }

    if (opponentView.itemEffects.some((effect) => effectNegatesResistance(effect, ref))) {
      return status("negated", "Opponent equipment or attack targets this resistance");
    }

    return null;
  }

  function effectiveResistanceRefsFor(view, opponentView) {
    return view.resistanceRefs.filter((ref) => !resistanceNegatedBy(ref, opponentView));
  }

  function resistanceBlocksPower(powerRef, resistanceRef) {
    const resistance = byId(options.resistances, resistanceRef.id);
    if (!list(resistance?.resists_power_ids).includes(powerRef.id)) return false;

    const level = byId(options.resistance_levels, resistanceRef.level || "resistant");
    return level?.id === "immunity" || abilityModifierRank(resistanceRef) >= abilityModifierRank(powerRef);
  }

  function resistanceRefMeetsRequirement(ownedRef, requiredRef) {
    if (!ownedRef || !requiredRef || ownedRef.id !== requiredRef.id) return false;
    if (requiredRef.source_variant && ownedRef.source_variant !== requiredRef.source_variant) return false;
    if (resistanceLevelRank(ownedRef) < resistanceLevelRank(requiredRef)) return false;
    if (abilityModifierRank(ownedRef) < abilityModifierRank(requiredRef)) return false;
    if (magicLevelRank(ownedRef) < magicLevelRank(requiredRef)) return false;

    return powerTypesCover(ownedRef.type_ids, requiredRef.type_ids);
  }

  function powerResistedBy(ref, ownerView, opponentView) {
    const resistingRef = effectiveResistanceRefsFor(opponentView, ownerView)
      .find((opponentResistanceRef) => resistanceBlocksPower(ref, opponentResistanceRef));

    if (!resistingRef) return null;

    return status("resisted", `${resistanceRefLabel(resistingRef)} blocks this power`);
  }

  function effectBlockedBy(effect, ownerView, opponentView) {
    const rules = effect?.nullified_by;
    if (!rules) return null;

    const blockingResistance = effectiveResistanceRefsFor(opponentView, ownerView)
      .find((opponentResistanceRef) => (
        list(rules.resistance_refs).some((requiredRef) => (
          resistanceRefMeetsRequirement(opponentResistanceRef, requiredRef)
        ))
      ));

    if (blockingResistance) {
      return status("resisted", `${resistanceRefLabel(blockingResistance)} stops this effect`);
    }

    const blockingPower = list(opponentView.powerRefs).find((opponentPowerRef) => (
      list(rules.power_refs).some((requiredRef) => powerRefMeetsRequirement(opponentPowerRef, requiredRef))
    ));

    if (blockingPower) {
      return status("nullified", `${powerRefLabel(blockingPower)} stops this effect`);
    }

    return null;
  }

  function powerEffectsBlockedBy(ref, ownerView, opponentView) {
    const effects = powerRefEffects(ref);
    const blockedEffects = effects
      .map((effect) => effectBlockedBy(effect, ownerView, opponentView))
      .filter(Boolean);

    return effects.length > 0 && blockedEffects.length === effects.length ? blockedEffects[0] : null;
  }

  function hasMatchingPowerRef(ref, refs) {
    const refKey = powerRefKey(ref);

    return list(refs).some((candidate) => powerRefKey(candidate) === refKey);
  }

  function hasMatchingResistanceRef(ref, refs) {
    const refKey = resistanceRefKey(ref);

    return list(refs).some((candidate) => resistanceRefKey(candidate) === refKey);
  }

  function battleTagStatus(item, ownerView, opponentView, ownerBattleView = ownerView) {
    if (item.status?.id === "disabled") return item.status;

    if (item.kind === "power") {
      return powerNullifiedBy(item.ref, opponentView)
        || powerResistedBy(item.ref, ownerView, opponentView)
        || powerEffectsBlockedBy(item.ref, ownerView, opponentView)
        || (hasMatchingPowerRef(item.ref, ownerBattleView.powerRefs) ? null : status("disabled", "Source power is inactive in this battle"))
        || status("active");
    }

    if (item.kind === "resistance") {
      return resistanceNegatedBy(item.ref, opponentView)
        || (hasMatchingResistanceRef(item.ref, ownerBattleView.resistanceRefs) ? null : status("disabled", "Source power is inactive in this battle"))
        || status("active");
    }

    if ((item.kind === "equipment" || item.kind === "attack") && item.catalogItem) {
      return itemStatusForPowerRefs(item.catalogItem, ownerBattleView.powerRefs, "Required power is inactive in this battle")
        || item.status
        || status("active");
    }

    return item.status || status("active");
  }

  function battleTagItem(item, ownerView, opponentView, ownerBattleView = ownerView) {
    return {
      ...item,
      status: battleTagStatus(item, ownerView, opponentView, ownerBattleView)
    };
  }

  function powerBlockedInBattle(ref, ownerView, opponentView) {
    return powerNullifiedBy(ref, opponentView) || powerResistedBy(ref, ownerView, opponentView);
  }

  function battleEffectiveView(view, opponentView) {
    const includeEffect = (effect) => !effectBlockedBy(effect, view, opponentView);
    const requirementPowerRefs = powerRefs(
      view.key,
      [],
      (ref) => !powerBlockedInBattle(ref, view, opponentView),
      includeEffect
    );
    const itemEffects = activeItemEffectsForPowerRefs(view.key, requirementPowerRefs);
    const resolvedPowerRefs = powerRefs(
      view.key,
      itemEffects,
      (ref) => !powerBlockedInBattle(ref, view, opponentView),
      includeEffect
    );
    const effects = activeEffects(view.key, resolvedPowerRefs, itemEffects, includeEffect);
    const key = effectiveKey(view.key, resolvedPowerRefs, itemEffects, effects);

    return {
      ...view,
      effectiveKey: key,
      powerRefs: resolvedPowerRefs,
      resistanceRefs: resistanceRefs(view.key, resolvedPowerRefs, itemEffects, includeEffect),
      itemEffects,
      effects,
      stats: statsForKey(key)
    };
  }

  function statComparisonClass(rank, otherRank) {
    if (rank > otherRank) return "higher";
    if (rank < otherRank) return "lower";

    return "same";
  }

  function rankValue(stat) {
    return stat?.rank || 0;
  }

  function comparisonPair(label, leftStat, rightStat) {
    const leftRank = rankValue(leftStat);
    const rightRank = rankValue(rightStat);

    return {
      label,
      left: leftStat,
      right: rightStat,
      leftClass: statComparisonClass(leftRank, rightRank),
      rightClass: statComparisonClass(rightRank, leftRank)
    };
  }

  function speedBattleStat(key, field, fallbackLabel) {
    if (!key?.[field]) return null;

    return {
      label: speedComparisonLabel(field, fallbackLabel),
      value: formatStat(key[field], "speed_tiers"),
      rank: compositeRank(key[field], "speed_tiers")
    };
  }

  function unpairedSpeedNotes(key, opponentKey) {
    return speedDefinitions
      .filter(([field]) => field !== "combat_speed" && key?.[field] && !opponentKey?.[field])
      .map(([field, fallbackLabel]) => {
        const label = speedComparisonLabel(field, fallbackLabel);
        return `${label} - ${formatStat(key[field], "speed_tiers")}${speedNote(key[field])}`;
      });
  }

  function speedBattlePairs(leftView, rightView) {
    const leftKey = leftView.effectiveKey;
    const rightKey = rightView.effectiveKey;
    const comparableSpeedDefinitions = speedDefinitions
      .filter(([field]) => field === "combat_speed" || (leftKey?.[field] && rightKey?.[field]));
    const useSpecificCombatLabel = comparableSpeedDefinitions.length > 1;
    const rows = comparableSpeedDefinitions
      .map(([field, fallbackLabel]) => {
        const leftStat = speedBattleStat(leftKey, field, fallbackLabel);
        const rightStat = speedBattleStat(rightKey, field, fallbackLabel);
        const label = field === "combat_speed" && !useSpecificCombatLabel
          ? "Speed"
          : speedComparisonLabel(field, fallbackLabel);

        return comparisonPair(label, leftStat, rightStat);
      });

    const leftNotes = unpairedSpeedNotes(leftKey, rightKey);
    const rightNotes = unpairedSpeedNotes(rightKey, leftKey);
    if (rows[0]) {
      if (leftNotes.length && rows[0].left) rows[0].left.note = `Shown only here: ${joinText(leftNotes)}`;
      if (rightNotes.length && rows[0].right) rows[0].right.note = `Shown only here: ${joinText(rightNotes)}`;
    }

    return rows;
  }

  function battleStatPairs(leftView, rightView) {
    return statDefinitions.flatMap(([label, field]) => {
      if (field === "speed") return speedBattlePairs(leftView, rightView);

      const leftStat = leftView.stats.find((stat) => stat.label === label);
      const rightStat = rightView.stats.find((stat) => stat.label === label);

      return comparisonPair(label, leftStat, rightStat);
    });
  }

  function battleWinner(leftRank, rightRank) {
    if (leftRank > rightRank) return "left";
    if (rightRank > leftRank) return "right";

    return "tie";
  }

  function strongestRankedPowerRef(view, powerId, ranker) {
    return list(view.powerRefs)
      .filter((ref) => ref.id === powerId)
      .reduce((best, ref) => {
        if (!best) return ref;

        const rankDiff = ranker(ref) - ranker(best);
        if (rankDiff > 0) return ref;
        if (rankDiff === 0 && compareRefStrength(ref, best) > 0) return ref;

        return best;
      }, null);
  }

  function powerRefTieBreaker(leftView, rightView, powerId, label, ranker) {
    const leftRef = strongestRankedPowerRef(leftView, powerId, ranker);
    const rightRef = strongestRankedPowerRef(rightView, powerId, ranker);
    const leftRank = ranker(leftRef);
    const rightRank = ranker(rightRef);

    return {
      label,
      leftValue: leftRef ? powerRefLabel(leftRef) : "None",
      rightValue: rightRef ? powerRefLabel(rightRef) : "None",
      leftRank,
      rightRank,
      rankGap: Math.abs(leftRank - rightRank),
      winner: battleWinner(leftRank, rightRank)
    };
  }

  function battleTieBreakers(leftView, rightView) {
    return [
      powerRefTieBreaker(leftView, rightView, "regeneration", "Regeneration", powerTypeRank),
      powerRefTieBreaker(leftView, rightView, "martial-arts-mastery", "Martial Arts Mastery", degreeRank)
    ];
  }

  const nonPhysicalProtectionPowerIds = new Set([
    "intangibility",
    "incorporeality",
    "abstract-existence",
    "nonexistent-physiology"
  ]);

  function nonPhysicalTargetCoversProtection(targetRef, protectionRef) {
    if (!targetRef || !protectionRef || targetRef.id !== protectionRef.id) return false;

    const protectionTypeIds = list(protectionRef.type_ids);
    const targetTypeIds = list(targetRef.type_ids);
    if (protectionTypeIds.length) return powerTypesCover(targetTypeIds, protectionTypeIds);

    const availableTypes = list(options.power_types).filter((type) => type.power_id === protectionRef.id);
    if (!availableTypes.length) return true;

    return targetTypeIds.some((typeId) => byId(options.power_types, typeId)?.covers_all);
  }

  function nonPhysicalInteractionTargets(view) {
    return list(view.effects).flatMap((effect) => (
      list(effect?.non_physical_interaction?.target_power_refs)
    ));
  }

  function activeNonPhysicalProtections(view) {
    return list(view.powerRefs).filter((ref) => nonPhysicalProtectionPowerIds.has(ref.id));
  }

  function nonPhysicalAttackStatus(attackerView, targetView) {
    const interactionTargets = nonPhysicalInteractionTargets(attackerView);
    const blockedBy = activeNonPhysicalProtections(targetView)
      .filter((protectionRef) => !interactionTargets.some((targetRef) => (
        nonPhysicalTargetCoversProtection(targetRef, protectionRef)
      )))
      .map(powerTargetRefLabel);

    return {
      canAffect: blockedBy.length === 0,
      blockedBy
    };
  }

  function battleInteractionOutcome(leftView, rightView) {
    const leftAttack = nonPhysicalAttackStatus(leftView, rightView);
    const rightAttack = nonPhysicalAttackStatus(rightView, leftView);
    if (leftAttack.canAffect && rightAttack.canAffect) return null;

    const leftName = title(leftView.character.name);
    const rightName = title(rightView.character.name);
    if (leftAttack.canAffect) {
      return {
        winner: "left",
        summary: `${rightName} cannot affect ${leftName}`,
        detail: `Blocked by ${joinText(rightAttack.blockedBy)}`
      };
    }

    if (rightAttack.canAffect) {
      return {
        winner: "right",
        summary: `${leftName} cannot affect ${rightName}`,
        detail: `Blocked by ${joinText(leftAttack.blockedBy)}`
      };
    }

    return {
      winner: "tie",
      summary: "Neither combatant can affect the other",
      detail: `${leftName} is blocked by ${joinText(leftAttack.blockedBy)}; ${rightName} is blocked by ${joinText(rightAttack.blockedBy)}`
    };
  }

  function battleStatRowsHtml(leftView, rightView, pairs = battleStatPairs(leftView, rightView), score = null) {
    const leftName = title(leftView.character.name);
    const rightName = title(rightView.character.name);
    const scoreRows = new Map(list(score?.rows).map((row) => [row.label, row]));

    return pairs.map(({ label, left, right, leftClass, rightClass }) => {
      const scoreRow = scoreRows.get(label);
      const resultDetail = score
        ? scoreRow
          ? scoreRow.winner === "tie"
            ? "Even"
            : `${scoreRow.winner === "left" ? leftName : rightName} +${scoreRow.rankGap}`
          : "Excluded"
        : "";

      return `
        <li class="battle-stat-row${score ? " is-scored" : ""}">
          <div class="battle-stat-cell is-${leftClass}">
            <span class="battle-side-label">${escapeHtml(leftName)}</span>
            <span class="stat-value">${escapeHtml(left?.value || "")}</span>
            ${scoreRow ? `<small class="battle-stat-points">${scoreRow.leftRank} pts</small>` : ""}
            ${left?.note ? `<small class="battle-stat-note">${escapeHtml(left.note)}</small>` : ""}
          </div>
          <span class="battle-stat-label">
            <strong>${escapeHtml(label)}</strong>
            ${score ? `<small>${escapeHtml(resultDetail)}</small>` : ""}
          </span>
          <div class="battle-stat-cell is-${rightClass}">
            <span class="battle-side-label">${escapeHtml(rightName)}</span>
            <span class="stat-value">${escapeHtml(right?.value || "")}</span>
            ${scoreRow ? `<small class="battle-stat-points">${scoreRow.rightRank} pts</small>` : ""}
            ${right?.note ? `<small class="battle-stat-note">${escapeHtml(right.note)}</small>` : ""}
          </div>
        </li>
      `;
    }).join("");
  }

  function battleScore(leftView, rightView, pairs = battleStatPairs(leftView, rightView)) {
    const rows = pairs
      .filter((row) => !battleScoreExcludedLabels.has(row.label))
      .map((row) => {
        const leftRank = rankValue(row.left);
        const rightRank = rankValue(row.right);
        const winner = battleWinner(leftRank, rightRank);

        return {
          label: row.label,
          leftValue: row.left?.value || "",
          rightValue: row.right?.value || "",
          leftRank,
          rightRank,
          rankGap: Math.abs(leftRank - rightRank),
          winner
        };
      });

    const leftScore = rows.reduce((total, row) => total + row.leftRank, 0);
    const rightScore = rows.reduce((total, row) => total + row.rightRank, 0);
    const scoreGap = Math.abs(leftScore - rightScore);
    const pointWinner = battleWinner(leftScore, rightScore);
    const interaction = battleInteractionOutcome(leftView, rightView);
    const activeTieBreaker = !interaction && pointWinner === "tie"
      ? battleTieBreakers(leftView, rightView).find((tieBreaker) => tieBreaker.winner !== "tie")
      : null;

    return {
      rows,
      leftScore,
      rightScore,
      scoreGap,
      statCount: rows.length,
      winner: interaction?.winner || activeTieBreaker?.winner || pointWinner,
      tieBreaker: activeTieBreaker,
      interaction
    };
  }

  function battleResultHtml(leftView, rightView, pairs) {
    const score = battleScore(leftView, rightView, pairs);
    const leftName = title(leftView.character.name);
    const rightName = title(rightView.character.name);
    const winnerText = score.winner === "left"
      ? `${leftName} wins`
      : score.winner === "right"
        ? `${rightName} wins`
        : "Draw";
    const scoreDetail = score.interaction
      ? score.interaction.winner === "tie" ? "Stalemate" : "Automatic win"
      : score.tieBreaker
      ? `Tie-breaker · ${score.tieBreaker.label}`
      : score.winner === "tie"
      ? "Scores tied"
      : `+${score.scoreGap} pts`;
    const summary = `${winnerText} · ${scoreDetail}`;

    return `
      <div class="battle-score" data-battle-summary="${escapeHtml(summary)}">
        <div class="battle-score-side">
          <span class="battle-score-name">${escapeHtml(leftName)}</span>
          <strong>${score.leftScore} <small>pts</small></strong>
        </div>
        <div class="battle-score-summary">
          <strong>${escapeHtml(winnerText)}</strong>
          <span>${escapeHtml(scoreDetail)}</span>
          ${score.interaction ? `<small>${escapeHtml(score.interaction.summary)}</small>` : ""}
        </div>
        <div class="battle-score-side">
          <span class="battle-score-name">${escapeHtml(rightName)}</span>
          <strong>${score.rightScore} <small>pts</small></strong>
        </div>
      </div>
      <ul class="battle-stat-list">${battleStatRowsHtml(leftView, rightView, pairs, score)}</ul>
    `;
  }

  function battleSectionRowsHtml(leftView, rightView, leftBattleView = leftView, rightBattleView = rightView) {
    return leftView.sections.map(([sectionTitle, leftItems], index) => {
      const rightItems = rightView.sections[index]?.[1] || [];
      const leftTags = list(leftItems)
        .map((item) => battleTagItem(item, leftView, rightView, leftBattleView))
        .map(tagItemHtml)
        .join("");
      const rightTags = list(rightItems)
        .map((item) => battleTagItem(item, rightView, leftView, rightBattleView))
        .map(tagItemHtml)
        .join("");

      if (!leftTags && !rightTags) return "";

      return `
        <details class="battle-fold" open>
          <summary class="battle-fold-summary">
            <span>${escapeHtml(sectionTitle)}</span>
            <small>Battle status</small>
          </summary>
          <section class="battle-section">
            <div class="battle-section-grid">
              <ul class="tag-list">${leftTags}</ul>
              <ul class="tag-list">${rightTags}</ul>
            </div>
          </section>
        </details>
      `;
    }).join("");
  }

  function renderBattle(content, leftSelection, rightSelection) {
    const baseLeftView = characterView(leftSelection.character, leftSelection.keyId);
    const baseRightView = characterView(rightSelection.character, rightSelection.keyId);
    const leftView = battleEffectiveView(baseLeftView, baseRightView);
    const rightView = battleEffectiveView(baseRightView, baseLeftView);
    const statPairs = battleStatPairs(leftView, rightView);

    content.innerHTML = `
      <details class="battle-fold" open>
        <summary class="battle-fold-summary">
          <span>Combatants</span>
          <small class="battle-matchup">
            <span>${escapeHtml(title(baseLeftView.character.name))}</span>
            <strong>VS</strong>
            <span>${escapeHtml(title(baseRightView.character.name))}</span>
          </small>
        </summary>
        <div class="battle-combatants">
          <article class="battle-character-card">${characterProfileHtml(baseLeftView, { includeStats: false, includeSections: false, imagePlacement: "identity", detailStyle: "facts" })}</article>
          <article class="battle-character-card">${characterProfileHtml(baseRightView, { includeStats: false, includeSections: false, imagePlacement: "identity", detailStyle: "facts" })}</article>
        </div>
      </details>
      <details class="battle-fold" open>
        <summary class="battle-fold-summary">
          <span>Comparison</span>
          <small data-battle-comparison-status>Tier excluded</small>
        </summary>
        <section class="battle-comparison" aria-label="Stat comparison" aria-live="polite" data-battle-comparison>
          <ul class="battle-stat-list">${battleStatRowsHtml(leftView, rightView, statPairs)}</ul>
        </section>
      </details>
      ${battleSectionRowsHtml(baseLeftView, baseRightView, leftView, rightView)}
    `;

    return { left: leftView, right: rightView, statPairs };
  }


  Object.assign(window.NexyCharacters, {
    battleResultHtml,
    battleScore,
    characterView,
    renderBattle,
    renderCard
  });
})();
