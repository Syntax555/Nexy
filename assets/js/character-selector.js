(() => {
  const data = JSON.parse(document.getElementById("character-data").textContent);
  data.empty_character = normalizeCharacterEntry("empty", data.empty_character);
  data.characters = normalizeCharacterEntries(data.characters);

  const options = data.options;
  const statModifiers = options.stat_modifiers;

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

  const byId = (items, id) => (Array.isArray(items) ? items : []).find((item) => item.id === id);
  const title = (value) => value || "Empty Character";
  const list = (value) => Array.isArray(value) ? value : [];
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

  function statEntry(stat, catalogName) {
    const normalized = normalizedStat(stat);
    return byId(options[catalogName], normalized?.value);
  }

  function compositeRank(stat, catalogName) {
    const entry = statEntry(stat, catalogName);
    const mod = modifier(stat);
    return entry ? ((entry.rank - 1) * 8) + mod.rank : 0;
  }

  function formatStat(stat, catalogName, valueField = "name") {
    const entry = statEntry(stat, catalogName);
    if (!entry) return "";

    const mod = modifier(stat);
    const prefix = mod.display_prefix ? `${mod.display_prefix} ` : "";
    const suffix = mod.display_suffix || "";
    return `${prefix}${entry[valueField]}${suffix}`;
  }

  function formatTier(key) {
    const attack = key.attack_potency;
    const durability = key.durability;
    const attackRank = compositeRank(attack, "attack_durability_tiers");
    const durabilityRank = compositeRank(durability, "attack_durability_tiers");
    const chosen = durabilityRank > attackRank ? durability : attack;
    return formatStat(chosen, "attack_durability_tiers", "tier");
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
    const mod = byId(options.ability_modifiers, ref.modifier || "normal");
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

  function powerRefs(key) {
    const refs = [...list(key.power_refs)];

    derivedPowerRefs(key).forEach((ref) => {
      if (!refs.some((existingRef) => existingRef.id === ref.id)) refs.push(ref);
    });

    return refs;
  }

  function powerRefEffects(ref) {
    const power = byId(options.powers, ref.id);
    const variant = power ? powerVariant(power, ref) : null;
    const includeBase = !variant || variant.inherits_base_grants !== false;

    if (Array.isArray(ref.effects)) return ref.effects;

    return [
      ...(includeBase ? list(power?.effects) : []),
      ...list(variant?.effects)
    ];
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

  function effectiveKey(key) {
    const result = { ...key };
    const effects = powerRefs(key).flatMap(powerRefEffects);

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
      if (value) lines.push(`Sets ${statLabel(statName)}: ${value}`);
    });

    const modifierFloorGroups = new Map();
    list(effect.stat_modifier_floor_effects).forEach((modifierFloor) => {
      const statName = modifierFloor.stat;
      const modifierId = modifierFloor.modifier;
      const catalog = statCatalogs[statName];
      if (!catalog || !modifierId) return;

      if (key) {
        const raisedStat = raiseStatModifier(key[statName], modifierId);
        const value = formatStat(raisedStat, catalog);
        if (value) lines.push(`Raises ${statLabel(statName)}: ${value}`);
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

    if (includeBase) lines.push(...grantTooltipLines(power.grants));
    if (variant) lines.push(...grantTooltipLines(variant.grants));

    if (Array.isArray(ref.effects)) {
      lines.push(...ref.effects.flatMap((effect) => effectTooltipLines(effect, key)));
      return lines;
    }

    if (includeBase) lines.push(...list(power.effects).flatMap((effect) => effectTooltipLines(effect, key)));
    if (variant) lines.push(...list(variant.effects).flatMap((effect) => effectTooltipLines(effect, key)));

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

  function powerTagItems(key) {
    return powerRefs(key).map((ref) => {
      const power = byId(options.powers, ref.id);
      if (!power) return null;

      return {
        label: powerRefLabel(ref),
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

  function resistanceTagItems(key) {
    return list(key.resistance_refs).map((ref) => {
      const resistance = byId(options.resistances, ref.id);
      if (!resistance) return null;

      return {
        label: resistanceRefLabel(ref),
        tooltipLines: resistanceTooltipLines(ref, resistance)
      };
    }).filter(Boolean);
  }

  function equipmentTooltipLines(item) {
    const lines = [];
    const requiredPowers = list(item.required_power_refs).map(powerRefLabel);

    lines.push(...typeTooltipLines(item.weapon_type_ids, "Weapon types"));
    if (requiredPowers.length) lines.push(`Requires powers: ${joinText(requiredPowers)}`);
    lines.push(...catalogEffectTooltipLines(item));

    return lines;
  }

  function equipmentTagItems(ids) {
    return list(ids)
      .map((id) => byId(options.equipment, id))
      .filter(Boolean)
      .map((item) => ({
        label: item.name,
        tooltipLines: equipmentTooltipLines(item)
      }));
  }

  function attackTooltipLines(item) {
    const lines = [];
    const requiredPowers = list(item.required_power_refs).map(powerRefLabel);

    lines.push(...typeTooltipLines(item.weapon_type_ids, "Weapon types"));
    if (requiredPowers.length) lines.push(`Requires powers: ${joinText(requiredPowers)}`);
    lines.push(...catalogEffectTooltipLines(item));

    return lines;
  }

  function attackTagItems(key) {
    return list(key.attack_ids)
      .map((id) => byId(options.attacks, id))
      .filter(Boolean)
      .map((item) => ({
        label: item.name,
        tooltipLines: attackTooltipLines(item)
      }));
  }

  function tagItemHtml(item) {
    const tooltipLines = list(item.tooltipLines).filter(Boolean);

    if (!tooltipLines.length) return `<li class="tag-item">${escapeHtml(item.label)}</li>`;

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
      <li class="tag-item has-tooltip" tabindex="0" aria-label="${escapeHtml(`${item.label}. ${tooltipLines.join(". ")}`)}">
        <span class="tag-text">${escapeHtml(item.label)}</span>
        <span class="tag-tooltip" role="tooltip">
          ${tooltipHtml}
        </span>
      </li>
    `;
  }

  function renderCard(card, character, keyId = null) {
    if (!character) {
      card.hidden = true;
      card.innerHTML = "";
      return;
    }

    card.hidden = false;
    const displayCharacter = character;
    const baseKey = characterKey(displayCharacter, keyId);
    const key = effectiveKey(baseKey);
    const image = list(baseKey.images)[0];
    const names = list(baseKey.names);
    const statRows = statDefinitions.map(([label, field, catalog, suffix = ""]) => {
      const value = field === "tier"
        ? formatTier(key)
        : field === "speed"
          ? formatSpeed(key)
          : `${formatStat(key[field], catalog)}${suffix}`;

      return `
        <li class="stat">
          <span class="stat-label">${escapeHtml(label)}</span>
          <span class="stat-value">${escapeHtml(value)}</span>
        </li>
      `;
    }).join("");

    const detailTags = characterDetails(displayCharacter)
      .map((detail) => `<li>${escapeHtml(detail)}</li>`)
      .join("");

    const powerTags = powerTagItems(baseKey).map(tagItemHtml).join("");
    const resistanceTags = resistanceTagItems(baseKey).map(tagItemHtml).join("");
    const standardEquipmentTags = equipmentTagItems(baseKey.standard_equipment_ids).map(tagItemHtml).join("");
    const optionalEquipmentTags = equipmentTagItems(baseKey.optional_equipment_ids).map(tagItemHtml).join("");
    const attackTags = attackTagItems(baseKey).map(tagItemHtml).join("");

    card.innerHTML = `
      <div class="character-image">
        ${image ? `<img src="${escapeHtml(assetUrl(image.image))}" alt="${escapeHtml(image.name)}">` : `<div class="empty-image">?</div>`}
      </div>
      <div class="character-content">
        <h3 class="character-heading">${escapeHtml(title(displayCharacter.name))}</h3>
        <p class="character-subtitle">${escapeHtml(names.join(" / "))}</p>
        ${detailTags ? `<ul class="meta-list" aria-label="Character details">${detailTags}</ul>` : ""}
        <ul class="stat-grid">${statRows}</ul>
        ${powerTags ? `<h4 class="section-title">Powers</h4><ul class="tag-list">${powerTags}</ul>` : ""}
        ${resistanceTags ? `<h4 class="section-title">Resistances</h4><ul class="tag-list">${resistanceTags}</ul>` : ""}
        ${standardEquipmentTags ? `<h4 class="section-title">Standard Equipment</h4><ul class="tag-list">${standardEquipmentTags}</ul>` : ""}
        ${optionalEquipmentTags ? `<h4 class="section-title">Optional Equipment</h4><ul class="tag-list">${optionalEquipmentTags}</ul>` : ""}
        ${attackTags ? `<h4 class="section-title">Attacks</h4><ul class="tag-list">${attackTags}</ul>` : ""}
      </div>
    `;
  }

  function selector(root) {
    const choiceLabel = root.querySelector("[data-choice-label]");
    const choiceList = root.querySelector("[data-choice-list]");
    const backButton = root.querySelector("[data-back]");
    const card = root.querySelector("[data-character-card]");
    const state = {
      step: "media",
      mediaId: null,
      originId: null,
      verseId: null,
      characterId: null,
      keyId: null,
      emptySelected: false
    };

    function clearSelection() {
      state.characterId = null;
      state.keyId = null;
      state.emptySelected = false;
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
      backButton.disabled = state.step === "media";
      renderChoices();
      renderCard(card, displayCharacter(), state.keyId);
    }

    backButton.addEventListener("click", back);
    render();
  }

  document.querySelectorAll("[data-selector]").forEach(selector);
})();
