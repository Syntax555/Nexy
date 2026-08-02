import path from "node:path";
import { pathToFileURL } from "node:url";

export interface SiteSmokeOptions {
  readonly pageUrl: string;
  readonly marker?: string;
  readonly attempts?: number;
  readonly retryDelayMs?: number;
  readonly requestTimeoutMs?: number;
  readonly fetcher?: typeof fetch;
}

export interface SiteSmokeReport {
  readonly pageUrl: string;
  readonly canonicalUrl: string;
  readonly manifestUrl: string;
  readonly socialImageUrls: readonly string[];
  readonly brandingImageUrls: readonly string[];
  readonly appIconUrls: readonly string[];
  readonly moduleScriptUrls: readonly string[];
  readonly stylesheetUrls: readonly string[];
  readonly attempt: number;
}

interface PageMetadata {
  readonly canonicalUrl: string;
  readonly manifestUrl: string;
  readonly socialImageUrls: readonly string[];
  readonly brandingImageUrls: readonly string[];
  readonly moduleScriptUrls: readonly string[];
  readonly stylesheetUrls: readonly string[];
}

interface RemoteAsset {
  readonly label: string;
  readonly url: string | URL;
  readonly expectedContentTypes: readonly string[];
}

const defaultMarker = "Nexy Battle Lab";
const unresolvedTokenPattern = /__NEXY_[A-Z0-9_]+__/;
const contentTypes = {
  html: ["text/html"],
  manifest: ["application/manifest+json"],
  image: ["image/"],
  script: ["text/javascript", "application/javascript"],
  stylesheet: ["text/css"]
} as const;
const requiredAppIconSizes = ["192x192", "512x512"] as const;

function decodeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function parseAttributes(tag: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  const attributePattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of tag.matchAll(attributePattern)) {
    const name = match[1]?.toLowerCase();
    if (!name || name.startsWith("<")) continue;
    attributes.set(name, decodeHtmlAttribute(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return attributes;
}

function tags(html: string, name: string): readonly ReadonlyMap<string, string>[] {
  const tagPattern = new RegExp(`<${name}\\b[^>]*>`, "gi");
  return [...html.matchAll(tagPattern)].map((match) => parseAttributes(match[0]));
}

function metadataContent(html: string, key: "name" | "property", value: string): string | undefined {
  return tags(html, "meta")
    .find((attributes) => attributes.get(key)?.toLowerCase() === value)
    ?.get("content");
}

function linkHref(html: string, relationship: string): string | undefined {
  return tags(html, "link")
    .find((attributes) => attributes.get("rel")?.toLowerCase().split(/\s+/).includes(relationship))
    ?.get("href");
}

function linkHrefs(html: string, relationship: string): readonly string[] {
  return tags(html, "link").flatMap((attributes) => {
    const href = attributes.get("href");
    const relationships = attributes.get("rel")?.toLowerCase().split(/\s+/) ?? [];
    return href && relationships.includes(relationship) ? [href] : [];
  });
}

function hasAppRoot(html: string): boolean {
  return tags(html, "div").some((attributes) => attributes.get("id") === "app");
}

function normalizedPageUrl(value: string): URL {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Smoke URL must use HTTP or HTTPS: ${value}`);
  }
  url.hash = "";
  url.search = "";
  if (url.pathname.endsWith("/index.html")) {
    url.pathname = url.pathname.slice(0, -"index.html".length);
  } else if (!url.pathname.endsWith("/") && !path.posix.extname(url.pathname)) {
    url.pathname += "/";
  }
  return url;
}

function requireAbsoluteHttpUrl(label: string, value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL: ${value}`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${label} must use HTTP or HTTPS: ${value}`);
  }
  return url;
}

function resolveHttpUrl(label: string, value: string, baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(value, baseUrl);
  } catch {
    throw new Error(`${label} is not a valid URL: ${value}`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${label} must use HTTP or HTTPS: ${value}`);
  }
  return url;
}

function requiredLinkUrl(html: string, relationship: string, label: string): string {
  const href = linkHref(html, relationship);
  if (!href) throw new Error(`${label} link is missing.`);
  return requireAbsoluteHttpUrl(label, href).href;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function inspectDeployedManifest(manifest: string, manifestUrl: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifest);
  } catch {
    throw new Error("Web manifest is not valid JSON.");
  }
  const icons = isRecord(parsed) ? Reflect.get(parsed, "icons") : undefined;
  if (!Array.isArray(icons)) {
    throw new Error("Web manifest must contain an icons array.");
  }

  return requiredAppIconSizes.map((requiredSize) => {
    const icon = icons.find(
      (candidate) =>
        isRecord(candidate) &&
        typeof candidate.sizes === "string" &&
        candidate.sizes.toLowerCase().split(/\s+/).includes(requiredSize)
    );
    if (!isRecord(icon)) throw new Error(`Web manifest is missing its ${requiredSize} app icon.`);
    if (typeof icon.src !== "string" || !icon.src) {
      throw new Error(`Web manifest ${requiredSize} app icon is missing its src URL.`);
    }
    if (typeof icon.type !== "string" || !icon.type.toLowerCase().startsWith("image/")) {
      throw new Error(`Web manifest ${requiredSize} app icon must declare an image content type.`);
    }
    return resolveHttpUrl(`Web manifest ${requiredSize} app icon`, icon.src, manifestUrl).href;
  });
}

export function inspectDeployedHtml(html: string, pageUrl: string, marker = defaultMarker): PageMetadata {
  const expectedUrl = normalizedPageUrl(pageUrl);
  const unresolvedToken = html.match(unresolvedTokenPattern)?.[0];
  if (unresolvedToken) {
    throw new Error(`Unresolved site template token found: ${unresolvedToken}`);
  }
  if (!html.includes(marker) || !hasAppRoot(html)) {
    throw new Error(`Expected Nexy page marker or app root was not found: ${marker}`);
  }

  const canonicalValue = linkHref(html, "canonical");
  if (!canonicalValue) throw new Error("Canonical link is missing.");
  const canonicalUrl = requireAbsoluteHttpUrl("Canonical URL", canonicalValue);
  if (canonicalUrl.search || canonicalUrl.hash || normalizedPageUrl(canonicalUrl.href).href !== expectedUrl.href) {
    throw new Error(`Canonical URL mismatch: expected ${expectedUrl.href}, received ${canonicalUrl.href}`);
  }

  const openGraphUrlValue = metadataContent(html, "property", "og:url");
  if (!openGraphUrlValue) throw new Error("Open Graph URL is missing.");
  const openGraphUrl = requireAbsoluteHttpUrl("Open Graph URL", openGraphUrlValue);
  if (openGraphUrl.search || openGraphUrl.hash || normalizedPageUrl(openGraphUrl.href).href !== expectedUrl.href) {
    throw new Error(`Open Graph URL mismatch: expected ${expectedUrl.href}, received ${openGraphUrl.href}`);
  }

  const openGraphImage = metadataContent(html, "property", "og:image");
  const twitterImage = metadataContent(html, "name", "twitter:image");
  if (!openGraphImage || !twitterImage) {
    throw new Error("Open Graph and Twitter image metadata are required.");
  }
  const socialImageUrls = [
    requireAbsoluteHttpUrl("Open Graph image", openGraphImage).href,
    requireAbsoluteHttpUrl("Twitter image", twitterImage).href
  ];
  if (socialImageUrls[0] !== socialImageUrls[1]) {
    throw new Error("Open Graph and Twitter image metadata must reference the same asset.");
  }

  const manifestUrl = requiredLinkUrl(html, "manifest", "Web manifest");
  const brandingImageUrls = [
    requiredLinkUrl(html, "icon", "Favicon"),
    requiredLinkUrl(html, "apple-touch-icon", "Apple touch icon")
  ];
  const moduleScriptUrls = tags(html, "script").flatMap((attributes) => {
    const source = attributes.get("src");
    return attributes.get("type")?.toLowerCase() === "module" && source
      ? [resolveHttpUrl("Module script", source, expectedUrl.href).href]
      : [];
  });
  if (moduleScriptUrls.length === 0) throw new Error("A module script URL is required.");
  const stylesheetUrls = linkHrefs(html, "stylesheet").map(
    (href) => resolveHttpUrl("Stylesheet", href, expectedUrl.href).href
  );
  if (stylesheetUrls.length === 0) throw new Error("A stylesheet URL is required.");

  return {
    canonicalUrl: canonicalUrl.href,
    manifestUrl,
    socialImageUrls: [...new Set(socialImageUrls)],
    brandingImageUrls: [...new Set(brandingImageUrls)],
    moduleScriptUrls: [...new Set(moduleScriptUrls)],
    stylesheetUrls: [...new Set(stylesheetUrls)]
  };
}

async function requireSuccessfulResponse(
  response: Response,
  label: string,
  expectedContentTypes: readonly string[]
): Promise<void> {
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const mediaType = contentType.split(";", 1)[0]?.trim() ?? "";
  const matches = expectedContentTypes.some((expectedType) =>
    expectedType.endsWith("/") ? mediaType.startsWith(expectedType) : mediaType === expectedType
  );
  if (!matches) {
    throw new Error(`${label} returned an unexpected content type: ${contentType || "missing"}.`);
  }
}

async function fetchAsset(asset: RemoteAsset, requestTimeoutMs: number, fetcher: typeof fetch): Promise<Response> {
  const response = await fetcher(asset.url, {
    headers: { "user-agent": "Nexy deployment smoke check" },
    redirect: "follow",
    signal: AbortSignal.timeout(requestTimeoutMs)
  });
  await requireSuccessfulResponse(response, asset.label, asset.expectedContentTypes);
  return response;
}

function uniqueAssets(assets: readonly RemoteAsset[]): readonly RemoteAsset[] {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    const key = `${asset.url.toString()}\0${asset.expectedContentTypes.join("|")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function checkOnce(
  pageUrl: URL,
  marker: string,
  requestTimeoutMs: number,
  fetcher: typeof fetch
): Promise<Omit<SiteSmokeReport, "attempt">> {
  const response = await fetchAsset(
    {
      label: "Deployed page",
      url: pageUrl,
      expectedContentTypes: contentTypes.html
    },
    requestTimeoutMs,
    fetcher
  );
  const metadata = inspectDeployedHtml(await response.text(), pageUrl.href, marker);
  const manifestResponse = await fetchAsset(
    {
      label: "Web manifest",
      url: metadata.manifestUrl,
      expectedContentTypes: contentTypes.manifest
    },
    requestTimeoutMs,
    fetcher
  );
  const appIconUrls = inspectDeployedManifest(await manifestResponse.text(), metadata.manifestUrl);

  const deployedAssets = uniqueAssets([
    ...metadata.socialImageUrls.map((url) => ({
      label: `Social image ${url}`,
      url,
      expectedContentTypes: contentTypes.image
    })),
    ...metadata.brandingImageUrls.map((url) => ({
      label: `Branding image ${url}`,
      url,
      expectedContentTypes: contentTypes.image
    })),
    ...appIconUrls.map((url) => ({
      label: `App icon ${url}`,
      url,
      expectedContentTypes: contentTypes.image
    })),
    ...metadata.moduleScriptUrls.map((url) => ({
      label: `Module script ${url}`,
      url,
      expectedContentTypes: contentTypes.script
    })),
    ...metadata.stylesheetUrls.map((url) => ({
      label: `Stylesheet ${url}`,
      url,
      expectedContentTypes: contentTypes.stylesheet
    }))
  ]);
  await Promise.all(deployedAssets.map((asset) => fetchAsset(asset, requestTimeoutMs, fetcher)));

  return {
    pageUrl: pageUrl.href,
    canonicalUrl: metadata.canonicalUrl,
    manifestUrl: metadata.manifestUrl,
    socialImageUrls: metadata.socialImageUrls,
    brandingImageUrls: metadata.brandingImageUrls,
    appIconUrls,
    moduleScriptUrls: metadata.moduleScriptUrls,
    stylesheetUrls: metadata.stylesheetUrls
  };
}

function positiveInteger(value: number | undefined, fallback: number, label: string): number {
  const candidate = value ?? fallback;
  if (!Number.isInteger(candidate) || candidate < 1) throw new Error(`${label} must be a positive integer.`);
  return candidate;
}

export async function runSiteSmoke(options: SiteSmokeOptions): Promise<SiteSmokeReport> {
  const pageUrl = normalizedPageUrl(options.pageUrl);
  const attempts = positiveInteger(options.attempts, 6, "attempts");
  const requestTimeoutMs = positiveInteger(options.requestTimeoutMs, 15_000, "requestTimeoutMs");
  const retryDelayMs = options.retryDelayMs ?? 5_000;
  if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0) {
    throw new Error("retryDelayMs must be a non-negative integer.");
  }
  const fetcher = options.fetcher ?? fetch;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return {
        ...(await checkOnce(pageUrl, options.marker ?? defaultMarker, requestTimeoutMs, fetcher)),
        attempt
      };
    } catch (error) {
      lastError = error;
      if (attempt < attempts && retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Deployment smoke check failed after ${attempts} attempt(s): ${message}`, { cause: lastError });
}

function environmentInteger(name: string): number | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer.`);
  return parsed;
}

export async function main(): Promise<void> {
  const pageUrl = process.argv[2] ?? process.env.NEXY_SMOKE_URL;
  if (!pageUrl) throw new Error("Pass a deployment URL or set NEXY_SMOKE_URL.");
  const marker = process.env.NEXY_SMOKE_MARKER;
  const attempts = environmentInteger("NEXY_SMOKE_ATTEMPTS");
  const retryDelayMs = environmentInteger("NEXY_SMOKE_RETRY_MS");
  const requestTimeoutMs = environmentInteger("NEXY_SMOKE_TIMEOUT_MS");
  const report = await runSiteSmoke({
    pageUrl,
    ...(marker ? { marker } : {}),
    ...(attempts === undefined ? {} : { attempts }),
    ...(retryDelayMs === undefined ? {} : { retryDelayMs }),
    ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs })
  });
  const imageCount = new Set([...report.socialImageUrls, ...report.brandingImageUrls, ...report.appIconUrls]).size;
  const codeAssetCount = new Set([...report.moduleScriptUrls, ...report.stylesheetUrls]).size;
  console.log(
    `Verified ${report.pageUrl}, its manifest, ${imageCount} image(s), and ` +
      `${codeAssetCount} code asset(s) on attempt ${report.attempt}.`
  );
}

const directScript = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === directScript) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
