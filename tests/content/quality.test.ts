import { describe, expect, it } from "vitest";

import { nexyData } from "../../src/data/nexy.js";
import { assertContentQuality, collectContentQuality } from "../../tools/content/quality.js";

describe("content quality report", () => {
  it("tracks the current roster depth and known optional-speed gaps", () => {
    const report = collectContentQuality(nexyData);

    expect(report).toMatchObject({
      characters: 20,
      forms: 21,
      universes: 4,
      sourcedCharacters: { authored: 20, total: 20 }
    });
    expect(report.optionalSpeedCoverage.attack_speed).toEqual({ authored: 0, total: 21 });
    expect(() => assertContentQuality(report)).not.toThrow();
  });

  it("rejects regressions in source, universe, and authored speed coverage", () => {
    const report = collectContentQuality(nexyData);
    expect(() =>
      assertContentQuality({
        ...report,
        characters: 19,
        forms: 20,
        universes: 3,
        sourcedCharacters: { authored: 18, total: 20 },
        optionalSpeedCoverage: {
          ...report.optionalSpeedCoverage,
          reaction_speed: { authored: 5, total: 21 }
        }
      })
    ).toThrow(
      /character count fell[\s\S]*form count fell[\s\S]*universe coverage fell[\s\S]*source coverage[\s\S]*reaction_speed/
    );
  });
});
