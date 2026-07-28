import { describe, expect, it } from "vitest";

import {
  collectImageRightsRecords,
  generatedVariantPaths,
  publishableImagePaths
} from "../../tools/images/publish-policy.js";

describe("image output publication policy", () => {
  const licensed = {
    image: "images/characters/example/licensed.png",
    source_url: "https://example.com/licensed",
    rights_status: "licensed",
    license: "CC BY 4.0"
  };
  const unverified = {
    image: "images/characters/example/unverified.webp",
    source_url: "https://example.com/unverified",
    rights_status: "unverified-third-party",
    rights_holder: "Example holder"
  };

  it("finds rights records in characters and catalog effects", () => {
    const records = collectImageRightsRecords({
      characters: [{ keys: [{ images: [licensed] }] }],
      options: { equipment: [{ effects: [{ image_update: unverified }] }] }
    });
    expect(records.map((record) => record.image)).toEqual([
      licensed.image,
      unverified.image
    ]);
  });

  it("whitelists only publishable originals and generated variants", () => {
    const paths = publishableImagePaths({
      characters: [{ keys: [{ images: [licensed, unverified] }] }]
    });
    expect(paths.has(licensed.image)).toBe(true);
    expect(paths.has(unverified.image)).toBe(false);
    expect(paths.has("images/generated/example/licensed-160.webp")).toBe(true);
    expect(paths.has("images/generated/example/unverified-160.webp")).toBe(false);
  });

  it("derives responsive output paths only for supported local images", () => {
    expect(generatedVariantPaths(licensed.image)).toEqual([
      "images/generated/example/licensed-160.webp",
      "images/generated/example/licensed-640.webp"
    ]);
    expect(generatedVariantPaths("https://example.com/image.png")).toEqual([]);
    expect(generatedVariantPaths("images/characters/example/animation.gif")).toEqual([]);
  });
});
