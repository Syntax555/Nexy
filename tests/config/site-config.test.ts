import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createRobotsTxt,
  createSiteConfig,
  createSitemapXml,
  createStructuredData,
  createWebManifest,
  renderSiteTemplate
} from "../../site.config.js";

describe("site configuration", () => {
  it("normalizes deployment paths and derives every public URL", () => {
    const config = createSiteConfig({
      VITE_BASE_PATH: "preview/nexy",
      VITE_SITE_ORIGIN: "https://example.com"
    });

    expect(config).toMatchObject({
      basePath: "/preview/nexy/",
      siteUrl: "https://example.com/preview/nexy/",
      legalUrl: "https://example.com/preview/nexy/legal.html",
      socialImageUrl: "https://example.com/preview/nexy/og.png",
      manifestUrl: "https://example.com/preview/nexy/site.webmanifest",
      faviconUrl: "https://example.com/preview/nexy/favicon-32.png",
      appleTouchIconUrl: "https://example.com/preview/nexy/apple-touch-icon.png"
    });
    expect(createRobotsTxt(config)).toContain("https://example.com/preview/nexy/sitemap.xml");
    expect(createSitemapXml(config)).toContain(config.legalUrl);
  });

  it("renders HTML tokens from the same deployment configuration", () => {
    const config = createSiteConfig({
      VITE_BASE_PATH: "/Nexy/",
      VITE_SITE_ORIGIN: "https://example.com"
    });
    const rendered = renderSiteTemplate(
      [
        "__NEXY_SITE_URL__",
        "__NEXY_LEGAL_URL__",
        "__NEXY_SOCIAL_IMAGE_URL__",
        "__NEXY_MANIFEST_URL__",
        "__NEXY_FAVICON_URL__",
        "__NEXY_APPLE_TOUCH_ICON_URL__",
        "__NEXY_STRUCTURED_DATA__",
        "__NEXY_BASE_PATH__",
        "__NEXY_CONTENT_LICENSE_URL__",
        "__NEXY_RIGHTS_REQUEST_URL__"
      ].join("\n"),
      config
    );

    expect(rendered).not.toContain("__NEXY_");
    expect(rendered).toContain("https://example.com/Nexy/");
    expect(rendered).toContain("/Nexy/");
    expect(rendered).toContain("CONTENT-LICENSE.md");
  });

  it("keeps install metadata and structured data inside the deployment base", () => {
    const config = createSiteConfig({
      VITE_BASE_PATH: "/preview/Nexy/",
      VITE_SITE_ORIGIN: "https://example.com"
    });
    const manifest = JSON.parse(createWebManifest(config)) as {
      readonly id: string;
      readonly start_url: string;
      readonly scope: string;
      readonly icons: readonly { readonly src: string; readonly sizes: string }[];
    };
    const structuredData = JSON.parse(createStructuredData(config)) as {
      readonly url: string;
      readonly image: string;
      readonly sameAs: string;
    };

    expect(manifest).toMatchObject({
      id: "/preview/Nexy/",
      start_url: "/preview/Nexy/",
      scope: "/preview/Nexy/"
    });
    expect(manifest.icons).toEqual([
      {
        src: "https://example.com/preview/Nexy/app-icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "https://example.com/preview/Nexy/app-icon-512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]);
    expect(structuredData).toMatchObject({
      url: "https://example.com/preview/Nexy/",
      image: "https://example.com/preview/Nexy/og.png",
      sameAs: "https://github.com/Syntax555/Nexy"
    });
    expect(structuredData).not.toHaveProperty("license");
  });

  it("renders favicon and install metadata into every page shell", async () => {
    const config = createSiteConfig({
      VITE_BASE_PATH: "/Nexy/",
      VITE_SITE_ORIGIN: "https://example.com"
    });
    const renderedPages = await Promise.all(
      ["index.html", "legal.html", "404.html"].map(async (file) =>
        renderSiteTemplate(await readFile(path.resolve(file), "utf8"), config)
      )
    );
    const rendered = renderedPages[0] ?? "";
    const structuredData = rendered.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1];

    for (const page of renderedPages) {
      expect(page).not.toContain("__NEXY_");
      expect(page).toContain('href="https://example.com/Nexy/favicon-32.png"');
      expect(page).toContain('href="https://example.com/Nexy/apple-touch-icon.png"');
      expect(page).toContain('href="https://example.com/Nexy/site.webmanifest"');
    }
    expect(structuredData).toBeDefined();
    expect(JSON.parse(structuredData ?? "{}")).toMatchObject({
      "@type": "WebApplication",
      url: "https://example.com/Nexy/"
    });
  });

  it("rejects origins with paths and traversal-like base paths", () => {
    expect(() =>
      createSiteConfig({
        VITE_SITE_ORIGIN: "https://example.com/path"
      })
    ).toThrow(/only an origin/);
    expect(() =>
      createSiteConfig({
        VITE_BASE_PATH: "/preview/../production/"
      })
    ).toThrow(/traversal/);
  });
});
