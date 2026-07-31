import { describe, expect, it } from "vitest";

import { assetUrl, characterImageVariant } from "../../src/app/assets.js";

describe("asset URLs", () => {
  it("keeps remote assets unchanged", () => {
    expect(assetUrl("https://example.com/image.webp")).toBe("https://example.com/image.webp");
  });

  it("maps character originals to generated variants", () => {
    expect(characterImageVariant("images/characters/example/base.png", 160)).toContain(
      "images/generated/example/base-160.webp"
    );
  });

  it("does not invent a generated URL for an unsupported source format", () => {
    expect(characterImageVariant("images/characters/example/base.gif", 160)).toContain(
      "images/characters/example/base.gif"
    );
  });
});
