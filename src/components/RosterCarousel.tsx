import { useEffect, useRef, useState } from "preact/hooks";

import { characterImageVariant } from "../app/assets.js";
import { isImageEnabledForPublicDisplay } from "../app/image-rights.js";
import type { RosterCharacter } from "../app/roster.js";
import type { BattleSelection } from "../domain/index.js";
import { CharacterImage } from "./CharacterImage.js";

interface RosterCarouselProps {
  readonly side: "left" | "right";
  readonly accentName: string;
  readonly items: readonly RosterCharacter[];
  readonly selection: BattleSelection | null;
  readonly rosterView: RosterView;
  readonly shownRosterCount: number;
  readonly visibleRosterCount: number;
  readonly remainingRosterCount: number;
  readonly nextPageSize: number;
  readonly resetKey: string;
  readonly describedBy: string;
  readonly onSelect: (selection: BattleSelection) => void;
  readonly onResetFilters: () => void;
  readonly onShowMore: () => void;
}

interface SwipeStart {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
}

export type RosterView = "carousel" | "grid";

const gridNavigationKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"] as const;
type GridNavigationKey = (typeof gridNavigationKeys)[number];

function isGridNavigationKey(key: string): key is GridNavigationKey {
  return gridNavigationKeys.some((candidate) => candidate === key);
}

function gridColumnCount(list: HTMLUListElement): number {
  const entries = [...list.querySelectorAll<HTMLElement>(".roster-entry")];
  const firstEntry = entries[0];
  if (!firstEntry || entries.length === 1) return 1;

  const firstTop = firstEntry.getBoundingClientRect().top;
  const nextRowIndex = entries.findIndex(
    (entry, index) => index > 0 && Math.abs(entry.getBoundingClientRect().top - firstTop) > 1
  );
  if (nextRowIndex > 0) return nextRowIndex;

  const template = window.getComputedStyle(list).gridTemplateColumns;
  const repeatedColumns = template.match(/^repeat\(\s*(\d+)\s*,/u)?.[1];
  if (repeatedColumns) return Math.max(1, Number.parseInt(repeatedColumns, 10));

  if (template && template !== "none" && !template.includes("repeat(")) {
    const explicitColumns = template.split(/\s+/u).filter(Boolean).length;
    if (explicitColumns > 0) return explicitColumns;
  }

  const entryWidth = firstEntry.getBoundingClientRect().width;
  if (list.clientWidth > 0 && entryWidth > 0) {
    return Math.max(1, Math.floor(list.clientWidth / entryWidth));
  }

  return 1;
}

function duplicateDisplayNames(items: readonly RosterCharacter[]): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
  return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
}

function rosterDisplayName(item: RosterCharacter, repeatedNames: ReadonlySet<string>): string {
  return repeatedNames.has(item.name) ? `${item.name} — ${item.identity}` : item.name;
}

function preserveViewportTop(element: HTMLElement, expectedTop: number): void {
  const restore = (): void => {
    const scrollRoot = document.scrollingElement;
    if (!element.isConnected || !scrollRoot) return;
    const offset = element.getBoundingClientRect().top - expectedTop;
    if (Math.abs(offset) > 1) scrollRoot.scrollTop += offset;
  };

  window.requestAnimationFrame(() => {
    restore();
    // Firefox can apply focus-following scroll after the first layout frame.
    window.requestAnimationFrame(restore);
  });
}

export function RosterCarousel({
  side,
  accentName,
  items,
  selection,
  rosterView,
  shownRosterCount,
  visibleRosterCount,
  remainingRosterCount,
  nextPageSize,
  resetKey,
  describedBy,
  onSelect,
  onResetFilters,
  onShowMore
}: RosterCarouselProps) {
  const selectedCharacterId = selection?.characterId ?? null;
  const [featuredId, setFeaturedId] = useState<string | null>(selectedCharacterId);
  const listRef = useRef<HTMLUListElement>(null);
  const swipeRef = useRef<SwipeStart | null>(null);
  const suppressClickRef = useRef(false);
  const featuredRosterIndex = items.findIndex((item) => item.id === featuredId);
  const featuredIndex = items.length === 0 ? -1 : Math.max(0, featuredRosterIndex);
  const featuredCharacter = featuredIndex >= 0 ? (items[featuredIndex] ?? null) : null;
  const featuredCharacterId = featuredCharacter?.id ?? null;
  const carouselActive = rosterView === "carousel";
  const gridActive = rosterView === "grid";
  const repeatedNames = duplicateDisplayNames(items);
  const gridInstructionsId = `${side}-grid-instructions`;
  const listDescribedBy = [describedBy, gridActive ? gridInstructionsId : ""].filter(Boolean).join(" ");
  const previousFeatured =
    featuredIndex >= 0 ? (items[(featuredIndex - 1 + items.length) % items.length] ?? null) : null;
  const nextFeatured = featuredIndex >= 0 ? (items[(featuredIndex + 1) % items.length] ?? null) : null;

  useEffect(() => {
    void resetKey;
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = 0;
  }, [resetKey]);

  useEffect(() => {
    if (items.length === 0) {
      if (featuredId !== null) setFeaturedId(null);
      return;
    }
    if (!featuredId || !items.some((item) => item.id === featuredId)) {
      setFeaturedId(items[0]?.id ?? null);
    }
  }, [featuredId, items]);

  useEffect(() => {
    if (!carouselActive || !featuredCharacterId) return;

    const frame = window.requestAnimationFrame(() => {
      const list = listRef.current;
      const entry = [...(list?.querySelectorAll<HTMLElement>(".roster-entry") ?? [])].find(
        (item) => item.dataset.characterId === featuredCharacterId
      );
      if (!list || !entry) return;

      const listBounds = list.getBoundingClientRect();
      const entryBounds = entry.getBoundingClientRect();
      const centeredLeft =
        list.scrollLeft + (entryBounds.left + entryBounds.width / 2) - (listBounds.left + listBounds.width / 2);
      const targetLeft = Math.max(0, Math.min(centeredLeft, list.scrollWidth - list.clientWidth));
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (typeof list.scrollTo === "function") {
        try {
          list.scrollTo({
            left: targetLeft,
            behavior: reducedMotion ? "auto" : "smooth"
          });
        } catch {
          list.scrollLeft = targetLeft;
        }
      } else {
        list.scrollLeft = targetLeft;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [carouselActive, featuredCharacterId]);

  useEffect(() => {
    if (!gridActive || !listRef.current) return;
    listRef.current.scrollLeft = 0;
  }, [gridActive]);

  useEffect(() => {
    if (!selectedCharacterId) return;
    setFeaturedId(selectedCharacterId);
    const frame = window.requestAnimationFrame(() => {
      const list = listRef.current;
      const selectedCard = list?.querySelector<HTMLElement>('.roster-card[aria-pressed="true"]');
      if (!list || !selectedCard) return;

      const listBounds = list.getBoundingClientRect();
      const cardBounds = selectedCard.getBoundingClientRect();
      if (cardBounds.top < listBounds.top) {
        list.scrollTop -= listBounds.top - cardBounds.top;
      } else if (cardBounds.bottom > listBounds.bottom) {
        list.scrollTop += cardBounds.bottom - listBounds.bottom;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedCharacterId]);

  const featureAtIndex = (index: number, focusCard = false, wrap = true): void => {
    if (items.length === 0) return;
    const normalizedIndex = wrap
      ? ((index % items.length) + items.length) % items.length
      : Math.max(0, Math.min(index, items.length - 1));
    const nextItem = items[normalizedIndex];
    if (!nextItem) return;
    setFeaturedId(nextItem.id);

    if (focusCard) {
      window.requestAnimationFrame(() => {
        const entry = [...(listRef.current?.querySelectorAll<HTMLElement>(".roster-entry") ?? [])].find(
          (item) => item.dataset.characterId === nextItem.id
        );
        entry?.querySelector<HTMLElement>(".roster-card")?.focus(carouselActive ? { preventScroll: true } : undefined);
      });
    }
  };

  const moveFeatured = (delta: number, focusCard = false): void => {
    if (featuredIndex < 0) return;
    featureAtIndex(featuredIndex + delta, focusCard);
  };

  const moveGridFocus = (index: number, key: GridNavigationKey): void => {
    const list = listRef.current;
    if (!list) return;

    const columns = gridColumnCount(list);
    let targetIndex = index;
    const column = index % columns;
    if (key === "ArrowLeft" && column > 0) targetIndex -= 1;
    else if (key === "ArrowRight" && column < columns - 1 && index + 1 < items.length) targetIndex += 1;
    else if (key === "ArrowUp" && index - columns >= 0) targetIndex -= columns;
    else if (key === "ArrowDown" && index + columns < items.length) targetIndex += columns;
    else if (key === "Home") targetIndex = 0;
    else if (key === "End") targetIndex = items.length - 1;
    else return;

    featureAtIndex(targetIndex, true, false);
  };

  return (
    <section
      class="roster-carousel"
      data-empty={visibleRosterCount === 0 ? "true" : "false"}
      data-roster-view={rosterView}
      aria-label={`${accentName} character ${rosterView === "carousel" ? "carousel" : "portrait grid"}`}
      aria-describedby={
        carouselActive && featuredCharacter ? `${side}-carousel-status` : gridActive ? gridInstructionsId : undefined
      }
    >
      {gridActive ? (
        <p class="visually-hidden" id={gridInstructionsId}>
          Use the Arrow keys to move through fighters. Home and End jump to the first and last fighter. Press Enter or
          Space to choose.
        </p>
      ) : null}
      {carouselActive && featuredCharacter ? (
        <button
          class="roster-carousel__arrow roster-carousel__arrow--previous"
          type="button"
          aria-label={`Previous fighter: ${rosterDisplayName(previousFeatured ?? featuredCharacter, repeatedNames)}`}
          disabled={items.length <= 1}
          onClick={(event) => {
            moveFeatured(-1);
            event.currentTarget.focus({ preventScroll: true });
          }}
        >
          <span aria-hidden="true">‹</span>
        </button>
      ) : null}
      <ul
        ref={listRef}
        class="roster-list"
        aria-label="Characters"
        aria-describedby={listDescribedBy || undefined}
        onPointerDown={(event) => {
          if (!carouselActive || items.length <= 1) return;
          swipeRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY
          };
        }}
        onPointerUp={(event) => {
          const start = swipeRef.current;
          swipeRef.current = null;
          if (!start || start.pointerId !== event.pointerId) return;

          const distanceX = event.clientX - start.x;
          const distanceY = event.clientY - start.y;
          if (Math.abs(distanceX) < 48 || Math.abs(distanceX) <= Math.abs(distanceY) * 1.2) {
            return;
          }

          event.preventDefault();
          suppressClickRef.current = true;
          moveFeatured(distanceX < 0 ? 1 : -1);
          window.setTimeout(() => {
            suppressClickRef.current = false;
          }, 0);
        }}
        onPointerCancel={() => {
          swipeRef.current = null;
        }}
      >
        {items.map((item, index) => {
          const image = item.defaultProfile.image;
          const displayImage = isImageEnabledForPublicDisplay(image) ? image : null;
          const thumbnailSource = displayImage ? characterImageVariant(displayImage.image, 160) : null;
          const gallerySource = displayImage ? characterImageVariant(displayImage.image, 640) : null;
          const isSelected = selection?.characterId === item.id;
          const isFeatured = carouselActive && featuredCharacter?.id === item.id;
          const isRovingFocusTarget = featuredCharacterId === item.id;
          const needsGridIdentity = gridActive && repeatedNames.has(item.name);
          const gridIdentity = item.identity !== item.name ? item.identity : `${item.origin} / ${item.verse}`;
          return (
            <li
              class="roster-entry"
              key={item.id}
              data-character-id={item.id}
              data-featured={isFeatured ? "true" : "false"}
              aria-label={carouselActive ? `${index + 1} of ${shownRosterCount}` : undefined}
            >
              <button
                class="roster-card"
                type="button"
                aria-label={`${item.name}, ${item.identity}, ${item.media}, ${item.origin}, ${item.verse}, tier ${item.tier}`}
                aria-pressed={isSelected}
                aria-current={isFeatured ? "true" : undefined}
                tabIndex={isRovingFocusTarget ? 0 : -1}
                onFocus={() => {
                  if (!isRovingFocusTarget) setFeaturedId(item.id);
                }}
                onKeyDown={(event) => {
                  if (gridActive) {
                    if (isGridNavigationKey(event.key)) {
                      event.preventDefault();
                      moveGridFocus(index, event.key);
                    }
                    return;
                  }

                  if (!isFeatured) return;
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    moveFeatured(-1, true);
                  } else if (event.key === "ArrowRight") {
                    event.preventDefault();
                    moveFeatured(1, true);
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    featureAtIndex(0, true);
                  } else if (event.key === "End") {
                    event.preventDefault();
                    featureAtIndex(items.length - 1, true);
                  }
                }}
                onClick={(event) => {
                  if (suppressClickRef.current) return;
                  setFeaturedId(item.id);
                  if (!isSelected) {
                    const picker = event.currentTarget.closest<HTMLElement>(".fighter-picker");
                    const pickerTop = picker?.getBoundingClientRect().top;
                    onSelect(item.defaultSelection);
                    if (picker && pickerTop !== undefined) preserveViewportTop(picker, pickerTop);
                  }
                }}
              >
                <span class="roster-card__portrait">
                  {displayImage ? (
                    <CharacterImage
                      src={thumbnailSource ?? gallerySource ?? ""}
                      srcSet={
                        carouselActive && thumbnailSource && gallerySource
                          ? `${thumbnailSource} 160w, ${gallerySource} 640w`
                          : undefined
                      }
                      sizes={
                        carouselActive
                          ? "(max-width: 820px) 84vw, (max-width: 1180px) 68vw, 34vw"
                          : gridActive
                            ? "(max-width: 640px) 22vw, (max-width: 1180px) 14vw, 96px"
                            : "48px"
                      }
                      alt=""
                      loading={isFeatured ? "eager" : "lazy"}
                    />
                  ) : (
                    <span class="image-fallback" aria-hidden="true">
                      {item.name.charAt(0)}
                    </span>
                  )}
                </span>
                <span class="roster-card__copy">
                  <strong>{item.name}</strong>
                  {carouselActive ? (
                    <small>
                      {item.identity !== item.name ? `${item.identity} · ` : ""}
                      {item.media} › {item.origin} / {item.verse}
                      {item.formCount > 1 ? ` · ${item.formCount} forms` : ""}
                    </small>
                  ) : null}
                  {needsGridIdentity ? <span class="roster-card__grid-identity">{gridIdentity}</span> : null}
                </span>
                {carouselActive ? (
                  <span class="roster-card__badges">
                    <span class="tier-badge">{item.tier}</span>
                  </span>
                ) : null}
                {gridActive && isSelected ? (
                  <span class="roster-card__grid-selected" aria-hidden="true">
                    ✓
                  </span>
                ) : null}
                {carouselActive ? (
                  <span class="roster-card__cta" aria-hidden="true">
                    Choose {rosterDisplayName(item, repeatedNames)}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
        {visibleRosterCount === 0 ? (
          <li class="roster-empty">
            <strong>No fighters found</strong>
            <span>Try a shorter search or reset the filters.</span>
            <button class="text-button" type="button" onClick={onResetFilters}>
              Reset filters
            </button>
          </li>
        ) : null}
      </ul>
      {carouselActive && featuredCharacter ? (
        <button
          class="roster-carousel__arrow roster-carousel__arrow--next"
          type="button"
          aria-label={`Next fighter: ${rosterDisplayName(nextFeatured ?? featuredCharacter, repeatedNames)}`}
          disabled={items.length <= 1}
          onClick={(event) => {
            moveFeatured(1);
            event.currentTarget.focus({ preventScroll: true });
          }}
        >
          <span aria-hidden="true">›</span>
        </button>
      ) : null}
      {carouselActive && featuredCharacter ? (
        <div class="roster-carousel__status" id={`${side}-carousel-status`}>
          <p role="status" aria-live="polite" aria-atomic="true">
            <strong>{rosterDisplayName(featuredCharacter, repeatedNames)}</strong>
            <span>
              {featuredIndex + 1} of {shownRosterCount}
              {remainingRosterCount > 0 ? " shown" : ""}
            </span>
          </p>
          <small>Use ← → or swipe, then choose the fighter</small>
        </div>
      ) : null}
      {remainingRosterCount > 0 ? (
        <div class="roster-list__more">
          <button type="button" aria-label={`Show next ${nextPageSize} fighters`} onClick={onShowMore}>
            Show more fighters
          </button>
          <small>
            Showing {shownRosterCount} of {visibleRosterCount} matching fighters
          </small>
        </div>
      ) : null}
    </section>
  );
}
