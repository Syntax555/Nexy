import { useEffect, useState } from "preact/hooks";

export type MobileFighterSide = "left" | "right";

export const MOBILE_MATCHUP_QUERY = "(max-width: 1180px)";

interface MobileMatchupNavigatorProps {
  readonly activeSide: MobileFighterSide;
  readonly isMobile: boolean;
  readonly leftName: string | null;
  readonly rightName: string | null;
  readonly onActivate: (side: MobileFighterSide) => void;
  readonly onAnalyze: () => void;
}

function queryMatches(query: string): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia(query).matches;
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
  return name
    ? `Fighter ${number}: ${name}, chosen`
    : `Fighter ${number}: not selected`;
}

export function MobileMatchupNavigator({
  activeSide,
  isMobile,
  leftName,
  rightName,
  onActivate,
  onAnalyze
}: MobileMatchupNavigatorProps) {
  const ready = Boolean(leftName && rightName);
  const nextSide = (side: MobileFighterSide): MobileFighterSide =>
    side === "left" ? "right" : "left";

  const activateAndFocus = (
    side: MobileFighterSide,
    focusTarget: "tab" | "heading" = "tab"
  ): void => {
    onActivate(side);
    window.requestAnimationFrame(() => {
      const reducedMotion = typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.querySelector<HTMLElement>(
        `#mobile-fighter-${side}-panel`
      )?.scrollIntoView?.({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start"
      });
      document.querySelector<HTMLElement>(
        focusTarget === "heading"
          ? `#${side}-picker-title`
          : `[data-mobile-fighter-tab="${side}"]`
      )?.focus({ preventScroll: true });
    });
  };

  const handleKeyDown = (
    event: KeyboardEvent,
    side: MobileFighterSide
  ): void => {
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

  const status = ready
    ? "Matchup ready. Review either fighter or analyze the battle."
    : leftName
      ? "Fighter 01 selected. Choose Fighter 02."
      : rightName
        ? "Fighter 02 selected. Choose Fighter 01."
        : "Choose Fighter 01, then Fighter 02.";
  const nextIncompleteSide: MobileFighterSide | null = !leftName
    ? "left"
    : !rightName
      ? "right"
      : null;

  return (
    <nav
      class="mobile-matchup-navigator"
      aria-label="Fighter selection steps"
      hidden={!isMobile}
    >
      <div class="mobile-matchup-tabs" role="tablist" aria-label="Choose a fighter to edit">
        <button
          id="mobile-fighter-left-tab"
          class="mobile-matchup-tab"
          type="button"
          role="tab"
          aria-controls="mobile-fighter-left-panel"
          aria-selected={activeSide === "left"}
          aria-label={stepLabel("01", leftName)}
          tabIndex={activeSide === "left" ? 0 : -1}
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
          id="mobile-fighter-right-tab"
          class="mobile-matchup-tab"
          type="button"
          role="tab"
          aria-controls="mobile-fighter-right-panel"
          aria-selected={activeSide === "right"}
          aria-label={stepLabel("02", rightName)}
          tabIndex={activeSide === "right" ? 0 : -1}
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
      </div>
      <div
        class="mobile-matchup-status"
        data-ready={ready ? "true" : "false"}
      >
        <p role="status" aria-live="polite">{status}</p>
        {ready ? (
          <button
            class="mobile-matchup-action"
            type="button"
            onClick={onAnalyze}
          >
            Analyze battle
          </button>
        ) : nextIncompleteSide && nextIncompleteSide !== activeSide ? (
          <button
            class="mobile-matchup-action"
            type="button"
            onClick={() => activateAndFocus(nextIncompleteSide, "heading")}
          >
            Choose Fighter {nextIncompleteSide === "left" ? "01" : "02"}
          </button>
        ) : null}
      </div>
    </nav>
  );
}
