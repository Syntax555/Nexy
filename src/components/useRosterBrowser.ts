import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import type { RosterCharacter, RosterTier } from "../app/roster.js";
import type { BattleSelection } from "../domain/index.js";
import { getCachedSearchIndex, searchIndex } from "../search/search.js";

export type SortOrder = "name" | "name-desc" | "tier-desc" | "tier-asc";
export type AgeFilter = "all" | "under-13" | "teen" | "20s" | "30s" | "40s" | "50-plus" | "unknown";

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

export const ROSTER_PAGE_SIZE = 60;
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

function sortedUniqueOptions(options: readonly FilterOption[]): readonly FilterOption[] {
  const labels = new Map<string, string>();
  for (const option of options) {
    if (option.id) labels.set(option.id, option.label);
  }
  return [...labels].map(([id, label]) => ({ id, label })).sort((left, right) => left.label.localeCompare(right.label));
}

function ageMatchesGroup(values: RosterCharacter["ageFilterValues"], groupId: Exclude<AgeFilter, "all">): boolean {
  const group = ageGroups.find((candidate) => candidate.id === groupId);
  if (!group) return true;
  if (group.id === "unknown") return values.includes("unknown");

  return values.some(
    (value) =>
      typeof value === "number" &&
      (group.min === undefined || value >= group.min) &&
      (group.max === undefined || value <= group.max)
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

function compareByName(left: RosterCharacter, right: RosterCharacter, direction = 1): number {
  return (
    direction *
    (left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
      left.identity.localeCompare(right.identity, undefined, { sensitivity: "base" }))
  );
}

function compareRoster(left: RosterCharacter, right: RosterCharacter, sortOrder: SortOrder): number {
  if (sortOrder === "tier-desc") return right.tierRank - left.tierRank || compareByName(left, right);
  if (sortOrder === "tier-asc") return left.tierRank - right.tierRank || compareByName(left, right);
  if (sortOrder === "name-desc") return compareByName(left, right, -1);
  return compareByName(left, right);
}

interface UseRosterBrowserOptions {
  readonly side: "left" | "right";
  readonly roster: readonly RosterCharacter[];
  readonly selection: BattleSelection | null;
}

export function useRosterBrowser({ side, roster, selection }: UseRosterBrowserOptions) {
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
  const searchIndexForRoster = useMemo(() => getCachedSearchIndex(roster, rosterSearchText), [roster]);

  const mediaOptions = useMemo(
    () => sortedUniqueOptions(roster.map((item) => ({ id: item.mediaId, label: item.media }))),
    [roster]
  );
  const originOptions = useMemo(
    () =>
      sortedUniqueOptions(
        media === "all"
          ? []
          : roster.filter((item) => item.mediaId === media).map((item) => ({ id: item.originId, label: item.origin }))
      ),
    [media, roster]
  );
  const verseOptions = useMemo(
    () =>
      sortedUniqueOptions(
        origin === "all"
          ? []
          : roster
              .filter((item) => media === "all" || item.mediaId === media)
              .filter((item) => item.originId === origin)
              .map((item) => ({ id: item.verseId, label: item.verse }))
      ),
    [media, origin, roster]
  );
  const locationRoster = useMemo(
    () =>
      roster.filter(
        (item) =>
          (media === "all" || item.mediaId === media) &&
          (origin === "all" || item.originId === origin) &&
          (verse === "all" || item.verseId === verse)
      ),
    [media, origin, roster, verse]
  );
  const genders = useMemo(
    () => sortedUniqueOptions(locationRoster.map((item) => ({ id: item.genderId, label: item.gender }))),
    [locationRoster]
  );
  const ages = useMemo(
    () =>
      ageGroups
        .filter((group) => locationRoster.some((item) => ageMatchesGroup(item.ageFilterValues, group.id)))
        .map((group) => ({ id: group.id, label: group.label })),
    [locationRoster]
  );
  const tiers = useMemo(() => sortedTierOptions(locationRoster), [locationRoster]);
  const classifications = useMemo(
    () =>
      sortedUniqueOptions(
        locationRoster.flatMap((item) =>
          item.classificationFilterIds.map((id, index) => ({
            id,
            label: item.classificationFilterNames[index] ?? id
          }))
        )
      ),
    [locationRoster]
  );
  const visibleRoster = useMemo(
    () =>
      searchIndex(searchIndexForRoster, query, (left, right) => compareRoster(left, right, sortOrder)).filter(
        (item) =>
          (media === "all" || item.mediaId === media) &&
          (origin === "all" || item.originId === origin) &&
          (verse === "all" || item.verseId === verse) &&
          (gender === "all" || item.genderId === gender) &&
          (age === "all" || ageMatchesGroup(item.ageFilterValues, age)) &&
          (tier === "all" || item.tiers.some((candidate) => candidate.value === tier)) &&
          (classification === "all" || item.classificationFilterIds.includes(classification))
      ),
    [age, classification, gender, media, origin, query, searchIndexForRoster, sortOrder, tier, verse]
  );
  const selectedCharacter = selection ? (roster.find((item) => item.id === selection.characterId) ?? null) : null;
  const selectedOutsideFilters = Boolean(
    selectedCharacter && !visibleRoster.some((item) => item.id === selectedCharacter.id)
  );
  const renderedRoster = useMemo(() => {
    const page = visibleRoster.slice(0, visibleLimit);
    if (!selectedCharacter || page.some((item) => item.id === selectedCharacter.id)) return page;
    if (selectedOutsideFilters) return [selectedCharacter, ...page];
    return [selectedCharacter, ...page.slice(0, Math.max(0, page.length - 1))];
  }, [selectedCharacter, selectedOutsideFilters, visibleLimit, visibleRoster]);
  const shownRosterCount = Math.min(visibleLimit, visibleRoster.length);
  const remainingRosterCount = Math.max(0, visibleRoster.length - shownRosterCount);
  const selectedMedia = mediaOptions.find((option) => option.id === media) ?? null;
  const selectedOrigin = originOptions.find((option) => option.id === origin) ?? null;
  const selectedVerse = verseOptions.find((option) => option.id === verse) ?? null;
  const browsePathLevel =
    verse !== "all" ? "universe" : origin !== "all" ? "publisher" : media !== "all" ? "media" : "all";
  const browsePathStatus =
    selectedVerse && selectedOrigin && selectedMedia
      ? `${selectedMedia.label} → ${selectedOrigin.label} → ${selectedVerse.label}`
      : selectedOrigin && selectedMedia
        ? `${selectedMedia.label} → ${selectedOrigin.label}. Choose a universe.`
        : selectedMedia
          ? `${selectedMedia.label} selected. Choose a publisher or origin.`
          : "Choose media, then publisher or origin, then universe.";
  const browsePathSummary = selectedVerse?.label ?? selectedOrigin?.label ?? selectedMedia?.label ?? "All universes";
  const rosterResetKey = [
    query,
    media,
    origin,
    verse,
    gender,
    age,
    tier,
    classification,
    sortOrder,
    String(roster.length)
  ].join("\u0000");

  useEffect(() => {
    void rosterResetKey;
    void searchIndexForRoster;
    setVisibleLimit(ROSTER_PAGE_SIZE);
  }, [rosterResetKey, searchIndexForRoster]);

  useEffect(() => {
    if (side !== "left") return;
    const focusSearch = (event: KeyboardEvent): void => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (event.key !== "/" || isTyping || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [side]);

  const focusSearchAfterRender = (): void => {
    window.requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
  };
  const resetMetadataFilters = (): void => {
    setGender("all");
    setAge("all");
    setTier("all");
    setClassification("all");
  };
  const resetFilters = (): void => {
    setQuery("");
    setMedia("all");
    setOrigin("all");
    setVerse("all");
    resetMetadataFilters();
    setSortOrder("name");
    focusSearchAfterRender();
  };
  const activeMetadataFilterCount = [gender, age, tier, classification].filter((value) => value !== "all").length;
  const filtersActive = Boolean(
    query ||
      media !== "all" ||
      origin !== "all" ||
      verse !== "all" ||
      gender !== "all" ||
      age !== "all" ||
      tier !== "all" ||
      classification !== "all" ||
      sortOrder !== "name"
  );

  return {
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
    showMore: () => setVisibleLimit((current) => Math.min(current + ROSTER_PAGE_SIZE, visibleRoster.length))
  };
}
