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
  readonly galleryActive: boolean;
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

export function RosterCarousel({
  side,
  accentName,
  items,
  selection,
  galleryActive,
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
  const [featuredId, setFeaturedId] = useState<string | null>(
    selection?.characterId ?? null
  );
  const listRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<SwipeStart | null>(null);
  const suppressClickRef = useRef(false);
  const featuredRosterIndex = items.findIndex((item) => item.id === featuredId);
  const featuredIndex = items.length === 0 ? -1 : Math.max(0, featuredRosterIndex);
  const featuredCharacter = featuredIndex >= 0 ? items[featuredIndex] ?? null : null;
  const previousFeatured = featuredIndex >= 0
    ? items[(featuredIndex - 1 + items.length) % items.length] ?? null
    : null;
  const nextFeatured = featuredIndex >= 0
    ? items[(featuredIndex + 1) % items.length] ?? null
    : null;

  useEffect(() => {
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
    if (!galleryActive || !featuredCharacter) return;

    const frame = window.requestAnimationFrame(() => {
      const list = listRef.current;
      const entry = [...(list?.querySelectorAll<HTMLElement>(".roster-entry") ?? [])]
        .find((item) => item.dataset.characterId === featuredCharacter.id);
      if (!list || !entry) return;

      const targetLeft = entry.offsetLeft - ((list.clientWidth - entry.offsetWidth) / 2);
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (typeof list.scrollTo === "function") {
        list.scrollTo({
          left: targetLeft,
          behavior: reducedMotion ? "auto" : "smooth"
        });
      } else {
        list.scrollLeft = targetLeft;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    featuredCharacter?.id,
    featuredIndex,
    galleryActive,
    items.length
  ]);

  useEffect(() => {
    if (!selection) return;
    setFeaturedId(selection.characterId);
    const frame = window.requestAnimationFrame(() => {
      const list = listRef.current;
      const selectedCard = list?.querySelector<HTMLElement>(
        '.roster-card[aria-pressed="true"]'
      );
      if (!list || !selectedCard) return;

      selectedCard.focus({ preventScroll: true });
      const listBounds = list.getBoundingClientRect();
      const cardBounds = selectedCard.getBoundingClientRect();
      if (cardBounds.top < listBounds.top) {
        list.scrollTop -= listBounds.top - cardBounds.top;
      } else if (cardBounds.bottom > listBounds.bottom) {
        list.scrollTop += cardBounds.bottom - listBounds.bottom;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selection?.characterId]);

  const featureAtIndex = (index: number, focusCard = false): void => {
    if (items.length === 0) return;
    const normalizedIndex = ((index % items.length) + items.length) % items.length;
    const nextItem = items[normalizedIndex];
    if (!nextItem) return;
    setFeaturedId(nextItem.id);

    if (focusCard) {
      window.requestAnimationFrame(() => {
        const entry = [...(
          listRef.current?.querySelectorAll<HTMLElement>(".roster-entry") ?? []
        )].find((item) => item.dataset.characterId === nextItem.id);
        entry?.querySelector<HTMLElement>(".roster-card")?.focus({
          preventScroll: true
        });
      });
    }
  };

  const moveFeatured = (delta: number, focusCard = false): void => {
    if (featuredIndex < 0) return;
    featureAtIndex(featuredIndex + delta, focusCard);
  };

  return (
    <div
      class="roster-carousel"
      data-empty={visibleRosterCount === 0 ? "true" : "false"}
      role={galleryActive ? "region" : undefined}
      aria-roledescription={galleryActive ? "carousel" : undefined}
      aria-label={galleryActive ? `${accentName} character carousel` : undefined}
      aria-describedby={galleryActive && featuredCharacter
        ? `${side}-carousel-status`
        : undefined}
    >
      {galleryActive && featuredCharacter ? (
        <button
          class="roster-carousel__arrow roster-carousel__arrow--previous"
          type="button"
          aria-label={`Previous fighter: ${previousFeatured?.name ?? featuredCharacter.name}`}
          disabled={items.length <= 1}
          onClick={(event) => {
            moveFeatured(-1);
            event.currentTarget.focus({ preventScroll: true });
          }}
        >
          <span aria-hidden="true">‹</span>
        </button>
      ) : null}
      <div
        ref={listRef}
        class="roster-list"
        role="list"
        aria-label="Characters"
        aria-describedby={describedBy}
        onPointerDown={(event) => {
          if (!galleryActive || items.length <= 1) return;
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
          if (
            Math.abs(distanceX) < 48
            || Math.abs(distanceX) <= Math.abs(distanceY) * 1.2
          ) {
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
          const isSelected = selection?.characterId === item.id;
          const isFeatured = galleryActive && featuredCharacter?.id === item.id;
          return (
            <div
              class="roster-entry"
              role="listitem"
              key={item.id}
              data-character-id={item.id}
              data-featured={isFeatured ? "true" : "false"}
              aria-label={galleryActive
                ? `${index + 1} of ${shownRosterCount}`
                : undefined}
            >
              <button
                class="roster-card"
                type="button"
                aria-label={`${item.name}, ${item.identity}, ${item.media}, ${item.origin}, ${item.verse}, tier ${item.tier}`}
                aria-pressed={isSelected}
                aria-current={isFeatured ? "true" : undefined}
                tabIndex={galleryActive ? (isFeatured ? 0 : -1) : 0}
                onFocus={() => {
                  if (galleryActive && !isFeatured) setFeaturedId(item.id);
                }}
                onKeyDown={(event) => {
                  if (!galleryActive || !isFeatured) return;
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
                onClick={() => {
                  if (suppressClickRef.current) return;
                  setFeaturedId(item.id);
                  if (!isSelected) onSelect(item.defaultSelection);
                }}
              >
                <span class="roster-card__portrait">
                  {displayImage ? (
                    <CharacterImage
                      src={characterImageVariant(
                        displayImage.image,
                        galleryActive ? 640 : 160
                      )}
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
                  <small>
                    {item.identity !== item.name ? `${item.identity} · ` : ""}
                    {galleryActive
                      ? `${item.media} › ${item.origin} / ${item.verse}`
                      : `${item.origin} / ${item.verse}`}
                    {item.formCount > 1 ? ` · ${item.formCount} forms` : ""}
                  </small>
                </span>
                <span class="roster-card__badges">
                  <span class="tier-badge">{item.tier}</span>
                  {isSelected ? (
                    <span class="roster-card__selected" aria-hidden="true">
                      <span>✓</span> Selected
                    </span>
                  ) : null}
                </span>
                <span class="roster-card__cta" aria-hidden="true">
                  Choose {item.name}
                </span>
              </button>
            </div>
          );
        })}
        {visibleRosterCount === 0 ? (
          <div class="roster-empty">
            <strong>No fighters found</strong>
            <span>Try a shorter search or reset the filters.</span>
            <button class="text-button" type="button" onClick={onResetFilters}>
              Reset filters
            </button>
          </div>
        ) : null}
      </div>
      {galleryActive && featuredCharacter ? (
        <button
          class="roster-carousel__arrow roster-carousel__arrow--next"
          type="button"
          aria-label={`Next fighter: ${nextFeatured?.name ?? featuredCharacter.name}`}
          disabled={items.length <= 1}
          onClick={(event) => {
            moveFeatured(1);
            event.currentTarget.focus({ preventScroll: true });
          }}
        >
          <span aria-hidden="true">›</span>
        </button>
      ) : null}
      {galleryActive && featuredCharacter ? (
        <div class="roster-carousel__status" id={`${side}-carousel-status`}>
          <p role="status" aria-live="polite" aria-atomic="true">
            <strong>{featuredCharacter.name}</strong>
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
          <button
            type="button"
            aria-label={`Show next ${nextPageSize} fighters`}
            onClick={onShowMore}
          >
            Show more fighters
          </button>
          <small>
            Showing {shownRosterCount} of {visibleRosterCount} matching fighters
          </small>
        </div>
      ) : null}
    </div>
  );
}
