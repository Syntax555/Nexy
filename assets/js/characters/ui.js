(() => {
  const {
    battleResultHtml,
    byId,
    data,
    list,
    options,
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
      classificationFilterId: "",
      filtersOpen: false,
      confirmed: false
    };

    function clearSelection() {
      state.characterId = null;
      state.keyId = null;
      state.confirmed = false;
    }

    function clearCharacterFilters() {
      state.characterQuery = "";
      state.genderFilterId = "";
      state.ageFilter = "";
      state.classificationFilterId = "";
      state.filtersOpen = false;
    }

    function stepItems() {
      if (state.step === "media") return options.media;
      if (state.step === "origin") return options.origins.filter((origin) => origin.media_id === state.mediaId);
      if (state.step === "verse") return options.verses.filter((verse) => verse.media_id === state.mediaId && verse.source_id === state.originId);
      if (state.step === "character") return filteredCharacters();

      const character = selectedCharacter();
      return character ? list(character.keys) : [];
    }

    function selectedCharacter() {
      return data.characters.find((character) => character.entry_id === state.characterId) || null;
    }

    function displayCharacter() {
      const character = selectedCharacter();
      if (!character) return null;
      if (state.step === "key" && !state.keyId) return null;

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
        ...list(character.keys).flatMap((key) => [key.key, ...list(key.names)])
      ].map(normalizedSearchText).join(" ");
    }

    function ageLabel(character) {
      const age = character.age || {};
      if (age.display) return String(age.display);
      if (age.value !== undefined && age.value !== null && age.value !== "") return String(age.value);
      return "Unknown";
    }

    function verseCharacters() {
      return data.characters.filter((character) => character.verse_id === state.verseId);
    }

    function characterMatchesFilters(character) {
      const query = normalizedSearchText(state.characterQuery);
      if (query && !characterSearchText(character).includes(query)) return false;
      if (state.genderFilterId && character.gender_id !== state.genderFilterId) return false;
      if (state.ageFilter && ageLabel(character) !== state.ageFilter) return false;
      if (state.classificationFilterId && !list(character.classification_ids).includes(state.classificationFilterId)) return false;

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
        state.classificationFilterId
      );
    }

    function activeMetadataFilterCount() {
      return [
        state.genderFilterId,
        state.ageFilter,
        state.classificationFilterId
      ].filter(Boolean).length;
    }

    function choiceSubtitle(item) {
      if (state.step === "character") {
        return uniqueNames(list(item.keys).flatMap((key) => list(key.names))).join(" / ");
      }

      if (state.step === "key") {
        return uniqueNames(item.names).join(" / ");
      }

      return "";
    }

    function choiceTitle(item) {
      return state.step === "key" ? title(item.key) : title(item.name);
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
        clearCharacterFilters();
        clearSelection();
      } else {
        state.step = "character";
        clearSelection();
      }

      render();
    }

    function renderChoices() {
      const labels = {
        media: "Media",
        origin: "Origin",
        verse: "Verse",
        character: "Character",
        key: "Key"
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

      if (state.step === "character" && items.length === 0) {
        const emptyItem = document.createElement("li");
        emptyItem.className = "choice-empty";
        emptyItem.textContent = hasActiveCharacterFilter() ? "No matching characters" : "No characters";
        choiceList.appendChild(emptyItem);
        return;
      }

      items.forEach((item) => {
        const button = document.createElement("button");
        const subtitle = choiceSubtitle(item);
        button.type = "button";
        button.className = "choice-button";
        button.innerHTML = `
          <span class="choice-title">${escapeHtml(choiceTitle(item))}</span>
          ${subtitle ? `<span class="choice-subtitle">${escapeHtml(subtitle)}</span>` : ""}
        `;
        button.addEventListener("click", () => choose(item));

        choiceList.appendChild(document.createElement("li")).appendChild(button);
      });
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

    function uniqueSortedChoices(values, labelForValue) {
      return Array.from(new Set(values.filter(Boolean)))
        .map((value) => ({ value, label: labelForValue(value) }))
        .sort((left, right) => left.label.localeCompare(right.label));
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
      state.ageFilter = populateSelect(
        filterControls.age,
        "All ages",
        uniqueSortedChoices(characters.map(ageLabel), (age) => age),
        state.ageFilter
      );
      state.classificationFilterId = populateSelect(
        filterControls.classification,
        "All classifications",
        uniqueSortedChoices(
          characters.flatMap((character) => list(character.classification_ids)),
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
      state.classificationFilterId = "";
      state.confirmed = false;
      render();
    }

    function applyCharacterFilters() {
      state.characterQuery = searchInput?.value || "";
      state.genderFilterId = filterControls.gender?.value || "";
      state.ageFilter = filterControls.age?.value || "";
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
    Object.values(filterControls).forEach((control) => control?.addEventListener("change", applyCharacterFilters));
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
