(() => {
  const data = JSON.parse(document.getElementById("character-data").textContent);
  const options = data.options;
  const statModifiers = options.stat_modifiers;

  const statDefinitions = [
    ["Tier", "tier"],
    ["Attack Potency", "attack_potency", "attack_durability_tiers"],
    ["Speed", "combat_speed", "speed_tiers", " combat speed"],
    ["Lifting Strength", "lifting_strength", "lifting_strength_tiers"],
    ["Striking Strength", "striking_strength", "striking_strength_tiers"],
    ["Durability", "durability", "attack_durability_tiers"],
    ["Stamina", "stamina", "stamina_tiers"],
    ["Range", "range", "range_tiers"],
    ["Intelligence", "intelligence", "intelligence_tiers"]
  ];

  const byId = (items, id) => items.find((item) => item.id === id);
  const title = (value) => value || "Empty Character";
  const list = (value) => Array.isArray(value) ? value : [];
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));

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

  function characterKey(character, keyId = null) {
    const keys = list(character.keys);
    return keys.find((key) => key.key === keyId) || keys[0] || list(data.empty_character.keys)[0];
  }

  function classifications(character) {
    return list(character.classification_ids)
      .map((id) => byId(options.classifications, id))
      .filter(Boolean);
  }

  function powers(key) {
    return list(key.power_refs).map((ref) => {
      const power = byId(options.powers, ref.id);
      if (!power) return null;

      const martialDegree = ref.martial_arts_degree_id
        ? byId(options.martial_arts_degrees, ref.martial_arts_degree_id)
        : null;

      if (martialDegree) return martialDegree.name;

      const typeNames = list(ref.type_ids)
        .map((id) => byId(options.power_types, id))
        .filter(Boolean)
        .map((type) => type.name);

      return typeNames.length ? `${power.name}: ${typeNames.join(", ")}` : power.name;
    }).filter(Boolean);
  }

  function equipment(key) {
    return list(key.standard_equipment_ids)
      .map((id) => byId(options.equipment, id))
      .filter(Boolean)
      .map((item) => item.name);
  }

  function renderCard(card, character, keyId = null) {
    if (!character) {
      card.hidden = true;
      card.innerHTML = "";
      return;
    }

    card.hidden = false;
    const displayCharacter = character;
    const key = characterKey(displayCharacter, keyId);
    const image = list(key.images)[0];
    const names = list(key.names);
    const statRows = statDefinitions.map(([label, field, catalog, suffix = ""]) => {
      const value = field === "tier" ? formatTier(key) : `${formatStat(key[field], catalog)}${suffix}`;
      return `
        <li class="stat">
          <span class="stat-label">${escapeHtml(label)}</span>
          <span class="stat-value">${escapeHtml(value)}</span>
        </li>
      `;
    }).join("");

    const classificationTags = classifications(displayCharacter)
      .map((classification) => `<li>${escapeHtml(classification.name)}</li>`)
      .join("");

    const powerTags = powers(key).map((power) => `<li>${escapeHtml(power)}</li>`).join("");
    const equipmentTags = equipment(key).map((item) => `<li>${escapeHtml(item)}</li>`).join("");

    card.innerHTML = `
      <div class="character-image">
        ${image ? `<img src="${escapeHtml(image.image)}" alt="${escapeHtml(image.name)}">` : `<div class="empty-image">?</div>`}
      </div>
      <div class="character-content">
        <h3 class="character-heading">${escapeHtml(title(displayCharacter.name))}</h3>
        <p class="character-subtitle">${escapeHtml(names.join(" / "))}</p>
        ${classificationTags ? `<ul class="meta-list" aria-label="Classifications">${classificationTags}</ul>` : ""}
        <ul class="stat-grid">${statRows}</ul>
        ${powerTags ? `<h4 class="section-title">Powers</h4><ul class="tag-list">${powerTags}</ul>` : ""}
        ${equipmentTags ? `<h4 class="section-title">Standard Equipment</h4><ul class="tag-list">${equipmentTags}</ul>` : ""}
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
      characterName: null,
      keyId: null,
      emptySelected: false
    };

    function clearSelection() {
      state.characterName = null;
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

      return data.characters.find((character) => character.name === state.characterName) || null;
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
        state.characterName = item.name;
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
