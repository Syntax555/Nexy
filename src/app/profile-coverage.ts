import { type CharacterProfile, rankedStatDefinitions, rankedStatNames } from "../domain/index.js";

export interface ProfileCoverage {
  readonly authored: number;
  readonly total: number;
  readonly missing: readonly string[];
}

export function profileCoverage(profile: CharacterProfile): ProfileCoverage {
  const missing = rankedStatNames
    .filter((id) => profile.effectiveKey[id] === null || profile.effectiveKey[id] === undefined)
    .map((id) => rankedStatDefinitions[id].label);
  return {
    authored: rankedStatNames.length - missing.length,
    total: rankedStatNames.length,
    missing
  };
}
