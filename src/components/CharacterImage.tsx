import { useEffect, useState } from "preact/hooks";

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
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

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
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
