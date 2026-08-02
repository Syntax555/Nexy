export interface SiteConfig {
  readonly basePath: string;
  readonly origin: string;
  readonly siteUrl: string;
  readonly legalUrl: string;
  readonly socialImageUrl: string;
  readonly manifestUrl: string;
  readonly faviconUrl: string;
  readonly appleTouchIconUrl: string;
  readonly repositoryUrl: string;
  readonly contentLicenseUrl: string;
  readonly rightsRequestUrl: string;
}

export interface SiteEnvironment {
  readonly VITE_BASE_PATH?: string;
  readonly VITE_SITE_ORIGIN?: string;
}

export const siteMetadata = {
  name: "Nexy Battle Lab",
  shortName: "Nexy",
  description: "Build character matchups and inspect every stat, power, resistance, and battle interaction.",
  socialDescription: "Pick two fighters. Read every advantage. Resolve the matchup with a transparent ruleset.",
  themeColor: "#090b12",
  backgroundColor: "#090b12"
} as const;

function normalizeBasePath(value: string): string {
  const withSlashes = `/${value.replaceAll("\\", "/")}/`.replace(/\/+/g, "/");
  const segments = withSlashes.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`VITE_BASE_PATH must not contain traversal segments: ${value}`);
  }
  if (/[?#]/.test(withSlashes)) {
    throw new Error(`VITE_BASE_PATH must be a URL path without a query or hash: ${value}`);
  }
  return segments.length > 0 ? `/${segments.join("/")}/` : "/";
}

function normalizeOrigin(value: string): string {
  const origin = new URL(value);
  if (!["http:", "https:"].includes(origin.protocol)) {
    throw new Error("VITE_SITE_ORIGIN must use HTTP or HTTPS.");
  }
  if (origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) {
    throw new Error("VITE_SITE_ORIGIN must contain only an origin.");
  }
  return origin.origin;
}

export function createSiteConfig(environment?: SiteEnvironment): SiteConfig {
  const basePath = normalizeBasePath(environment?.VITE_BASE_PATH ?? process.env.VITE_BASE_PATH ?? "/Nexy/");
  const origin = normalizeOrigin(
    environment?.VITE_SITE_ORIGIN ?? process.env.VITE_SITE_ORIGIN ?? "https://syntax555.github.io"
  );
  const siteUrl = new URL(basePath, `${origin}/`).href;
  const repositoryUrl = "https://github.com/Syntax555/Nexy";

  return {
    basePath,
    origin,
    siteUrl,
    legalUrl: new URL("legal.html", siteUrl).href,
    socialImageUrl: new URL("og.png", siteUrl).href,
    manifestUrl: new URL("site.webmanifest", siteUrl).href,
    faviconUrl: new URL("favicon-32.png", siteUrl).href,
    appleTouchIconUrl: new URL("apple-touch-icon.png", siteUrl).href,
    repositoryUrl,
    contentLicenseUrl: `${repositoryUrl}/blob/main/CONTENT-LICENSE.md`,
    rightsRequestUrl: `${repositoryUrl}/issues/new?template=rights-holder-request.yml`
  };
}

const siteTokens = {
  siteName: "__NEXY_SITE_NAME__",
  shortName: "__NEXY_SHORT_NAME__",
  description: "__NEXY_DESCRIPTION__",
  socialDescription: "__NEXY_SOCIAL_DESCRIPTION__",
  themeColor: "__NEXY_THEME_COLOR__",
  siteUrl: "__NEXY_SITE_URL__",
  legalUrl: "__NEXY_LEGAL_URL__",
  socialImageUrl: "__NEXY_SOCIAL_IMAGE_URL__",
  manifestUrl: "__NEXY_MANIFEST_URL__",
  faviconUrl: "__NEXY_FAVICON_URL__",
  appleTouchIconUrl: "__NEXY_APPLE_TOUCH_ICON_URL__",
  structuredData: "__NEXY_STRUCTURED_DATA__",
  basePath: "__NEXY_BASE_PATH__",
  repositoryUrl: "__NEXY_REPOSITORY_URL__",
  contentLicenseUrl: "__NEXY_CONTENT_LICENSE_URL__",
  rightsRequestUrl: "__NEXY_RIGHTS_REQUEST_URL__"
} as const;

export function renderSiteTemplate(template: string, config: SiteConfig): string {
  const values: Readonly<Record<keyof typeof siteTokens, string>> = {
    siteName: siteMetadata.name,
    shortName: siteMetadata.shortName,
    description: siteMetadata.description,
    socialDescription: siteMetadata.socialDescription,
    themeColor: siteMetadata.themeColor,
    siteUrl: config.siteUrl,
    legalUrl: config.legalUrl,
    socialImageUrl: config.socialImageUrl,
    manifestUrl: config.manifestUrl,
    faviconUrl: config.faviconUrl,
    appleTouchIconUrl: config.appleTouchIconUrl,
    structuredData: createStructuredData(config),
    basePath: config.basePath,
    repositoryUrl: config.repositoryUrl,
    contentLicenseUrl: config.contentLicenseUrl,
    rightsRequestUrl: config.rightsRequestUrl
  };

  return Object.entries(siteTokens).reduce(
    (rendered, [name, token]) => rendered.replaceAll(token, values[name as keyof typeof siteTokens]),
    template
  );
}

export function createStructuredData(config: SiteConfig): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: siteMetadata.name,
    url: config.siteUrl,
    description: siteMetadata.description,
    applicationCategory: "EntertainmentApplication",
    operatingSystem: "Any",
    isAccessibleForFree: true,
    image: config.socialImageUrl,
    sameAs: config.repositoryUrl
  });
}

export function createWebManifest(config: SiteConfig): string {
  return `${JSON.stringify(
    {
      id: config.basePath,
      name: siteMetadata.name,
      short_name: siteMetadata.shortName,
      description: siteMetadata.description,
      start_url: config.basePath,
      scope: config.basePath,
      display: "standalone",
      background_color: siteMetadata.backgroundColor,
      theme_color: siteMetadata.themeColor,
      icons: [
        {
          src: new URL("app-icon-192.png", config.siteUrl).href,
          sizes: "192x192",
          type: "image/png"
        },
        {
          src: new URL("app-icon-512.png", config.siteUrl).href,
          sizes: "512x512",
          type: "image/png"
        }
      ]
    },
    null,
    2
  )}\n`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function createRobotsTxt(config: SiteConfig): string {
  return ["User-agent: *", "Allow: /", "", `Sitemap: ${new URL("sitemap.xml", config.siteUrl).href}`, ""].join("\n");
}

export function createSitemapXml(config: SiteConfig): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "  <url>",
    `    <loc>${escapeXml(config.siteUrl)}</loc>`,
    "  </url>",
    "  <url>",
    `    <loc>${escapeXml(config.legalUrl)}</loc>`,
    "  </url>",
    "</urlset>",
    ""
  ].join("\n");
}
