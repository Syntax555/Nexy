import { describe, expect, it } from "vitest";

import { imageRightsLabel, imageSourceName, isImageEnabledForPublicDisplay } from "../../src/app/image-rights.js";
import type { ImageRef } from "../../src/domain/index.js";

function image(rights_status: ImageRef["rights_status"], publish_unverified?: boolean): ImageRef {
  return {
    name: "Example",
    image: "images/characters/example/example.webp",
    source_url: "https://example.com/source",
    rights_status,
    ...(publish_unverified === undefined ? {} : { publish_unverified })
  };
}

describe("image publication policy", () => {
  it.each(["original", "licensed", "public-domain", "permission"] as const)("allows %s artwork", (status) => {
    expect(isImageEnabledForPublicDisplay(image(status))).toBe(true);
  });

  it("requires an explicit opt-in before displaying unverified artwork", () => {
    expect(isImageEnabledForPublicDisplay(image("unverified-third-party"))).toBe(false);
    expect(isImageEnabledForPublicDisplay(image("unverified-third-party", true))).toBe(true);
    expect(isImageEnabledForPublicDisplay(image("unverified-third-party", false))).toBe(false);
  });

  it("labels unverified artwork without implying a licence", () => {
    const unverified = image("unverified-third-party", true);
    expect(imageRightsLabel(unverified)).toBe("Rights unverified · no image licence claimed");
    expect(imageSourceName("https://vsbattles.fandom.com/wiki/File:Example.png")).toBe("VS Battles Wiki");
  });
});
