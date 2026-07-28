import type { ImageRef } from "../domain/index.js";

const publicDisplayStatuses = new Set<ImageRef["rights_status"]>([
  "original",
  "licensed",
  "public-domain",
  "permission"
]);

export function isImageApprovedForPublicDisplay(
  image: ImageRef | null | undefined
): image is ImageRef {
  return Boolean(image && publicDisplayStatuses.has(image.rights_status));
}
