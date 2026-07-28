import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const legalPagePath = join(process.cwd(), "public", "legal.html");
const sitemapPath = join(process.cwd(), "public", "sitemap.xml");

describe("legal notice", () => {
  it("states the limits of the notice and provides a rights-holder route", async () => {
    const page = await readFile(legalPagePath, "utf8");

    expect(page).toMatch(/unofficial,\s+currently non-commercial fan\s+project/i);
    expect(page).toMatch(/not affiliated with, sponsored by, endorsed by, or approved by/i);
    expect(page).toMatch(/no blanket claim of fair use/i);
    expect(page).toMatch(/does not grant a license/i);
    expect(page).toContain(
      "https://github.com/Syntax555/Nexy/issues/new?title=Rights-holder%20request"
    );
    expect(page).not.toMatch(/no copyright infringement intended/i);
  });

  it("includes the permanent legal page in the sitemap", async () => {
    const sitemap = await readFile(sitemapPath, "utf8");

    expect(sitemap).toContain("https://syntax555.github.io/Nexy/legal.html");
  });
});
