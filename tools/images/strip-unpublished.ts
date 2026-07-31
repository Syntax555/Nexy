import type { Dirent } from "node:fs";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { publishedImageVariantPaths } from "./publish-policy.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(moduleDirectory, "../..");

export interface StripUnpublishedOptions {
  readonly root?: string;
}

export interface StripUnpublishedResult {
  readonly removedOriginals: number;
  readonly removedUnpublishedVariants: number;
}

async function filesBelow(directory: string): Promise<readonly string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? Reflect.get(error, "code") : undefined;
    if (code === "ENOENT") return [];
    throw error;
  }

  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? filesBelow(absolute) : entry.isFile() ? [absolute] : [];
    })
  );
  return nested.flat();
}

async function stripDirectory(
  distRoot: string,
  directory: string,
  publicPrefix: string,
  publishedPaths: ReadonlySet<string>
): Promise<number> {
  const relativeRoot = path.relative(distRoot, directory);
  if (!relativeRoot || relativeRoot.startsWith("..") || path.isAbsolute(relativeRoot)) {
    throw new Error(`Refusing to strip unsafe output path ${directory}`);
  }

  let removed = 0;
  for (const file of await filesBelow(directory)) {
    const relative = path.relative(directory, file).replaceAll(path.sep, "/");
    const publicPath = `${publicPrefix}/${relative}`;
    if (publishedPaths.has(publicPath)) continue;
    await rm(file);
    removed += 1;
  }
  return removed;
}

export async function stripUnpublishedImages(options: StripUnpublishedOptions = {}): Promise<StripUnpublishedResult> {
  const projectRoot = path.resolve(options.root ?? defaultRoot);
  const distRoot = path.join(projectRoot, "dist");
  const dataPath = path.join(projectRoot, "src", "generated", "nexy-data.json");
  const data: unknown = JSON.parse(await readFile(dataPath, "utf8"));
  const publishedVariantPaths = publishedImageVariantPaths(data);
  const removedOriginals = await stripDirectory(
    distRoot,
    path.join(distRoot, "images", "characters"),
    "images/characters",
    new Set()
  );
  const removedUnpublishedVariants = await stripDirectory(
    distRoot,
    path.join(distRoot, "images", "generated"),
    "images/generated",
    publishedVariantPaths
  );
  return { removedOriginals, removedUnpublishedVariants };
}

async function runCli(): Promise<void> {
  const result = await stripUnpublishedImages();
  console.log(
    `Removed ${result.removedOriginals} full-size source assets and ` +
      `${result.removedUnpublishedVariants} unpublished generated assets from dist.`
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
