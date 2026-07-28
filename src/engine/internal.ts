import type {
  CharacterEntry,
  CharacterForm,
  ContentSource,
  Effect,
  ImageRef,
  PowerRef,
  RankedStatName,
  ResistanceRef,
  StatusCode
} from "../domain/index.js";
import type { CatalogRecord } from "./context.js";

export interface ResolvedStat {
  readonly id: RankedStatName | "tier" | "speed";
  readonly label: string;
  readonly value: string;
  readonly rank: number;
  readonly note?: string;
}

export interface EngineStatus {
  readonly code: StatusCode;
  readonly label: string;
  readonly reason: string;
  readonly causedBy?: CapabilityIdentity;
}

export interface CapabilityIdentity {
  readonly kind: "power" | "resistance" | "equipment" | "attack";
  readonly id: string;
}

export interface ResolvedCatalogItem extends CatalogRecord {
  readonly effects?: readonly Effect[];
  readonly ref?: Readonly<Record<string, unknown>>;
}

export interface CapabilityItem {
  readonly kind: CapabilityIdentity["kind"];
  readonly id: string;
  readonly label: string;
  readonly placeholder: boolean;
  readonly ref?: PowerRef | ResistanceRef | Readonly<Record<string, unknown>>;
  readonly catalogItem?: ResolvedCatalogItem;
  readonly status?: EngineStatus;
  readonly details?: readonly string[];
}

export interface ProfileSection {
  readonly id: "powers" | "resistances" | "standard-equipment" | "optional-equipment" | "attacks";
  readonly label: string;
  readonly items: readonly CapabilityItem[];
}

export interface OpponentStatSwapOutcome {
  readonly side: "left" | "right";
  readonly statNames: readonly RankedStatName[];
  readonly gain: number;
}

export interface EngineView {
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
  readonly stats: readonly ResolvedStat[];
  readonly sections: readonly ProfileSection[];
  readonly opponentStatSwap?: OpponentStatSwapOutcome;
}

export interface ResolutionMetadata {
  readonly mode: "stable" | "cycle-suppressed" | "safety-limit";
  readonly rounds: number;
}

export interface ResolvedPair {
  readonly left: EngineView;
  readonly right: EngineView;
  readonly resolution: ResolutionMetadata;
}

export const statusLabels: Readonly<Record<StatusCode, string>> = {
  active: "Active",
  disabled: "Disabled",
  absorbed: "Absorbed",
  negated: "Negated",
  nullified: "Nullified",
  resisted: "Resisted"
};

export function status(
  code: StatusCode,
  reason = "",
  causedBy?: CapabilityIdentity
): EngineStatus {
  return {
    code,
    label: statusLabels[code],
    reason,
    ...(causedBy ? { causedBy } : {})
  };
}

export function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null
    ? value as Readonly<Record<string, unknown>>
    : {};
}
