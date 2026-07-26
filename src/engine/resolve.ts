import type {
  CharacterForm,
  Effect,
  PowerRef,
  RankedStatInput,
  RankedStatName,
  ResistanceRef
} from "../domain/index.js";
import { effectiveForm } from "./capabilities.js";
import { battleEffectiveView } from "./counters.js";
import {
  arrayField,
  objectField,
  stringField,
  type GameContext
} from "./context.js";
import type {
  EngineView,
  OpponentStatSwapOutcome,
  ResolvedPair
} from "./internal.js";
import {
  compositeRank,
  normalizeStat,
  raiseStatModifier,
  statCatalogs,
  statsForForm
} from "./rank.js";

interface StatSwapEntry {
  readonly statName: RankedStatName;
  readonly gain: number;
}

interface StatSwapCandidate {
  readonly side: "left" | "right";
  readonly swap: Readonly<Record<string, unknown>>;
  readonly swaps: readonly StatSwapEntry[];
  readonly gain: number;
}

function opponentStatSwapCandidate(
  context: GameContext,
  owner: EngineView,
  target: EngineView,
  side: "left" | "right"
): StatSwapCandidate | undefined {
  return owner.effects
    .flatMap((effect) => {
      const swap = objectField(effect, "opponent_stat_swap");
      if (!swap) return [];
      const rangeLimit = Reflect.get(swap, "max_target_range") as RankedStatInput | undefined;
      if (
        rangeLimit
        && compositeRank(context, target.effectiveKey.range, "range_tiers")
          > compositeRank(context, rangeLimit, "range_tiers")
      ) {
        return [];
      }

      const maximumStats = objectField(swap, "max_target_stats");
      const swaps = arrayField<RankedStatName>(swap, "stat_names").flatMap((statName) => {
        const catalogName = statCatalogs[statName];
        const ownerStat = Reflect.get(owner.effectiveKey, statName) as RankedStatInput | undefined;
        const ownerBaseStat = Reflect.get(owner.key, statName) as RankedStatInput | undefined;
        const targetStat = Reflect.get(target.effectiveKey, statName) as RankedStatInput | undefined;
        const targetCap = maximumStats
          ? Reflect.get(maximumStats, statName) as RankedStatInput | undefined
          : undefined;
        if (!catalogName || !ownerStat || !ownerBaseStat || !targetStat) return [];

        const ownerRank = compositeRank(context, ownerStat, catalogName);
        const targetRank = compositeRank(context, targetStat, catalogName);
        const capRank = targetCap
          ? compositeRank(context, targetCap, catalogName)
          : Number.POSITIVE_INFINITY;
        if (targetRank <= ownerRank || targetRank > capRank) return [];
        return [{ statName, gain: targetRank - ownerRank }];
      });
      if (swaps.length === 0) return [];
      return [{
        side,
        swap,
        swaps,
        gain: swaps.reduce((total, entry) => total + entry.gain, 0)
      }];
    })
    .reduce<StatSwapCandidate | undefined>(
      (best, candidate) => !best || candidate.gain > best.gain ? candidate : best,
      undefined
    );
}

function assignStat(
  form: CharacterForm,
  name: RankedStatName,
  value: RankedStatInput | null | undefined
): void {
  Reflect.set(form, name, value);
}

function applyOpponentStatSwap(
  context: GameContext,
  left: EngineView,
  right: EngineView
): { readonly left: EngineView; readonly right: EngineView } {
  const leftCandidate = opponentStatSwapCandidate(context, left, right, "left");
  const rightCandidate = opponentStatSwapCandidate(context, right, left, "right");
  const candidate = leftCandidate && rightCandidate
    ? leftCandidate.gain === rightCandidate.gain
      ? undefined
      : leftCandidate.gain > rightCandidate.gain ? leftCandidate : rightCandidate
    : leftCandidate ?? rightCandidate;
  if (!candidate) return { left, right };

  const source = candidate.side === "left" ? left : right;
  const target = candidate.side === "left" ? right : left;
  const sourceKey = { ...source.effectiveKey };
  const targetKey = { ...target.effectiveKey };

  candidate.swaps.forEach(({ statName }) => {
    assignStat(
      sourceKey,
      statName,
      normalizeStat(
        Reflect.get(target.effectiveKey, statName) as RankedStatInput | undefined
      )
    );
    assignStat(
      targetKey,
      statName,
      normalizeStat(Reflect.get(source.key, statName) as RankedStatInput | undefined)
    );
  });

  arrayField<object>(
    candidate.swap,
    "on_success_stat_modifier_floor_effects"
  ).forEach((floor) => {
    const statName = stringField(floor, "stat") as RankedStatName;
    const catalogName = statCatalogs[statName];
    if (!catalogName) return;
    assignStat(
      sourceKey,
      statName,
      raiseStatModifier(
        context,
        Reflect.get(sourceKey, statName) as RankedStatInput | undefined,
        stringField(floor, "modifier"),
        catalogName
      )
    );
  });

  const outcome: OpponentStatSwapOutcome = {
    side: candidate.side,
    statNames: candidate.swaps.map(({ statName }) => statName),
    gain: candidate.gain
  };
  const sourceResult: EngineView = {
    ...source,
    effectiveKey: sourceKey,
    stats: statsForForm(context, sourceKey),
    opponentStatSwap: outcome
  };
  const targetResult: EngineView = {
    ...target,
    effectiveKey: targetKey,
    stats: statsForForm(context, targetKey),
    opponentStatSwap: outcome
  };
  return candidate.side === "left"
    ? { left: sourceResult, right: targetResult }
    : { left: targetResult, right: sourceResult };
}

function viewStateSignature(view: EngineView): string {
  return JSON.stringify({
    powerRefs: view.powerRefs,
    resistanceRefs: view.resistanceRefs,
    itemEffects: view.itemEffects,
    effects: view.effects,
    effectiveKey: view.effectiveKey
  });
}

function pairStateSignature(left: EngineView, right: EngineView): string {
  return `${viewStateSignature(left)}\u0000${viewStateSignature(right)}`;
}

function intersectResolvedLists<T>(
  views: readonly EngineView[],
  field: "powerRefs" | "resistanceRefs" | "itemEffects" | "effects"
): readonly T[] {
  const first = (views[0]?.[field] ?? []) as readonly T[];
  const signature = (value: T) => JSON.stringify(value);
  const minimumCounts = new Map<string, number>();
  first.forEach((value) => {
    const key = signature(value);
    minimumCounts.set(key, (minimumCounts.get(key) ?? 0) + 1);
  });
  views.slice(1).forEach((view) => {
    const counts = new Map<string, number>();
    (view[field] as readonly T[]).forEach((value) => {
      const key = signature(value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    minimumCounts.forEach((count, key) => {
      minimumCounts.set(key, Math.min(count, counts.get(key) ?? 0));
    });
  });

  const used = new Map<string, number>();
  return first.filter((value) => {
    const key = signature(value);
    const usedCount = used.get(key) ?? 0;
    const keep = usedCount < (minimumCounts.get(key) ?? 0);
    if (keep) used.set(key, usedCount + 1);
    return keep;
  });
}

function conservativeCycleView(
  context: GameContext,
  base: EngineView,
  cycle: readonly EngineView[]
): EngineView {
  const powerRefs = intersectResolvedLists<PowerRef>(cycle, "powerRefs");
  const resistanceRefs = intersectResolvedLists<ResistanceRef>(cycle, "resistanceRefs");
  const itemEffects = intersectResolvedLists<Effect>(cycle, "itemEffects");
  const effects = intersectResolvedLists<Effect>(cycle, "effects");
  const effectiveKey = effectiveForm(
    context,
    base.key,
    powerRefs,
    itemEffects,
    effects
  );
  return {
    ...base,
    effectiveKey,
    powerRefs,
    resistanceRefs,
    itemEffects,
    effects,
    stats: statsForForm(context, effectiveKey)
  };
}

/**
 * Resolve counters simultaneously. Both next states are computed from the
 * previous round, so the result does not depend on left/right evaluation order.
 */
export function resolveBattleViews(
  context: GameContext,
  baseLeft: EngineView,
  baseRight: EngineView
): ResolvedPair {
  const maximumRounds = 32;
  let left = baseLeft;
  let right = baseRight;
  let signature = pairStateSignature(left, right);
  const seen = new Map<string, number>([[signature, 0]]);
  const states: { readonly left: EngineView; readonly right: EngineView }[] = [
    { left, right }
  ];

  for (let round = 0; round < maximumRounds; round += 1) {
    const nextLeft = battleEffectiveView(context, baseLeft, right, left);
    const nextRight = battleEffectiveView(context, baseRight, left, right);
    const nextSignature = pairStateSignature(nextLeft, nextRight);
    if (nextSignature === signature) {
      const swapped = applyOpponentStatSwap(context, nextLeft, nextRight);
      return {
        ...swapped,
        resolution: { mode: "stable", rounds: round + 1 }
      };
    }

    const cycleStart = seen.get(nextSignature);
    if (cycleStart !== undefined) {
      const cycleStates = states.slice(cycleStart);
      const cycleLeft = conservativeCycleView(
        context,
        baseLeft,
        cycleStates.map((state) => state.left)
      );
      const cycleRight = conservativeCycleView(
        context,
        baseRight,
        cycleStates.map((state) => state.right)
      );
      const swapped = applyOpponentStatSwap(context, cycleLeft, cycleRight);
      return {
        ...swapped,
        resolution: { mode: "cycle-suppressed", rounds: round + 1 }
      };
    }

    left = nextLeft;
    right = nextRight;
    signature = nextSignature;
    seen.set(signature, states.length);
    states.push({ left, right });
  }

  const tailStart = Math.max(1, states.length - 8);
  const tail = states.slice(tailStart);
  const fallbackLeft = conservativeCycleView(
    context,
    baseLeft,
    tail.map((state) => state.left)
  );
  const fallbackRight = conservativeCycleView(
    context,
    baseRight,
    tail.map((state) => state.right)
  );
  const swapped = applyOpponentStatSwap(context, fallbackLeft, fallbackRight);
  return {
    ...swapped,
    resolution: { mode: "safety-limit", rounds: maximumRounds }
  };
}
