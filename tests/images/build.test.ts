import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { buildImages } from "../../tools/images/build.js";
import { stripUnpublishedImages } from "../../tools/images/strip-unpublished.js";

const temporaryRoots: string[] = [];
sharp.cache(false);

async function temporaryProject(rightsStatus: "licensed" | "unverified-third-party" = "licensed"): Promise<string> {
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
  await writeData(root, rightsStatus);
  return root;
}

async function writeData(root: string, rightsStatus: "licensed" | "unverified-third-party"): Promise<void> {
  const image = {
    name: "Base",
    image: "images/characters/test-character/base.png",
    source_url: "https://example.com/base.png",
    rights_status: rightsStatus,
    reviewed_on: "2026-07-31",
    ...(rightsStatus === "licensed"
      ? { rights_holder: "Example", license: "Example licence" }
      : { rights_holder: "Unverified" })
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
      rebuiltSocialCard: true
    });
    expect((await sharp(await readFile(path.join(generated, "base-160.webp"))).metadata()).width).toBe(160);
    expect((await sharp(await readFile(path.join(generated, "base-640.webp"))).metadata()).width).toBe(640);

    const second = await buildImages({ root, concurrency: 2 });
    expect(second.cachedVariantCount).toBe(2);
    expect(second.rebuiltSocialCard).toBe(false);

    const manifest = JSON.parse(await readFile(path.join(root, "public", "image-rights.json"), "utf8")) as {
      readonly schema_version: number;
      readonly generated_on?: string;
      readonly content_revision?: string;
      readonly records: readonly { readonly published: boolean }[];
    };
    expect(manifest.schema_version).toBe(1);
    expect(manifest.generated_on).toBeUndefined();
    expect(manifest.content_revision).toBe("test-revision");
    expect(manifest.records[0]?.published).toBe(true);
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
