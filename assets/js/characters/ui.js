(() => {
  const {
    battleResultHtml,
    data,
    list,
    options,
    renderBattle,
    renderCard,
    title
  } = window.NexyCharacters;
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
      confirmed: false
    };

    function clearSelection() {
      state.characterId = null;
      state.keyId = null;
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

      if (state.step === "character" && items.length === 0) {
        const emptyItem = document.createElement("li");
        emptyItem.className = "choice-empty";
        emptyItem.textContent = "No characters";
        choiceList.appendChild(emptyItem);
        return;
      }

      items.forEach((item) => {
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
