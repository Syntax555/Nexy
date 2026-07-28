import type {
  BattleReport,
  BattleSelection,
  CharacterProfile
} from "../domain/index.js";
import { withBattleStatuses } from "./counters.js";
import type { GameContext } from "./context.js";
import type { EngineView } from "./internal.js";
import { prepareCharacterProfile, resolveSelection } from "./profile.js";
import { resolveBattleViews } from "./resolve.js";
import {
  compareBattleStats,
  scoreBattle,
  verdictForScore
} from "./score.js";

function normalizedSelection(
  view: EngineView
): BattleSelection {
  return {
    characterId: view.character.entry_id || view.character.id || "",
    formId: view.key.key
  };
}

function publicProfile(
  view: EngineView,
  selection: BattleSelection
): CharacterProfile {
  return {
    selection,
    character: view.character,
    key: view.key,
    effectiveKey: view.effectiveKey,
    itemEffects: view.itemEffects,
    powerRefs: view.powerRefs,
    resistanceRefs: view.resistanceRefs,
    effects: view.effects,
    ...(view.image ? { image: view.image } : {}),
    sources: view.sources,
    names: view.names,
    details: view.details,
    stats: view.stats,
    sections: view.sections,
    ...(view.opponentStatSwap
      ? { opponentStatSwap: view.opponentStatSwap }
      : {})
  };
}

/**
 * Run one deterministic ruleset-v1 matchup and return presentation-neutral
 * data. This is the sole battle orchestration entry point.
 */
export function simulateBattle(
  context: GameContext,
  leftSelection: BattleSelection,
  rightSelection: BattleSelection
): BattleReport {
  const leftResolvedSelection = resolveSelection(context, leftSelection);
  const rightResolvedSelection = resolveSelection(context, rightSelection);
  const baseLeft = prepareCharacterProfile(
    context,
    leftResolvedSelection.character,
    leftResolvedSelection.form
  );
  const baseRight = prepareCharacterProfile(
    context,
    rightResolvedSelection.character,
    rightResolvedSelection.form
  );
  const resolved = resolveBattleViews(context, baseLeft, baseRight);
  const comparisons = compareBattleStats(context, resolved.left, resolved.right);
  const score = scoreBattle(
    context,
    resolved.left,
    resolved.right,
    comparisons
  );
  const left = withBattleStatuses(
    context,
    baseLeft,
    baseRight,
    resolved.left,
    resolved.right
  );
  const right = withBattleStatuses(
    context,
    baseRight,
    baseLeft,
    resolved.right,
    resolved.left
  );
  const normalizedLeftSelection = normalizedSelection(left);
  const normalizedRightSelection = normalizedSelection(right);

  return {
    rulesetVersion: "1",
    selections: {
      left: normalizedLeftSelection,
      right: normalizedRightSelection
    },
    left: publicProfile(left, normalizedLeftSelection),
    right: publicProfile(right, normalizedRightSelection),
    comparisons,
    score,
    verdict: verdictForScore(resolved.left, resolved.right, score),
    resolution: resolved.resolution
  };
}
