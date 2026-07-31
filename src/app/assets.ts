const localCharacterImage = /^images\/characters\/(.+)\.(?:avif|jpe?g|png|webp)$/i;

export function assetUrl(path: string): string {
  if (!path || /^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith("data:")) return path;
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}

export function characterImageVariant(path: string, width: 160 | 640): string {
  const match = localCharacterImage.exec(path);
  if (!match?.[1]) return assetUrl(path);
  return assetUrl(`images/generated/${match[1]}-${width}.webp`);
}
