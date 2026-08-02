import { describe, expect, it } from "vitest";

import { loadNexyData } from "../../src/data/load-nexy.js";

describe("loadNexyData", () => {
  it("loads and caches the validated content payload", async () => {
    const firstPromise = loadNexyData();
    const secondPromise = loadNexyData();

    expect(secondPromise).toBe(firstPromise);
    const data = await firstPromise;
    expect(data.meta.schema_version).toBe(1);
    expect(Array.isArray(data.characters)).toBe(true);
    expect(Array.isArray(data.characters) ? data.characters.length : Object.keys(data.characters).length).toBe(20);
  });
});
