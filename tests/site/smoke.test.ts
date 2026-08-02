import { describe, expect, it, vi } from "vitest";

import { inspectDeployedHtml, inspectDeployedManifest, runSiteSmoke } from "../../tools/site/smoke.js";

const pageUrl = "https://example.com/Nexy/";
const manifestUrl = "https://example.com/Nexy/site.webmanifest";
const socialImageUrl = "https://example.com/Nexy/og.png";
const faviconUrl = "https://example.com/Nexy/favicon-32.png";
const appleTouchIconUrl = "https://example.com/Nexy/apple-touch-icon.png";
const appIcon192Url = "https://example.com/Nexy/app-icon-192.png";
const appIcon512Url = "https://example.com/Nexy/app-icon-512.png";
const moduleScriptUrl = "https://example.com/Nexy/assets/main.js";
const stylesheetUrl = "https://example.com/Nexy/assets/main.css";

interface PageHtmlOverrides {
  readonly canonical?: string;
  readonly ogUrl?: string;
  readonly ogImage?: string;
  readonly twitterImage?: string;
  readonly manifest?: string | null;
  readonly favicon?: string | null;
  readonly appleTouchIcon?: string | null;
  readonly moduleScript?: string | null;
  readonly stylesheet?: string | null;
}

interface FakeResource {
  readonly body: string;
  readonly contentType: string;
  readonly status?: number;
}

function optionalLink(relationship: string, override: string | null | undefined, fallback: string): string {
  return override === null ? "" : `<link href="${override ?? fallback}" rel="${relationship}">`;
}

function pageHtml(overrides: PageHtmlOverrides = {}): string {
  return `<!doctype html>
    <html>
      <head>
        <title>Nexy Battle Lab</title>
        <link href="${overrides.canonical ?? pageUrl}" rel="alternate canonical">
        ${optionalLink("manifest", overrides.manifest, manifestUrl)}
        ${optionalLink("icon", overrides.favicon, faviconUrl)}
        ${optionalLink("apple-touch-icon", overrides.appleTouchIcon, appleTouchIconUrl)}
        ${optionalLink("stylesheet", overrides.stylesheet, "/Nexy/assets/main.css")}
        <meta content="${overrides.ogUrl ?? pageUrl}" property="og:url">
        <meta content="${overrides.ogImage ?? socialImageUrl}" property="og:image">
        <meta content="${overrides.twitterImage ?? socialImageUrl}" name="twitter:image">
      </head>
      <body>
        <div class="shell" id="app"></div>
        ${
          overrides.moduleScript === null
            ? ""
            : `<script src="${overrides.moduleScript ?? "/Nexy/assets/main.js"}" type="module"></script>`
        }
      </body>
    </html>`;
}

function webManifest(
  icons: readonly Readonly<{ src: string; sizes: string; type: string }>[] = [
    { src: appIcon192Url, sizes: "192x192", type: "image/png" },
    { src: appIcon512Url, sizes: "512x512", type: "image/png" }
  ]
): string {
  return JSON.stringify({ icons });
}

function response(resource: FakeResource): Response {
  return new Response(resource.body, {
    status: resource.status ?? 200,
    headers: { "content-type": resource.contentType }
  });
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function deployedResource(url: string, overrides: Readonly<Record<string, FakeResource>> = {}): Response {
  const resources: Readonly<Record<string, FakeResource>> = {
    [pageUrl]: { body: pageHtml(), contentType: "text/html; charset=utf-8" },
    [manifestUrl]: { body: webManifest(), contentType: "application/manifest+json" },
    [socialImageUrl]: { body: "social image", contentType: "image/png" },
    [faviconUrl]: { body: "favicon", contentType: "image/png" },
    [appleTouchIconUrl]: { body: "apple icon", contentType: "image/png" },
    [appIcon192Url]: { body: "192 icon", contentType: "image/png" },
    [appIcon512Url]: { body: "512 icon", contentType: "image/png" },
    [moduleScriptUrl]: { body: "export {};", contentType: "text/javascript" },
    [stylesheetUrl]: { body: "body {}", contentType: "text/css" },
    ...overrides
  };
  return response(resources[url] ?? { body: "missing", contentType: "text/plain", status: 404 });
}

function successfulFetcher(overrides: Readonly<Record<string, FakeResource>> = {}) {
  return vi.fn<typeof fetch>(async (input) => deployedResource(requestUrl(input), overrides));
}

describe("deployment smoke check", () => {
  it("extracts canonical, metadata, and critical assets independent of attribute order", () => {
    expect(inspectDeployedHtml(pageHtml(), "https://example.com/Nexy")).toEqual({
      canonicalUrl: pageUrl,
      manifestUrl,
      socialImageUrls: [socialImageUrl],
      brandingImageUrls: [faviconUrl, appleTouchIconUrl],
      moduleScriptUrls: [moduleScriptUrl],
      stylesheetUrls: [stylesheetUrl]
    });
  });

  it("extracts the required app icons from the web manifest", () => {
    expect(
      inspectDeployedManifest(
        webManifest([
          { src: "app-icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/Nexy/app-icon-512.png", sizes: "512x512", type: "image/png" }
        ]),
        manifestUrl
      )
    ).toEqual([appIcon192Url, appIcon512Url]);
  });

  it("rejects missing markers, unresolved tokens, and inconsistent metadata", () => {
    expect(() => inspectDeployedHtml(pageHtml().replace("Nexy Battle Lab", "Different site"), pageUrl)).toThrow(
      /page marker/
    );
    expect(() => inspectDeployedHtml(`${pageHtml()} __NEXY_SITE_URL__`, pageUrl)).toThrow(/Unresolved/);
    expect(() => inspectDeployedHtml(pageHtml({ canonical: "https://example.com/wrong/" }), pageUrl)).toThrow(
      /Canonical URL mismatch/
    );
    expect(() => inspectDeployedHtml(pageHtml({ canonical: `${pageUrl}?preview=true` }), pageUrl)).toThrow(
      /Canonical URL mismatch/
    );
    expect(() => inspectDeployedHtml(pageHtml({ ogUrl: "https://example.com/wrong/" }), pageUrl)).toThrow(
      /Open Graph URL mismatch/
    );
    expect(() =>
      inspectDeployedHtml(pageHtml({ twitterImage: "https://cdn.example.com/different.png" }), pageUrl)
    ).toThrow(/same asset/);
    expect(() => inspectDeployedHtml(pageHtml({ manifest: null }), pageUrl)).toThrow(/manifest link is missing/i);
    expect(() => inspectDeployedHtml(pageHtml({ favicon: null }), pageUrl)).toThrow(/favicon link is missing/i);
    expect(() => inspectDeployedHtml(pageHtml({ appleTouchIcon: null }), pageUrl)).toThrow(
      /apple touch icon link is missing/i
    );
    expect(() => inspectDeployedHtml(pageHtml({ moduleScript: null }), pageUrl)).toThrow(/module script URL/i);
    expect(() => inspectDeployedHtml(pageHtml({ stylesheet: null }), pageUrl)).toThrow(/stylesheet URL/i);
  });

  it("rejects malformed manifests and incomplete app-icon metadata", () => {
    expect(() => inspectDeployedManifest("not json", manifestUrl)).toThrow(/not valid JSON/);
    expect(() => inspectDeployedManifest(JSON.stringify({}), manifestUrl)).toThrow(/icons array/);
    expect(() =>
      inspectDeployedManifest(webManifest([{ src: appIcon192Url, sizes: "192x192", type: "image/png" }]), manifestUrl)
    ).toThrow(/missing its 512x512 app icon/);
    expect(() =>
      inspectDeployedManifest(
        webManifest([
          { src: appIcon192Url, sizes: "192x192", type: "text/plain" },
          { src: appIcon512Url, sizes: "512x512", type: "image/png" }
        ]),
        manifestUrl
      )
    ).toThrow(/must declare an image content type/);
  });

  it("checks the deployed HTML, manifest, images, scripts, and stylesheets", async () => {
    const fetcher = successfulFetcher();

    await expect(runSiteSmoke({ pageUrl, attempts: 1, fetcher })).resolves.toMatchObject({
      pageUrl,
      canonicalUrl: pageUrl,
      manifestUrl,
      socialImageUrls: [socialImageUrl],
      brandingImageUrls: [faviconUrl, appleTouchIconUrl],
      appIconUrls: [appIcon192Url, appIcon512Url],
      moduleScriptUrls: [moduleScriptUrl],
      stylesheetUrls: [stylesheetUrl],
      attempt: 1
    });
    expect(fetcher.mock.calls.map(([input]) => requestUrl(input))).toEqual([
      pageUrl,
      manifestUrl,
      socialImageUrl,
      faviconUrl,
      appleTouchIconUrl,
      appIcon192Url,
      appIcon512Url,
      moduleScriptUrl,
      stylesheetUrl
    ]);
    expect(fetcher).toHaveBeenNthCalledWith(1, new URL(pageUrl), expect.objectContaining({ redirect: "follow" }));
  });

  it("rejects incorrect manifest and critical-asset content types", async () => {
    await expect(
      runSiteSmoke({
        pageUrl,
        attempts: 1,
        fetcher: successfulFetcher({
          [manifestUrl]: { body: webManifest(), contentType: "application/json" }
        })
      })
    ).rejects.toThrow(/Web manifest returned an unexpected content type/);

    await expect(
      runSiteSmoke({
        pageUrl,
        attempts: 1,
        fetcher: successfulFetcher({
          [moduleScriptUrl]: { body: "not JavaScript", contentType: "text/plain" }
        })
      })
    ).rejects.toThrow(/Module script.*unexpected content type/);

    await expect(
      runSiteSmoke({
        pageUrl,
        attempts: 1,
        fetcher: successfulFetcher({
          [appIcon512Url]: { body: "not an image", contentType: "text/plain" }
        })
      })
    ).rejects.toThrow(/App icon.*unexpected content type/);
  });

  it("retries transient responses without delaying when configured for tests", async () => {
    let pageAttempts = 0;
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = requestUrl(input);
      if (url === pageUrl && pageAttempts === 0) {
        pageAttempts += 1;
        return response({ body: "unavailable", contentType: "text/html", status: 503 });
      }
      return deployedResource(url);
    });

    await expect(runSiteSmoke({ pageUrl, attempts: 2, retryDelayMs: 0, fetcher })).resolves.toMatchObject({
      attempt: 2
    });
    expect(fetcher).toHaveBeenCalledTimes(10);
  });

  it("reports exhausted retries and validates option values", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        body: "missing",
        contentType: "text/plain",
        status: 404
      })
    );
    await expect(runSiteSmoke({ pageUrl, attempts: 2, retryDelayMs: 0, fetcher })).rejects.toThrow(
      /failed after 2 attempt.*HTTP 404/
    );
    await expect(runSiteSmoke({ pageUrl, attempts: 0, fetcher })).rejects.toThrow(/positive integer/);
    await expect(runSiteSmoke({ pageUrl, retryDelayMs: -1, fetcher })).rejects.toThrow(/non-negative integer/);
  });
});
