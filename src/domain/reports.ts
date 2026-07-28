import type {
  CharacterEntry,
  CharacterForm,
  ContentSource,
  Effect,
  ImageRef,
  PowerRef,
  RankedStatName,
  ResistanceRef
} from "./data.js";

export type Side = "left" | "right";
export type Winner = Side | "tie";

export type StatusCode =
  | "active"
  | "disabled"
  | "absorbed"
  | "negated"
  | "nullified"
  | "resisted";

export type ComparisonClass = "higher" | "lower" | "same";

export type CapabilityKind =
  | "power"
  | "resistance"
  | "equipment"
  | "attack";

export interface BattleSelection {
  readonly characterId: string;
  /** Preferred name for the selected persisted form id. */
  readonly formId?: string;
  /** Compatibility alias for the persisted `CharacterForm.key` field. */
  readonly keyId?: string;
}

export interface CapabilityIdentity {
  readonly kind: CapabilityKind;
  readonly id: string;
}

export interface ItemStatus {
  readonly code: StatusCode;
  readonly label: string;
  readonly reason: string;
  readonly causedBy?: CapabilityIdentity;

  /** Legacy aliases, useful at the old renderer boundary only. */
  readonly id?: StatusCode;
  readonly detail?: string;
}

export interface ProfileStat {
  /** `speed` is the aggregated profile display; battle rows use concrete speed ids. */
  readonly id: RankedStatName | "tier" | "speed";
  readonly label: string;
  readonly value: string;
  readonly rank: number;
  readonly note?: string;
}

export interface ProfileCapability {
  readonly kind: CapabilityKind;
  readonly id: string;
  readonly label: string;
  readonly placeholder: boolean;
  readonly ref?:
    | PowerRef
    | ResistanceRef
    | Readonly<Record<string, unknown>>;
  readonly status?: ItemStatus;
  readonly details?: readonly string[];
}

export type ProfileSectionId =
  | "powers"
  | "resistances"
  | "standard-equipment"
  | "optional-equipment"
  | "attacks";

export interface ProfileSection {
  readonly id: ProfileSectionId;
  readonly label: string;
  readonly items: readonly ProfileCapability[];
}

export interface OpponentStatSwapOutcome {
  readonly side: Side;
  readonly statNames: readonly RankedStatName[];
  readonly gain: number;
}

/**
 * Complete data required to render a character profile. It deliberately
 * contains no HTML strings, DOM nodes, or browser-global values.
 */
export interface CharacterProfile {
  readonly selection?: BattleSelection;
  readonly character: CharacterEntry;
  readonly key: CharacterForm;
  readonly effectiveKey: CharacterForm;
  readonly itemEffects: readonly Effect[];
  readonly powerRefs: readonly PowerRef[];
  readonly resistanceRefs: readonly ResistanceRef[];
  readonly effects: readonly Effect[];
  readonly image?: ImageRef;
  readonly sources: readonly ContentSource[];
  readonly names: readonly string[];
  readonly details: readonly string[];
  readonly stats: readonly ProfileStat[];
  readonly sections: readonly ProfileSection[];
  readonly opponentStatSwap?: OpponentStatSwapOutcome;
}

export interface ComparedStat {
  readonly id: RankedStatName | "tier";
  readonly label: string;
  readonly value: string;
  readonly rank: number;
  readonly note?: string;
}

export interface StatComparison {
  readonly id: RankedStatName | "tier";
  readonly label: string;
  readonly left: ComparedStat | null;
  readonly right: ComparedStat | null;
  readonly leftClass: ComparisonClass;
  readonly rightClass: ComparisonClass;
  readonly winner: Winner;
  readonly includedInScore: boolean;
}

export interface BattleScoreRow {
  readonly id: RankedStatName;
  readonly label: string;
  readonly leftValue: string;
  readonly rightValue: string;
  readonly leftRank: number;
  readonly rightRank: number;
  readonly rankGap: number;
  readonly winner: Winner;
}

export interface BattleTieBreaker {
  readonly id: string;
  readonly label: string;
  readonly leftValue: string;
  readonly rightValue: string;
  readonly leftRank: number;
  readonly rightRank: number;
  readonly rankGap: number;
  readonly winner: Winner;
}

export interface BattleInteraction {
  readonly winner: Winner;
  readonly summary: string;
  readonly detail: string;
}

export interface BattleScore {
  readonly rows: readonly BattleScoreRow[];
  readonly leftScore: number;
  readonly rightScore: number;
  readonly scoreGap: number;
  readonly statCount: number;
  readonly winner: Winner;
  readonly pointWinner: Winner;
  readonly tieBreaker: BattleTieBreaker | null;
  readonly interaction: BattleInteraction | null;
}

export type VerdictKind =
  | "points"
  | "tie-breaker"
  | "automatic"
  | "stalemate"
  | "draw";

export interface BattleVerdict {
  readonly winner: Winner;
  readonly kind: VerdictKind;
  readonly headline: string;
  readonly summary: string;
  readonly detail?: string;
}

export type ResolutionMode =
  | "stable"
  | "cycle-suppressed"
  | "safety-limit";

export interface BattleResolution {
  readonly mode: ResolutionMode;
  readonly rounds: number;
}

export interface BattleReport {
  readonly rulesetVersion: "1";
  readonly selections: Readonly<Record<Side, BattleSelection>>;
  readonly left: CharacterProfile;
  readonly right: CharacterProfile;
  readonly comparisons: readonly StatComparison[];
  readonly score: BattleScore;
  readonly verdict: BattleVerdict;
  readonly resolution: BattleResolution;
}
