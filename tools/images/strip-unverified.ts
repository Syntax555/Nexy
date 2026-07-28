import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";

import { publishableImagePaths } from "./publish-policy.js";

const projectRoot = path.resolve(".");
const distRoot = path.join(projectRoot, "dist");
const dataPath = path.join(projectRoot, "src", "generated", "nexy-data.json");

async function filesBelow(directory: string): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    const code = error instanceof Error && "code" in error
      ? Reflect.get(error, "code")
      : undefined;
    if (code === "ENOENT") return [];
    throw error;
  }

  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory()
      ? filesBelow(absolute)
      : entry.isFile()
        ? [absolute]
        : [];
  }));
  return nested.flat();
}

async function stripDirectory(
  directory: string,
  publicPrefix: string,
  approvedPaths: ReadonlySet<string>
): Promise<number> {
  const relativeRoot = path.relative(distRoot, directory);
  if (
    !relativeRoot
    || relativeRoot.startsWith("..")
    || path.isAbsolute(relativeRoot)
  ) {
    throw new Error(`Refusing to strip unsafe output path ${directory}`);
  }

  let removed = 0;
  for (const file of await filesBelow(directory)) {
    const relative = path.relative(directory, file).replaceAll(path.sep, "/");
    const publicPath = `${publicPrefix}/${relative}`;
    if (approvedPaths.has(publicPath)) continue;
    await rm(file);
    removed += 1;
  }
  return removed;
}

const data: unknown = JSON.parse(await readFile(dataPath, "utf8"));
const approvedPaths = publishableImagePaths(data);
const removedOriginals = await stripDirectory(
  path.join(distRoot, "images", "characters"),
  "images/characters",
  approvedPaths
);
const removedVariants = await stripDirectory(
  path.join(distRoot, "images", "generated"),
  "images/generated",
  approvedPaths
);

console.log(
  `Withheld ${removedOriginals} unapproved source assets and ${removedVariants} unapproved generated assets from dist.`
);
