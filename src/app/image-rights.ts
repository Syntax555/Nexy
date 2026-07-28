import type { ImageRef } from "../domain/index.js";

const verifiedPublicDisplayStatuses = new Set<ImageRef["rights_status"]>([
  "original",
  "licensed",
  "public-domain",
  "permission"
]);

export function isImageEnabledForPublicDisplay(
  image: ImageRef | null | undefined
): image is ImageRef {
  return Boolean(
    image
    && (
      verifiedPublicDisplayStatuses.has(image.rights_status)
      || (
        image.rights_status === "unverified-third-party"
        && image.publish_unverified === true
      )
    )
  );
}

export function imageRightsLabel(image: ImageRef): string {
  if (image.rights_status === "unverified-third-party") {
    return "Rights unverified · no image licence claimed";
  }
  return image.rights_status
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function imageSourceName(sourceUrl: string): string {
  try {
    const hostname = new URL(sourceUrl).hostname.toLocaleLowerCase("en-US");
    if (hostname === "vsbattles.fandom.com") return "VS Battles Wiki";
    return hostname.replace(/^www\./, "");
  } catch {
    return "source page";
  }
}
