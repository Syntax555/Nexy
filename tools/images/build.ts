import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  collectImageRightsRecords,
  generatedVariantPaths,
  isRightsRecordPublishable,
  publishedImageSourcePaths
} from "./publish-policy.js";

// Avoid retaining file descriptors between incremental swaps on Windows.
sharp.cache({ files: 0 });

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(moduleDirectory, "../..");
const widths = [160, 640] as const;
const imageRecipeVersion = "2";
const socialRecipeVersion = "1";

interface ImageBuildCache {
  readonly version: 1;
  readonly entries: Readonly<Record<string, string>>;
}

interface ImageBuildPaths {
  readonly root: string;
  readonly sourceRoot: string;
  readonly outputRoot: string;
  readonly socialSource: string;
  readonly socialOutput: string;
  readonly dataSource: string;
  readonly rightsManifestOutput: string;
  readonly cacheOutput: string;
}

export interface ImageBuildOptions {
  readonly root?: string;
  readonly concurrency?: number;
}

export interface ImageBuildResult {
  readonly sourceCount: number;
  readonly variantCount: number;
  readonly cachedVariantCount: number;
  readonly unpublishedCount: number;
  readonly rebuiltSocialCard: boolean;
}

interface VariantTask {
  readonly source: string;
  readonly width: (typeof widths)[number];
  readonly destination: string;
  readonly cacheKey: string;
}

function buildPaths(rootOption?: string): ImageBuildPaths {
  const root = path.resolve(rootOption ?? defaultRoot);
  return {
    root,
    sourceRoot: path.join(root, "content", "images", "characters"),
    outputRoot: path.join(root, "public", "images", "generated"),
    socialSource: path.join(root, "content", "images", "og-source.png"),
    socialOutput: path.join(root, "public", "og.png"),
    dataSource: path.join(root, "src", "generated", "nexy-data.json"),
    rightsManifestOutput: path.join(root, "public", "image-rights.json"),
    cacheOutput: path.join(root, "tmp", "image-build-cache.json")
  };
}

function assertDescendant(parent: string, target: string, label: string): void {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to use unsafe ${label} path ${target}`);
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (error) {
    const code = error instanceof Error && "code" in error ? Reflect.get(error, "code") : undefined;
    if (code === "ENOENT") return false;
    throw error;
  }
}

async function imageFiles(directory: string): Promise<readonly string[]> {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name, "en")
  );
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return imageFiles(absolute);
      if (!entry.isFile() || !/\.(?:avif|jpe?g|png|webp)$/i.test(entry.name)) return [];
      return [absolute];
    })
  );

  return nested.flat();
}

function sourcePublicPath(paths: ImageBuildPaths, source: string): string {
  const relative = path.relative(paths.sourceRoot, source).replaceAll(path.sep, "/");
  return `images/characters/${relative}`;
}

function variantRelativePath(paths: ImageBuildPaths, source: string, width: (typeof widths)[number]): string {
  const relative = path.relative(paths.sourceRoot, source);
  const parsed = path.parse(relative);
  return path.join(parsed.dir, `${parsed.name}-${width}.webp`);
}

function variantDestination(
  paths: ImageBuildPaths,
  outputRoot: string,
  source: string,
  width: (typeof widths)[number]
): string {
  return path.join(outputRoot, variantRelativePath(paths, source, width));
}

async function fileFingerprint(file: string, recipe: string): Promise<string> {
  const source = await readFile(file);
  return createHash("sha256").update(recipe).update("\0").update(source).digest("hex");
}

async function readCache(cacheOutput: string): Promise<ImageBuildCache> {
  try {
    const parsed = JSON.parse(await readFile(cacheOutput, "utf8")) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Reflect.get(parsed, "version") === 1 &&
      typeof Reflect.get(parsed, "entries") === "object" &&
      Reflect.get(parsed, "entries") !== null
    ) {
      return parsed as ImageBuildCache;
    }
  } catch (error) {
    const code = error instanceof Error && "code" in error ? Reflect.get(error, "code") : undefined;
    if (code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }
  return { version: 1, entries: {} };
}

async function writeAtomically(destination: string, contents: string): Promise<void> {
  const temporary = `${destination}.next-${process.pid}`;
  const backup = `${destination}.previous-${process.pid}`;
  await mkdir(path.dirname(destination), { recursive: true });
  await rm(temporary, { force: true });
  await rm(backup, { force: true });
  try {
    await writeFile(temporary, contents, "utf8");
    const hadDestination = await pathExists(destination);
    if (hadDestination) await rename(destination, backup);
    try {
      await rename(temporary, destination);
    } catch (error) {
      if (hadDestination && (await pathExists(backup))) {
        await rename(backup, destination);
      }
      throw error;
    }
    await rm(backup, { force: true });
  } finally {
    await rm(temporary, { force: true });
  }
}

async function replaceDirectoryAtomically(root: string, source: string, destination: string): Promise<void> {
  const backup = `${destination}.previous-${process.pid}`;
  assertDescendant(root, source, "temporary image output");
  assertDescendant(root, destination, "image output");
  assertDescendant(root, backup, "image output backup");
  await rm(backup, { recursive: true, force: true });

  const hadDestination = await pathExists(destination);
  if (hadDestination) await rename(destination, backup);
  try {
    await rename(source, destination);
  } catch (error) {
    if (hadDestination && (await pathExists(backup))) {
      await rename(backup, destination);
    }
    throw error;
  }
  await rm(backup, { recursive: true, force: true });
}

async function replaceFileAtomically(root: string, source: string, destination: string): Promise<void> {
  const backup = `${destination}.previous-${process.pid}`;
  assertDescendant(root, source, "temporary file output");
  assertDescendant(root, destination, "file output");
  assertDescendant(root, backup, "file output backup");
  await rm(backup, { force: true });

  const hadDestination = await pathExists(destination);
  if (hadDestination) await rename(destination, backup);
  try {
    await rename(source, destination);
  } catch (error) {
    if (hadDestination && (await pathExists(backup))) {
      await rename(backup, destination);
    }
    throw error;
  }
  await rm(backup, { force: true });
}

async function mapWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(workers);
}

async function buildVariant(task: VariantTask): Promise<void> {
  await mkdir(path.dirname(task.destination), { recursive: true });
  await sharp(task.source)
    .resize({
      width: task.width,
      height: task.width === 160 ? 200 : 760,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({
      quality: task.width === 160 ? 76 : 84,
      effort: 5,
      smartSubsample: true
    })
    .toFile(task.destination);
}

export async function buildImages(options: ImageBuildOptions = {}): Promise<ImageBuildResult> {
  const paths = buildPaths(options.root);
  const publicRoot = path.join(paths.root, "public");
  const temporaryOutput = `${paths.outputRoot}.next-${process.pid}`;
  assertDescendant(publicRoot, paths.outputRoot, "image output");
  assertDescendant(publicRoot, temporaryOutput, "temporary image output");

  const data: unknown = JSON.parse(await readFile(paths.dataSource, "utf8"));
  const publishedSourcePaths = publishedImageSourcePaths(data);
  const files = [...(await imageFiles(paths.sourceRoot))]
    .filter((file) => publishedSourcePaths.has(sourcePublicPath(paths, file)))
    .sort((left, right) => left.localeCompare(right, "en"));

  const destinations = new Map<string, string>();
  for (const source of files) {
    for (const width of widths) {
      const destination = variantDestination(paths, paths.outputRoot, source, width);
      const collisionKey = destination.toLocaleLowerCase("en-US");
      const previous = destinations.get(collisionKey);
      if (previous) {
        throw new Error(
          "Character image output collision: " +
            `${path.relative(paths.sourceRoot, previous)} and ` +
            `${path.relative(paths.sourceRoot, source)} both produce ` +
            path.relative(paths.outputRoot, destination)
        );
      }
      destinations.set(collisionKey, source);
    }
  }

  const previousCache = await readCache(paths.cacheOutput);
  const nextCacheEntries: Record<string, string> = {};
  const sourceFingerprints = new Map<string, Promise<string>>();
  const fingerprintFor = (source: string, width: (typeof widths)[number]) => {
    const key = `${source}\0${width}`;
    let fingerprint = sourceFingerprints.get(key);
    if (!fingerprint) {
      fingerprint = fileFingerprint(
        source,
        `${imageRecipeVersion}:${width}:${width === 160 ? 200 : 760}:${width === 160 ? 76 : 84}`
      );
      sourceFingerprints.set(key, fingerprint);
    }
    return fingerprint;
  };

  await rm(temporaryOutput, { recursive: true, force: true });
  await mkdir(temporaryOutput, { recursive: true });
  let cachedVariantCount = 0;
  const tasks = files.flatMap((source) =>
    widths.map(
      (width) =>
        ({
          source,
          width,
          destination: variantDestination(paths, temporaryOutput, source, width),
          cacheKey: `variant:${variantRelativePath(paths, source, width).replaceAll(path.sep, "/")}`
        }) satisfies VariantTask
    )
  );

  try {
    await mapWithConcurrency(tasks, Math.max(1, Math.floor(options.concurrency ?? 4)), async (task) => {
      const fingerprint = await fingerprintFor(task.source, task.width);
      nextCacheEntries[task.cacheKey] = fingerprint;
      const previousDestination = variantDestination(paths, paths.outputRoot, task.source, task.width);
      if (previousCache.entries[task.cacheKey] === fingerprint && (await pathExists(previousDestination))) {
        await mkdir(path.dirname(task.destination), { recursive: true });
        await copyFile(previousDestination, task.destination);
        cachedVariantCount += 1;
        return;
      }
      await buildVariant(task);
    });
    await replaceDirectoryAtomically(publicRoot, temporaryOutput, paths.outputRoot);
  } finally {
    await rm(temporaryOutput, { recursive: true, force: true });
  }

  const socialCacheKey = "social:og.png";
  const socialFingerprint = await fileFingerprint(paths.socialSource, socialRecipeVersion);
  nextCacheEntries[socialCacheKey] = socialFingerprint;
  const rebuiltSocialCard =
    previousCache.entries[socialCacheKey] !== socialFingerprint || !(await pathExists(paths.socialOutput));
  if (rebuiltSocialCard) {
    const temporarySocial = `${paths.socialOutput}.next-${process.pid}`;
    assertDescendant(publicRoot, temporarySocial, "temporary social image");
    await rm(temporarySocial, { force: true });
    try {
      await sharp(paths.socialSource)
        .resize(1200, 630, { fit: "cover", position: "centre" })
        .png({
          compressionLevel: 9,
          adaptiveFiltering: true,
          palette: true,
          quality: 88,
          effort: 10
        })
        .toFile(temporarySocial);
      await replaceFileAtomically(publicRoot, temporarySocial, paths.socialOutput);
    } finally {
      await rm(temporarySocial, { force: true });
    }
  }

  const rightsRecords = collectImageRightsRecords(data).map((record) => ({
    ...record,
    published: isRightsRecordPublishable(record),
    published_variants: isRightsRecordPublishable(record) ? generatedVariantPaths(record.image) : []
  }));
  const meta = typeof data === "object" && data !== null ? Reflect.get(data, "meta") : undefined;
  const contentRevision = typeof meta === "object" && meta !== null ? Reflect.get(meta, "content_revision") : undefined;
  await writeAtomically(
    paths.rightsManifestOutput,
    `${JSON.stringify(
      {
        schema_version: 1,
        ...(typeof contentRevision === "string" ? { content_revision: contentRevision } : {}),
        policy:
          "Verified images are published normally. An unverified-third-party image is published only when its record explicitly sets publish_unverified=true; that setting is an operator display choice, not evidence of ownership, permission, or a licence.",
        records: rightsRecords
      },
      null,
      2
    )}\n`
  );
  await writeAtomically(paths.cacheOutput, `${JSON.stringify({ version: 1, entries: nextCacheEntries }, null, 2)}\n`);

  return {
    sourceCount: files.length,
    variantCount: tasks.length,
    cachedVariantCount,
    unpublishedCount: rightsRecords.filter((record) => !record.published).length,
    rebuiltSocialCard
  };
}

async function runCli(): Promise<void> {
  const result = await buildImages();
  console.log(
    `Optimized ${result.sourceCount} enabled character images into ` +
      `${result.variantCount} variants (${result.cachedVariantCount} reused), ` +
      `left ${result.unpublishedCount} image records unpublished, and ` +
      `${result.rebuiltSocialCard ? "rebuilt" : "reused"} the social card.`
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
