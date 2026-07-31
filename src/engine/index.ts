export {
  byId,
  catalog,
  createGameContext,
  type CatalogName,
  type CatalogRecord,
  type GameContext
} from "./context.js";

export {
  abilityModifierRank,
  compositeRank,
  formatSpeed,
  formatStat,
  formatTier,
  normalizeStat,
  statsForForm
} from "./rank.js";

export {
  powerRefLabel,
  powerRefs,
  powerTypesCover,
  resistanceRefLabel,
  resistanceRefs
} from "./capabilities.js";

export {
  getCharacterProfile,
  resolveSelection
} from "./profile.js";

export { resolveBattleViews } from "./resolve.js";

export {
  battleInteractionOutcome,
  compareBattleStats,
  scoreBattle,
  verdictForScore
} from "./score.js";

export { simulateBattle } from "./simulate.js";
