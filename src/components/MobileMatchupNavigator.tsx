import { useEffect, useState } from "preact/hooks";

export type MobileFighterSide = "left" | "right";

export const MOBILE_MATCHUP_QUERY = "(max-width: 1180px)";

interface MobileMatchupNavigatorProps {
  readonly activeSide: MobileFighterSide;
  readonly isMobile: boolean;
  readonly leftName: string | null;
  readonly rightName: string | null;
  readonly onActivate: (side: MobileFighterSide) => void;
}

function queryMatches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

export function useMobileMatchupViewport(): boolean {
  const [matches, setMatches] = useState(() => queryMatches(MOBILE_MATCHUP_QUERY));

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia(MOBILE_MATCHUP_QUERY);
    const update = (event?: MediaQueryListEvent): void => {
      setMatches(event?.matches ?? mediaQuery.matches);
    };

    update();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
      return () => mediaQuery.removeEventListener("change", update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  return matches;
}

function stepLabel(number: "01" | "02", name: string | null): string {
  return name ? `Fighter ${number}: ${name}, chosen` : `Fighter ${number}: not selected`;
}

export function MobileMatchupNavigator({
  activeSide,
  isMobile,
  leftName,
  rightName,
  onActivate
}: MobileMatchupNavigatorProps) {
  const nextSide = (side: MobileFighterSide): MobileFighterSide => (side === "left" ? "right" : "left");

  const activateAndFocus = (side: MobileFighterSide): void => {
    onActivate(side);
    window.requestAnimationFrame(() => {
      const reducedMotion =
        typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.querySelector<HTMLElement>(`#mobile-fighter-${side}-panel`)?.scrollIntoView?.({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start"
      });
      document.querySelector<HTMLElement>(`[data-mobile-fighter-tab="${side}"]`)?.focus({ preventScroll: true });
    });
  };

  const handleKeyDown = (event: KeyboardEvent, side: MobileFighterSide): void => {
    let target: MobileFighterSide | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      target = nextSide(side);
    } else if (event.key === "Home") {
      target = "left";
    } else if (event.key === "End") {
      target = "right";
    }

    if (!target) return;
    event.preventDefault();
    activateAndFocus(target);
  };

  return (
    <nav class="mobile-matchup-navigator" aria-label="Fighter selection steps" hidden={!isMobile}>
      <fieldset class="mobile-matchup-tabs">
        <legend class="visually-hidden">Choose a fighter to edit</legend>
        <button
          class="mobile-matchup-tab"
          type="button"
          aria-pressed={activeSide === "left"}
          aria-label={stepLabel("01", leftName)}
          data-mobile-fighter-tab="left"
          data-complete={leftName ? "true" : "false"}
          onClick={() => activateAndFocus("left")}
          onKeyDown={(event) => handleKeyDown(event, "left")}
        >
          <span aria-hidden="true">01</span>
          <span>
            <small>Fighter 01</small>
            <strong>{leftName ?? "Choose fighter"}</strong>
          </span>
        </button>
        <span class="mobile-matchup-tabs__connector" aria-hidden="true" />
        <button
          class="mobile-matchup-tab"
          type="button"
          aria-pressed={activeSide === "right"}
          aria-label={stepLabel("02", rightName)}
          data-mobile-fighter-tab="right"
          data-complete={rightName ? "true" : "false"}
          onClick={() => activateAndFocus("right")}
          onKeyDown={(event) => handleKeyDown(event, "right")}
        >
          <span aria-hidden="true">02</span>
          <span>
            <small>Fighter 02</small>
            <strong>{rightName ?? "Choose fighter"}</strong>
          </span>
        </button>
      </fieldset>
    </nav>
  );
}
