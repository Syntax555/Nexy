import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
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
const brandingRecipeVersion = "4";

const brandingIconSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="surface" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0" stop-color="#183b49" />
        <stop offset="0.56" stop-color="#171d2a" />
        <stop offset="1" stop-color="#30202d" />
      </linearGradient>
      <radialGradient id="glow" cx="22%" cy="18%" r="90%">
        <stop offset="0" stop-color="#4bdcff" stop-opacity="0.17" />
        <stop offset="1" stop-color="#4bdcff" stop-opacity="0" />
      </radialGradient>
    </defs>
    <rect width="512" height="512" fill="#090b12" />
    <rect x="24" y="24" width="464" height="464" rx="132" fill="url(#surface)" />
    <rect x="24" y="24" width="464" height="464" rx="132" fill="url(#glow)" />
    <rect x="30" y="30" width="452" height="452" rx="126" fill="none" stroke="#4bdcff" stroke-opacity="0.48" stroke-width="8" />
    <path fill="#f7f9fc" d="M145 382 196 130h66l58 157 32-157h67l-51 252h-65l-59-158-32 158z" />
  </svg>
`;

export interface ImageBuildBudgets {
  readonly thumbnailBytes: number;
  readonly portraitBytes: number;
  readonly socialBytes: number;
  readonly brandingAssetBytes: number;
  readonly aggregateBytes: number;
}

export const defaultImageBuildBudgets: ImageBuildBudgets = {
  thumbnailBytes: 16 * 1024,
  portraitBytes: 96 * 1024,
  socialBytes: 480 * 1024,
  brandingAssetBytes: 96 * 1024,
  aggregateBytes: 8 * 1024 * 1024
};

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
  readonly brandingOutputs: readonly BrandingOutput[];
  readonly dataSource: string;
  readonly rightsManifestOutput: string;
  readonly cacheOutput: string;
}

export interface ImageBuildOptions {
  readonly root?: string;
  readonly concurrency?: number;
  readonly budgets?: Partial<ImageBuildBudgets>;
}

export interface ImageBuildResult {
  readonly sourceCount: number;
  readonly variantCount: number;
  readonly cachedVariantCount: number;
  readonly unpublishedCount: number;
  readonly unverifiedPublishedCount: number;
  readonly rebuiltSocialCard: boolean;
  readonly rebuiltBrandingAssetCount: number;
  readonly totalOutputBytes: number;
}

interface VariantTask {
  readonly source: string;
  readonly width: (typeof widths)[number];
  readonly destination: string;
  readonly cacheKey: string;
}

interface BrandingOutput {
  readonly cacheKey: string;
  readonly destination: string;
  readonly size: number;
}

type ImageAssetRole = "thumbnail" | "portrait" | "social" | "branding";

const imageAssetRoles: Readonly<
  Record<ImageAssetRole, { readonly label: string; readonly budget: keyof ImageBuildBudgets }>
> = {
  thumbnail: { label: "Thumbnail", budget: "thumbnailBytes" },
  portrait: { label: "Portrait", budget: "portraitBytes" },
  social: { label: "Social image", budget: "socialBytes" },
  branding: { label: "Branding image", budget: "brandingAssetBytes" }
};

interface ImageAsset {
  readonly displayPath: string;
  readonly file: string;
  readonly role: ImageAssetRole;
}

function buildPaths(rootOption?: string): ImageBuildPaths {
  const root = path.resolve(rootOption ?? defaultRoot);
  return {
    root,
    sourceRoot: path.join(root, "content", "images", "characters"),
    outputRoot: path.join(root, "public", "images", "generated"),
    socialSource: path.join(root, "content", "images", "og-source.png"),
    socialOutput: path.join(root, "public", "og.png"),
    brandingOutputs: [
      { cacheKey: "branding:favicon-32.png", destination: path.join(root, "public", "favicon-32.png"), size: 32 },
      {
        cacheKey: "branding:apple-touch-icon.png",
        destination: path.join(root, "public", "apple-touch-icon.png"),
        size: 180
      },
      {
        cacheKey: "branding:app-icon-192.png",
        destination: path.join(root, "public", "app-icon-192.png"),
        size: 192
      },
      {
        cacheKey: "branding:app-icon-512.png",
        destination: path.join(root, "public", "app-icon-512.png"),
        size: 512
      }
    ],
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

function fingerprint(source: string | Buffer, recipe: string): string {
  return createHash("sha256").update(recipe).update("\0").update(source).digest("hex");
}

async function fileFingerprint(file: string, recipe: string): Promise<string> {
  return fingerprint(await readFile(file), recipe);
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
  try {
    await writeFile(temporary, contents, "utf8");
    await replacePathAtomically(temporary, destination, backup, false);
  } finally {
    await rm(temporary, { force: true });
  }
}

const transientRenameErrors = new Set(["EACCES", "EBUSY", "ENOTEMPTY", "EPERM"]);

async function renameWithRetry(source: string, destination: string): Promise<void> {
  const retryDelays = [25, 50, 100, 200, 400, 800] as const;
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      const code = error instanceof Error && "code" in error ? Reflect.get(error, "code") : undefined;
      const retryDelay = retryDelays[attempt];
      if (typeof code !== "string" || !transientRenameErrors.has(code) || retryDelay === undefined) throw error;
      await delay(retryDelay);
    }
  }
}

async function replacePathAtomically(
  source: string,
  destination: string,
  backup: string,
  recursive: boolean
): Promise<void> {
  const removeBackup = () => rm(backup, { recursive, force: true });
  await removeBackup();
  const hadDestination = await pathExists(destination);
  if (hadDestination) await renameWithRetry(destination, backup);
  try {
    await renameWithRetry(source, destination);
  } catch (error) {
    if (hadDestination && (await pathExists(backup))) await renameWithRetry(backup, destination);
    throw error;
  }
  await removeBackup();
}

async function replaceDirectoryAtomically(root: string, source: string, destination: string): Promise<void> {
  const backup = `${destination}.previous-${process.pid}`;
  assertDescendant(root, source, "temporary image output");
  assertDescendant(root, destination, "image output");
  assertDescendant(root, backup, "image output backup");
  await replacePathAtomically(source, destination, backup, true);
}

async function replaceFileAtomically(root: string, source: string, destination: string): Promise<void> {
  const backup = `${destination}.previous-${process.pid}`;
  assertDescendant(root, source, "temporary file output");
  assertDescendant(root, destination, "file output");
  assertDescendant(root, backup, "file output backup");
  await replacePathAtomically(source, destination, backup, false);
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

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KiB`;
}

function resolveBudgets(overrides?: Partial<ImageBuildBudgets>): ImageBuildBudgets {
  const budgets = { ...defaultImageBuildBudgets, ...overrides };
  for (const [name, value] of Object.entries(budgets)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`Image budget ${name} must be a positive integer number of bytes.`);
    }
  }
  return budgets;
}

async function assertImageBudgets(assets: readonly ImageAsset[], budgets: ImageBuildBudgets): Promise<number> {
  const measured = await Promise.all(
    assets.map(async (asset) => ({
      ...asset,
      bytes: (await stat(asset.file)).size
    }))
  );
  for (const asset of measured) {
    const role = imageAssetRoles[asset.role];
    const limit = budgets[role.budget];
    if (asset.bytes > limit) {
      throw new Error(
        `${role.label} budget exceeded for ${asset.displayPath}: ` +
          `${formatBytes(asset.bytes)} (limit ${formatBytes(limit)}).`
      );
    }
  }

  const totalBytes = measured.reduce((total, asset) => total + asset.bytes, 0);
  if (totalBytes > budgets.aggregateBytes) {
    throw new Error(
      `Generated image aggregate budget exceeded: ${formatBytes(totalBytes)} ` +
        `(limit ${formatBytes(budgets.aggregateBytes)} across ${measured.length} assets).`
    );
  }
  return totalBytes;
}

async function buildBrandingIcon(destination: string, size: number): Promise<void> {
  await sharp(Buffer.from(brandingIconSvg))
    .resize(size, size, {
      fit: "fill"
    })
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      palette: true,
      quality: 90,
      effort: 10
    })
    .toFile(destination);
}

export async function buildImages(options: ImageBuildOptions = {}): Promise<ImageBuildResult> {
  const paths = buildPaths(options.root);
  const budgets = resolveBudgets(options.budgets);
  const publicRoot = path.join(paths.root, "public");
  const temporaryOutput = `${paths.outputRoot}.next-${process.pid}`;
  const temporarySocial = `${paths.socialOutput}.next-${process.pid}`;
  const temporaryBranding = paths.brandingOutputs.map((output) => ({
    ...output,
    temporary: `${output.destination}.next-${process.pid}`
  }));
  assertDescendant(publicRoot, paths.outputRoot, "image output");
  assertDescendant(publicRoot, temporaryOutput, "temporary image output");
  assertDescendant(publicRoot, temporarySocial, "temporary social image");
  for (const output of temporaryBranding) {
    assertDescendant(publicRoot, output.temporary, "temporary branding image");
  }

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

  const socialCacheKey = "social:og.png";
  const socialFingerprint = await fileFingerprint(paths.socialSource, socialRecipeVersion);
  nextCacheEntries[socialCacheKey] = socialFingerprint;
  const rebuiltSocialCard =
    previousCache.entries[socialCacheKey] !== socialFingerprint || !(await pathExists(paths.socialOutput));
  let rebuiltBrandingAssetCount = 0;
  let totalOutputBytes = 0;

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
    await rm(temporarySocial, { force: true });
    if (rebuiltSocialCard) {
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
    }

    const brandingAssets: ImageAsset[] = [];
    for (const output of temporaryBranding) {
      const brandingFingerprint = fingerprint(
        brandingIconSvg,
        `${brandingRecipeVersion}:${output.size}:nexy-brand-mark`
      );
      nextCacheEntries[output.cacheKey] = brandingFingerprint;
      const rebuilt =
        previousCache.entries[output.cacheKey] !== brandingFingerprint || !(await pathExists(output.destination));
      await rm(output.temporary, { force: true });
      if (rebuilt) {
        await buildBrandingIcon(output.temporary, output.size);
        rebuiltBrandingAssetCount += 1;
      }
      brandingAssets.push({
        displayPath: path.basename(output.destination),
        file: rebuilt ? output.temporary : output.destination,
        role: "branding"
      });
    }

    const generatedAssets: ImageAsset[] = [
      ...tasks.map((task) => ({
        displayPath: path
          .relative(publicRoot, variantDestination(paths, paths.outputRoot, task.source, task.width))
          .replaceAll(path.sep, "/"),
        file: task.destination,
        role: task.width === 160 ? ("thumbnail" as const) : ("portrait" as const)
      })),
      {
        displayPath: path.basename(paths.socialOutput),
        file: rebuiltSocialCard ? temporarySocial : paths.socialOutput,
        role: "social"
      },
      ...brandingAssets
    ];
    totalOutputBytes = await assertImageBudgets(generatedAssets, budgets);

    await replaceDirectoryAtomically(publicRoot, temporaryOutput, paths.outputRoot);
    if (rebuiltSocialCard) {
      await replaceFileAtomically(publicRoot, temporarySocial, paths.socialOutput);
    }
    for (const output of temporaryBranding) {
      if (await pathExists(output.temporary)) {
        await replaceFileAtomically(publicRoot, output.temporary, output.destination);
      }
    }
  } finally {
    await rm(temporaryOutput, { recursive: true, force: true });
    await rm(temporarySocial, { force: true });
    await Promise.all(temporaryBranding.map((output) => rm(output.temporary, { force: true })));
  }

  const rightsRecords = collectImageRightsRecords(data).map((record) => ({
    ...record,
    published: isRightsRecordPublishable(record),
    published_variants: isRightsRecordPublishable(record) ? generatedVariantPaths(record.image) : []
  }));
  const publishedCount = rightsRecords.filter((record) => record.published).length;
  const unpublishedCount = rightsRecords.length - publishedCount;
  const unverifiedPublishedCount = rightsRecords.filter(
    (record) => record.published && record.rights_status === "unverified-third-party"
  ).length;
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
        summary: {
          total_records: rightsRecords.length,
          published_records: publishedCount,
          unpublished_records: unpublishedCount,
          unverified_published_records: unverifiedPublishedCount
        },
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
    unpublishedCount,
    unverifiedPublishedCount,
    rebuiltSocialCard,
    rebuiltBrandingAssetCount,
    totalOutputBytes
  };
}

async function runCli(): Promise<void> {
  const result = await buildImages();
  console.log(
    `Optimized ${result.sourceCount} enabled character images into ` +
      `${result.variantCount} variants (${result.cachedVariantCount} reused), ` +
      `left ${result.unpublishedCount} image records unpublished, and ` +
      `${result.rebuiltSocialCard ? "rebuilt" : "reused"} the social card. ` +
      `${result.rebuiltBrandingAssetCount} branding assets rebuilt; ` +
      `${formatBytes(result.totalOutputBytes)} generated in total.`
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
