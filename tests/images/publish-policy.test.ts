import { describe, expect, it } from "vitest";

import {
  collectImageRightsRecords,
  generatedVariantPaths,
  publishedImageSourcePaths,
  publishedImageVariantPaths
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
    rights_holder: "Example holder",
    publish_unverified: true
  };
  const withheldUnverified = {
    ...unverified,
    image: "images/characters/example/withheld.webp",
    publish_unverified: false
  };

  it("finds rights records in characters and catalog effects", () => {
    const records = collectImageRightsRecords({
      characters: [{ keys: [{ images: [licensed, unverified] }] }],
      options: { equipment: [{ effects: [{ image_update: unverified }] }] }
    });
    expect(records.map((record) => record.image)).toEqual([licensed.image, unverified.image]);
  });

  it("publishes verified images and explicitly enabled unverified images", () => {
    const data = {
      characters: [
        {
          keys: [{ images: [licensed, unverified, withheldUnverified] }]
        }
      ]
    };
    const sources = publishedImageSourcePaths(data);
    const variants = publishedImageVariantPaths(data);

    expect(sources.has(licensed.image)).toBe(true);
    expect(sources.has(unverified.image)).toBe(true);
    expect(sources.has(withheldUnverified.image)).toBe(false);
    expect(variants.has("images/generated/example/licensed-160.webp")).toBe(true);
    expect(variants.has("images/generated/example/unverified-160.webp")).toBe(true);
    expect(variants.has("images/generated/example/withheld-160.webp")).toBe(false);
  });

  it("withholds a reused path if any rights record lacks the opt-in", () => {
    const sources = publishedImageSourcePaths({
      characters: [{ keys: [{ images: [unverified] }] }],
      options: {
        equipment: [
          {
            effects: [
              {
                image_update: { ...unverified, publish_unverified: false }
              }
            ]
          }
        ]
      }
    });
    expect(sources.has(unverified.image)).toBe(false);
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
