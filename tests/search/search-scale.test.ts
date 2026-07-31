import { describe, expect, it } from "vitest";

import { getCachedSearchIndex, searchIndex } from "../../src/search/search.js";

interface SearchFixture {
  readonly id: string;
  readonly text: string;
}

const textForFixture = (item: SearchFixture): string => item.text;

describe("large-roster search indexing", () => {
  it("reuses an immutable roster index across consumers", () => {
    const roster: SearchFixture[] = [
      { id: "one", text: "Alpha fighter" },
      { id: "two", text: "Beta fighter" }
    ];

    const first = getCachedSearchIndex(roster, textForFixture);
    const second = getCachedSearchIndex(roster, textForFixture);
    expect(second).toBe(first);

    roster.push({ id: "three", text: "Gamma fighter" });
    const afterMutation = getCachedSearchIndex(roster, textForFixture);
    expect(afterMutation).not.toBe(first);
    expect(searchIndex(afterMutation, "Gamma").map(({ id }) => id)).toEqual(["three"]);
  });

  it("keeps typo matching while rejecting noisy one-character fuzzy matches", () => {
    const roster: SearchFixture[] = [
      { id: "venom", text: "Agent Venom" },
      { id: "marvel", text: "Ms Marvel" }
    ];
    const index = getCachedSearchIndex(roster, textForFixture);

    expect(searchIndex(index, "agt venm").map(({ id }) => id)).toEqual(["venom"]);
    expect(searchIndex(index, "z")).toEqual([]);
  });

  it("keeps relevance ahead of a caller's display-order tie breaker", () => {
    const roster: SearchFixture[] = [
      { id: "alpha", text: "Agent Venom" },
      { id: "zulu", text: "agt venm" }
    ];
    const index = getCachedSearchIndex(roster, textForFixture);
    const byId = (left: SearchFixture, right: SearchFixture): number => left.id.localeCompare(right.id);

    expect(searchIndex(index, "", byId).map(({ id }) => id)).toEqual(["alpha", "zulu"]);
    expect(searchIndex(index, "agt venm", byId).map(({ id }) => id)).toEqual(["zulu", "alpha"]);
  });
});
