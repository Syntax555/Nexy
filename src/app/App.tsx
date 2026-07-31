import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { nexyData } from "../data/nexy.js";
import type { BattleReport, BattleSelection, CharacterProfile } from "../domain/index.js";
import { RULESET_VERSION } from "../domain/index.js";
import { createGameContext, getCharacterProfile, simulateBattle } from "../engine/index.js";
import { ActionDock } from "../components/ActionDock.js";
import { BattleResult } from "../components/BattleResult.js";
import { Brand } from "../components/Brand.js";
import { FighterPicker } from "../components/FighterPicker.js";
import type { DialogImage } from "../components/ImageDialog.js";
import { ImageDialog } from "../components/ImageDialog.js";
import {
  MobileMatchupNavigator,
  type MobileFighterSide,
  useMobileMatchupViewport
} from "../components/MobileMatchupNavigator.js";
import { RulesDialog } from "../components/RulesDialog.js";
import { ThemeToggle } from "../components/ThemeToggle.js";
import { assetUrl } from "./assets.js";
import { buildRoster, validSelection, type RosterCharacter } from "./roster.js";
import {
  matchupVersionWarning,
  readMatchupUrl,
  writeMatchupUrl,
  type CurrentMatchupVersion,
  type MatchupUrlState
} from "./url-state.js";
import { useTheme } from "./use-theme.js";

interface AppState {
  readonly left: BattleSelection | null;
  readonly right: BattleSelection | null;
  readonly showBattle: boolean;
}

interface InitialAppState extends AppState {
  readonly versionWarning: string | null;
}

interface ReportState {
  readonly report: BattleReport | null;
  readonly error: string | null;
}

function profileFor(
  selection: BattleSelection | null,
  context: ReturnType<typeof createGameContext>
): CharacterProfile | null {
  return selection ? getCharacterProfile(context, selection) : null;
}

function initialState(
  context: ReturnType<typeof createGameContext>,
  search: string,
  currentVersion: CurrentMatchupVersion
): InitialAppState {
  const fromUrl = readMatchupUrl(search);
  const left = validSelection(context, fromUrl.left);
  const right = validSelection(context, fromUrl.right);
  return {
    left,
    right,
    showBattle: fromUrl.showBattle && Boolean(left && right),
    versionWarning: matchupVersionWarning(fromUrl, currentVersion)
  };
}

function urlState(state: AppState, currentVersion: CurrentMatchupVersion): MatchupUrlState {
  const asUrlSelection = (selection: BattleSelection | null) => {
    const formId = selection?.formId || selection?.keyId;
    return selection && formId ? { characterId: selection.characterId, formId } : null;
  };

  return {
    left: asUrlSelection(state.left),
    right: asUrlSelection(state.right),
    showBattle: state.showBattle,
    rulesetVersion: currentVersion.rulesetVersion,
    contentRevision: currentVersion.contentRevision
  };
}

function randomIndex(length: number): number {
  if (length <= 1) return 0;

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return (values[0] ?? 0) % length;
  }

  return Math.floor(Math.random() * length);
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("The browser did not allow clipboard access.");
}

function scrollToSection(selector: string): void {
  const reducedMotion =
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelector(selector)?.scrollIntoView({
    behavior: reducedMotion ? "auto" : "smooth",
    block: "start"
  });
}

function focusAndScroll(focusSelector: string, scrollSelector: string): void {
  document.querySelector<HTMLElement>(focusSelector)?.focus({ preventScroll: true });
  scrollToSection(scrollSelector);
}

export function App() {
  const context = useMemo(() => createGameContext(nexyData), []);
  const roster = useMemo(() => buildRoster(context), [context]);
  const currentVersion = useMemo<CurrentMatchupVersion>(
    () => ({
      rulesetVersion: RULESET_VERSION,
      contentRevision: nexyData.meta.content_revision
    }),
    []
  );
  const initial = useMemo(
    () => initialState(context, window.location.search, currentVersion),
    [context, currentVersion]
  );
  const [left, setLeft] = useState<BattleSelection | null>(initial.left);
  const [right, setRight] = useState<BattleSelection | null>(initial.right);
  const [showBattle, setShowBattle] = useState(initial.showBattle);
  const [versionWarning, setVersionWarning] = useState(initial.versionWarning);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [dialogImage, setDialogImage] = useState<DialogImage | null>(null);
  const [shareLabel, setShareLabel] = useState("Copy battle link");
  const [activeMobileSide, setActiveMobileSide] = useState<MobileFighterSide>("left");
  const [theme, toggleTheme] = useTheme();
  const isMobileMatchup = useMobileMatchupViewport();
  const shareResetTimer = useRef<number | undefined>(undefined);
  const pendingFocus = useRef<"battle" | "picker" | null>(null);
  const previousMobileViewport = useRef(isMobileMatchup);
  const lastFocusedPicker = useRef<MobileFighterSide>("left");

  const leftProfile = useMemo(() => profileFor(left, context), [context, left]);
  const rightProfile = useMemo(() => profileFor(right, context), [context, right]);
  const reportState = useMemo<ReportState>(() => {
    if (!showBattle || !left || !right) return { report: null, error: null };
    try {
      return {
        report: simulateBattle(context, left, right),
        error: null
      };
    } catch (error) {
      return {
        report: null,
        error: error instanceof Error ? error.message : "The battle could not be resolved."
      };
    }
  }, [context, left, right, showBattle]);

  useEffect(() => {
    if (versionWarning) return;
    const query = writeMatchupUrl(urlState({ left, right, showBattle }, currentVersion));
    const nextUrl = `${window.location.pathname}${query}`;
    window.history.replaceState(null, "", nextUrl);
  }, [currentVersion, left, right, showBattle, versionWarning]);

  useEffect(() => {
    const restoreFromHistory = (): void => {
      const restored = initialState(context, window.location.search, currentVersion);
      setLeft(restored.left);
      setRight(restored.right);
      setShowBattle(restored.showBattle);
      setVersionWarning(restored.versionWarning);
    };
    window.addEventListener("popstate", restoreFromHistory);
    return () => window.removeEventListener("popstate", restoreFromHistory);
  }, [context, currentVersion]);

  useEffect(
    () => () => {
      if (shareResetTimer.current !== undefined) {
        window.clearTimeout(shareResetTimer.current);
      }
    },
    []
  );

  useEffect(() => {
    const wasMobile = previousMobileViewport.current;
    previousMobileViewport.current = isMobileMatchup;
    if (wasMobile === isMobileMatchup) return;

    const focusedElement = document.activeElement;
    if (isMobileMatchup) {
      const focusedPicker =
        focusedElement instanceof HTMLElement
          ? focusedElement.closest<HTMLElement>(".fighter-picker")?.dataset.side
          : undefined;
      const side = focusedPicker === "right" ? "right" : lastFocusedPicker.current;
      setActiveMobileSide(side);
      if (focusedPicker) {
        window.requestAnimationFrame(() => {
          document
            .querySelector<HTMLButtonElement>(`[data-mobile-fighter-tab="${side}"]`)
            ?.focus({ preventScroll: true });
        });
      }
      return;
    }

    if (focusedElement instanceof HTMLElement && focusedElement.matches("[data-mobile-fighter-tab]")) {
      const side = lastFocusedPicker.current;
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`#${side}-picker-title`)?.focus({ preventScroll: true });
      });
    }
  }, [isMobileMatchup]);

  useEffect(() => {
    if (pendingFocus.current === "battle") {
      if (!showBattle || (!reportState.report && !reportState.error)) return;
      pendingFocus.current = null;
      focusAndScroll(
        reportState.report ? "#battle-title" : "#battle-error-title",
        reportState.report ? "#battle" : "#battle-error"
      );
      return;
    }

    if (pendingFocus.current === "picker" && !showBattle) {
      pendingFocus.current = null;
      focusAndScroll(isMobileMatchup ? `#${activeMobileSide}-picker-title` : "#left-picker-title", "#arena");
    }
  }, [activeMobileSide, isMobileMatchup, reportState.error, reportState.report, showBattle]);

  const updateSelection = (side: "left" | "right", selection: BattleSelection | null): void => {
    if (side === "left") setLeft(selection);
    else setRight(selection);
    setShowBattle(false);
    setVersionWarning(null);
  };

  const chooseRandom = (side: "left" | "right", candidates: readonly RosterCharacter[]): void => {
    const current = side === "left" ? left : right;
    const alternatives = current ? candidates.filter((candidate) => candidate.id !== current.characterId) : candidates;
    const candidate = alternatives[randomIndex(alternatives.length)];
    if (candidate) updateSelection(side, candidate.defaultSelection);
  };

  const randomMatchup = (): void => {
    const leftIndex = randomIndex(roster.length);
    let rightIndex = randomIndex(roster.length);
    if (roster.length > 1 && rightIndex === leftIndex) {
      rightIndex = (rightIndex + 1) % roster.length;
    }
    setLeft(roster[leftIndex]?.defaultSelection ?? null);
    setRight(roster[rightIndex]?.defaultSelection ?? null);
    setShowBattle(false);
    setVersionWarning(null);
    window.requestAnimationFrame(() => {
      scrollToSection("#arena");
    });
  };

  const analyze = (): void => {
    if (!left || !right) return;
    if (showBattle && (reportState.report || reportState.error)) {
      focusAndScroll(
        reportState.report ? "#battle-title" : "#battle-error-title",
        reportState.report ? "#battle" : "#battle-error"
      );
      return;
    }
    pendingFocus.current = "battle";
    setShowBattle(true);
  };

  const editMatchup = (): void => {
    pendingFocus.current = "picker";
    setShowBattle(false);
  };

  const shareBattle = async (): Promise<void> => {
    const query = writeMatchupUrl(urlState({ left, right, showBattle: true }, currentVersion));
    const address = new URL(`${window.location.pathname}${query}`, window.location.origin).href;
    try {
      await copyText(address);
      setShareLabel("Link copied");
    } catch {
      setShareLabel("Copy unavailable");
    }

    if (shareResetTimer.current !== undefined) {
      window.clearTimeout(shareResetTimer.current);
    }
    shareResetTimer.current = window.setTimeout(() => {
      setShareLabel("Copy battle link");
    }, 2200);
  };

  const formCount = roster.reduce((total, character) => total + character.formCount, 0);

  return (
    <div class="app-shell">
      <a class="skip-link" href="#main">
        Skip to matchup builder
      </a>

      <header class="site-header">
        <Brand />
        <div class="site-header__actions">
          <span class="roster-count">
            <span class="visually-hidden">
              {roster.length} characters and {formCount} forms
            </span>
            <span aria-hidden="true">
              <strong>{roster.length}</strong> fighters · {formCount} forms
            </span>
          </span>
          <button class="quiet-button" type="button" onClick={() => setRulesOpen(true)}>
            Rules
          </button>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      <main class="main" id="main" tabIndex={-1}>
        <section class="hero" aria-labelledby="hero-title">
          <div class="hero__copy">
            <span class="eyebrow">Transparent character matchup engine</span>
            <h1 id="hero-title">Build the fight. Inspect the reason.</h1>
            <p>
              Pick two combatants and Nexy resolves forms, equipment, powers, resistances, counters, and ranked
              statistics into a reproducible battle report—without hiding the calculation.
            </p>
          </div>
          <div class="hero__actions">
            <button class="secondary-button" type="button" onClick={randomMatchup}>
              Random matchup
            </button>
          </div>
        </section>

        {versionWarning ? (
          <aside class="link-version-warning" role="status">
            <strong>Shared-link compatibility notice</strong>
            <p>{versionWarning}</p>
          </aside>
        ) : null}

        <section class="arena-grid" id="arena" aria-label="Matchup builder">
          <MobileMatchupNavigator
            activeSide={activeMobileSide}
            isMobile={isMobileMatchup}
            leftName={leftProfile?.character.name ?? null}
            rightName={rightProfile?.character.name ?? null}
            onActivate={(side) => {
              lastFocusedPicker.current = side;
              setActiveMobileSide(side);
            }}
            onAnalyze={analyze}
          />
          <div
            id="mobile-fighter-left-panel"
            class="mobile-matchup-panel"
            {...(isMobileMatchup
              ? {
                  role: "tabpanel",
                  "aria-labelledby": "mobile-fighter-left-tab"
                }
              : {})}
            hidden={isMobileMatchup && activeMobileSide !== "left"}
            onFocusCapture={() => {
              lastFocusedPicker.current = "left";
            }}
          >
            <FighterPicker
              side="left"
              roster={roster}
              selection={left}
              profile={leftProfile}
              onSelect={(selection) => updateSelection("left", selection)}
              onClear={() => updateSelection("left", null)}
              onRandom={(candidates) => chooseRandom("left", candidates)}
              onOpenImage={setDialogImage}
            />
          </div>
          <div class="versus-rail" aria-hidden="true">
            <strong>VS</strong>
          </div>
          <div
            id="mobile-fighter-right-panel"
            class="mobile-matchup-panel"
            {...(isMobileMatchup
              ? {
                  role: "tabpanel",
                  "aria-labelledby": "mobile-fighter-right-tab"
                }
              : {})}
            hidden={isMobileMatchup && activeMobileSide !== "right"}
            onFocusCapture={() => {
              lastFocusedPicker.current = "right";
            }}
          >
            <FighterPicker
              side="right"
              roster={roster}
              selection={right}
              profile={rightProfile}
              onSelect={(selection) => updateSelection("right", selection)}
              onClear={() => updateSelection("right", null)}
              onRandom={(candidates) => chooseRandom("right", candidates)}
              onOpenImage={setDialogImage}
            />
          </div>
        </section>

        <ActionDock
          left={leftProfile}
          right={rightProfile}
          onSwap={() => {
            setLeft(right);
            setRight(left);
            setShowBattle(false);
            setVersionWarning(null);
          }}
          onAnalyze={analyze}
        />

        {reportState.report ? (
          <BattleResult
            report={reportState.report}
            shareLabel={shareLabel}
            onEdit={editMatchup}
            onShare={() => void shareBattle()}
          />
        ) : null}

        {reportState.error ? (
          <section class="battle-error" id="battle-error" role="alert" aria-labelledby="battle-error-title">
            <h2 id="battle-error-title" tabIndex={-1}>
              Battle calculation stopped
            </h2>
            <p>{reportState.error}</p>
            <button class="secondary-button" type="button" onClick={editMatchup}>
              Return to matchup
            </button>
          </section>
        ) : null}

        <footer class="site-footer">
          <div class="site-footer__copy">
            <p>Nexy Battle Lab · deterministic ruleset v{RULESET_VERSION}</p>
            <small>
              Unofficial, non-commercial fan project. Not affiliated with or endorsed by any rights holder. Third-party
              characters and marks belong to their respective owners.
            </small>
          </div>
          <div class="site-footer__actions">
            <button class="text-button" type="button" onClick={() => setRulesOpen(true)}>
              Read the rules
            </button>
            <a class="site-footer__link" href={assetUrl("legal.html")}>
              Legal &amp; removal requests
            </a>
          </div>
        </footer>
      </main>

      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <ImageDialog image={dialogImage} onClose={() => setDialogImage(null)} />
    </div>
  );
}
