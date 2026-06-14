(() => {
  const data = JSON.parse(document.getElementById("character-data").textContent);
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
    ["combat_speed", "Combat Speed"],
    ["attack_speed", "Attack Speed"],
    ["reaction_speed", "Reaction Speed"],
    ["travel_speed", "Travel Speed"],
    ["flight_speed", "Flight Speed"]
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
    absorbed: { id: "absorbed", label: "Absorbed" },
    negated: { id: "negated", label: "Negated" },
    nullified: { id: "nullified", label: "Nullified" },
    resisted: { id: "resisted", label: "Resisted" }
  };

  const byId = (items, id) => {
    if (!items || typeof items !== "object") return undefined;

    return optionMaps.get(items)?.get(id);
  };
  const title = (value) => value || "";
  const list = (value) => Array.isArray(value) ? value : [];
  const idListKey = (ids) => list(ids).slice().sort().join(",");
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));

  function integerFrom(value) {
    if (value === null || value === undefined || value === "") return null;

    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : null;
  }

  function addAgeRange(values, start, end) {
    for (let age = start; age <= end; age += 1) values.add(age);
  }

  function addDecadeAgeRange(values, decade, qualifier) {
    if (!Number.isInteger(decade) || decade < 0) return;

    if (qualifier === "early") {
      addAgeRange(values, decade, decade + 3);
    } else if (qualifier === "mid" || qualifier === "middle") {
      addAgeRange(values, decade + 4, decade + 6);
    } else if (qualifier === "late") {
      addAgeRange(values, decade + 7, decade + 9);
    } else {
      addAgeRange(values, decade, decade + 9);
    }
  }

  function ageFilterValues(age = {}) {
    const source = age || {};
    const values = new Set();
    const exactValue = integerFrom(source.value);

    if (exactValue !== null) values.add(exactValue);

    const text = String(source.display || "").toLowerCase();
    const decadePattern = /\b(early|mid|middle|late)?\s*-?\s*(\d{1,3})\s*'?\s*s\b/g;
    const teenPattern = /\b(early|mid|middle|late)?\s*-?\s*teens?\b/g;
    const exactPattern = /\b(\d{1,3})(?!\s*'?\s*s)\b/g;

    for (const match of text.matchAll(decadePattern)) {
      addDecadeAgeRange(values, Number(match[2]), match[1] || "");
    }

    for (const match of text.matchAll(teenPattern)) {
      const qualifier = match[1] || "";

      if (qualifier === "early") {
        addAgeRange(values, 13, 15);
      } else if (qualifier === "mid" || qualifier === "middle") {
        addAgeRange(values, 15, 17);
      } else if (qualifier === "late") {
        addAgeRange(values, 17, 19);
      } else {
        addAgeRange(values, 13, 19);
      }
    }

    for (const match of text.matchAll(exactPattern)) {
      const exactAge = integerFrom(match[1]);
      if (exactAge !== null) values.add(exactAge);
    }

    if (values.size > 0) return Array.from(values).sort((left, right) => left - right);
    return source.unknown ? ["unknown"] : [];
  }

  function normalizeCharacterEntry(entryId, character) {
    return {
      ...character,
      entry_id: entryId,
      age_filter_values: ageFilterValues(character.age)
    };
  }

  function normalizeCharacterEntries(entries) {
    if (Array.isArray(entries)) return entries;

    return Object.entries(entries || {})
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


  window.NexyCharacters = {
    data,
    options,
    statModifiers,
    optionMaps,
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
  };
})();
