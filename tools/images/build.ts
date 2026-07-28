import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import {
  collectImageRightsRecords,
  isRightsRecordPublishable,
  publishableImagePaths
} from "./publish-policy.js";

const sourceRoot = path.resolve("public/images/characters");
const outputRoot = path.resolve("public/images/generated");
const socialSource = path.resolve("content/images/og-source.png");
const socialOutput = path.resolve("public/og.png");
const dataSource = path.resolve("src/generated/nexy-data.json");
const rightsManifestOutput = path.resolve("public/image-rights.json");
const widths = [160, 640] as const;

async function imageFiles(directory: string): Promise<readonly string[]> {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return imageFiles(absolute);
    if (!entry.isFile() || !/\.(?:avif|jpe?g|png|webp)$/i.test(entry.name)) return [];
    return [absolute];
  }));

  return nested.flat();
}

function variantDestination(
  source: string,
  width: (typeof widths)[number]
): string {
  const relative = path.relative(sourceRoot, source);
  const parsed = path.parse(relative);
  return path.join(outputRoot, parsed.dir, `${parsed.name}-${width}.webp`);
}

async function buildVariant(source: string, width: (typeof widths)[number]): Promise<void> {
  const destination = variantDestination(source, width);

  await mkdir(path.dirname(destination), { recursive: true });
  await sharp(source)
    .resize({
      width,
      height: width === 160 ? 200 : 760,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({
      quality: width === 160 ? 76 : 84,
      effort: 5,
      smartSubsample: true
    })
    .toFile(destination);
}

const data: unknown = JSON.parse(await readFile(dataSource, "utf8"));
const publishablePaths = publishableImagePaths(data);
const files = [...await imageFiles(sourceRoot)]
  .filter((file) => {
    const relative = path.relative(path.resolve("public"), file).replaceAll(path.sep, "/");
    return publishablePaths.has(relative);
  })
  .sort((left, right) => left.localeCompare(right));
const destinations = new Map<string, string>();
for (const source of files) {
  for (const width of widths) {
    const destination = variantDestination(source, width);
    const collisionKey = destination.toLocaleLowerCase("en-US");
    const previous = destinations.get(collisionKey);
    if (previous) {
      throw new Error(
        "Character image output collision: "
        + `${path.relative(sourceRoot, previous)} and ${path.relative(sourceRoot, source)} `
        + `both produce ${path.relative(outputRoot, destination)}`
      );
    }
    destinations.set(collisionKey, source);
  }
}

await rm(outputRoot, { recursive: true, force: true });
await Promise.all(files.flatMap((file) => widths.map((width) => buildVariant(file, width))));

await sharp(socialSource)
  .resize(1200, 630, { fit: "cover", position: "centre" })
  .png({
    compressionLevel: 9,
    adaptiveFiltering: true,
    palette: true,
    quality: 88,
    effort: 10
  })
  .toFile(`${socialOutput}.next`);
await rm(socialOutput, { force: true });
await rename(`${socialOutput}.next`, socialOutput);

const rightsRecords = collectImageRightsRecords(data).map((record) => ({
  ...record,
  published: isRightsRecordPublishable(record)
}));
await writeFile(
  rightsManifestOutput,
  `${JSON.stringify({
    generated_on: new Date().toISOString().slice(0, 10),
    policy: "Only original, licensed, public-domain, or permission-backed images are published.",
    records: rightsRecords
  }, null, 2)}\n`,
  "utf8"
);

console.log(
  `Optimized ${files.length} approved character images into ${files.length * widths.length} variants, `
  + `withheld ${rightsRecords.filter((record) => !record.published).length} unverified records, `
  + "and rebuilt the social card."
);
