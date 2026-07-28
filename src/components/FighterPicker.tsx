import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { characterImageVariant } from "../app/assets.js";
import { isImageApprovedForPublicDisplay } from "../app/image-rights.js";
import type { RosterCharacter, RosterTier } from "../app/roster.js";
import type {
  BattleSelection,
  CharacterProfile as CharacterProfileData
} from "../domain/index.js";
import { getCachedSearchIndex, searchIndex } from "../search/search.js";
import "../styles/roster-scale.css";
import type { DialogImage } from "./ImageDialog.js";
import { CharacterImage } from "./CharacterImage.js";
import { CharacterProfile } from "./CharacterProfile.js";
import { SearchableSelect } from "./SearchableSelect.js";

type SortOrder = "name" | "name-desc" | "tier-desc" | "tier-asc";
type AgeFilter =
  | "all"
  | "under-13"
  | "teen"
  | "20s"
  | "30s"
  | "40s"
  | "50-plus"
  | "unknown";

interface FilterOption {
  readonly id: string;
  readonly label: string;
}

interface AgeGroup {
  readonly id: Exclude<AgeFilter, "all">;
  readonly label: string;
  readonly min?: number;
  readonly max?: number;
}

const ROSTER_PAGE_SIZE = 60;
const rosterSearchText = (item: RosterCharacter): string => item.searchText;

const ageGroups: readonly AgeGroup[] = [
  { id: "under-13", label: "Under 13", min: 0, max: 12 },
  { id: "teen", label: "Teen", min: 13, max: 19 },
  { id: "20s", label: "20s", min: 20, max: 29 },
  { id: "30s", label: "30s", min: 30, max: 39 },
  { id: "40s", label: "40s", min: 40, max: 49 },
  { id: "50-plus", label: "50+", min: 50 },
  { id: "unknown", label: "Unknown" }
];

interface FighterPickerProps {
  readonly side: "left" | "right";
  readonly roster: readonly RosterCharacter[];
  readonly selection: BattleSelection | null;
  readonly profile: CharacterProfileData | null;
  readonly onSelect: (selection: BattleSelection) => void;
  readonly onClear: () => void;
  readonly onRandom: () => void;
  readonly onOpenImage: (image: DialogImage) => void;
}

function sortedUniqueOptions(options: readonly FilterOption[]): readonly FilterOption[] {
  const labels = new Map<string, string>();
  for (const option of options) {
    if (option.id) labels.set(option.id, option.label);
  }
  return [...labels]
    .map(([id, label]) => ({ id, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function ageMatchesGroup(
  values: RosterCharacter["ageFilterValues"],
  groupId: Exclude<AgeFilter, "all">
): boolean {
  const group = ageGroups.find((candidate) => candidate.id === groupId);
  if (!group) return true;
  if (group.id === "unknown") return values.includes("unknown");

  return values.some((value) =>
    typeof value === "number"
    && (group.min === undefined || value >= group.min)
    && (group.max === undefined || value <= group.max)
  );
}

function sortedTierOptions(items: readonly RosterCharacter[]): readonly FilterOption[] {
  const tiers = new Map<string, RosterTier>();
  for (const item of items) {
    for (const tier of item.tiers) {
      const current = tiers.get(tier.value);
      if (!current || tier.rank < current.rank) tiers.set(tier.value, tier);
    }
  }

  return [...tiers.values()]
    .sort((left, right) => left.rank - right.rank || left.value.localeCompare(right.value))
    .map((tier) => ({ id: tier.value, label: tier.value }));
}

function compareByName(
  left: RosterCharacter,
  right: RosterCharacter,
  direction = 1
): number {
  return direction * (
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
    || left.identity.localeCompare(right.identity, undefined, { sensitivity: "base" })
  );
}

export function FighterPicker({
  side,
  roster,
  selection,
  profile,
  onSelect,
  onClear,
  onRandom,
  onOpenImage
}: FighterPickerProps) {
  const [query, setQuery] = useState("");
  const [media, setMedia] = useState("all");
  const [origin, setOrigin] = useState("all");
  const [verse, setVerse] = useState("all");
  const [gender, setGender] = useState("all");
  const [age, setAge] = useState<AgeFilter>("all");
  const [tier, setTier] = useState("all");
  const [classification, setClassification] = useState("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("name");
  const [visibleLimit, setVisibleLimit] = useState(ROSTER_PAGE_SIZE);
  const searchRef = useRef<HTMLInputElement>(null);
  const fighterNumber = side === "left" ? "01" : "02";
  const accentName = side === "left" ? "Cyan corner" : "Magenta corner";
  const searchIndexForRoster = useMemo(
    () => getCachedSearchIndex(roster, rosterSearchText),
    [roster]
  );
  const mediaOptions = useMemo(() => sortedUniqueOptions(
    roster.map((item) => ({ id: item.mediaId, label: item.media }))
  ), [roster]);
  const originOptions = useMemo(() => sortedUniqueOptions(
    media === "all" ? [] : roster
      .filter((item) => media === "all" || item.mediaId === media)
      .map((item) => ({ id: item.originId, label: item.origin }))
  ), [media, roster]);
  const verseOptions = useMemo(() => sortedUniqueOptions(
    origin === "all" ? [] : roster
      .filter((item) => media === "all" || item.mediaId === media)
      .filter((item) => origin === "all" || item.originId === origin)
      .map((item) => ({ id: item.verseId, label: item.verse }))
  ), [media, origin, roster]);
  const locationRoster = useMemo(() => roster.filter((item) =>
    (media === "all" || item.mediaId === media)
    && (origin === "all" || item.originId === origin)
    && (verse === "all" || item.verseId === verse)
  ),
  [media, origin, roster, verse]);
  const genders = useMemo(() => sortedUniqueOptions(
    locationRoster.map((item) => ({ id: item.genderId, label: item.gender }))
  ), [locationRoster]);
  const ages = useMemo(() => ageGroups
    .filter((group) =>
      locationRoster.some((item) => ageMatchesGroup(item.ageFilterValues, group.id))
    )
    .map((group) => ({ id: group.id, label: group.label })),
  [locationRoster]);
  const tiers = useMemo(() => sortedTierOptions(locationRoster), [locationRoster]);
  const classifications = useMemo(() => sortedUniqueOptions(
    locationRoster.flatMap((item) =>
      item.classificationFilterIds.map((id, index) => ({
        id,
        label: item.classificationFilterNames[index] ?? id
      }))
    )
  ), [locationRoster]);

  const visibleRoster = useMemo(() => {
    const matched = searchIndex(searchIndexForRoster, query)
      .filter((item) =>
        (media === "all" || item.mediaId === media)
        && (origin === "all" || item.originId === origin)
        && (verse === "all" || item.verseId === verse)
        && (gender === "all" || item.genderId === gender)
        && (age === "all" || ageMatchesGroup(item.ageFilterValues, age))
        && (
          tier === "all"
          || item.tiers.some((candidate) => candidate.value === tier)
        )
        && (
          classification === "all"
          || item.classificationFilterIds.includes(classification)
        )
      );

    return [...matched].sort((left, right) => {
      if (sortOrder === "tier-desc") {
        return right.tierRank - left.tierRank || compareByName(left, right);
      }
      if (sortOrder === "tier-asc") {
        return left.tierRank - right.tierRank || compareByName(left, right);
      }
      if (sortOrder === "name-desc") {
        return compareByName(left, right, -1);
      }
      return compareByName(left, right);
    });
  }, [
    age,
    classification,
    gender,
    media,
    origin,
    query,
    searchIndexForRoster,
    sortOrder,
    tier,
    verse
  ]);

  const selectedCharacter = selection
    ? roster.find((item) => item.id === selection.characterId) ?? null
    : null;
  const renderedRoster = useMemo(() => {
    const page = visibleRoster.slice(0, visibleLimit);
    if (!selection || page.some((item) => item.id === selection.characterId)) {
      return page;
    }

    const selectedMatch = visibleRoster.find(
      (item) => item.id === selection.characterId
    );
    return selectedMatch && page.length > 0
      ? [selectedMatch, ...page.slice(0, page.length - 1)]
      : page;
  }, [selection, visibleLimit, visibleRoster]);
  const shownRosterCount = Math.min(visibleLimit, visibleRoster.length);
  const remainingRosterCount = Math.max(0, visibleRoster.length - shownRosterCount);
  const selectedMedia = mediaOptions.find((option) => option.id === media) ?? null;
  const selectedOrigin = originOptions.find((option) => option.id === origin) ?? null;
  const selectedVerse = verseOptions.find((option) => option.id === verse) ?? null;
  const browsePathLevel = verse !== "all"
    ? "universe"
    : origin !== "all"
      ? "publisher"
      : media !== "all"
        ? "media"
        : "all";
  const browsePathStatus = selectedVerse && selectedOrigin && selectedMedia
    ? `${selectedMedia.label} → ${selectedOrigin.label} → ${selectedVerse.label}`
    : selectedOrigin && selectedMedia
      ? `${selectedMedia.label} → ${selectedOrigin.label}. Choose a universe.`
      : selectedMedia
        ? `${selectedMedia.label} selected. Choose a publisher or origin.`
        : "Choose media, then publisher or origin, then universe.";

  useEffect(() => {
    setVisibleLimit(ROSTER_PAGE_SIZE);
  }, [
    age,
    classification,
    gender,
    media,
    origin,
    query,
    roster,
    sortOrder,
    tier,
    verse
  ]);

  useEffect(() => {
    if (side !== "left") return;

    const focusSearch = (event: KeyboardEvent): void => {
      const target = event.target;
      const isTyping = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable);
      if (event.key !== "/" || isTyping || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      searchRef.current?.focus();
    };

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [side]);

  const focusSearchAfterRender = (): void => {
    window.requestAnimationFrame(() => {
      searchRef.current?.focus({ preventScroll: true });
    });
  };

  const resetFilters = (): void => {
    setQuery("");
    setMedia("all");
    setOrigin("all");
    setVerse("all");
    setGender("all");
    setAge("all");
    setTier("all");
    setClassification("all");
    setSortOrder("name");
    focusSearchAfterRender();
  };

  const resetMetadataFilters = (): void => {
    setGender("all");
    setAge("all");
    setTier("all");
    setClassification("all");
  };

  const activeMetadataFilterCount = [
    gender,
    age,
    tier,
    classification
  ].filter((value) => value !== "all").length;
  const filtersActive = Boolean(
    query
    || media !== "all"
    || origin !== "all"
    || verse !== "all"
    || gender !== "all"
    || age !== "all"
    || tier !== "all"
    || classification !== "all"
    || sortOrder !== "name"
  );

  return (
    <section class="fighter-picker" data-side={side} aria-labelledby={`${side}-picker-title`}>
      <header class="fighter-picker__header">
        <div>
          <span class="eyebrow">{accentName} · Fighter {fighterNumber}</span>
          <h2 id={`${side}-picker-title`} tabIndex={-1}>
            {selectedCharacter?.name ?? "Select fighter"}
          </h2>
          <p>
            {selectedCharacter
              ? `${profile?.names[0] ?? selectedCharacter.identity} · ${profile?.key.name || "Base form"}`
              : "Search the complete character roster"}
          </p>
        </div>
        <div class="fighter-picker__actions">
          <button class="text-button" type="button" onClick={onRandom}>
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
              Clear
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
            {side === "left" ? <kbd aria-hidden="true">/</kbd> : null}
          </label>

          <fieldset
            class="roster-path"
            data-browse-path
            data-browse-level={browsePathLevel}
          >
            <legend class="roster-path__legend">Browse by universe</legend>
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
                allLabel={selectedMedia
                  ? `All ${selectedMedia.label} publishers / origins`
                  : "All publishers / origins"}
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
                allLabel={selectedOrigin
                  ? `All ${selectedOrigin.label} universes`
                  : "All universes"}
                disabled={origin === "all"}
                disabledHint="Choose publisher / origin first"
                describedBy={`${side}-browse-path-status`}
                onChange={(value) => {
                  setVerse(value);
                  resetMetadataFilters();
                }}
              />
            </div>
          </fieldset>

          <div class="filter-primary filter-primary--order">
            <label class="filter-field">
              <span>Order</span>
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.currentTarget.value as SortOrder)}
              >
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
                {activeMetadataFilterCount > 0
                  ? `${activeMetadataFilterCount} active`
                  : "Gender, age, tier, class"}
              </small>
            </summary>
            <div class="filter-grid">
              <label class="filter-field">
                <span>Gender</span>
                <select value={gender} onChange={(event) => setGender(event.currentTarget.value)}>
                  <option value="all">All genders</option>
                  {genders.map((option) => (
                    <option value={option.id} key={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label class="filter-field">
                <span>Age</span>
                <select
                  value={age}
                  onChange={(event) => setAge(event.currentTarget.value as AgeFilter)}
                >
                  <option value="all">All ages</option>
                  {ages.map((option) => (
                    <option value={option.id} key={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label class="filter-field">
                <span>Tier</span>
                <select value={tier} onChange={(event) => setTier(event.currentTarget.value)}>
                  <option value="all">All tiers</option>
                  {tiers.map((option) => (
                    <option value={option.id} key={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label class="filter-field">
                <span>Classification</span>
                <select
                  value={classification}
                  onChange={(event) => setClassification(event.currentTarget.value)}
                >
                  <option value="all">All classifications</option>
                  {classifications.map((option) => (
                    <option value={option.id} key={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </details>

          <div class="roster-meta">
            <span role="status" aria-live="polite" aria-atomic="true">
              {visibleRoster.length} of {roster.length} fighters
            </span>
            {filtersActive ? (
              <button class="text-button" type="button" onClick={resetFilters}>
                Reset
              </button>
            ) : <span>Ruleset v1</span>}
          </div>

          <div
            class="roster-list"
            role="list"
            aria-label="Characters"
            aria-describedby={`${side}-rendered-roster-count`}
          >
            {renderedRoster.map((item) => {
              const image = item.defaultProfile.image;
              const displayImage = isImageApprovedForPublicDisplay(image)
                ? image
                : null;
              return (
                <div class="roster-entry" role="listitem" key={item.id}>
                  <button
                    class="roster-card"
                    type="button"
                    aria-label={`${item.name}, ${item.identity}, ${item.media}, ${item.origin}, ${item.verse}, tier ${item.tier}`}
                    aria-pressed={selection?.characterId === item.id}
                    onClick={() => onSelect(item.defaultSelection)}
                  >
                    <span class="roster-card__portrait">
                      {displayImage ? (
                        <CharacterImage
                          src={characterImageVariant(displayImage.image, 160)}
                          alt=""
                        />
                      ) : (
                        <span class="image-fallback" aria-hidden="true">
                          {item.name.charAt(0)}
                        </span>
                      )}
                    </span>
                    <span class="roster-card__copy">
                      <strong>{item.name}</strong>
                      <small>
                        {item.identity !== item.name ? `${item.identity} · ` : ""}
                        {item.origin} / {item.verse}
                        {item.formCount > 1 ? ` · ${item.formCount} forms` : ""}
                      </small>
                    </span>
                    <span class="tier-badge">{item.tier}</span>
                  </button>
                </div>
              );
            })}
            {remainingRosterCount > 0 ? (
              <div class="roster-list__more" role="listitem">
                <button
                  type="button"
                  aria-label={`Show next ${Math.min(
                    ROSTER_PAGE_SIZE,
                    remainingRosterCount
                  )} fighters`}
                  onClick={() => setVisibleLimit((current) =>
                    Math.min(current + ROSTER_PAGE_SIZE, visibleRoster.length)
                  )}
                >
                  Show more fighters
                </button>
                <small>
                  Showing {shownRosterCount} of {visibleRoster.length} matching fighters
                </small>
              </div>
            ) : null}
            {visibleRoster.length === 0 ? (
              <div class="roster-empty">
                <strong>No fighters found</strong>
                <span>Try a shorter search or reset the filters.</span>
                <button class="text-button" type="button" onClick={resetFilters}>
                  Reset filters
                </button>
              </div>
            ) : null}
          </div>
          <span
            id={`${side}-rendered-roster-count`}
            class="visually-hidden"
            role="status"
            aria-live="polite"
          >
            Showing {shownRosterCount} of {visibleRoster.length} matching fighters.
          </span>
        </aside>

        <CharacterProfile
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
