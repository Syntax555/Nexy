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

  const charactersByEntryId = new Map(data.characters.map((character) => [character.entry_id, character]));
  const imageBoundsCache = new Map();
  const preparedTrimImages = new WeakSet();
  const trimImageRequests = new WeakSet();
  const trimResizeObserver = "ResizeObserver" in window
    ? new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const image = entry.target.querySelector("img[data-trim-image]");
        if (image) requestTrimImage(image);
      });
    })
    : null;

  function trimFrameFor(image) {
    return image.closest(".character-image, .character-portrait, .circle-choice-orb");
  }

  function trimModeFor(frame) {
    if (frame?.closest(".battle-character-card")) return "cover";

    return frame?.classList.contains("circle-choice-orb") ? "cover" : "contain";
  }

  function trimAnchorFor(frame) {
    if (frame?.classList.contains("circle-choice-orb")) return { x: "center", y: "top" };
    if (frame?.closest(".battle-character-card")) return { x: "right", y: "top" };
    if (frame?.classList.contains("character-portrait")) return { x: "right", y: "bottom" };

    return { x: "center", y: "bottom" };
  }

  function trimInsetFor(frame) {
    if (frame?.classList.contains("circle-choice-orb")) return { top: 0, right: 0, bottom: 0, left: 0 };
    if (frame?.closest(".battle-character-card")) return { top: 0, right: 0, bottom: 0, left: 12 };
    if (frame?.classList.contains("character-portrait")) return { top: 0, right: 10, bottom: 0, left: 10 };

    return { top: 0, right: 8, bottom: 0, left: 8 };
  }

  function anchoredOffset(space, size, anchor) {
    if (anchor === "right" || anchor === "bottom") return space - size;
    if (anchor === "center") return (space - size) / 2;

    return 0;
  }

  function waitForImage(image) {
    if (image.complete && image.naturalWidth > 0) return Promise.resolve();

    return new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  }

  async function visibleImageBounds(image) {
    const source = image.currentSrc || image.src;
    if (!source) return null;
    if (imageBoundsCache.has(source)) return imageBoundsCache.get(source);

    const boundsPromise = (async () => {
      await waitForImage(image);
      const naturalWidth = image.naturalWidth;
      const naturalHeight = image.naturalHeight;
      if (!naturalWidth || !naturalHeight) return null;

      const maxSampleSide = 900;
      const sampleScale = Math.min(1, maxSampleSide / Math.max(naturalWidth, naturalHeight));
      const sampleWidth = Math.max(1, Math.round(naturalWidth * sampleScale));
      const sampleHeight = Math.max(1, Math.round(naturalHeight * sampleScale));
      const canvas = document.createElement("canvas");
      canvas.width = sampleWidth;
      canvas.height = sampleHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return null;

      try {
        context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
        const { data: pixels } = context.getImageData(0, 0, sampleWidth, sampleHeight);
        let minX = sampleWidth;
        let minY = sampleHeight;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < sampleHeight; y += 1) {
          for (let x = 0; x < sampleWidth; x += 1) {
            const alpha = pixels[((y * sampleWidth) + x) * 4 + 3];
            if (alpha <= 8) continue;

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }

        if (maxX < minX || maxY < minY) return null;

        return {
          naturalWidth,
          naturalHeight,
          left: minX / sampleScale,
          top: minY / sampleScale,
          width: ((maxX - minX) + 1) / sampleScale,
          height: ((maxY - minY) + 1) / sampleScale
        };
      } catch (error) {
        return null;
      }
    })();

    imageBoundsCache.set(source, boundsPromise);
    return boundsPromise;
  }

  async function applyTrimImage(image) {
    const frame = trimFrameFor(image);
    if (!frame || !image.isConnected) return;

    const bounds = await visibleImageBounds(image);
    if (!bounds || !image.isConnected) return;

    const frameWidth = frame.clientWidth;
    const frameHeight = frame.clientHeight;
    if (frameWidth <= 0 || frameHeight <= 0 || bounds.width <= 0 || bounds.height <= 0) return;

    const mode = trimModeFor(frame);
    const inset = trimInsetFor(frame);
    const fitWidth = Math.max(1, frameWidth - inset.left - inset.right);
    const fitHeight = Math.max(1, frameHeight - inset.top - inset.bottom);
    const scale = mode === "cover"
      ? Math.max(fitWidth / bounds.width, fitHeight / bounds.height)
      : Math.min(fitWidth / bounds.width, fitHeight / bounds.height);
    const imageWidth = bounds.naturalWidth * scale;
    const imageHeight = bounds.naturalHeight * scale;
    const visibleWidth = bounds.width * scale;
    const visibleHeight = bounds.height * scale;
    const anchor = trimAnchorFor(frame);
    const visibleLeft = inset.left + anchoredOffset(fitWidth, visibleWidth, anchor.x);
    const visibleTop = inset.top + anchoredOffset(fitHeight, visibleHeight, anchor.y);

    image.classList.add("is-pixel-trimmed");
    image.style.width = `${imageWidth}px`;
    image.style.height = `${imageHeight}px`;
    image.style.left = `${visibleLeft - (bounds.left * scale)}px`;
    image.style.top = `${visibleTop - (bounds.top * scale)}px`;
  }

  function requestTrimImage(image) {
    if (trimImageRequests.has(image)) return;

    trimImageRequests.add(image);
    window.requestAnimationFrame(() => {
      trimImageRequests.delete(image);
      applyTrimImage(image);
    });
  }

  function prepareTrimImage(image) {
    const frame = trimFrameFor(image);
    if (!frame) return;
    if (!preparedTrimImages.has(image)) {
      preparedTrimImages.add(image);
      image.addEventListener("load", () => requestTrimImage(image));
      trimResizeObserver?.observe(frame);
    }

    requestTrimImage(image);
  }

  function trimImagesIn(root) {
    root.querySelectorAll("img[data-trim-image]").forEach(prepareTrimImage);
  }

  function selector(root, onSelectionChange = () => {}) {
    const choiceLabel = root.querySelector("[data-choice-label]");
    const choiceList = root.querySelector("[data-choice-list]");
    const searchShell = root.querySelector("[data-choice-search-shell]");
    const searchInput = root.querySelector("[data-choice-search]");
    const filterButton = root.querySelector("[data-choice-filter]");
    const filterPopover = root.querySelector("[data-filter-popover]");
    const filterClearButton = root.querySelector("[data-filter-clear]");
    const sortButton = root.querySelector("[data-choice-sort]");
    const sortPopover = root.querySelector("[data-sort-popover]");
    const sortOptions = root.querySelector("[data-sort-options]");
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
      sortMode: "name-asc",
      filtersOpen: false,
      sortsOpen: false,
      confirmed: false
    };
    const classificationParentCache = new Map();
    const characterFilterDataCache = new WeakMap();
    const verseCharacterCache = new Map();
    const ageFilterGroups = [
      { value: "under-13", label: "Under 13", min: 0, max: 12 },
      { value: "teen", label: "Teen", min: 13, max: 19 },
      { value: "20s", label: "20s", min: 20, max: 29 },
      { value: "30s", label: "30s", min: 30, max: 39 },
      { value: "40s", label: "40s", min: 40, max: 49 },
      { value: "50-plus", label: "50+", min: 50 },
      { value: "unknown", label: "Unknown" }
    ];
    const sortChoices = [
      { value: "name-asc", label: "Name A-Z", shortLabel: "Name" },
      { value: "name-desc", label: "Name Z-A", shortLabel: "Name" },
      { value: "tier-desc", label: "Tier strongest first", shortLabel: "Tier" },
      { value: "tier-asc", label: "Tier weakest first", shortLabel: "Tier" }
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
      state.sortsOpen = false;
    }

    function stepItems() {
      if (state.step === "media") return options.media;
      if (state.step === "origin") return options.origins.filter((origin) => origin.media_id === state.mediaId);
      if (state.step === "verse") return options.verses.filter((verse) => verse.media_id === state.mediaId && verse.source_id === state.originId);
      if (state.step === "character") return filteredCharacters();

      return [];
    }

    function selectedCharacter() {
      return charactersByEntryId.get(state.characterId) || null;
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

    function resolveClassificationWithParents(classificationId, seen = new Set()) {
      if (!classificationId || seen.has(classificationId)) return [];

      const nextSeen = new Set(seen);
      nextSeen.add(classificationId);
      const classification = byId(options.classifications, classificationId);

      return [
        classificationId,
        ...list(classification?.parent_ids).flatMap((parentId) => resolveClassificationWithParents(parentId, nextSeen))
      ];
    }

    function classificationWithParents(classificationId) {
      if (!classificationId) return [];
      if (!classificationParentCache.has(classificationId)) {
        classificationParentCache.set(classificationId, resolveClassificationWithParents(classificationId));
      }

      return classificationParentCache.get(classificationId);
    }

    function classificationFilterIds(character) {
      const ids = new Set();
      list(character.classification_ids)
        .flatMap((id) => classificationWithParents(id))
        .forEach((id) => ids.add(id));

      return Array.from(ids);
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

    function characterFilterData(character) {
      if (!character) {
        return {
          searchText: "",
          ageValues: [],
          tierRecords: [],
          tierValues: [],
          classificationIds: []
        };
      }

      if (!characterFilterDataCache.has(character)) {
        const ageValues = ageFilterValues(character);
        const cachedTierRecords = tierRecords(character);
        const tierValues = cachedTierRecords.map((record) => record.value);
        const classificationIds = classificationFilterIds(character);
        const classificationValues = classificationIds
          .flatMap((id) => [id, optionLabel(options.classifications, id)]);
        const searchValues = [
          character.name,
          character.entry_id,
          ...ageValues,
          ...tierValues,
          ...classificationValues,
          ...list(character.keys).flatMap((key) => [key.key, key.name, ...list(key.names)])
        ];

        characterFilterDataCache.set(character, {
          searchText: searchValues.map(normalizedSearchText).join(" "),
          ageValues,
          tierRecords: cachedTierRecords,
          tierValues,
          classificationIds
        });
      }

      return characterFilterDataCache.get(character);
    }

    function verseCharacters() {
      if (!state.verseId) return [];
      if (!verseCharacterCache.has(state.verseId)) {
        verseCharacterCache.set(
          state.verseId,
          data.characters.filter((character) => character.verse_id === state.verseId)
        );
      }

      return verseCharacterCache.get(state.verseId);
    }

    function characterMatchesFilters(character) {
      const query = normalizedSearchText(state.characterQuery);
      const filterData = characterFilterData(character);

      if (query && !filterData.searchText.includes(query)) return false;
      if (state.genderFilterId && character.gender_id !== state.genderFilterId) return false;
      if (state.ageFilter && !ageValuesMatchFilter(filterData.ageValues, state.ageFilter)) return false;
      if (state.tierFilter && !filterData.tierValues.includes(state.tierFilter)) return false;
      if (state.classificationFilterId && !filterData.classificationIds.includes(state.classificationFilterId)) return false;

      return true;
    }

    function filteredCharacters() {
      return sortCharacters(verseCharacters().filter(characterMatchesFilters));
    }

    function characterSortName(character) {
      return normalizedSearchText(`${choiceTitle(character)} ${choiceSubtitle(character)}`);
    }

    function bestTierRank(character) {
      return characterFilterData(character).tierRecords.reduce(
        (bestRank, record) => Math.max(bestRank, Number(record.rank) || 0),
        0
      );
    }

    function compareByName(left, right, direction = 1) {
      return direction * characterSortName(left).localeCompare(characterSortName(right), undefined, { sensitivity: "base" });
    }

    function sortCharacters(characters) {
      return characters
        .map((character, index) => ({ character, index }))
        .sort((left, right) => {
          if (state.sortMode === "name-asc") {
            return compareByName(left.character, right.character) || left.index - right.index;
          }

          if (state.sortMode === "name-desc") {
            return compareByName(left.character, right.character, -1) || left.index - right.index;
          }

          if (state.sortMode === "tier-desc") {
            return bestTierRank(right.character) - bestTierRank(left.character)
              || compareByName(left.character, right.character)
              || left.index - right.index;
          }

          if (state.sortMode === "tier-asc") {
            return bestTierRank(left.character) - bestTierRank(right.character)
              || compareByName(left.character, right.character)
              || left.index - right.index;
          }

          return left.index - right.index;
        })
        .map((item) => item.character);
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
        state.sortsOpen = false;

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
      renderSortPopover();
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
            ? `<img src="${escapeHtml(assetUrl(image.image))}" alt="" data-trim-image>`
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
      const values = characters.flatMap((character) => characterFilterData(character).ageValues).filter(Boolean);

      return ageFilterGroups.filter((group) => values.some((value) => ageValueMatchesGroup(value, group)));
    }

    function tierChoices(characters) {
      const recordsByValue = new Map();

      characters.flatMap((character) => characterFilterData(character).tierRecords).forEach((record) => {
        const existing = recordsByValue.get(record.value);
        if (!existing || record.rank < existing.rank) recordsByValue.set(record.value, record);
      });

      return Array.from(recordsByValue.values())
        .sort((left, right) => left.rank - right.rank || left.label.localeCompare(right.label));
    }

    function renderFilters() {
      if (state.step !== "character") {
        state.filtersOpen = false;
        state.sortsOpen = false;
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
          characters.flatMap((character) => characterFilterData(character).classificationIds),
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

    function renderSortPopover() {
      const currentSort = sortChoices.find((choice) => choice.value === state.sortMode) || sortChoices[0];
      const sortIsActive = state.sortMode !== "name-asc";

      if (sortButton) {
        sortButton.textContent = sortIsActive ? `Sort: ${currentSort.shortLabel}` : "Sort";
        sortButton.classList.toggle("is-active", sortIsActive);
        sortButton.setAttribute("aria-expanded", state.sortsOpen ? "true" : "false");
      }

      if (sortPopover) {
        sortPopover.hidden = state.step !== "character" || !state.sortsOpen;
      }

      if (!sortOptions) return;

      sortOptions.innerHTML = "";
      sortChoices.forEach((choice) => {
        const selected = choice.value === state.sortMode;
        const button = document.createElement("button");
        button.type = "button";
        button.className = `sort-option${selected ? " is-active" : ""}`;
        button.dataset.sortValue = choice.value;
        button.setAttribute("role", "radio");
        button.setAttribute("aria-checked", selected ? "true" : "false");
        button.textContent = choice.label;
        sortOptions.appendChild(button);
      });
    }

    function render() {
      const currentCharacter = displayCharacter();
      backButton.disabled = state.step === "media";
      confirmButton.disabled = !currentCharacter || state.confirmed;
      confirmButton.textContent = state.confirmed ? "Confirmed" : "Confirm";
      renderChoices();
      renderCard(card, currentCharacter, state.keyId);
      renderCardKeySwitcher(currentCharacter);
      trimImagesIn(root);
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
      if (state.filtersOpen) state.sortsOpen = false;
      renderFilterPopover();
      renderSortPopover();
    });
    sortButton?.addEventListener("click", () => {
      state.sortsOpen = !state.sortsOpen;
      if (state.sortsOpen) state.filtersOpen = false;
      renderFilterPopover();
      renderSortPopover();
    });
    sortOptions?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-sort-value]");
      if (!button || !sortOptions.contains(button)) return;

      state.sortMode = button.dataset.sortValue || "name-asc";
      state.sortsOpen = false;
      state.confirmed = false;
      render();
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
      if (root.contains(event.target)) return;
      if (!state.filtersOpen && !state.sortsOpen) return;

      const shouldFocusFilter = state.filtersOpen;
      const shouldFocusSort = state.sortsOpen;
      state.filtersOpen = false;
      state.sortsOpen = false;
      renderFilterPopover();
      renderSortPopover();
      if (shouldFocusFilter) filterButton?.blur();
      if (shouldFocusSort) sortButton?.blur();
    });
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || (!state.filtersOpen && !state.sortsOpen)) return;

      const shouldFocusFilter = state.filtersOpen;
      const shouldFocusSort = state.sortsOpen;
      state.filtersOpen = false;
      state.sortsOpen = false;
      renderFilterPopover();
      renderSortPopover();
      if (shouldFocusFilter) filterButton?.focus();
      if (shouldFocusSort) sortButton?.focus();
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
  const imageLightbox = document.querySelector("[data-image-lightbox]");
  const imageLightboxImage = imageLightbox?.querySelector("[data-image-lightbox-image]");
  const imageLightboxTitle = imageLightbox?.querySelector("[data-image-lightbox-title]");
  const imageLightboxClose = imageLightbox?.querySelector("[data-image-lightbox-close]");
  let lastImageExpandButton = null;
  let selectors = [];
  let currentBattleViews = null;

  function closeImageLightbox() {
    if (!imageLightbox) return;

    imageLightbox.hidden = true;
    if (imageLightboxImage) {
      imageLightboxImage.removeAttribute("src");
      imageLightboxImage.alt = "";
    }
    if (imageLightboxTitle) imageLightboxTitle.textContent = "";
    document.body.classList.remove("is-lightbox-open");
    if (lastImageExpandButton?.isConnected) lastImageExpandButton.focus();
    lastImageExpandButton = null;
  }

  function openImageLightbox(button) {
    if (!imageLightbox || !imageLightboxImage) return;

    const src = button.dataset.imageSrc;
    const title = button.dataset.imageTitle || "Character image";
    if (!src) return;

    imageLightboxImage.src = src;
    imageLightboxImage.alt = title;
    if (imageLightboxTitle) imageLightboxTitle.textContent = title;
    lastImageExpandButton = button;
    imageLightbox.hidden = false;
    document.body.classList.add("is-lightbox-open");
    imageLightboxClose?.focus();
  }

  function showSelectionScreen() {
    selectionScreen.hidden = false;
    battleScreen.hidden = true;
    currentBattleViews = null;
    trimImagesIn(selectionScreen);
  }

  function showBattleScreen(leftSelection, rightSelection) {
    currentBattleViews = renderBattle(battleContent, leftSelection, rightSelection);
    if (startBattleButton) startBattleButton.disabled = false;
    selectionScreen.hidden = true;
    battleScreen.hidden = false;
    trimImagesIn(battleContent);
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
    result.innerHTML = battleResultHtml(currentBattleViews.left, currentBattleViews.right, currentBattleViews.statPairs);
    startBattleButton.disabled = true;
  });

  document.addEventListener("click", (event) => {
    const expandButton = event.target.closest("[data-image-expand]");
    if (expandButton) {
      openImageLightbox(expandButton);
      return;
    }

    if (event.target === imageLightbox || event.target.closest("[data-image-lightbox-close]")) {
      closeImageLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !imageLightbox || imageLightbox.hidden) return;

    closeImageLightbox();
  });

  imageLightbox?.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || imageLightbox.hidden || !imageLightboxClose) return;

    event.preventDefault();
    imageLightboxClose.focus();
  });

  selectors = Array.from(document.querySelectorAll("[data-selector]"))
    .map((root) => selector(root, maybeShowBattleScreen));
})();
