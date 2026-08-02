import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";

import type { RosterCharacter } from "../app/roster.js";
import type { BattleSelection, CharacterProfile as CharacterProfileData } from "../domain/index.js";
import "../styles/roster-scale.css";
import { CharacterProfile } from "./CharacterProfile.js";
import type { DialogImage } from "./ImageDialog.js";
import { RosterCarousel, type RosterView } from "./RosterCarousel.js";
import { SearchableSelect } from "./SearchableSelect.js";
import { type AgeFilter, ROSTER_PAGE_SIZE, type SortOrder, useRosterBrowser } from "./useRosterBrowser.js";

interface FighterPickerProps {
  readonly side: "left" | "right";
  readonly roster: readonly RosterCharacter[];
  readonly selection: BattleSelection | null;
  readonly profile: CharacterProfileData | null;
  readonly collapseBrowse?: boolean;
  readonly mobileNavigation?: ComponentChildren;
  readonly rosterView?: RosterView;
  readonly onRosterViewChange?: (view: RosterView) => void;
  readonly onSelect: (selection: BattleSelection) => void;
  readonly onClear: () => void;
  readonly onRandom: (candidates: readonly RosterCharacter[]) => void;
  readonly onOpenImage: (image: DialogImage, returnFocus: HTMLElement) => void;
}

export function FighterPicker({
  side,
  roster,
  selection,
  profile,
  collapseBrowse = false,
  mobileNavigation,
  rosterView,
  onRosterViewChange,
  onSelect,
  onClear,
  onRandom,
  onOpenImage
}: FighterPickerProps) {
  const [localRosterView, setLocalRosterView] = useState<RosterView>("carousel");
  const fighterNumber = side === "left" ? "01" : "02";
  const accentName = side === "left" ? "Cyan corner" : "Magenta corner";
  const activeRosterView = rosterView ?? localRosterView;
  const updateRosterView = onRosterViewChange ?? setLocalRosterView;
  const {
    query,
    setQuery,
    media,
    setMedia,
    origin,
    setOrigin,
    verse,
    setVerse,
    gender,
    setGender,
    age,
    setAge,
    tier,
    setTier,
    classification,
    setClassification,
    sortOrder,
    setSortOrder,
    searchRef,
    mediaOptions,
    originOptions,
    verseOptions,
    genders,
    ages,
    tiers,
    classifications,
    selectedMedia,
    selectedOrigin,
    visibleRoster,
    selectedCharacter,
    selectedOutsideFilters,
    renderedRoster,
    shownRosterCount,
    remainingRosterCount,
    browsePathLevel,
    browsePathStatus,
    browsePathSummary,
    rosterResetKey,
    resetMetadataFilters,
    resetFilters,
    focusSearchAfterRender,
    activeMetadataFilterCount,
    filtersActive,
    showMore
  } = useRosterBrowser({ side, roster, selection });
  const randomAvailable = selection
    ? visibleRoster.some((item) => item.id !== selection.characterId)
    : visibleRoster.length > 0;
  const galleryActive = !(selectedCharacter && profile);
  const displayedRosterView: RosterView = galleryActive ? activeRosterView : "grid";
  const selectRosterFighter = (nextSelection: BattleSelection): void => {
    if (activeRosterView !== "grid") updateRosterView("grid");
    onSelect(nextSelection);
  };
  const browsePathControls = (
    <>
      <p
        class="roster-path__status"
        id={`${side}-browse-path-status`}
        data-browse-path-status
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {browsePathStatus}
      </p>
      <div class="roster-path__steps">
        <SearchableSelect
          id={`${side}-media-filter`}
          label="Media"
          step={1}
          browseStep="media"
          value={media}
          options={mediaOptions}
          allLabel="All media"
          describedBy={`${side}-browse-path-status`}
          onChange={(value) => {
            setMedia(value);
            setOrigin("all");
            setVerse("all");
            resetMetadataFilters();
          }}
        />
        <SearchableSelect
          id={`${side}-origin-filter`}
          label="Publisher / origin"
          step={2}
          browseStep="publisher"
          value={origin}
          options={originOptions}
          allLabel={selectedMedia ? `All ${selectedMedia.label} publishers / origins` : "All publishers / origins"}
          disabled={media === "all"}
          disabledHint="Choose media first"
          describedBy={`${side}-browse-path-status`}
          onChange={(value) => {
            setOrigin(value);
            setVerse("all");
            resetMetadataFilters();
          }}
        />
        <SearchableSelect
          id={`${side}-verse-filter`}
          label="Universe / verse"
          step={3}
          browseStep="universe"
          value={verse}
          options={verseOptions}
          allLabel={selectedOrigin ? `All ${selectedOrigin.label} universes` : "All universes"}
          disabled={origin === "all"}
          disabledHint="Choose publisher / origin first"
          describedBy={`${side}-browse-path-status`}
          onChange={(value) => {
            setVerse(value);
            resetMetadataFilters();
          }}
        />
      </div>
    </>
  );
  return (
    <section
      class="fighter-picker"
      data-side={side}
      data-view={galleryActive ? "gallery" : "profile"}
      aria-labelledby={`${side}-picker-title`}
    >
      {mobileNavigation}
      <header class="fighter-picker__header">
        <div>
          <span class="eyebrow">
            {accentName} · Fighter {fighterNumber}
          </span>
          <h2 id={`${side}-picker-title`} tabIndex={-1}>
            {selectedCharacter?.name ?? "Select fighter"}
          </h2>
        </div>
        <div class="fighter-picker__actions">
          <button class="text-button" type="button" disabled={!randomAvailable} onClick={() => onRandom(visibleRoster)}>
            Random
          </button>
          {selection ? (
            <button
              class="text-button"
              type="button"
              onClick={() => {
                onClear();
                focusSearchAfterRender();
              }}
            >
              Remove fighter
            </button>
          ) : null}
        </div>
        <p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {selectedCharacter
            ? `${selectedCharacter.name}, ${profile?.names[0] ?? selectedCharacter.identity}, selected for fighter ${fighterNumber}.`
            : `No fighter selected for fighter ${fighterNumber}.`}
        </p>
      </header>

      <div class="fighter-picker__body">
        <aside class="roster-browser" aria-label={`${accentName} roster`}>
          <details class="roster-tools" data-gallery={galleryActive ? "true" : "false"} open={galleryActive}>
            <summary class="roster-tools__summary">
              <span>Find another fighter</span>
              <small>Search, universe, order, and filters</small>
            </summary>
            <div class="roster-tools__content">
              <label class="search-wrap">
                <span class="visually-hidden">Search characters</span>
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  placeholder="Name, alias, universe…"
                  autocomplete="off"
                  onInput={(event) => setQuery(event.currentTarget.value)}
                />
                {side === "left" ? (
                  <span aria-hidden="true">
                    <kbd>/</kbd>
                  </span>
                ) : null}
              </label>

              {collapseBrowse ? (
                <details
                  class="roster-path roster-path--disclosure"
                  data-browse-path
                  data-browse-level={browsePathLevel}
                >
                  <summary class="roster-path__summary">
                    <span>Browse by universe</span>
                    <small>{browsePathSummary}</small>
                  </summary>
                  <fieldset class="roster-path__content">
                    <legend class="visually-hidden">Browse by universe</legend>
                    {browsePathControls}
                  </fieldset>
                </details>
              ) : (
                <fieldset class="roster-path" data-browse-path data-browse-level={browsePathLevel}>
                  <legend class="roster-path__legend">Browse by universe</legend>
                  {browsePathControls}
                </fieldset>
              )}

              <div class="filter-primary filter-primary--order">
                <label class="filter-field">
                  <span>Order</span>
                  <select value={sortOrder} onChange={(event) => setSortOrder(event.currentTarget.value as SortOrder)}>
                    <option value="name">Name A–Z</option>
                    <option value="name-desc">Name Z–A</option>
                    <option value="tier-desc">Highest tier</option>
                    <option value="tier-asc">Lowest tier</option>
                  </select>
                </label>
              </div>

              <details class="filter-panel">
                <summary>
                  <span>More filters</span>
                  <small>
                    {activeMetadataFilterCount > 0 ? `${activeMetadataFilterCount} active` : "Gender, age, tier, class"}
                  </small>
                </summary>
                <div class="filter-grid">
                  <label class="filter-field">
                    <span>Gender</span>
                    <select value={gender} onChange={(event) => setGender(event.currentTarget.value)}>
                      <option value="all">All genders</option>
                      {genders.map((option) => (
                        <option value={option.id} key={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label class="filter-field">
                    <span>Age</span>
                    <select value={age} onChange={(event) => setAge(event.currentTarget.value as AgeFilter)}>
                      <option value="all">All ages</option>
                      {ages.map((option) => (
                        <option value={option.id} key={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label class="filter-field">
                    <span>Tier</span>
                    <select value={tier} onChange={(event) => setTier(event.currentTarget.value)}>
                      <option value="all">All tiers</option>
                      {tiers.map((option) => (
                        <option value={option.id} key={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label class="filter-field">
                    <span>Classification</span>
                    <select value={classification} onChange={(event) => setClassification(event.currentTarget.value)}>
                      <option value="all">All classifications</option>
                      {classifications.map((option) => (
                        <option value={option.id} key={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </details>
            </div>
          </details>

          <div class="roster-meta">
            <span role="status" aria-live="polite" aria-atomic="true">
              {visibleRoster.length} of {roster.length} fighters
            </span>
            <div class="roster-meta__actions">
              {filtersActive ? (
                <button class="text-button" type="button" onClick={resetFilters}>
                  Reset
                </button>
              ) : null}
              {galleryActive ? (
                <fieldset class="roster-view-switcher">
                  <legend class="visually-hidden">Roster view</legend>
                  <div>
                    <button
                      type="button"
                      aria-pressed={activeRosterView === "carousel"}
                      aria-label="Carousel view"
                      onClick={() => updateRosterView("carousel")}
                    >
                      <span aria-hidden="true">&#9635;</span>
                      Carousel
                    </button>
                    <button
                      type="button"
                      aria-pressed={activeRosterView === "grid"}
                      aria-label="Portrait grid view"
                      onClick={() => updateRosterView("grid")}
                    >
                      <span aria-hidden="true">&#9638;</span>
                      Grid
                    </button>
                  </div>
                </fieldset>
              ) : null}
            </div>
          </div>
          {selectedOutsideFilters ? (
            <p class="roster-selection-note" id={`${side}-roster-selection-note`} role="status">
              Selected fighter shown outside the current filters.
            </p>
          ) : null}

          <RosterCarousel
            side={side}
            accentName={accentName}
            items={renderedRoster}
            selection={selection}
            rosterView={displayedRosterView}
            shownRosterCount={shownRosterCount}
            visibleRosterCount={visibleRoster.length}
            remainingRosterCount={remainingRosterCount}
            nextPageSize={Math.min(ROSTER_PAGE_SIZE, remainingRosterCount)}
            resetKey={rosterResetKey}
            describedBy={[
              `${side}-rendered-roster-count`,
              galleryActive ? `${side}-roster-artwork-note` : "",
              selectedOutsideFilters ? `${side}-roster-selection-note` : ""
            ]
              .filter(Boolean)
              .join(" ")}
            onSelect={selectRosterFighter}
            onResetFilters={resetFilters}
            onShowMore={showMore}
          />
          {galleryActive ? (
            <p class="roster-artwork-note" id={`${side}-roster-artwork-note`}>
              Third-party artwork may have unverified rights. Select a fighter for its exact source record.
            </p>
          ) : null}
          <span id={`${side}-rendered-roster-count`} class="visually-hidden">
            Showing {shownRosterCount} of {visibleRoster.length} matching fighters.
            {selectedOutsideFilters ? " Plus the selected fighter outside the filters." : ""}
          </span>
        </aside>

        <CharacterProfile
          key={selection ? selection.characterId : `${side}:empty`}
          side={side}
          rosterCharacter={selectedCharacter}
          profile={profile}
          onFormChange={(formId) => {
            if (!selectedCharacter) return;
            onSelect({ characterId: selectedCharacter.id, formId });
          }}
          onOpenImage={onOpenImage}
        />
      </div>
    </section>
  );
}
