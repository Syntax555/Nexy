import { type CharacterProfile, RULESET_VERSION } from "../domain/index.js";

interface ActionDockProps {
  readonly left: CharacterProfile | null;
  readonly right: CharacterProfile | null;
  readonly mobile: boolean;
  readonly battleVisible: boolean;
  readonly onSwap: () => void;
  readonly onAnalyze: () => void;
  readonly onChoose: (side: "left" | "right") => void;
}

function FighterSummary({
  side,
  profile
}: {
  readonly side: "Fighter 01" | "Fighter 02";
  readonly profile: CharacterProfile | null;
}) {
  return (
    <div class="dock-fighter">
      <span>{side}</span>
      <strong>{profile?.character.name ?? "Not selected"}</strong>
      <small>
        {profile
          ? `${profile.names[0] || profile.character.name} · ${profile.key.name || "Base"}`
          : "Choose from the roster"}
      </small>
    </div>
  );
}

export function ActionDock({ left, right, mobile, battleVisible, onSwap, onAnalyze, onChoose }: ActionDockProps) {
  const ready = Boolean(left && right);
  const nextSide = !left ? "left" : !right ? "right" : null;
  const canContinue = mobile && nextSide !== null;
  const actionLabel = ready
    ? battleVisible
      ? "View battle report"
      : "Analyze battle"
    : mobile
      ? nextSide === "right"
        ? "Choose Fighter 02"
        : "Choose Fighter 01"
      : "Analyze battle";

  return (
    <fieldset
      class="action-dock"
      data-ready={ready ? "true" : "false"}
      data-mobile={mobile ? "true" : "false"}
      data-battle-visible={battleVisible ? "true" : "false"}
    >
      <legend class="visually-hidden">Matchup controls</legend>
      <FighterSummary side="Fighter 01" profile={left} />
      <button
        class="icon-button swap-button"
        type="button"
        aria-label="Swap fighters"
        title="Swap fighters"
        disabled={!left && !right}
        onClick={onSwap}
      >
        ⇄
      </button>
      <FighterSummary side="Fighter 02" profile={right} />
      <button
        class="primary-button analyze-button"
        type="button"
        disabled={!ready && !canContinue}
        onClick={() => {
          if (ready) onAnalyze();
          else if (nextSide) onChoose(nextSide);
        }}
      >
        <span>{actionLabel}</span>
        <small>
          {ready
            ? `Run deterministic ruleset v${RULESET_VERSION}`
            : canContinue
              ? "Continue fighter selection"
              : "Choose two fighters"}
        </small>
      </button>
    </fieldset>
  );
}
