import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { buildImages, type ImageBuildOptions } from "../../tools/images/build.js";
import { stripUnpublishedImages } from "../../tools/images/strip-unpublished.js";

const temporaryRoots: string[] = [];
sharp.cache(false);

async function temporaryProject(
  rightsStatus: "licensed" | "unverified-third-party" = "licensed",
  publishUnverified = false
): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "nexy-images-"));
  temporaryRoots.push(root);
  const sourceDirectory = path.join(root, "content", "images", "characters", "test-character");
  await mkdir(sourceDirectory, { recursive: true });
  await mkdir(path.join(root, "src", "generated"), { recursive: true });
  await mkdir(path.join(root, "public"), { recursive: true });
  await sharp({
    create: {
      width: 800,
      height: 800,
      channels: 4,
      background: { r: 40, g: 120, b: 220, alpha: 1 }
    }
  })
    .png()
    .toFile(path.join(sourceDirectory, "base.png"));
  await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: { r: 12, g: 18, b: 30, alpha: 1 }
    }
  })
    .png()
    .toFile(path.join(root, "content", "images", "og-source.png"));
  await writeData(root, rightsStatus, publishUnverified);
  return root;
}

async function writeData(
  root: string,
  rightsStatus: "licensed" | "unverified-third-party",
  publishUnverified = false
): Promise<void> {
  const image = {
    name: "Base",
    image: "images/characters/test-character/base.png",
    source_url: "https://example.com/base.png",
    rights_status: rightsStatus,
    reviewed_on: "2026-07-31",
    ...(rightsStatus === "licensed"
      ? { rights_holder: "Example", license: "Example licence" }
      : { rights_holder: "Unverified", ...(publishUnverified ? { publish_unverified: true } : {}) })
  };
  await writeFile(
    path.join(root, "src", "generated", "nexy-data.json"),
    `${JSON.stringify(
      {
        meta: { schema_version: 1, content_revision: "test-revision" },
        characters: [{ entry_id: "test-character", keys: [{ images: [image] }] }],
        options: {}
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

interface PixelBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

async function brightPixelBounds(target: string): Promise<PixelBounds> {
  const { data, info } = await sharp(target).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      if (red < 220 || green < 220 || blue < 220) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < 0 || bottom < 0) throw new Error(`Expected bright branding pixels in ${target}.`);
  return { left, top, right, bottom };
}

async function imageBuildFailure(options: ImageBuildOptions): Promise<Error> {
  try {
    await buildImages(options);
  } catch (error) {
    if (error instanceof Error) return error;
    throw error;
  }
  throw new Error("Expected the image build to fail.");
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("image build", () => {
  it("publishes only allowlisted variants and reuses unchanged work", async () => {
    const root = await temporaryProject();
    const first = await buildImages({ root, concurrency: 2 });
    const generated = path.join(root, "public", "images", "generated", "test-character");

    expect(first).toMatchObject({
      sourceCount: 1,
      variantCount: 2,
      cachedVariantCount: 0,
      unpublishedCount: 0,
      unverifiedPublishedCount: 0,
      rebuiltSocialCard: true,
      rebuiltBrandingAssetCount: 4
    });
    expect((await sharp(await readFile(path.join(generated, "base-160.webp"))).metadata()).width).toBe(160);
    expect((await sharp(await readFile(path.join(generated, "base-640.webp"))).metadata()).width).toBe(640);
    expect((await sharp(await readFile(path.join(root, "public", "favicon-32.png"))).metadata()).width).toBe(32);
    expect((await sharp(await readFile(path.join(root, "public", "apple-touch-icon.png"))).metadata()).width).toBe(180);
    const appIcon = path.join(root, "public", "app-icon-512.png");
    const appIconMetadata = await sharp(await readFile(appIcon)).metadata();
    expect(appIconMetadata).toMatchObject({ width: 512, height: 512 });
    const markBounds = await brightPixelBounds(appIcon);
    const safeMargin = Math.floor(512 * 0.16);
    expect(markBounds.left).toBeGreaterThanOrEqual(safeMargin);
    expect(markBounds.top).toBeGreaterThanOrEqual(safeMargin);
    expect(markBounds.right).toBeLessThan(512 - safeMargin);
    expect(markBounds.bottom).toBeLessThan(512 - safeMargin);
    expect(markBounds.right - markBounds.left).toBeGreaterThan(512 * 0.45);
    expect(markBounds.bottom - markBounds.top).toBeGreaterThan(512 * 0.44);

    const second = await buildImages({ root, concurrency: 2 });
    expect(second.cachedVariantCount).toBe(2);
    expect(second.rebuiltSocialCard).toBe(false);
    expect(second.rebuiltBrandingAssetCount).toBe(0);
    expect(second.totalOutputBytes).toBe(first.totalOutputBytes);

    const manifest = JSON.parse(await readFile(path.join(root, "public", "image-rights.json"), "utf8")) as {
      readonly schema_version: number;
      readonly generated_on?: string;
      readonly content_revision?: string;
      readonly summary: {
        readonly total_records: number;
        readonly published_records: number;
        readonly unpublished_records: number;
        readonly unverified_published_records: number;
      };
      readonly records: readonly { readonly published: boolean }[];
    };
    expect(manifest.schema_version).toBe(1);
    expect(manifest.generated_on).toBeUndefined();
    expect(manifest.content_revision).toBe("test-revision");
    expect(manifest.summary).toEqual({
      total_records: 1,
      published_records: 1,
      unpublished_records: 0,
      unverified_published_records: 0
    });
    expect(manifest.records[0]?.published).toBe(true);
  });

  it("keeps explicitly published unverified artwork in the generated catalog", async () => {
    const root = await temporaryProject("unverified-third-party", true);

    const result = await buildImages({ root });
    const manifest = JSON.parse(await readFile(path.join(root, "public", "image-rights.json"), "utf8")) as {
      readonly summary: { readonly unverified_published_records: number };
      readonly records: readonly { readonly published: boolean; readonly published_variants: readonly string[] }[];
    };

    expect(result).toMatchObject({
      sourceCount: 1,
      unpublishedCount: 0,
      unverifiedPublishedCount: 1
    });
    expect(manifest.summary.unverified_published_records).toBe(1);
    expect(manifest.records[0]).toMatchObject({
      published: true,
      published_variants: [
        "images/generated/test-character/base-160.webp",
        "images/generated/test-character/base-640.webp"
      ]
    });
  });

  it("atomically removes variants when a rights record is no longer publishable", async () => {
    const root = await temporaryProject();
    await buildImages({ root });
    await writeData(root, "unverified-third-party");

    const result = await buildImages({ root });
    const generatedRoot = path.join(root, "public", "images", "generated");
    const manifest = JSON.parse(await readFile(path.join(root, "public", "image-rights.json"), "utf8")) as {
      readonly records: readonly { readonly published: boolean }[];
    };

    expect(result).toMatchObject({
      sourceCount: 0,
      variantCount: 0,
      unpublishedCount: 1
    });
    expect(await readdir(generatedRoot)).toEqual([]);
    expect(manifest.records[0]?.published).toBe(false);
  });

  it.each([
    ["Thumbnail", { thumbnailBytes: 1 }, "images/generated/test-character/base-160.webp"],
    ["Portrait", { portraitBytes: 1 }, "images/generated/test-character/base-640.webp"],
    ["Social image", { socialBytes: 1 }, "og.png"],
    ["Branding image", { brandingAssetBytes: 1 }, "favicon-32.png"]
  ] as const)("fails clearly when the %s budget is exceeded", async (label, budgets, asset) => {
    const root = await temporaryProject();
    const failure = await imageBuildFailure({ root, budgets });

    expect(failure.message).toContain(`${label} budget exceeded for ${asset}`);
    expect(failure.message).toContain("limit 1 B");
    expect(await exists(path.join(root, "public", "images", "generated"))).toBe(false);
  });

  it("fails clearly when the aggregate image budget is exceeded", async () => {
    const root = await temporaryProject();
    const failure = await imageBuildFailure({ root, budgets: { aggregateBytes: 1 } });

    expect(failure.message).toContain("Generated image aggregate budget exceeded");
    expect(failure.message).toContain("limit 1 B");
    expect(await exists(path.join(root, "public", "images", "generated"))).toBe(false);
  });
});

describe("production image stripping", () => {
  it("removes originals and variants outside the publication allowlist", async () => {
    const root = await temporaryProject();
    const original = path.join(root, "dist", "images", "characters", "test-character", "base.png");
    const expected = path.join(root, "dist", "images", "generated", "test-character", "base-160.webp");
    const unexpected = path.join(root, "dist", "images", "generated", "test-character", "unused-160.webp");
    await mkdir(path.dirname(original), { recursive: true });
    await mkdir(path.dirname(expected), { recursive: true });
    await writeFile(original, "source", "utf8");
    await writeFile(expected, "expected", "utf8");
    await writeFile(unexpected, "unexpected", "utf8");

    const result = await stripUnpublishedImages({ root });

    expect(result).toEqual({
      removedOriginals: 1,
      removedUnpublishedVariants: 1
    });
    expect(await exists(original)).toBe(false);
    expect(await exists(expected)).toBe(true);
    expect(await exists(unexpected)).toBe(false);
  });
});
