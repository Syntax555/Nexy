import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function chooseComboboxOption(
  picker: Locator,
  label: string,
  search: string
): Promise<void> {
  const combobox = picker.getByRole("combobox", { name: label });
  await combobox.fill(search);
  await combobox.press("Enter");
}

async function selectFighter(
  picker: Locator,
  query: string,
  buttonName: RegExp
): Promise<void> {
  await picker.getByRole("searchbox", { name: "Search characters" }).fill(query);
  await picker.getByRole("button", { name: buttonName }).click();
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(
    dimensions.viewportWidth + 1
  );
}

test("loads every core asset and resolves a complete battle", async ({ page }) => {
  const runtimeErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("response", (response) => {
    if (
      response.status() >= 400
      && new URL(response.url()).origin === new URL(page.url()).origin
    ) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto("./");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Build the fight. Inspect the reason."
    })
  ).toBeVisible();

  const leftPicker = page.locator('.fighter-picker[data-side="left"]');
  const rightPicker = page.locator('.fighter-picker[data-side="right"]');
  await selectFighter(leftPicker, "Captain America", /^Captain America,/);
  await selectFighter(rightPicker, "Dagger", /^Dagger,/);

  const analyze = page.getByRole("button", { name: /Analyze battle/ });
  await expect(analyze).toBeEnabled();
  await analyze.click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Battle report" })
  ).toBeVisible();
  await expect(page.getByText("Ranked comparison")).toBeVisible();

  const interactionAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(interactionAccessibility.violations).toEqual([]);
  expect(runtimeErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
});

test("browses the roster through media, publisher, and universe", async ({
  page
}) => {
  await page.goto("./");
  const leftPicker = page.locator('.fighter-picker[data-side="left"]');

  const mediaCombobox = leftPicker.getByRole("combobox", { name: "Media" });
  await mediaCombobox.fill("Comics");
  await expect(leftPicker.getByRole("listbox", { name: "Media" })).toBeVisible();
  const openListboxAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(openListboxAccessibility.violations).toEqual([]);
  await mediaCombobox.press("Enter");
  await expect(
    leftPicker.getByRole("combobox", { name: "Publisher / origin" })
  ).toBeEnabled();

  await chooseComboboxOption(leftPicker, "Publisher / origin", "Marvel Comics");
  await expect(
    leftPicker.getByRole("combobox", { name: "Universe / verse" })
  ).toBeEnabled();

  await chooseComboboxOption(leftPicker, "Universe / verse", "Mainstream");
  await expect(leftPicker.locator("[data-browse-path-status]")).toContainText(
    "Comics → Marvel Comics → Mainstream"
  );
  await expect(
    leftPicker.getByRole("button", { name: /^Captain America,/ })
  ).toBeVisible();
});

for (const theme of ["dark", "light"] as const) {
  test(`${theme} theme has no automated WCAG A/AA violations`, async ({
    page
  }) => {
    await page.addInitScript((selectedTheme) => {
      window.localStorage.setItem("nexy-theme", selectedTheme);
    }, theme);
    await page.goto("./");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
}

test("supports 200% text without page-level horizontal scrolling", async ({
  page
}) => {
  await page.goto("./");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expectNoHorizontalOverflow(page);
  await expect(
    page.getByRole("heading", { name: "Build the fight. Inspect the reason." })
  ).toBeVisible();
});

test("mobile flow advances from Fighter 01 to Fighter 02", async ({
  page
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"), "Mobile-only flow");
  await page.goto("./");

  const leftPicker = page.locator('.fighter-picker[data-side="left"]');
  await selectFighter(leftPicker, "Captain America", /^Captain America,/);

  const secondTab = page.getByRole("tab", { name: /Fighter 02/ });
  await expect(secondTab).toHaveAttribute("aria-selected", "true");
  await expect(
    page.locator("#mobile-fighter-right-panel")
  ).not.toHaveAttribute("hidden", "");
});

test("desktop fighter cards stay equal height after one selection", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile-"), "Desktop-only layout");
  await page.goto("./");

  const leftPicker = page.locator('.fighter-picker[data-side="left"]');
  const rightPicker = page.locator('.fighter-picker[data-side="right"]');
  await selectFighter(leftPicker, "Captain America", /^Captain America,/);

  const [leftBox, rightBox] = await Promise.all([
    leftPicker.boundingBox(),
    rightPicker.boundingBox()
  ]);
  expect(leftBox).not.toBeNull();
  expect(rightBox).not.toBeNull();
  expect(Math.abs((leftBox?.height ?? 0) - (rightBox?.height ?? 0)))
    .toBeLessThanOrEqual(1);
});

test("forced-colors mode preserves selected-state affordances", async ({
  page,
  browserName
}) => {
  test.skip(browserName !== "chromium", "Forced colors emulation is Chromium-only");
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("./");
  await expect(page.getByRole("button", { name: /Switch to/ })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});

test("legal page remains reachable and accessible", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("link", { name: "Legal & removal requests" }).click();
  await expect(page).toHaveURL(/\/Nexy\/legal\.html$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Legal & IP notice"
  );

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
