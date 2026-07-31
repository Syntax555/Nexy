import type {
  BattleInteraction,
  BattleScore,
  BattleScoreRow,
  BattleTieBreaker,
  BattleVerdict,
  ComparedStat,
  OptionalSpeedStatName,
  PowerRef,
  PowerTargetRef,
  RankedStatName,
  SpeedStatName,
  StatComparison,
  Winner
} from "../domain/index.js";
import {
  compareRefStrength,
  powerRefLabel,
  powerTargetRefLabel,
  powerTypeRank,
  powerTypesCover
} from "./capabilities.js";
import { arrayField, byId, type GameContext } from "./context.js";
import type { EngineView, ResolvedStat } from "./internal.js";
import {
  compositeRank,
  degreeRank,
  formatStat,
  formStat,
  joinText,
  normalizeStat,
  profileStatDefinitions,
  speedComparisonLabel,
  speedDefinitions
} from "./rank.js";

function winnerFor(leftRank: number, rightRank: number): Winner {
  if (leftRank > rightRank) return "left";
  if (rightRank > leftRank) return "right";
  return "tie";
}

const rulesetV1OptionalSpeedScoring = {
  attack_speed: "both-authored",
  reaction_speed: "both-authored",
  travel_speed: "both-authored",
  flight_speed: "both-authored"
} as const satisfies Readonly<Record<OptionalSpeedStatName, "both-authored">>;

const rulesetV1SpeedScoring = {
  combat_speed: "always",
  ...rulesetV1OptionalSpeedScoring
} as const satisfies Readonly<Record<SpeedStatName, "always" | "both-authored">>;

function hasAuthoredSpeedCategory(view: EngineView, field: SpeedStatName): boolean {
  return Boolean(formStat(view.effectiveKey, field));
}

/**
 * Ruleset v1 always scores combat speed. An optional category contributes a
 * comparison row only when it is present on both resolved forms.
 */
function speedCategoryIsScored(left: EngineView, right: EngineView, field: SpeedStatName): boolean {
  return (
    rulesetV1SpeedScoring[field] === "always" ||
    (hasAuthoredSpeedCategory(left, field) && hasAuthoredSpeedCategory(right, field))
  );
}

function comparisonClass(rank: number, otherRank: number): "higher" | "lower" | "same" {
  if (rank > otherRank) return "higher";
  if (rank < otherRank) return "lower";
  return "same";
}

function comparisonPair(
  id: RankedStatName | "tier",
  label: string,
  left: ComparedStat | null,
  right: ComparedStat | null
): StatComparison {
  const leftRank = left?.rank ?? 0;
  const rightRank = right?.rank ?? 0;
  return {
    id,
    label,
    left,
    right,
    leftClass: comparisonClass(leftRank, rightRank),
    rightClass: comparisonClass(rightRank, leftRank),
    winner: winnerFor(leftRank, rightRank),
    includedInScore: id !== "tier"
  };
}

function comparedStat(
  id: RankedStatName | "tier",
  label: string,
  value: string,
  rank: number,
  note?: string
): ComparedStat {
  return {
    id,
    label,
    value,
    rank,
    ...(note ? { note } : {})
  };
}

function speedBattleStat(
  context: GameContext,
  view: EngineView,
  field: SpeedStatName,
  fallbackLabel: string
): ComparedStat | null {
  const stat = formStat(view.effectiveKey, field);
  if (!stat) return null;
  return comparedStat(
    field,
    speedComparisonLabel(field, fallbackLabel),
    formatStat(context, stat, "speed_tiers"),
    compositeRank(context, stat, "speed_tiers"),
    normalizeStat(stat)?.note || undefined
  );
}

function unscoredOptionalSpeedNotes(context: GameContext, view: EngineView, opponent: EngineView): readonly string[] {
  return speedDefinitions
    .filter(
      ([field]) =>
        rulesetV1SpeedScoring[field] === "both-authored" &&
        hasAuthoredSpeedCategory(view, field) &&
        !speedCategoryIsScored(view, opponent, field)
    )
    .map(([field, fallbackLabel]) => {
      const stat = formStat(view.effectiveKey, field);
      const label = speedComparisonLabel(field, fallbackLabel);
      const note = normalizeStat(stat)?.note;
      return `${label} - ${formatStat(context, stat, "speed_tiers")}${note ? ` (${note})` : ""}`;
    });
}

function withAdditionalNote(stat: ComparedStat | null, additionalNote: string): ComparedStat | null {
  if (!stat) return null;
  const note = stat.note ? `${stat.note} · ${additionalNote}` : additionalNote;
  return { ...stat, note };
}

function speedComparisons(context: GameContext, left: EngineView, right: EngineView): readonly StatComparison[] {
  const comparable = speedDefinitions.filter(([field]) => speedCategoryIsScored(left, right, field));
  const useSpecificCombatLabel = comparable.length > 1;
  const rows = comparable.map(([field, fallbackLabel]) => {
    const label =
      field === "combat_speed" && !useSpecificCombatLabel ? "Speed" : speedComparisonLabel(field, fallbackLabel);
    return comparisonPair(
      field,
      label,
      speedBattleStat(context, left, field, fallbackLabel),
      speedBattleStat(context, right, field, fallbackLabel)
    );
  });

  // These disclosures are attached to the always-present combat-speed row;
  // they never create a score row or contribute points.
  const leftNotes = unscoredOptionalSpeedNotes(context, left, right);
  const rightNotes = unscoredOptionalSpeedNotes(context, right, left);
  const first = rows[0];
  if (!first || (leftNotes.length === 0 && rightNotes.length === 0)) return rows;
  const firstWithNotes: StatComparison = {
    ...first,
    left: leftNotes.length ? withAdditionalNote(first.left, `Shown only here: ${joinText(leftNotes)}`) : first.left,
    right: rightNotes.length ? withAdditionalNote(first.right, `Shown only here: ${joinText(rightNotes)}`) : first.right
  };
  return [firstWithNotes, ...rows.slice(1)];
}

function profileStat(view: EngineView, id: string): ResolvedStat | undefined {
  return view.stats.find((stat) => stat.id === id);
}

export function compareBattleStats(
  context: GameContext,
  left: EngineView,
  right: EngineView
): readonly StatComparison[] {
  return profileStatDefinitions.flatMap(([id, label, field]) => {
    if (field === "speed") return speedComparisons(context, left, right);
    const leftStat = profileStat(left, id);
    const rightStat = profileStat(right, id);
    return [
      comparisonPair(
        field,
        label,
        leftStat ? comparedStat(field, label, leftStat.value, leftStat.rank, leftStat.note) : null,
        rightStat ? comparedStat(field, label, rightStat.value, rightStat.rank, rightStat.note) : null
      )
    ];
  });
}

function strongestRankedPowerRef(
  context: GameContext,
  view: EngineView,
  powerId: string,
  ranker: (ref?: PowerRef | null) => number
): PowerRef | undefined {
  return view.powerRefs
    .filter((ref) => ref.id === powerId)
    .reduce<PowerRef | undefined>((best, ref) => {
      if (!best) return ref;
      const difference = ranker(ref) - ranker(best);
      if (difference > 0) return ref;
      if (difference === 0 && compareRefStrength(context, ref, best) > 0) return ref;
      return best;
    }, undefined);
}

function powerTieBreaker(
  context: GameContext,
  left: EngineView,
  right: EngineView,
  powerId: string,
  label: string,
  ranker: (ref?: PowerRef | null) => number
): BattleTieBreaker {
  const leftRef = strongestRankedPowerRef(context, left, powerId, ranker);
  const rightRef = strongestRankedPowerRef(context, right, powerId, ranker);
  const leftRank = ranker(leftRef);
  const rightRank = ranker(rightRef);
  return {
    id: powerId,
    label,
    leftValue: leftRef ? powerRefLabel(context, leftRef) : "None",
    rightValue: rightRef ? powerRefLabel(context, rightRef) : "None",
    leftRank,
    rightRank,
    rankGap: Math.abs(leftRank - rightRank),
    winner: winnerFor(leftRank, rightRank)
  };
}

export function battleTieBreakers(
  context: GameContext,
  left: EngineView,
  right: EngineView
): readonly BattleTieBreaker[] {
  return [
    powerTieBreaker(context, left, right, "regeneration", "Regeneration", (ref) => powerTypeRank(context, ref)),
    powerTieBreaker(context, left, right, "martial-arts-mastery", "Martial Arts Mastery", (ref) =>
      ref ? degreeRank(context, ref) : 0
    )
  ];
}

const nonPhysicalProtectionPowerIds = new Set([
  "intangibility",
  "incorporeality",
  "abstract-existence",
  "nonexistent-physiology"
]);

function nonPhysicalTargetCoversProtection(
  context: GameContext,
  targetRef: PowerTargetRef,
  protectionRef: PowerRef
): boolean {
  if (targetRef.id !== protectionRef.id) return false;
  const protectionTypes = arrayField<string>(protectionRef, "type_ids");
  const targetTypes = arrayField<string>(targetRef, "type_ids");
  if (protectionTypes.length > 0) {
    return powerTypesCover(context, targetTypes, protectionTypes);
  }
  const availableTypes = context.catalogs.power_types.filter(
    (type) => Reflect.get(type, "power_id") === protectionRef.id
  );
  if (availableTypes.length === 0) return true;
  return targetTypes.some((typeId) => byId(context, "power_types", typeId)?.covers_all === true);
}

function nonPhysicalInteractionTargets(view: EngineView): readonly PowerTargetRef[] {
  return view.effects.flatMap((effect) =>
    arrayField<PowerTargetRef>(
      Reflect.get(effect, "non_physical_interaction") as object | undefined,
      "target_power_refs"
    )
  );
}

function activeNonPhysicalProtections(view: EngineView): readonly PowerRef[] {
  return view.powerRefs.filter((ref) => nonPhysicalProtectionPowerIds.has(ref.id));
}

function firstDistinctIdentity(view: EngineView): string | undefined {
  const characterName = view.character.name.trim();
  return view.names.find((name) => {
    const identity = name.trim();
    return identity.length > 0 && identity !== characterName;
  });
}

function contextualDisplayNames(
  left: EngineView,
  right: EngineView
): { readonly left: string; readonly right: string } {
  const leftName = left.character.name;
  const rightName = right.character.name;
  if (leftName !== rightName) return { left: leftName, right: rightName };

  const leftIdentity = firstDistinctIdentity(left);
  const rightIdentity = firstDistinctIdentity(right);
  if (!leftIdentity || !rightIdentity || leftIdentity.trim() === rightIdentity.trim()) {
    return { left: leftName, right: rightName };
  }

  return {
    left: `${leftName} (${leftIdentity})`,
    right: `${rightName} (${rightIdentity})`
  };
}

function nonPhysicalAttackStatus(
  context: GameContext,
  attacker: EngineView,
  target: EngineView
): { readonly canAffect: boolean; readonly blockedBy: readonly string[] } {
  const interactionTargets = nonPhysicalInteractionTargets(attacker);
  const blockedBy = activeNonPhysicalProtections(target)
    .filter(
      (protection) =>
        !interactionTargets.some((targetRef) => nonPhysicalTargetCoversProtection(context, targetRef, protection))
    )
    .map((ref) => powerTargetRefLabel(context, ref));
  return { canAffect: blockedBy.length === 0, blockedBy };
}

export function battleInteractionOutcome(
  context: GameContext,
  left: EngineView,
  right: EngineView
): BattleInteraction | null {
  const leftAttack = nonPhysicalAttackStatus(context, left, right);
  const rightAttack = nonPhysicalAttackStatus(context, right, left);
  if (leftAttack.canAffect && rightAttack.canAffect) return null;

  const { left: leftName, right: rightName } = contextualDisplayNames(left, right);
  if (leftAttack.canAffect) {
    return {
      winner: "left",
      summary: `${rightName} cannot affect ${leftName}`,
      detail: `Blocked by ${joinText(rightAttack.blockedBy)}`
    };
  }
  if (rightAttack.canAffect) {
    return {
      winner: "right",
      summary: `${leftName} cannot affect ${rightName}`,
      detail: `Blocked by ${joinText(leftAttack.blockedBy)}`
    };
  }
  return {
    winner: "tie",
    summary: "Neither combatant can affect the other",
    detail: `${leftName} is blocked by ${joinText(leftAttack.blockedBy)}; ${rightName} is blocked by ${joinText(rightAttack.blockedBy)}`
  };
}

export function scoreBattle(
  context: GameContext,
  left: EngineView,
  right: EngineView,
  comparisons: readonly StatComparison[] = compareBattleStats(context, left, right)
): BattleScore {
  const rows: BattleScoreRow[] = comparisons
    .filter((comparison) => comparison.includedInScore)
    .map((comparison) => {
      const leftRank = comparison.left?.rank ?? 0;
      const rightRank = comparison.right?.rank ?? 0;
      return {
        id: comparison.id as RankedStatName,
        label: comparison.label,
        leftValue: comparison.left?.value ?? "",
        rightValue: comparison.right?.value ?? "",
        leftRank,
        rightRank,
        rankGap: Math.abs(leftRank - rightRank),
        winner: winnerFor(leftRank, rightRank)
      };
    });
  const leftScore = rows.reduce((total, row) => total + row.leftRank, 0);
  const rightScore = rows.reduce((total, row) => total + row.rightRank, 0);
  const pointWinner = winnerFor(leftScore, rightScore);
  const interaction = battleInteractionOutcome(context, left, right);
  const tieBreaker =
    !interaction && pointWinner === "tie"
      ? (battleTieBreakers(context, left, right).find((candidate) => candidate.winner !== "tie") ?? null)
      : null;
  return {
    rows,
    leftScore,
    rightScore,
    scoreGap: Math.abs(leftScore - rightScore),
    statCount: rows.length,
    winner: interaction?.winner ?? tieBreaker?.winner ?? pointWinner,
    pointWinner,
    tieBreaker,
    interaction
  };
}

export function verdictForScore(left: EngineView, right: EngineView, score: BattleScore): BattleVerdict {
  const displayNames = contextualDisplayNames(left, right);
  const headline =
    score.winner === "left"
      ? `${displayNames.left} wins`
      : score.winner === "right"
        ? `${displayNames.right} wins`
        : "Draw";
  if (score.interaction) {
    const kind = score.interaction.winner === "tie" ? "stalemate" : "automatic";
    const result = score.interaction.winner === "tie" ? "Stalemate" : "Automatic win";
    return {
      winner: score.winner,
      kind,
      headline,
      summary: `${headline} - ${result}`,
      detail: `${score.interaction.summary}. ${score.interaction.detail}`
    };
  }
  if (score.tieBreaker) {
    return {
      winner: score.winner,
      kind: "tie-breaker",
      headline,
      summary: `${headline} - Tie-breaker: ${score.tieBreaker.label}`,
      detail: `${score.tieBreaker.leftValue} vs ${score.tieBreaker.rightValue}`
    };
  }
  if (score.winner === "tie") {
    return {
      winner: "tie",
      kind: "draw",
      headline,
      summary: `${headline} - Scores tied`
    };
  }
  return {
    winner: score.winner,
    kind: "points",
    headline,
    summary: `${headline} - +${score.scoreGap} pts`
  };
}
