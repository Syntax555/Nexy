import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createSiteConfig, createSitemapXml, renderSiteTemplate } from "../../site.config.js";

const legalPagePath = join(process.cwd(), "legal.html");
const site = createSiteConfig();

describe("legal notice", () => {
  it("states the limits of the notice and provides a rights-holder route", async () => {
    const page = renderSiteTemplate(await readFile(legalPagePath, "utf8"), site);

    expect(page).toMatch(/unofficial,\s+currently non-commercial fan\s+project/i);
    expect(page).toMatch(/not affiliated with, sponsored by, endorsed by, or approved by/i);
    expect(page).toMatch(/no blanket claim of fair use/i);
    expect(page).toMatch(/does not grant a license/i);
    expect(page).toMatch(/data attribution/i);
    expect(page).toContain("CONTENT-LICENSE.md");
    expect(page).toContain("image-rights.json");
    expect(page).toMatch(/direct source-file links/i);
    expect(page).toMatch(/they are not a licence/i);
    expect(page).toMatch(/unverified rights are\s+withheld from public display/i);
    expect(page).toContain(
      "https://support.fandom.com/hc/en-us/articles/360035075654-I-want-to-reuse-text-or-images-from-a-Fandom-wiki"
    );
    expect(page).toContain("https://github.com/Syntax555/Nexy/issues/new?template=rights-holder-request.yml");
    expect(page).not.toContain("__NEXY_");
    expect(page).not.toMatch(/no copyright infringement intended/i);
  });

  it("includes the permanent legal page in the sitemap", async () => {
    const sitemap = createSitemapXml(site);

    expect(sitemap).toContain("https://syntax555.github.io/Nexy/legal.html");
  });
});
