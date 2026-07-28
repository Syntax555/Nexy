import { useState } from "preact/hooks";

interface CharacterImageProps {
  readonly src: string;
  readonly alt: string;
  readonly loading?: "eager" | "lazy";
}

export function CharacterImage({
  src,
  alt,
  loading = "lazy"
}: CharacterImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;
  const loaded = loadedSrc === src;

  if (failed || !src) {
    if (!alt) {
      return <span class="image-fallback" aria-hidden="true">?</span>;
    }
    return (
      <span class="image-fallback" role="img" aria-label={`${alt} image unavailable`}>
        {alt.trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }

  return (
    <img
      class="character-image"
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      data-loaded={loaded ? "true" : "false"}
      onLoad={() => setLoadedSrc(src)}
      onError={() => setFailedSrc(src)}
    />
  );
}
