import path from "node:path";
import { fileURLToPath } from "node:url";

import { nexyData } from "../../src/data/nexy.js";
import {
  type CharacterEntry,
  type NexyData,
  type OptionalSpeedStatName,
  optionalSpeedStatNames
} from "../../src/domain/index.js";

interface CoverageCount {
  readonly authored: number;
  readonly total: number;
}

export interface ContentQualityReport {
  readonly characters: number;
  readonly forms: number;
  readonly universes: number;
  readonly sourcedCharacters: CoverageCount;
  readonly optionalSpeedCoverage: Readonly<Record<OptionalSpeedStatName, CoverageCount>>;
}

const baseline = {
  characters: 20,
  forms: 21,
  universes: 4,
  sourcedCharacters: { authored: 20, total: 20 },
  optionalSpeedCoverage: {
    attack_speed: { authored: 0, total: 21 },
    reaction_speed: { authored: 6, total: 21 },
    travel_speed: { authored: 2, total: 21 },
    flight_speed: { authored: 1, total: 21 }
  }
} as const;

function characters(data: NexyData): readonly CharacterEntry[] {
  return Array.isArray(data.characters) ? data.characters : Object.values(data.characters);
}

export function collectContentQuality(data: NexyData): ContentQualityReport {
  const entries = characters(data);
  const forms = entries.flatMap((character) => character.keys);
  const optionalSpeedCoverage = Object.fromEntries(
    optionalSpeedStatNames.map((field) => [
      field,
      {
        authored: forms.filter((form) => form[field] !== null && form[field] !== undefined).length,
        total: forms.length
      }
    ])
  ) as Readonly<Record<OptionalSpeedStatName, CoverageCount>>;

  return {
    characters: entries.length,
    forms: forms.length,
    universes: new Set(entries.map((character) => character.verse_id)).size,
    sourcedCharacters: {
      authored: entries.filter((character) => character.sources.length > 0).length,
      total: entries.length
    },
    optionalSpeedCoverage
  };
}

function coverageRegressed(current: CoverageCount, minimum: CoverageCount): boolean {
  if (minimum.authored === 0) return false;
  return current.authored * minimum.total < minimum.authored * current.total;
}

export function assertContentQuality(report: ContentQualityReport): void {
  const errors: string[] = [];
  if (report.characters < baseline.characters) {
    errors.push(`character count fell from ${baseline.characters} to ${report.characters}`);
  }
  if (report.forms < baseline.forms) {
    errors.push(`form count fell from ${baseline.forms} to ${report.forms}`);
  }
  if (report.universes < baseline.universes) {
    errors.push(`universe coverage fell from ${baseline.universes} to ${report.universes}`);
  }
  if (coverageRegressed(report.sourcedCharacters, baseline.sourcedCharacters)) {
    errors.push("character source coverage fell below 100%");
  }
  for (const field of optionalSpeedStatNames) {
    const current = report.optionalSpeedCoverage[field];
    const minimum = baseline.optionalSpeedCoverage[field];
    if (coverageRegressed(current, minimum)) {
      errors.push(
        `${field} coverage regressed to ${current.authored}/${current.total}; ` +
          `baseline is ${minimum.authored}/${minimum.total}`
      );
    }
  }
  if (errors.length > 0) throw new Error(`Content quality regression:\n- ${errors.join("\n- ")}`);
}

function runCli(): void {
  const report = collectContentQuality(nexyData);
  assertContentQuality(report);
  console.log(JSON.stringify(report, null, 2));
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
