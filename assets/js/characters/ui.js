(() => {
  const {
    battleResultHtml,
    byId,
    data,
    list,
    options,
    assetUrl,
    characterView,
    renderBattle,
    renderCard,
    escapeHtml,
    title
  } = window.NexyCharacters;
  function selector(root, onSelectionChange = () => {}) {
    const choiceLabel = root.querySelector("[data-choice-label]");
    const choiceList = root.querySelector("[data-choice-list]");
    const searchShell = root.querySelector("[data-choice-search-shell]");
    const searchInput = root.querySelector("[data-choice-search]");
    const filterButton = root.querySelector("[data-choice-filter]");
    const filterPopover = root.querySelector("[data-filter-popover]");
    const filterClearButton = root.querySelector("[data-filter-clear]");
    const filterControls = {
      gender: root.querySelector("[data-filter-gender]"),
      age: root.querySelector("[data-filter-age]"),
      tier: root.querySelector("[data-filter-tier]"),
      classification: root.querySelector("[data-filter-classification]")
    };
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
      characterQuery: "",
      genderFilterId: "",
      ageFilter: "",
      tierFilter: "",
      classificationFilterId: "",
      filtersOpen: false,
      confirmed: false
    };
    const ageFilterGroups = [
      { value: "under-13", label: "Under 13", min: 0, max: 12 },
      { value: "teen", label: "Teen", min: 13, max: 19 },
      { value: "20s", label: "20s", min: 20, max: 29 },
      { value: "30s", label: "30s", min: 30, max: 39 },
      { value: "40s", label: "40s", min: 40, max: 49 },
      { value: "50-plus", label: "50+", min: 50 },
      { value: "unknown", label: "Unknown" }
    ];

    function clearSelection() {
      state.characterId = null;
      state.keyId = null;
      state.confirmed = false;
    }

    function clearCharacterFilters() {
      state.characterQuery = "";
      state.genderFilterId = "";
      state.ageFilter = "";
      state.tierFilter = "";
      state.classificationFilterId = "";
      state.filtersOpen = false;
    }

    function stepItems() {
      if (state.step === "media") return options.media;
      if (state.step === "origin") return options.origins.filter((origin) => origin.media_id === state.mediaId);
      if (state.step === "verse") return options.verses.filter((verse) => verse.media_id === state.mediaId && verse.source_id === state.originId);
      if (state.step === "character") return filteredCharacters();

      return [];
    }

    function selectedCharacter() {
      return data.characters.find((character) => character.entry_id === state.characterId) || null;
    }

    function displayCharacter() {
      const character = selectedCharacter();
      if (!character) return null;

      return character;
    }

    function uniqueNames(names) {
      return Array.from(new Set(
        list(names)
          .map((name) => String(name || "").trim())
          .filter(Boolean)
      ));
    }

    function normalizedSearchText(value) {
      return String(value || "").trim().toLowerCase();
    }

    function characterSearchText(character) {
      return [
        character.name,
        character.entry_id,
        ...ageFilterValues(character),
        ...tierFilterValues(character),
        ...classificationSearchValues(character),
        ...list(character.keys).flatMap((key) => [key.key, key.name, ...list(key.names)])
      ].map(normalizedSearchText).join(" ");
    }

    function ageFilterValues(character) {
      return list(character.age_filter_values).map((value) => String(value));
    }

    function ageValueMatchesGroup(value, group) {
      if (group.value === "unknown") return value === "unknown";
      if (value === "unknown") return false;

      const age = Number(value);
      if (!Number.isFinite(age)) return false;
      if (age < group.min) return false;

      return group.max === undefined || age <= group.max;
    }

    function ageValuesMatchFilter(values, filterValue) {
      const group = ageFilterGroups.find((item) => item.value === filterValue);
      return group ? values.some((value) => ageValueMatchesGroup(value, group)) : true;
    }

    function classificationWithParents(classificationId, seen = new Set()) {
      if (!classificationId || seen.has(classificationId)) return [];

      seen.add(classificationId);
      const classification = byId(options.classifications, classificationId);

      return [
        classificationId,
        ...list(classification?.parent_ids).flatMap((parentId) => classificationWithParents(parentId, seen))
      ];
    }

    function classificationFilterIds(character) {
      const ids = new Set();
      list(character.classification_ids)
        .flatMap((id) => classificationWithParents(id))
        .forEach((id) => ids.add(id));

      return Array.from(ids);
    }

    function classificationSearchValues(character) {
      return classificationFilterIds(character)
        .flatMap((id) => [id, optionLabel(options.classifications, id)]);
    }

    function keyTierRecord(character, key) {
      const tierStat = characterView(character, key.key)?.stats.find((stat) => stat.label === "Tier");
      if (!tierStat?.value) return null;

      return {
        value: tierStat.value,
        label: tierStat.value,
        rank: tierStat.rank || 0
      };
    }

    function tierRecords(character) {
      const recordsByValue = new Map();

      list(character.keys).forEach((key) => {
        const record = keyTierRecord(character, key);
        if (!record) return;

        const existing = recordsByValue.get(record.value);
        if (!existing || record.rank < existing.rank) recordsByValue.set(record.value, record);
      });

      return Array.from(recordsByValue.values());
    }

    function tierFilterValues(character) {
      return tierRecords(character).map((record) => record.value);
    }

    function verseCharacters() {
      return data.characters.filter((character) => character.verse_id === state.verseId);
    }

    function characterMatchesFilters(character) {
      const query = normalizedSearchText(state.characterQuery);
      if (query && !characterSearchText(character).includes(query)) return false;
      if (state.genderFilterId && character.gender_id !== state.genderFilterId) return false;
      if (state.ageFilter && !ageValuesMatchFilter(ageFilterValues(character), state.ageFilter)) return false;
      if (state.tierFilter && !tierFilterValues(character).includes(state.tierFilter)) return false;
      if (state.classificationFilterId && !classificationFilterIds(character).includes(state.classificationFilterId)) return false;

      return true;
    }

    function filteredCharacters() {
      return verseCharacters().filter(characterMatchesFilters);
    }

    function hasActiveCharacterFilter() {
      return Boolean(
        normalizedSearchText(state.characterQuery) ||
        state.genderFilterId ||
        state.ageFilter ||
        state.tierFilter ||
        state.classificationFilterId
      );
    }

    function activeMetadataFilterCount() {
      return [
        state.genderFilterId,
        state.ageFilter,
        state.tierFilter,
        state.classificationFilterId
      ].filter(Boolean).length;
    }

    function choiceSubtitle(item) {
      if (state.step === "character") {
        return uniqueNames(list(item.keys).flatMap((key) => list(key.names))).join(" / ");
      }

      return "";
    }

    function choiceTitle(item) {
      return title(item.name);
    }

    function keyTitle(key) {
      if (key.name) return key.name;

      return String(key.key || "")
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
    }

    function choose(item) {
      state.confirmed = false;

      if (state.step === "media") {
        state.mediaId = item.id;
        state.originId = null;
        state.verseId = null;
        clearCharacterFilters();
        clearSelection();
        state.step = "origin";
      } else if (state.step === "origin") {
        state.originId = item.id;
        state.verseId = null;
        clearCharacterFilters();
        clearSelection();
        state.step = "verse";
      } else if (state.step === "verse") {
        state.verseId = item.id;
        clearCharacterFilters();
        clearSelection();
        state.step = "character";
      } else if (state.step === "character") {
        clearSelection();
        state.filtersOpen = false;

        const keys = list(item.keys);
        state.characterId = item.entry_id;
        state.keyId = keys[0]?.key || null;
        state.step = "character";
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
        clearCharacterFilters();
        clearSelection();
      }

      render();
    }

    function renderChoices() {
      const labels = {
        media: "Media",
        origin: "Origin",
        verse: "Verse",
        character: "Character"
      };

      choiceLabel.textContent = labels[state.step];
      choiceList.innerHTML = "";

      if (searchShell) searchShell.hidden = state.step !== "character";
      renderFilters();
      renderFilterPopover();
      if (searchInput && searchInput.value !== state.characterQuery) {
        searchInput.value = state.characterQuery;
      }

      const items = stepItems();
      choiceList.classList.toggle("character-choice-list", state.step === "character");

      if (state.step === "character" && items.length === 0) {
        const emptyItem = document.createElement("li");
        emptyItem.className = "choice-empty";
        emptyItem.textContent = hasActiveCharacterFilter() ? "No matching characters" : "No characters";
        choiceList.appendChild(emptyItem);
        return;
      }

      items.forEach((item) => {
        const button = state.step === "character" ? characterChoiceButton(item) : choiceButton(item);
        button.addEventListener("click", () => choose(item));

        choiceList.appendChild(document.createElement("li")).appendChild(button);
      });
    }

    function choiceButton(item) {
      const button = document.createElement("button");
      const subtitle = choiceSubtitle(item);
      button.type = "button";
      button.className = "choice-button";
      button.innerHTML = `
        <span class="choice-title">${escapeHtml(choiceTitle(item))}</span>
        ${subtitle ? `<span class="choice-subtitle">${escapeHtml(subtitle)}</span>` : ""}
      `;

      return button;
    }

    function circleChoiceButton({ className, size = "large", label, subtitle = "", image, initials, selected = false, titleText = "" }) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = [
        "circle-choice-button",
        `circle-choice-button--${size}`,
        className,
        selected ? "is-selected" : ""
      ].filter(Boolean).join(" ");
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      if (titleText) button.title = titleText;
      button.innerHTML = `
        <span class="circle-choice-orb circle-choice-orb--${size}">
          ${image?.image
            ? `<img src="${escapeHtml(assetUrl(image.image))}" alt="">`
            : `<span>${escapeHtml(initials)}</span>`}
          <span class="circle-choice-check" aria-hidden="true">&#10003;</span>
        </span>
        <span class="circle-choice-title">${escapeHtml(label)}</span>
        ${subtitle ? `<span class="circle-choice-subtitle">${escapeHtml(subtitle)}</span>` : ""}
      `;

      return button;
    }

    function characterChoiceButton(character) {
      const image = list(list(character.keys)[0]?.images)[0];

      return circleChoiceButton({
        className: "character-choice-button",
        label: choiceTitle(character),
        subtitle: choiceSubtitle(character),
        image,
        initials: choiceInitials(character.name),
        selected: character.entry_id === state.characterId
      });
    }

    function keyChoiceButton(key) {
      const image = list(key.images)[0];
      const selected = key.key === state.keyId;
      const label = keyTitle(key);

      return circleChoiceButton({
        className: "card-key-button",
        size: "compact",
        label,
        image,
        initials: keyInitials(key),
        selected,
        titleText: label
      });
    }

    function choiceInitials(value) {
      const words = String(value || "").match(/[a-z0-9]+/gi) || [];
      return words.slice(0, 2).map((word) => word[0].toUpperCase()).join("") || "?";
    }

    function keyInitials(key) {
      return choiceInitials(keyTitle(key));
    }

    function renderCardKeySwitcher(character) {
      const keys = list(character?.keys);
      if (keys.length <= 1) return;

      const imageArea = card.querySelector(".character-image");
      if (!imageArea) return;

      const switcher = document.createElement("div");
      switcher.className = "card-key-switcher";
      switcher.setAttribute("aria-label", "Character keys");

      keys.forEach((key) => {
        const button = keyChoiceButton(key);
        button.addEventListener("click", () => {
          state.keyId = key.key;
          state.confirmed = false;
          render();
        });
        switcher.appendChild(button);
      });

      imageArea.appendChild(switcher);
    }

    function optionLabel(itemsById, id) {
      return byId(itemsById, id)?.name || title(id);
    }

    function populateSelect(select, defaultLabel, choices, selectedValue) {
      if (!select) return "";

      const validValues = new Set(choices.map((choice) => choice.value));
      const value = validValues.has(selectedValue) ? selectedValue : "";

      select.innerHTML = "";
      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = defaultLabel;
      select.appendChild(defaultOption);

      choices.forEach((choice) => {
        const option = document.createElement("option");
        option.value = choice.value;
        option.textContent = choice.label;
        select.appendChild(option);
      });

      select.value = value;
      return value;
    }

    function populateChipFilter(container, choices, selectedValue) {
      if (!container) return "";

      const validValues = new Set(choices.map((choice) => choice.value));
      const value = validValues.has(selectedValue) ? selectedValue : "";
      const allChoices = [{ value: "", label: "All" }, ...choices];

      container.innerHTML = "";
      container.dataset.value = value;
      allChoices.forEach((choice) => {
        const selected = choice.value === value;
        const button = document.createElement("button");
        button.type = "button";
        button.className = `filter-chip${selected ? " is-active" : ""}`;
        button.dataset.filterValue = choice.value;
        button.setAttribute("aria-pressed", selected ? "true" : "false");
        button.textContent = choice.label;
        container.appendChild(button);
      });

      return value;
    }

    function uniqueSortedChoices(values, labelForValue) {
      return Array.from(new Set(values.filter(Boolean)))
        .map((value) => ({ value, label: labelForValue(value) }))
        .sort((left, right) => left.label.localeCompare(right.label));
    }

    function ageChoices(characters) {
      const values = characters.flatMap(ageFilterValues).filter(Boolean);

      return ageFilterGroups.filter((group) => values.some((value) => ageValueMatchesGroup(value, group)));
    }

    function tierChoices(characters) {
      const recordsByValue = new Map();

      characters.flatMap(tierRecords).forEach((record) => {
        const existing = recordsByValue.get(record.value);
        if (!existing || record.rank < existing.rank) recordsByValue.set(record.value, record);
      });

      return Array.from(recordsByValue.values())
        .sort((left, right) => left.rank - right.rank || left.label.localeCompare(right.label));
    }

    function renderFilters() {
      if (state.step !== "character") {
        state.filtersOpen = false;
        return;
      }

      const characters = verseCharacters();
      state.genderFilterId = populateSelect(
        filterControls.gender,
        "All genders",
        uniqueSortedChoices(characters.map((character) => character.gender_id), (id) => optionLabel(options.genders, id)),
        state.genderFilterId
      );
      state.ageFilter = populateChipFilter(
        filterControls.age,
        ageChoices(characters),
        state.ageFilter
      );
      state.tierFilter = populateChipFilter(
        filterControls.tier,
        tierChoices(characters),
        state.tierFilter
      );
      state.classificationFilterId = populateSelect(
        filterControls.classification,
        "All classifications",
        uniqueSortedChoices(
          characters.flatMap(classificationFilterIds),
          (id) => optionLabel(options.classifications, id)
        ),
        state.classificationFilterId
      );
    }

    function renderFilterPopover() {
      const filterCount = activeMetadataFilterCount();

      if (filterButton) {
        filterButton.textContent = filterCount ? `Filter (${filterCount})` : "Filter";
        filterButton.classList.toggle("is-active", filterCount > 0);
        filterButton.setAttribute("aria-expanded", state.filtersOpen ? "true" : "false");
      }

      if (filterPopover) {
        filterPopover.hidden = state.step !== "character" || !state.filtersOpen;
      }

      if (filterClearButton) {
        filterClearButton.disabled = filterCount === 0;
      }
    }

    function render() {
      const currentCharacter = displayCharacter();
      backButton.disabled = state.step === "media";
      confirmButton.disabled = !currentCharacter || state.confirmed;
      confirmButton.textContent = state.confirmed ? "Confirmed" : "Confirm";
      renderChoices();
      renderCard(card, currentCharacter, state.keyId);
      renderCardKeySwitcher(currentCharacter);
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

    function clearMetadataFilters() {
      state.genderFilterId = "";
      state.ageFilter = "";
      state.tierFilter = "";
      state.classificationFilterId = "";
      state.confirmed = false;
      render();
    }

    function applyCharacterFilters() {
      state.characterQuery = searchInput?.value || "";
      state.genderFilterId = filterControls.gender?.value || "";
      state.ageFilter = filterControls.age?.dataset.value || "";
      state.tierFilter = filterControls.tier?.dataset.value || "";
      state.classificationFilterId = filterControls.classification?.value || "";
      state.confirmed = false;

      const character = selectedCharacter();
      if (character && !characterMatchesFilters(character)) clearSelection();

      render();
    }
    filterButton?.addEventListener("click", () => {
      state.filtersOpen = !state.filtersOpen;
      renderFilterPopover();
    });
    filterClearButton?.addEventListener("click", clearMetadataFilters);
    searchShell?.addEventListener("submit", (event) => {
      event.preventDefault();
      applyCharacterFilters();
      searchInput?.focus();
    });
    searchInput?.addEventListener("input", applyCharacterFilters);
    [filterControls.gender, filterControls.classification]
      .forEach((control) => control?.addEventListener("change", applyCharacterFilters));
    [filterControls.age, filterControls.tier].forEach((container) => container?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-filter-value]");
      if (!button || !container.contains(button)) return;

      container.dataset.value = button.dataset.filterValue || "";
      applyCharacterFilters();
    }));
    document.addEventListener("click", (event) => {
      if (!state.filtersOpen || root.contains(event.target)) return;

      state.filtersOpen = false;
      renderFilterPopover();
    });
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !state.filtersOpen) return;

      state.filtersOpen = false;
      renderFilterPopover();
      filterButton?.focus();
    });
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
