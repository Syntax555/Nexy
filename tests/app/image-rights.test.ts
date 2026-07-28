import { describe, expect, it } from "vitest";

import { isImageApprovedForPublicDisplay } from "../../src/app/image-rights.js";
import type { ImageRef } from "../../src/domain/index.js";

function image(rights_status: ImageRef["rights_status"]): ImageRef {
  return {
    name: "Example",
    image: "images/characters/example/example.webp",
    source_url: "https://example.com/source",
    rights_status
  };
}

describe("image publication policy", () => {
  it.each([
    "original",
    "licensed",
    "public-domain",
    "permission"
  ] as const)("allows %s artwork", (status) => {
    expect(isImageApprovedForPublicDisplay(image(status))).toBe(true);
  });

  it("withholds unverified third-party artwork", () => {
    expect(
      isImageApprovedForPublicDisplay(image("unverified-third-party"))
    ).toBe(false);
  });
});
