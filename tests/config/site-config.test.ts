import { describe, expect, it } from "vitest";

import { createRobotsTxt, createSiteConfig, createSitemapXml, renderSiteTemplate } from "../../site.config.js";

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
      socialImageUrl: "https://example.com/preview/nexy/og.png"
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
