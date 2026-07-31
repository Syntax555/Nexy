import path from "node:path";

export interface ImageRightsRecord {
  readonly image: string;
  readonly source_url: string;
  readonly rights_status: string;
  readonly publish_unverified?: boolean;
  readonly creator?: string | null;
  readonly rights_holder?: string | null;
  readonly license?: string | null;
  readonly reviewed_on?: string | null;
}

const verifiedPublicDisplayStatuses = new Set(["original", "licensed", "public-domain", "permission"]);
const generatedWidths = [160, 640] as const;
const characterImagePrefix = "images/characters/";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(record: Readonly<Record<string, unknown>>, key: string): string | null | undefined {
  const value = Reflect.get(record, key);
  return typeof value === "string" || value === null ? value : undefined;
}

function optionalBoolean(record: Readonly<Record<string, unknown>>, key: string): boolean | undefined {
  const value = Reflect.get(record, key);
  return typeof value === "boolean" ? value : undefined;
}

function asRightsRecord(value: unknown): ImageRightsRecord | null {
  if (!isRecord(value)) return null;
  const image = Reflect.get(value, "image");
  const sourceUrl = Reflect.get(value, "source_url");
  const rightsStatus = Reflect.get(value, "rights_status");
  if (typeof image !== "string" || typeof sourceUrl !== "string" || typeof rightsStatus !== "string") {
    return null;
  }

  const creator = optionalString(value, "creator");
  const rightsHolder = optionalString(value, "rights_holder");
  const license = optionalString(value, "license");
  const reviewedOn = optionalString(value, "reviewed_on");
  const publishUnverified = optionalBoolean(value, "publish_unverified");
  return {
    image: image.replaceAll("\\", "/"),
    source_url: sourceUrl,
    rights_status: rightsStatus,
    ...(publishUnverified === undefined ? {} : { publish_unverified: publishUnverified }),
    ...(creator === undefined ? {} : { creator }),
    ...(rightsHolder === undefined ? {} : { rights_holder: rightsHolder }),
    ...(license === undefined ? {} : { license }),
    ...(reviewedOn === undefined ? {} : { reviewed_on: reviewedOn })
  };
}

export function collectImageRightsRecords(data: unknown): readonly ImageRightsRecord[] {
  const records: ImageRightsRecord[] = [];

  const visit = (value: unknown): void => {
    const rightsRecord = asRightsRecord(value);
    if (rightsRecord) records.push(rightsRecord);

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    Object.values(value).forEach(visit);
  };

  visit(data);
  const sorted = records.sort(
    (left, right) => left.image.localeCompare(right.image) || left.source_url.localeCompare(right.source_url)
  );
  const seen = new Set<string>();
  return sorted.filter((record) => {
    const key = JSON.stringify(record);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isRightsRecordPublishable(record: ImageRightsRecord): boolean {
  return (
    verifiedPublicDisplayStatuses.has(record.rights_status) ||
    (record.rights_status === "unverified-third-party" && record.publish_unverified === true)
  );
}

export function generatedVariantPaths(image: string): readonly string[] {
  const normalized = image.replaceAll("\\", "/");
  if (!normalized.startsWith(characterImagePrefix) || !/\.(?:avif|jpe?g|png|webp)$/i.test(normalized)) {
    return [];
  }

  const relative = normalized.slice(characterImagePrefix.length);
  const extension = path.posix.extname(relative);
  const stem = relative.slice(0, -extension.length);
  return generatedWidths.map((width) => `images/generated/${stem}-${width}.webp`);
}

export function publishedImageSourcePaths(data: unknown): ReadonlySet<string> {
  const recordsByImage = new Map<string, ImageRightsRecord[]>();
  for (const record of collectImageRightsRecords(data)) {
    const records = recordsByImage.get(record.image) ?? [];
    records.push(record);
    recordsByImage.set(record.image, records);
  }

  const paths = new Set<string>();
  for (const [image, records] of recordsByImage) {
    if (!records.every(isRightsRecordPublishable)) continue;
    paths.add(image);
  }
  return paths;
}

export function publishedImageVariantPaths(data: unknown): ReadonlySet<string> {
  const paths = new Set<string>();
  for (const image of publishedImageSourcePaths(data)) {
    generatedVariantPaths(image).forEach((variant) => {
      paths.add(variant);
    });
  }
  return paths;
}
