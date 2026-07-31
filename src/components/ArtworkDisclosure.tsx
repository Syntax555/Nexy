import { imageRightsLabel, imageSourceName } from "../app/image-rights.js";
import type { ImageRef } from "../domain/index.js";

interface ArtworkDisclosureProps {
  readonly image: ImageRef;
  readonly className?: string;
}

export function ArtworkDisclosure({ image, className = "" }: ArtworkDisclosureProps) {
  const sourceName = imageSourceName(image.source_url);
  const rightsLabel = imageRightsLabel(image);

  return (
    <a
      class={`artwork-disclosure ${className}`.trim()}
      data-rights-status={image.rights_status}
      href={image.source_url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Source file page: ${sourceName}. ${rightsLabel}`}
    >
      <span>Source file page: {sourceName}</span>
      <small>{rightsLabel}</small>
    </a>
  );
}
