(() => {
  const data = JSON.parse(document.getElementById("character-data").textContent);
  data.empty_character = normalizeCharacterEntry("empty", data.empty_character);
  data.characters = normalizeCharacterEntries(data.characters);

  const options = data.options;
  const statModifiers = options.stat_modifiers;
  const optionMaps = new WeakMap();

  Object.values(options).forEach((items) => {
    if (!Array.isArray(items)) return;

    optionMaps.set(items, new Map(
      items
        .filter((item) => item && item.id !== undefined)
        .map((item) => [item.id, item])
    ));
  });

  const statDefinitions = [
    ["Tier", "tier"],
    ["Attack Potency", "attack_potency", "attack_durability_tiers"],
    ["Speed", "speed"],
    ["Lifting Strength", "lifting_strength", "lifting_strength_tiers"],
    ["Striking Strength", "striking_strength", "striking_strength_tiers"],
    ["Durability", "durability", "attack_durability_tiers"],
    ["Stamina", "stamina", "stamina_tiers"],
    ["Range", "range", "range_tiers"],
    ["Intelligence", "intelligence", "intelligence_tiers"]
  ];
  const battleScoreExcludedLabels = new Set(["Tier"]);

  const speedDefinitions = [
    ["combat_speed", "combat speed"],
    ["attack_speed", "attack speed"],
    ["reaction_speed", "reactions"],
    ["travel_speed", "movement speed"],
    ["flight_speed", "flight speed"]
  ];

  const statCatalogs = {
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

  const statLabels = {
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
  const statusDefinitions = {
    active: { id: "active", label: "Active" },
    disabled: { id: "disabled", label: "Disabled" },
    negated: { id: "negated", label: "Negated" },
    nullified: { id: "nullified", label: "Nullified" },
    resisted: { id: "resisted", label: "Resisted" }
  };

  const byId = (items, id) => {
    if (!items || typeof items !== "object") return undefined;

    return optionMaps.get(items)?.get(id);
  };
  const title = (value) => value || "Empty Character";
  const list = (value) => Array.isArray(value) ? value : [];
  const idListKey = (ids) => list(ids).slice().sort().join(",");
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));

  function normalizeCharacterEntry(entryId, character) {
    return { ...character, entry_id: entryId };
  }

  function normalizeCharacterEntries(entries) {
    if (Array.isArray(entries)) return entries;

    return Object.entries(entries || {})
      .filter(([entryId]) => entryId !== "empty")
      .map(([entryId, character]) => normalizeCharacterEntry(entryId, character));
  }

  function assetUrl(path) {
    const value = String(path || "");
    if (!value || /^(?:[a-z]+:)?\/\//i.test(value) || value.startsWith("data:")) return value;

    const baseurl = data.baseurl || "";
    const normalizedPath = value.startsWith("/") ? value : `/${value}`;
    if (baseurl && normalizedPath.startsWith(`${baseurl}/`)) return normalizedPath;

    return `${baseurl}${normalizedPath}`;
  }

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
    return Math.max(
      compositeRank(key.attack_potency, "attack_durability_tiers"),
      compositeRank(key.durability, "attack_durability_tiers")
    );
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
    const attack = key.attack_potency;
    const durability = key.durability;
    const attackRank = compositeRank(attack, "attack_durability_tiers");
    const durabilityRank = compositeRank(durability, "attack_durability_tiers");
    const chosen = durabilityRank > attackRank ? durability : attack;
    const entry = statEntry(chosen, "attack_durability_tiers");

    return entry ? statDisplayValue(entry, "attack_durability_tiers", "tier") : "";
  }

  function joinText(items) {
    if (items.length <= 1) return items[0] || "";
    if (items.length === 2) return `${items[0]} and ${items[1]}`;

    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  }

  function joinSpeedGroups(items) {
    return items.join(", ");
  }

  function speedLabel(stat, fallbackLabel) {
    const normalized = normalizedStat(stat);
    return normalized && Object.prototype.hasOwnProperty.call(normalized, "label") ? normalized.label : fallbackLabel;
  }

  function speedNote(stat) {
    const normalized = normalizedStat(stat);
    return normalized?.note ? ` (${normalized.note})` : "";
  }

  function formatSpeed(key) {
    const entries = speedDefinitions
      .filter(([field]) => key[field])
      .map(([field, fallbackLabel]) => ({
        field,
        label: speedLabel(key[field], fallbackLabel),
        note: speedNote(key[field]),
        value: formatStat(key[field], "speed_tiers")
      }))
      .filter((entry) => entry.value);

    if (entries.length === 0) return "";
    if (entries.length === 1 && entries[0].field === "combat_speed") {
      return `${entries[0].value}${entries[0].note}`;
    }

    const groups = [];
    entries.forEach((entry) => {
      const group = groups.find((candidate) => candidate.value === entry.value && candidate.note === entry.note);
      if (group) {
        group.labels.push(entry.label);
      } else {
        groups.push({ value: entry.value, note: entry.note, labels: [entry.label] });
      }
    });

    return joinSpeedGroups(groups.map((group) => {
      const labels = group.labels.filter((label) => label !== "");
      const labelText = labels.length > 0 ? ` ${joinText(labels)}` : "";
      return `${group.value}${labelText}${group.note}`;
    }));
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

  function nameList(ids, catalogName) {
    return list(ids)
      .map((id) => byId(options[catalogName], id))
      .filter(Boolean)
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
    return keys.find((key) => key.key === keyId) || keys[0] || list(data.empty_character.keys)[0];
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

  function activeItemEffects(key) {
    const ownedPowerRefs = powerRefs(key, []);
    const standardEquipmentEffects = list(key.standard_equipment_ids)
      .map((id) => byId(options.equipment, id))
      .filter(Boolean)
      .filter((item) => powerRefsMeetRequirements(ownedPowerRefs, item.required_power_refs))
      .flatMap((item) => list(item.effects));
    const attackEffects = list(key.attack_ids)
      .map((id) => byId(options.attacks, id))
      .filter(Boolean)
      .filter((item) => powerRefsMeetRequirements(ownedPowerRefs, item.required_power_refs))
      .flatMap((item) => list(item.effects));

    return [...standardEquipmentEffects, ...attackEffects];
  }

  function itemStatus(item, key) {
    const requiredRefs = list(item.required_power_refs);
    if (!requiredRefs.length) return null;

    const ownedPowerRefs = powerRefs(key, []);
    if (powerRefsMeetRequirements(ownedPowerRefs, requiredRefs)) return null;

    return status("disabled", `Missing ${joinText(requiredRefs.map(powerRefLabel))}`);
  }

  function magicLevelsFromIds(ids) {
    const levels = [];
    const seen = new Set();
    const queue = list(ids);

    for (let index = 0; index < queue.length; index += 1) {
      const id = queue[index];
      if (!id || seen.has(id)) continue;

      const level = byId(options.magic_levels, id);
      if (!level) continue;

      seen.add(id);
      levels.push(level);
      queue.push(...list(level.inherits_level_ids));
    }

    return levels;
  }

  function magicNaturesFromIds(ids) {
    const natures = [];
    const seen = new Set();
    const queue = list(ids);

    for (let index = 0; index < queue.length; index += 1) {
      const id = queue[index];
      if (!id || seen.has(id)) continue;

      const nature = byId(options.magic_natures, id);
      if (!nature) continue;

      seen.add(id);
      natures.push(nature);
      queue.push(...list(nature.inherits_nature_ids));
    }

    return natures;
  }

  function powerRefsFromGrants(grants = {}) {
    const grantData = grants || {};

    return [
      ...list(grantData.power_refs),
      ...magicLevelsFromIds(grantData.magic_level_ids).flatMap((level) => list(level.power_refs))
    ];
  }

  function resistanceRefsFromGrants(grants = {}) {
    const grantData = grants || {};

    return [
      ...list(grantData.resistance_refs),
      ...magicLevelsFromIds(grantData.magic_level_ids).flatMap((level) => list(level.resistance_refs))
    ];
  }

  function grantedPowerRefsFromEffects(effects) {
    return list(effects).flatMap((effect) => powerRefsFromGrants(effect?.grants));
  }

  function grantedResistanceRefsFromEffects(effects) {
    return list(effects).flatMap((effect) => resistanceRefsFromGrants(effect?.grants));
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

  function grantedPowerRefsFromPowerRef(ref) {
    const { power, variant, includeBase } = powerRefContext(ref);
    const magicNatures = magicNaturesFromIds(ref.magic_nature_ids);

    return [
      ...(includeBase ? powerRefsFromGrants(power?.grants) : []),
      ...powerRefsFromGrants(variant?.grants),
      ...magicNatures.flatMap((nature) => list(nature.power_refs)),
      ...grantedPowerRefsFromEffects(powerRefEffects(ref))
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

  function compareRefStrength(a, b) {
    const left = refStrength(a);
    const right = refStrength(b);

    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return left[index] - right[index];
    }

    return 0;
  }

  function powerRefs(key, itemEffects = activeItemEffects(key), includeRef = () => true) {
    const refs = [];
    const refIndexes = new Map();
    const queue = [
      ...list(key.power_refs),
      ...derivedPowerRefs(key),
      ...grantedPowerRefsFromEffects(itemEffects)
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

      queue.push(...grantedPowerRefsFromPowerRef(ref));
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

  function grantedResistanceRefsFromPowerRef(ref) {
    const { power, variant, includeBase } = powerRefContext(ref);
    const magicNatures = magicNaturesFromIds(ref.magic_nature_ids);

    return [
      ...(includeBase ? resistanceRefsFromGrants(power?.grants) : []),
      ...resistanceRefsFromGrants(variant?.grants),
      ...magicNatures.flatMap((nature) => list(nature.resistance_refs)),
      ...grantedResistanceRefsFromEffects(powerRefEffects(ref))
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
    const left = resistanceRefStrength(a);
    const right = resistanceRefStrength(b);

    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return left[index] - right[index];
    }

    return 0;
  }

  function resistanceRefs(key, refs = powerRefs(key), itemEffects = activeItemEffects(key)) {
    const resolved = [];
    const refIndexes = new Map();
    const queue = [
      ...list(key.resistance_refs),
      ...grantedResistanceRefsFromEffects(itemEffects),
      ...refs.flatMap(grantedResistanceRefsFromPowerRef)
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

  function activeEffects(key, refs = powerRefs(key), itemEffects = activeItemEffects(key)) {
    return [
      ...itemEffects,
      ...refs.flatMap(powerRefEffects)
    ];
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
    const typeNames = nameList(typeIds, "power_types");
    return typeNames.length ? [`${label}: ${joinText(typeNames)}`] : [];
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
      const targets = powerNames(effect.power_nullification.target_power_ids);
      lines.push(targets.length ? `Nullifies: ${joinText(targets)}` : "Nullifies powers");
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
        ref,
        tooltipLines: resistanceTooltipLines(ref, resistance)
      };
    }).filter(Boolean);
  }

  function equipmentTooltipLines(item, key = null) {
    const lines = [];
    const requiredPowers = list(item.required_power_refs).map(powerRefLabel);

    lines.push(...typeTooltipLines(item.weapon_type_ids, "Weapon types"));
    if (requiredPowers.length) lines.push(`Requires powers: ${joinText(requiredPowers)}`);
    lines.push(...catalogEffectTooltipLines(item, key));

    return lines;
  }

  function equipmentTagItems(ids, key = null) {
    return list(ids)
      .map((id) => byId(options.equipment, id))
      .filter(Boolean)
      .map((item) => ({
        kind: "equipment",
        id: item.id,
        label: item.name,
        status: key ? itemStatus(item, key) : null,
        tooltipLines: equipmentTooltipLines(item, key)
      }));
  }

  function attackTooltipLines(item, key = null) {
    const lines = [];
    const requiredPowers = list(item.required_power_refs).map(powerRefLabel);

    lines.push(...typeTooltipLines(item.weapon_type_ids, "Weapon types"));
    if (requiredPowers.length) lines.push(`Requires powers: ${joinText(requiredPowers)}`);
    lines.push(...catalogEffectTooltipLines(item, key));

    return lines;
  }

  function attackTagItems(key) {
    return list(key.attack_ids)
      .map((id) => byId(options.attacks, id))
      .filter(Boolean)
      .map((item) => ({
        kind: "attack",
        id: item.id,
        label: item.name,
        status: itemStatus(item, key),
        tooltipLines: attackTooltipLines(item, key)
      }));
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
    const tooltipClass = tooltipLines.length ? " has-tooltip" : "";
    const statusIcon = item.status
      ? `<span class="status-icon" aria-hidden="true"></span>`
      : "";

    if (!tooltipLines.length) return `<li class="tag-item${statusClass}">${escapeHtml(item.label)}</li>`;

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
      <li class="tag-item${tooltipClass}${statusClass}" tabindex="0" aria-label="${escapeHtml(`${item.label}. ${tooltipLines.join(". ")}`)}">
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
        ["Standard Equipment", equipmentTagItems(baseKey.standard_equipment_ids, baseKey)],
        ["Optional Equipment", equipmentTagItems(baseKey.optional_equipment_ids, baseKey)],
        ["Attacks/Techniques", attackTagItems(baseKey)]
      ]
    };
  }

  function statGridHtml(stats) {
    return list(stats).map((stat) => `
      <li class="stat">
        <span class="stat-label">${escapeHtml(stat.label)}</span>
        <span class="stat-value">${escapeHtml(stat.value)}</span>
      </li>
    `).join("");
  }

  function tagSectionHtml(titleText, items) {
    const tags = list(items).map(tagItemHtml).join("");
    if (!tags) return "";

    return `<h4 class="section-title">${escapeHtml(titleText)}</h4><ul class="tag-list">${tags}</ul>`;
  }

  function characterProfileHtml(view, { includeStats = true, includeSections = true } = {}) {
    const detailTags = view.details
      .map((detail) => `<li>${escapeHtml(detail)}</li>`)
      .join("");
    const sectionHtml = view.sections
      .map(([sectionTitle, items]) => tagSectionHtml(sectionTitle, items))
      .join("");

    return `
      <div class="character-image">
        ${view.image ? `<img src="${escapeHtml(assetUrl(view.image.image))}" alt="${escapeHtml(view.image.name)}">` : `<div class="empty-image">?</div>`}
      </div>
      <div class="character-content">
        <h3 class="character-heading">${escapeHtml(title(view.character.name))}</h3>
        <p class="character-subtitle">${escapeHtml(view.names.join(" / "))}</p>
        ${detailTags ? `<ul class="meta-list" aria-label="Character details">${detailTags}</ul>` : ""}
        ${includeStats ? `<ul class="stat-grid">${statGridHtml(view.stats)}</ul>` : ""}
        ${includeSections ? sectionHtml : ""}
      </div>
    `;
  }

  function renderCard(card, character, keyId = null) {
    const view = characterView(character, keyId);

    if (!view) {
      card.hidden = true;
      card.innerHTML = "";
      return;
    }

    card.hidden = false;
    card.innerHTML = characterProfileHtml(view);
  }

  function effectTargetsPower(effect, powerId) {
    if (!effect?.power_nullification) return false;

    const targetIds = list(effect.power_nullification.target_power_ids);
    return targetIds.length === 0 || targetIds.includes(powerId);
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
      powerRefEffects(opponentRef).some((effect) => effectTargetsPower(effect, ref.id))
    ));

    if (nullifyingPower) {
      return status("nullified", `${powerRefLabel(nullifyingPower)} targets this power`);
    }

    if (opponentView.itemEffects.some((effect) => effectTargetsPower(effect, ref.id))) {
      return status("nullified", "Opponent equipment or attack targets this power");
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

  function powerResistedBy(ref, ownerView, opponentView) {
    const resistingRef = effectiveResistanceRefsFor(opponentView, ownerView)
      .find((opponentResistanceRef) => resistanceBlocksPower(ref, opponentResistanceRef));

    if (!resistingRef) return null;

    return status("resisted", `${resistanceRefLabel(resistingRef)} blocks this power`);
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
        || (hasMatchingPowerRef(item.ref, ownerBattleView.powerRefs) ? null : status("disabled", "Source power is inactive in this battle"))
        || status("active");
    }

    if (item.kind === "resistance") {
      return resistanceNegatedBy(item.ref, opponentView)
        || (hasMatchingResistanceRef(item.ref, ownerBattleView.resistanceRefs) ? null : status("disabled", "Source power is inactive in this battle"))
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
    const resolvedPowerRefs = powerRefs(
      view.key,
      view.itemEffects,
      (ref) => !powerBlockedInBattle(ref, view, opponentView)
    );
    const effects = activeEffects(view.key, resolvedPowerRefs, view.itemEffects);
    const key = effectiveKey(view.key, resolvedPowerRefs, view.itemEffects, effects);

    return {
      ...view,
      effectiveKey: key,
      powerRefs: resolvedPowerRefs,
      resistanceRefs: resistanceRefs(view.key, resolvedPowerRefs, view.itemEffects),
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

  function battleStatPairs(leftView, rightView) {
    return statDefinitions.map(([label]) => {
      const leftStat = leftView.stats.find((stat) => stat.label === label);
      const rightStat = rightView.stats.find((stat) => stat.label === label);

      return {
        label,
        left: leftStat,
        right: rightStat,
        leftClass: statComparisonClass(rankValue(leftStat), rankValue(rightStat)),
        rightClass: statComparisonClass(rankValue(rightStat), rankValue(leftStat))
      };
    });
  }

  function battleWinner(leftRank, rightRank) {
    if (leftRank > rightRank) return "left";
    if (rightRank > leftRank) return "right";

    return "tie";
  }

  function battleStatRowsHtml(leftView, rightView) {
    return battleStatPairs(leftView, rightView).map(({ label, left, right, leftClass, rightClass }) => {
      return `
        <li class="battle-stat-row">
          <div class="battle-stat-cell is-${leftClass}">
            <span class="stat-label">${escapeHtml(label)}</span>
            <span class="stat-value">${escapeHtml(left?.value || "")}</span>
          </div>
          <div class="battle-stat-cell is-${rightClass}">
            <span class="stat-label">${escapeHtml(label)}</span>
            <span class="stat-value">${escapeHtml(right?.value || "")}</span>
          </div>
        </li>
      `;
    }).join("");
  }

  function battleScore(leftView, rightView) {
    const rows = battleStatPairs(leftView, rightView)
      .filter((row) => !battleScoreExcludedLabels.has(row.label))
      .map((row) => ({
        label: row.label,
        leftValue: row.left?.value || "",
        rightValue: row.right?.value || "",
        winner: battleWinner(rankValue(row.left), rankValue(row.right))
      }));

    const leftScore = rows.filter((row) => row.winner === "left").length;
    const rightScore = rows.filter((row) => row.winner === "right").length;

    return {
      rows,
      leftScore,
      rightScore,
      maxScore: rows.length,
      winner: leftScore > rightScore
        ? "left"
        : rightScore > leftScore
          ? "right"
          : "tie"
    };
  }

  function battleResultHtml(leftView, rightView) {
    const score = battleScore(leftView, rightView);
    const leftName = title(leftView.character.name);
    const rightName = title(rightView.character.name);
    const winnerText = score.winner === "left"
      ? `${leftName} wins`
      : score.winner === "right"
        ? `${rightName} wins`
        : "Draw";
    const rows = score.rows.map((row) => {
      const resultText = row.winner === "left"
        ? leftName
        : row.winner === "right"
          ? rightName
          : "Tie";

      return `
        <li class="battle-point-row is-${row.winner}">
          <span class="battle-point-label">${escapeHtml(row.label)}</span>
          <span class="battle-point-value">${escapeHtml(row.leftValue)}</span>
          <span class="battle-point-result">${escapeHtml(resultText)}</span>
          <span class="battle-point-value">${escapeHtml(row.rightValue)}</span>
        </li>
      `;
    }).join("");

    return `
      <section class="battle-result" aria-live="polite">
        <div class="battle-score">
          <div class="battle-score-side">
            <span class="battle-score-name">${escapeHtml(leftName)}</span>
            <strong>${score.leftScore}</strong>
          </div>
          <div class="battle-score-summary">
            <span>${escapeHtml(winnerText)}</span>
            <small>${score.maxScore} stats compared, Tier excluded</small>
          </div>
          <div class="battle-score-side">
            <span class="battle-score-name">${escapeHtml(rightName)}</span>
            <strong>${score.rightScore}</strong>
          </div>
        </div>
        <ul class="battle-point-list">${rows}</ul>
      </section>
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
        <section class="battle-section">
          <h2 class="section-title">${escapeHtml(sectionTitle)}</h2>
          <div class="battle-section-grid">
            <ul class="tag-list">${leftTags}</ul>
            <ul class="tag-list">${rightTags}</ul>
          </div>
        </section>
      `;
    }).join("");
  }

  function renderBattle(content, leftSelection, rightSelection) {
    const baseLeftView = characterView(leftSelection.character, leftSelection.keyId);
    const baseRightView = characterView(rightSelection.character, rightSelection.keyId);
    const leftView = battleEffectiveView(baseLeftView, baseRightView);
    const rightView = battleEffectiveView(baseRightView, baseLeftView);

    content.innerHTML = `
      <div class="battle-combatants">
        <article class="battle-character-card">${characterProfileHtml(baseLeftView, { includeStats: false, includeSections: false })}</article>
        <article class="battle-character-card">${characterProfileHtml(baseRightView, { includeStats: false, includeSections: false })}</article>
      </div>
      <section class="battle-comparison" aria-label="Stat comparison">
        <ul class="battle-stat-list">${battleStatRowsHtml(leftView, rightView)}</ul>
      </section>
      <div data-battle-result hidden></div>
      ${battleSectionRowsHtml(baseLeftView, baseRightView, leftView, rightView)}
    `;

    return { left: leftView, right: rightView };
  }

  function selector(root, onSelectionChange = () => {}) {
    const choiceLabel = root.querySelector("[data-choice-label]");
    const choiceList = root.querySelector("[data-choice-list]");
    const backButton = root.querySelector("[data-back]");
    const confirmButton = root.querySelector("[data-confirm]");
    const card = root.querySelector("[data-character-card]");
    const state = {
      step: "media",
      mediaId: null,
      originId: null,
      verseId: null,
      characterId: null,
      keyId: null,
      emptySelected: false,
      confirmed: false
    };

    function clearSelection() {
      state.characterId = null;
      state.keyId = null;
      state.emptySelected = false;
      state.confirmed = false;
    }

    function stepItems() {
      if (state.step === "media") return options.media;
      if (state.step === "origin") return options.origins.filter((origin) => origin.media_id === state.mediaId);
      if (state.step === "verse") return options.verses.filter((verse) => verse.media_id === state.mediaId && verse.source_id === state.originId);
      if (state.step === "character") return data.characters.filter((character) => character.verse_id === state.verseId);

      const character = selectedCharacter();
      return character ? list(character.keys) : [];
    }

    function selectedCharacter() {
      if (state.emptySelected) return data.empty_character;

      return data.characters.find((character) => character.entry_id === state.characterId) || null;
    }

    function displayCharacter() {
      const character = selectedCharacter();
      if (!character) return null;
      if (state.step === "key" && !state.keyId) return null;

      return character;
    }

    function choose(item) {
      state.confirmed = false;

      if (state.step === "media") {
        state.mediaId = item.id;
        state.originId = null;
        state.verseId = null;
        clearSelection();
        state.step = "origin";
      } else if (state.step === "origin") {
        state.originId = item.id;
        state.verseId = null;
        clearSelection();
        state.step = "verse";
      } else if (state.step === "verse") {
        state.verseId = item.id;
        clearSelection();
        state.step = "character";
      } else if (state.step === "character") {
        clearSelection();

        if (item === data.empty_character) {
          state.emptySelected = true;
          state.keyId = list(item.keys)[0]?.key || null;
          render();
          return;
        }

        const keys = list(item.keys);
        state.characterId = item.entry_id;
        state.keyId = keys.length > 1 ? null : keys[0]?.key || null;
        state.step = keys.length > 1 ? "key" : "character";
      } else {
        state.keyId = item.key;
      }

      render();
    }

    function back() {
      if (state.step === "media") return;
      state.confirmed = false;

      if (state.step === "origin") {
        state.step = "media";
        state.mediaId = null;
        clearSelection();
      } else if (state.step === "verse") {
        state.step = "origin";
        state.originId = null;
        clearSelection();
      } else if (state.step === "character") {
        state.step = "verse";
        state.verseId = null;
        clearSelection();
      } else {
        state.step = "character";
        clearSelection();
      }

      render();
    }

    function renderChoices() {
      const items = stepItems();
      const labels = {
        media: "Media",
        origin: "Origin",
        verse: "Verse",
        character: "Character",
        key: "Key"
      };

      choiceLabel.textContent = labels[state.step];
      choiceList.innerHTML = "";

      const choices = state.step === "character" && items.length === 0
        ? [data.empty_character]
        : items;

      choices.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "choice-button";
        button.textContent = state.step === "key" ? title(item.key) : title(item.name);
        button.addEventListener("click", () => choose(item));

        choiceList.appendChild(document.createElement("li")).appendChild(button);
      });
    }

    function render() {
      const currentCharacter = displayCharacter();
      backButton.disabled = state.step === "media";
      confirmButton.disabled = !currentCharacter || state.confirmed;
      confirmButton.textContent = state.confirmed ? "Confirmed" : "Confirm";
      renderChoices();
      renderCard(card, currentCharacter, state.keyId);
      onSelectionChange();
    }

    function confirmedSelection() {
      const character = displayCharacter();
      if (!state.confirmed || !character) return null;

      return {
        character,
        keyId: state.keyId
      };
    }

    function unconfirm() {
      state.confirmed = false;
      render();
    }

    confirmButton.addEventListener("click", () => {
      if (!displayCharacter()) return;

      state.confirmed = true;
      render();
    });
    backButton.addEventListener("click", back);
    render();

    return {
      confirmedSelection,
      unconfirm
    };
  }

  const selectionScreen = document.querySelector("[data-selection-screen]");
  const battleScreen = document.querySelector("[data-battle-screen]");
  const battleContent = document.querySelector("[data-battle-content]");
  const startBattleButton = document.querySelector("[data-start-battle]");
  const editSelectionButton = document.querySelector("[data-edit-selection]");
  let selectors = [];
  let currentBattleViews = null;

  function showSelectionScreen() {
    selectionScreen.hidden = false;
    battleScreen.hidden = true;
    currentBattleViews = null;
  }

  function showBattleScreen(leftSelection, rightSelection) {
    currentBattleViews = renderBattle(battleContent, leftSelection, rightSelection);
    if (startBattleButton) startBattleButton.disabled = false;
    selectionScreen.hidden = true;
    battleScreen.hidden = false;
  }

  function maybeShowBattleScreen() {
    if (selectors.length < 2) return;

    const selections = selectors.map((item) => item.confirmedSelection());
    if (selections.every(Boolean)) showBattleScreen(selections[0], selections[1]);
  }

  editSelectionButton?.addEventListener("click", () => {
    selectors.forEach((item) => item.unconfirm());
    if (startBattleButton) startBattleButton.disabled = true;
    showSelectionScreen();
  });

  startBattleButton?.addEventListener("click", () => {
    if (!currentBattleViews) return;

    const result = battleContent.querySelector("[data-battle-result]");
    if (!result) return;

    result.hidden = false;
    result.innerHTML = battleResultHtml(currentBattleViews.left, currentBattleViews.right);
    startBattleButton.disabled = true;
  });

  selectors = Array.from(document.querySelectorAll("[data-selector]"))
    .map((root) => selector(root, maybeShowBattleScreen));
})();
