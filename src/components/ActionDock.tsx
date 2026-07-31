import { type CharacterProfile, RULESET_VERSION } from "../domain/index.js";

interface ActionDockProps {
  readonly left: CharacterProfile | null;
  readonly right: CharacterProfile | null;
  readonly onSwap: () => void;
  readonly onAnalyze: () => void;
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

export function ActionDock({ left, right, onSwap, onAnalyze }: ActionDockProps) {
  const ready = Boolean(left && right);

  return (
    <fieldset class="action-dock" data-ready={ready ? "true" : "false"}>
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
      <button class="primary-button analyze-button" type="button" disabled={!ready} onClick={onAnalyze}>
        <span>Analyze battle</span>
        <small>{ready ? `Run deterministic ruleset v${RULESET_VERSION}` : "Choose two fighters"}</small>
      </button>
    </fieldset>
  );
}
