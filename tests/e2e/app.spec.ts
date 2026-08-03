import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hierarchyTrigger(picker: Locator, label: string): Locator {
  return picker.getByRole("button", {
    name: new RegExp(`^${escapeRegExp(label)}:`)
  });
}

async function chooseListOption(picker: Locator, label: string, option: string): Promise<void> {
  const trigger = hierarchyTrigger(picker, label);
  await trigger.click();
  const listbox = picker.getByRole("listbox", { name: label });
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole("option", { name: option, exact: true })).toBeVisible();
  await listbox.getByRole("option", { name: option, exact: true }).click();
  await expect(trigger).toHaveAccessibleName(`${label}: ${option}`);
  await expect(trigger).toBeFocused();
}

async function openBrowsePath(picker: Locator): Promise<void> {
  await picker.waitFor({ state: "attached" });
  const disclosure = picker.locator("details[data-browse-path]");
  if ((await disclosure.count()) === 0 || (await disclosure.getAttribute("open")) !== null) return;
  await disclosure.locator("summary").click();
  await expect(disclosure).toHaveAttribute("open", "");
}

async function selectFighter(picker: Locator, query: string, buttonName: RegExp): Promise<void> {
  await picker.getByRole("searchbox", { name: "Search characters" }).fill(query);
  await expect(picker.locator(".roster-card")).toHaveCount(1);
  await picker.getByRole("button", { name: buttonName }).click();
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    overflowingElements: Array.from(document.body.querySelectorAll("*"))
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          element: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${
            element.classList.length > 0 ? `.${Array.from(element.classList).join(".")}` : ""
          }`,
          left: Math.round(bounds.left),
          right: Math.round(bounds.right)
        };
      })
      .filter(({ left, right }) => left < -1 || right > document.documentElement.clientWidth + 1)
      .slice(0, 10)
  }));
  expect(
    dimensions.documentWidth,
    `Overflowing elements: ${JSON.stringify(dimensions.overflowingElements)}`
  ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}

async function expectNoVisibleOverlap(locator: Locator, description: string): Promise<void> {
  const overlaps = await locator.evaluateAll((elements) => {
    const visible = elements
      .map((element) => ({
        element,
        bounds: element.getBoundingClientRect()
      }))
      .filter(({ element, bounds }) => {
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && bounds.width > 0 && bounds.height > 0;
      });

    return visible.flatMap((current, index) =>
      visible.slice(index + 1).flatMap((candidate) => {
        const horizontalIntersection =
          Math.min(current.bounds.right, candidate.bounds.right) - Math.max(current.bounds.left, candidate.bounds.left);
        const verticalIntersection =
          Math.min(current.bounds.bottom, candidate.bounds.bottom) - Math.max(current.bounds.top, candidate.bounds.top);
        if (horizontalIntersection <= 1 || verticalIntersection <= 1) return [];

        const label = (element: Element) =>
          element.getAttribute("aria-label") ??
          element.textContent?.trim().replace(/\s+/g, " ").slice(0, 60) ??
          element.tagName;
        return [`${label(current.element)} overlaps ${label(candidate.element)}`];
      })
    );
  });

  expect(overlaps, description).toEqual([]);
}

test("loads every core asset and resolves a complete battle", async ({ page }) => {
  const runtimeErrors: string[] = [];
  const failedResponses: string[] = [];
  await page.addInitScript(() => {
    window.localStorage.setItem("nexy-theme", "light");
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400 && new URL(response.url()).origin === new URL(page.url()).origin) {
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
  await expect(page.locator("#arena")).toBeInViewport({ ratio: 0.01 });

  const leftPicker = page.locator('.fighter-picker[data-side="left"]');
  const rightPicker = page.locator('.fighter-picker[data-side="right"]');
  await selectFighter(leftPicker, "Captain America", /^Captain America,/);
  await expect(leftPicker.getByRole("region", { name: "Cyan corner character portrait grid" })).toHaveAttribute(
    "data-roster-view",
    "grid"
  );
  const secondFighterSwitch = page.getByRole("button", { name: /^Fighter 02:/ });
  if ((await secondFighterSwitch.count()) === 1) {
    await secondFighterSwitch.click();
  }
  await selectFighter(rightPicker, "Dagger", /^Dagger,/);

  const visibleProfile = page.locator(".fighter-profile:visible").first();
  const profileImage = visibleProfile.locator(".profile-visual img");
  await expect(profileImage).toBeVisible();
  await expect(profileImage).toHaveAttribute("src", /\/images\/generated\/.+-640\.webp$/);
  await expect(visibleProfile.locator(".profile-visual .image-fallback")).toHaveCount(0);
  await expect(visibleProfile.getByRole("button", { name: /^View full image of/ })).toBeVisible();
  await expect(visibleProfile.locator(".profile-artwork-disclosure")).toContainText(
    "Rights unverified · no image licence claimed"
  );
  await expect(visibleProfile.locator(".profile-sources")).toContainText("Character image record");
  await expect(visibleProfile.locator(".profile-sources")).toContainText("Rights status: Unverified Third Party");
  await expect(page.locator("dialog.image-modal")).not.toBeVisible();

  const analyze = page.getByRole("button", { name: /Analyze battle/ });
  await expect(analyze).toHaveCount(1);
  await expect(analyze).toBeEnabled();
  await analyze.click();
  await expect(page.getByRole("heading", { level: 2, name: "Battle report" })).toBeVisible();
  await expect
    .poll(() => {
      const parameters = new URL(page.url()).searchParams;
      return {
        ruleset: parameters.get("ruleset"),
        contentRevision: parameters.get("data")
      };
    })
    .toEqual({
      ruleset: "1",
      contentRevision: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
  await expect(page.getByText("Ranked comparison")).toBeVisible();
  await page.getByRole("heading", { level: 2, name: "Combatants" }).click();
  const combatantImages = page.locator(".combatant-card__image img");
  await expect(combatantImages).toHaveCount(2);
  await expect(page.locator(".combatant-card__image .image-fallback")).toHaveCount(0);
  await expect(page.locator(".combatant-card .artwork-disclosure")).toHaveCount(2);

  const interactionAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(interactionAccessibility.violations).toEqual([]);
  expect(runtimeErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
});

test("browses the roster through media, publisher, and universe", async ({ page }) => {
  await page.goto("./");
  const leftPicker = page.locator('.fighter-picker[data-side="left"]');
  await openBrowsePath(leftPicker);

  const mediaTrigger = hierarchyTrigger(leftPicker, "Media");
  await expect(mediaTrigger).toHaveAccessibleName("Media: All media");
  await mediaTrigger.click();
  const mediaListbox = leftPicker.getByRole("listbox", { name: "Media" });
  await expect(mediaListbox).toBeVisible();
  await expect(mediaListbox.getByRole("option")).toHaveCount(2);
  await expect(
    mediaListbox.getByRole("option", {
      name: "All media",
      exact: true
    })
  ).toBeVisible();
  await expect(
    mediaListbox.getByRole("option", {
      name: "Comics",
      exact: true
    })
  ).toBeVisible();
  await expect(
    leftPicker.getByRole("searchbox", {
      name: "Search Media choices"
    })
  ).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  const openListboxAccessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(openListboxAccessibility.violations).toEqual([]);
  await mediaListbox.getByRole("option", { name: "Comics", exact: true }).click();
  await expect(mediaTrigger).toHaveAccessibleName("Media: Comics");
  await expect(mediaTrigger).toBeFocused();
  await expect(hierarchyTrigger(leftPicker, "Publisher / origin")).toBeEnabled();

  const publisherTrigger = hierarchyTrigger(leftPicker, "Publisher / origin");
  await publisherTrigger.focus();
  await publisherTrigger.press("Enter");
  const publisherListbox = leftPicker.getByRole("listbox", {
    name: "Publisher / origin"
  });
  await expect(publisherListbox).toBeFocused();
  await publisherListbox.press("End");
  await expect(publisherListbox.getByRole("option", { name: "Marvel Comics", exact: true })).toHaveAttribute(
    "data-active",
    "true"
  );
  await publisherListbox.press("Enter");
  await expect(publisherTrigger).toHaveAccessibleName("Publisher / origin: Marvel Comics");
  await expect(publisherTrigger).toBeFocused();
  await expect(hierarchyTrigger(leftPicker, "Universe / verse")).toBeEnabled();

  await chooseListOption(leftPicker, "Universe / verse", "Mainstream");
  await expect(leftPicker.locator("[data-browse-path-status]")).toContainText("Comics → Marvel Comics → Mainstream");
  await expect(leftPicker.getByRole("button", { name: /^Captain America,/ })).toBeVisible();
});

for (const theme of ["dark", "light"] as const) {
  test(`${theme} theme has no automated WCAG A/AA violations`, async ({ page }) => {
    await page.addInitScript((selectedTheme) => {
      window.localStorage.setItem("nexy-theme", selectedTheme);
    }, theme);
    await page.goto("./");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();

    expect(results.violations).toEqual([]);
  });
}

test("supports 200% text without page-level horizontal scrolling", async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expectNoHorizontalOverflow(page);
  await expect(page.getByRole("heading", { name: "Build the fight. Inspect the reason." })).toBeVisible();

  const leftPicker = page.locator('.fighter-picker[data-side="left"]');
  await leftPicker.waitFor({ state: "attached" });
  await leftPicker.getByRole("button", { name: "Portrait grid view" }).click();
  const gridMetrics = await leftPicker.locator(".roster-card").evaluateAll((cards) => ({
    minimumCardWidth: Math.min(...cards.map((card) => card.getBoundingClientRect().width)),
    labelsAllowEmergencyWrap: cards.every(
      (card) => getComputedStyle(card.querySelector("strong") as Element).overflowWrap === "anywhere"
    )
  }));
  expect(gridMetrics.minimumCardWidth, "Portrait cards did not scale with 200% text").toBeGreaterThanOrEqual(120);
  expect(gridMetrics.labelsAllowEmergencyWrap).toBe(true);
  await expectNoVisibleOverlap(
    page.locator(".site-header > .brand, .site-header__actions > button"),
    "Header controls overlap at 200% text"
  );
  await expectNoVisibleOverlap(
    leftPicker.locator(".roster-meta > *"),
    "Roster status and view controls overlap at 200% text"
  );
  await expectNoHorizontalOverflow(page);
});

test("uses wide desktop space without stretching compact layouts", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile-"), "Wide desktop layout coverage");
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("./");

  const leftPicker = page.locator('.fighter-picker[data-side="left"]');
  const rightPicker = page.locator('.fighter-picker[data-side="right"]');
  const [featuredCardBox, pickerBodyBox] = await Promise.all([
    leftPicker.locator('.roster-card[aria-current="true"]').boundingBox(),
    leftPicker.locator(".fighter-picker__body").boundingBox()
  ]);
  expect(featuredCardBox).not.toBeNull();
  expect(pickerBodyBox).not.toBeNull();
  expect((featuredCardBox?.width ?? 0) / (pickerBodyBox?.width ?? 1)).toBeGreaterThanOrEqual(0.55);
  expect((featuredCardBox?.width ?? 0) / (pickerBodyBox?.width ?? 1)).toBeLessThanOrEqual(0.7);
  await leftPicker.getByRole("button", { name: "Portrait grid view" }).click();

  const metrics = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>(".main");
    const header = document.querySelector<HTMLElement>(".site-header");
    const heroHeading = document.querySelector<HTMLElement>(".hero h1");
    const arena = document.querySelector<HTMLElement>(".arena-grid");
    const pickers = Array.from(document.querySelectorAll<HTMLElement>(".fighter-picker"));
    const browsePaths = Array.from(document.querySelectorAll<HTMLElement>(".roster-path"));
    const browseSteps = Array.from(document.querySelectorAll<HTMLElement>(".roster-path__step"));
    const gridList = document.querySelector<HTMLElement>(
      '.fighter-picker[data-side="left"] .roster-carousel[data-roster-view="grid"] .roster-list'
    );
    if (!main || !header || !heroHeading || !arena || !gridList || pickers.length !== 2 || browsePaths.length !== 2) {
      throw new Error("Expected the complete wide-screen matchup layout.");
    }

    return {
      viewportWidth: document.documentElement.clientWidth,
      main: main.getBoundingClientRect(),
      header: header.getBoundingClientRect(),
      heroLineCount: Math.round(
        heroHeading.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(heroHeading).lineHeight)
      ),
      arenaWidth: arena.getBoundingClientRect().width,
      minimumPickerWidth: Math.min(...pickers.map((picker) => picker.getBoundingClientRect().width)),
      minimumBrowseWidth: Math.min(...browsePaths.map((path) => path.getBoundingClientRect().width)),
      minimumBrowseStepWidth: Math.min(...browseSteps.map((step) => step.getBoundingClientRect().width)),
      gridColumnCount: getComputedStyle(gridList).gridTemplateColumns.split(/\s+/).filter(Boolean).length
    };
  });

  expect(metrics.main.width / metrics.viewportWidth).toBeGreaterThanOrEqual(0.82);
  expect(metrics.main.width / metrics.viewportWidth).toBeLessThanOrEqual(0.88);
  expect(Math.abs(metrics.main.x - metrics.header.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.main.width - metrics.header.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.main.width - metrics.arenaWidth)).toBeLessThanOrEqual(1);
  expect(metrics.heroLineCount).toBeLessThanOrEqual(2);
  expect(metrics.minimumPickerWidth).toBeGreaterThanOrEqual(980);
  expect(metrics.minimumBrowseWidth).toBeGreaterThanOrEqual(940);
  expect(metrics.minimumBrowseStepWidth).toBeGreaterThanOrEqual(220);
  expect(metrics.gridColumnCount).toBeGreaterThanOrEqual(9);
  await expect(leftPicker).toBeVisible();
  await expect(rightPicker).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.reload();
  await expect(leftPicker).toBeAttached();
  await expect(rightPicker).toBeAttached();
  const compactMetrics = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>(".main");
    const pickers = Array.from(document.querySelectorAll<HTMLElement>(".fighter-picker"));
    if (!main || pickers.length !== 2) throw new Error("Expected the compact desktop matchup layout.");
    return {
      viewportWidth: document.documentElement.clientWidth,
      main: main.getBoundingClientRect(),
      pickerBoxes: pickers.map((picker) => picker.getBoundingClientRect())
    };
  });
  expect(compactMetrics.main.width).toBeLessThanOrEqual(compactMetrics.viewportWidth);
  const [compactLeftPicker, compactRightPicker] = compactMetrics.pickerBoxes;
  if (!compactLeftPicker || !compactRightPicker) throw new Error("Expected both compact desktop fighter panels.");
  expect(Math.abs(compactLeftPicker.y - compactRightPicker.y)).toBeLessThanOrEqual(1);
  expect(Math.min(...compactMetrics.pickerBoxes.map((picker) => picker.width))).toBeGreaterThanOrEqual(600);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 2560, height: 720 });
  await page.reload();
  const shortViewportBodyHeight = await page
    .locator('.fighter-picker[data-side="left"] .fighter-picker__body')
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(shortViewportBodyHeight).toBeLessThanOrEqual(700);
  await expectNoHorizontalOverflow(page);
});

test("wide desktop remains usable at 200% text", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Wide zoom coverage runs once in Chromium");
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("./");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });

  const leftPicker = page.locator('.fighter-picker[data-side="left"]');
  await expectNoVisibleOverlap(
    page.locator(".site-header > .brand, .site-header__actions > button"),
    "Wide header controls overlap at 200% text"
  );
  await expectNoVisibleOverlap(
    leftPicker.locator(".roster-path__step"),
    "Wide Browse by universe controls overlap at 200% text"
  );
  await expectNoHorizontalOverflow(page);
});

test("selected roster tools reflow at 320px and 200% text", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"), "Narrow mobile reflow coverage");
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("./");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });

  const leftPicker = page.locator('.fighter-picker[data-side="left"]');
  await selectFighter(leftPicker, "Captain America", /^Captain America,/);
  const toolsSummary = leftPicker.locator(".roster-tools__summary");
  await expect(toolsSummary).toBeVisible();
  await expectNoVisibleOverlap(
    toolsSummary.locator("span, small"),
    "Selected-roster summary labels overlap at narrow 200% text"
  );

  const reflowMetrics = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".site-header");
    const label = document.querySelector<HTMLElement>('.fighter-picker[data-side="left"] .roster-tools__summary span');
    if (!header || !label) throw new Error("Expected the header and selected-roster summary label.");
    return {
      headerHeight: header.getBoundingClientRect().height,
      headerMinHeight: Number.parseFloat(getComputedStyle(header).minHeight),
      labelWidth: label.getBoundingClientRect().width
    };
  });
  expect(reflowMetrics.labelWidth, "Selected-roster summary label collapsed").toBeGreaterThan(1);
  expect(
    reflowMetrics.headerMinHeight,
    "Sticky-header offset did not grow with its wrapped content"
  ).toBeGreaterThanOrEqual(reflowMetrics.headerHeight - 1);
  await expectNoHorizontalOverflow(page);
});

test("mobile fighter switcher stays inside the active picker", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"), "Mobile-only flow");
  await page.goto("./");

  const leftPicker = page.locator('.fighter-picker[data-side="left"]');
  const leftBrowse = leftPicker.locator("details[data-browse-path]");
  await expect(leftBrowse).not.toHaveAttribute("open", "");
  await expect(leftBrowse.locator("summary")).toContainText("Browse by universe");
  await expect(leftBrowse.locator("summary")).toContainText("All universes");
  await expect(page.locator(".hero__copy > p")).toBeHidden();
  await expect(page.locator(".mobile-matchup-navigator")).toHaveCount(1);
  await expect(leftPicker.locator(".mobile-matchup-navigator")).toHaveCount(1);
  await expect(page.locator(".mobile-matchup-status")).toHaveCount(0);

  await selectFighter(leftPicker, "Captain America", /^Captain America,/);

  const firstSwitch = page.getByRole("button", { name: /^Fighter 01:/ });
  const secondSwitch = page.getByRole("button", { name: /^Fighter 02:/ });
  await expect(firstSwitch).toHaveAttribute("aria-pressed", "true");
  await expect(firstSwitch).toHaveAccessibleName(/Captain America, chosen/);
  await expect(page.locator("#mobile-fighter-left-panel")).not.toHaveAttribute("hidden", "");
  await expect(page.locator("#mobile-fighter-right-panel")).toHaveAttribute("hidden", "");

  const continueAction = page.getByRole("button", { name: /Choose Fighter 02/ });
  await expect(continueAction).toBeVisible();
  await expect
    .poll(() =>
      continueAction.evaluate((element) => {
        const dock = element.closest(".action-dock");
        return dock ? getComputedStyle(dock).position : "missing";
      })
    )
    .toBe("fixed");
  await continueAction.click();
  await expect(secondSwitch).toHaveAttribute("aria-pressed", "true");
  await expect(secondSwitch).toBeFocused();
  await expect(page.locator("#mobile-fighter-right-panel")).not.toHaveAttribute("hidden", "");
  await expect(page.locator("#mobile-fighter-right-panel")).toBeInViewport();

  await firstSwitch.click();
  await expect(firstSwitch).toHaveAttribute("aria-pressed", "true");
  await expect(leftPicker.locator('.roster-card[aria-pressed="true"]')).toHaveAccessibleName(/^Captain America,/);
});

test("mobile spotlight track follows the featured fighter", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"), "Mobile-only layout");
  await page.goto("./");

  const leftPicker = page.locator('.fighter-picker[data-side="left"]');
  const track = leftPicker.getByRole("list", { name: "Characters" });
  const featuredCard = leftPicker.locator('.roster-card[aria-current="true"]');
  const nextArrow = leftPicker.locator(".roster-carousel__arrow--next");

  await expect(featuredCard).toHaveAccessibleName(/^Agent Venom,/);
  const scrollLeftBefore = await track.evaluate((element) => element.scrollLeft);

  await nextArrow.click();
  await expect(featuredCard).toHaveAccessibleName(/^Aurora,/);
  await expect
    .poll(
      () => track.evaluate((element, previousScrollLeft) => element.scrollLeft - previousScrollLeft, scrollLeftBefore),
      { message: "the mobile carousel track should follow its featured fighter" }
    )
    .toBeGreaterThan(100);
  await expect
    .poll(async () => {
      const [trackBox, cardBox] = await Promise.all([track.boundingBox(), featuredCard.boundingBox()]);
      if (!trackBox || !cardBox) return Number.POSITIVE_INFINITY;
      return Math.abs(trackBox.x + trackBox.width / 2 - (cardBox.x + cardBox.width / 2));
    })
    .toBeLessThanOrEqual(3);
});

test("desktop spotlight carousel previews fighters before a stable master-detail view", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile-"), "Desktop-only layout");
  await page.goto("./");

  const leftPicker = page.locator('.fighter-picker[data-side="left"]');
  const rightPicker = page.locator('.fighter-picker[data-side="right"]');
  const pickerBody = leftPicker.locator(".fighter-picker__body");
  const rosterBrowser = leftPicker.locator(".roster-browser");
  const carousel = leftPicker.getByRole("region", {
    name: "Cyan corner character carousel"
  });
  const featuredCard = leftPicker.locator('.roster-card[aria-current="true"]');
  await leftPicker.scrollIntoViewIfNeeded();

  await expect(leftPicker).toHaveAttribute("data-view", "gallery");
  await expect(featuredCard).toHaveAccessibleName(/^Agent Venom,/);
  const [initialLeftBox, initialRightBox] = await Promise.all([leftPicker.boundingBox(), rightPicker.boundingBox()]);
  const [initialBodyBox, initialRosterBox] = await Promise.all([pickerBody.boundingBox(), rosterBrowser.boundingBox()]);
  expect(initialLeftBox).not.toBeNull();
  expect(initialRightBox).not.toBeNull();
  expect(initialBodyBox).not.toBeNull();
  expect(initialRosterBox).not.toBeNull();
  expect(initialRosterBox?.width ?? 0).toBeGreaterThanOrEqual((initialBodyBox?.width ?? 0) * 0.9);

  const previousArrow = carousel.locator(".roster-carousel__arrow--previous");
  const nextArrow = carousel.locator(".roster-carousel__arrow--next");
  const [featuredBox, portraitBox, previousArrowBox, nextArrowBox] = await Promise.all([
    featuredCard.boundingBox(),
    featuredCard.locator(".roster-card__portrait").boundingBox(),
    previousArrow.boundingBox(),
    nextArrow.boundingBox()
  ]);
  expect(featuredBox).not.toBeNull();
  expect(portraitBox).not.toBeNull();
  expect(featuredBox?.width ?? 0).toBeGreaterThanOrEqual((initialBodyBox?.width ?? 0) * 0.55);
  expect(featuredBox?.height ?? 0).toBeGreaterThanOrEqual((initialBodyBox?.height ?? 0) * 0.45);
  expect(portraitBox?.height ?? 0).toBeGreaterThanOrEqual(200);
  expect(previousArrowBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(previousArrowBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(nextArrowBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(nextArrowBox?.height ?? 0).toBeGreaterThanOrEqual(44);

  await nextArrow.focus();
  await nextArrow.click();
  await expect(leftPicker).toHaveAttribute("data-view", "gallery");
  await expect(featuredCard).toHaveAccessibleName(/^Aurora,/);
  await expect(nextArrow).toBeFocused();
  await expect(leftPicker.locator('.roster-card[aria-pressed="true"]')).toHaveCount(0);
  await expect
    .poll(async () => {
      const [listBox, cardBox] = await Promise.all([
        leftPicker.locator(".roster-list").boundingBox(),
        featuredCard.boundingBox()
      ]);
      if (!listBox || !cardBox) return Number.POSITIVE_INFINITY;
      return Math.abs(listBox.x + listBox.width / 2 - (cardBox.x + cardBox.width / 2));
    })
    .toBeLessThanOrEqual(2);

  await featuredCard.scrollIntoViewIfNeeded();
  const pickerViewportYBeforeSelection = await leftPicker.evaluate((element) => element.getBoundingClientRect().y);
  await featuredCard.click();
  await expect(leftPicker).toHaveAttribute("data-view", "profile");
  const portraitGrid = leftPicker.getByRole("region", { name: "Cyan corner character portrait grid" });
  await expect(portraitGrid).toHaveAttribute("data-roster-view", "grid");
  await expect(portraitGrid.locator(".roster-carousel__arrow")).toHaveCount(0);
  await expect(leftPicker.locator("#left-carousel-status")).toHaveCount(0);
  const selectedCard = leftPicker.locator('.roster-card[aria-pressed="true"]');
  await expect(selectedCard).toHaveAccessibleName(/^Aurora,/);
  await expect(selectedCard).toBeFocused();
  await expect(selectedCard.locator(".roster-card__grid-selected")).toBeVisible();
  await expect(selectedCard.locator(".roster-card__copy small")).toHaveCount(0);
  await expect(selectedCard.locator(".roster-card__badges")).toHaveCount(0);
  await expect(selectedCard.locator(".roster-card__cta")).toHaveCount(0);

  const [leftBox, rightBox, selectedBodyBox, selectedRosterBox, profileBox] = await Promise.all([
    leftPicker.boundingBox(),
    rightPicker.boundingBox(),
    pickerBody.boundingBox(),
    rosterBrowser.boundingBox(),
    leftPicker.locator(".fighter-profile:not(.fighter-profile--empty)").boundingBox()
  ]);
  expect(leftBox).not.toBeNull();
  expect(rightBox).not.toBeNull();
  expect(selectedBodyBox).not.toBeNull();
  expect(selectedRosterBox).not.toBeNull();
  expect(profileBox).not.toBeNull();
  expect(selectedRosterBox?.width ?? 0).toBeLessThanOrEqual((selectedBodyBox?.width ?? 0) * 0.55);
  expect(profileBox?.width ?? 0).toBeGreaterThanOrEqual((selectedBodyBox?.width ?? 0) * 0.45);
  expect(Math.abs((leftBox?.height ?? 0) - (rightBox?.height ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((leftBox?.height ?? 0) - (initialLeftBox?.height ?? 0))).toBeLessThanOrEqual(8);
  expect(Math.abs((rightBox?.height ?? 0) - (initialRightBox?.height ?? 0))).toBeLessThanOrEqual(8);

  const [selectedCardBox, selectedRosterViewport] = await Promise.all([
    selectedCard.boundingBox(),
    leftPicker.locator(".roster-list").boundingBox()
  ]);
  expect(selectedCardBox).not.toBeNull();
  expect(selectedRosterViewport).not.toBeNull();
  expect(selectedCardBox?.y ?? 0).toBeGreaterThanOrEqual((selectedRosterViewport?.y ?? 0) - 1);
  expect((selectedCardBox?.y ?? 0) + (selectedCardBox?.height ?? 0)).toBeLessThanOrEqual(
    (selectedRosterViewport?.y ?? 0) + (selectedRosterViewport?.height ?? 0) + 1
  );
  expect(Math.abs((leftBox?.y ?? pickerViewportYBeforeSelection) - pickerViewportYBeforeSelection)).toBeLessThanOrEqual(
    16
  );

  await leftPicker.getByRole("button", { name: "Remove fighter" }).click();
  await expect(leftPicker).toHaveAttribute("data-view", "gallery");
  await expect(leftPicker.getByRole("region", { name: "Cyan corner character portrait grid" })).toHaveAttribute(
    "data-roster-view",
    "grid"
  );
  await expect(featuredCard).toHaveCount(0);
  const [restoredBodyBox, restoredRosterBox] = await Promise.all([
    pickerBody.boundingBox(),
    rosterBrowser.boundingBox()
  ]);
  expect(restoredRosterBox?.width ?? 0).toBeGreaterThanOrEqual((restoredBodyBox?.width ?? 0) * 0.9);
});

test("forced-colors mode preserves selected-state affordances", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Forced colors emulation is Chromium-only");
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("./");
  const leftPicker = page.locator('.fighter-picker[data-side="left"]');
  await selectFighter(leftPicker, "Captain America", /^Captain America,/);
  await leftPicker.locator(".roster-tools__summary").click();
  await leftPicker.getByRole("searchbox", { name: "Search characters" }).fill("");
  await expect(leftPicker.locator(".roster-card")).toHaveCount(20);

  const selectedCard = leftPicker.locator('.roster-card[aria-pressed="true"]');
  const unselectedCard = leftPicker.locator('.roster-card[aria-pressed="false"]').first();
  await expect(selectedCard).toBeVisible();
  await expect(selectedCard).toHaveAttribute("aria-pressed", "true");
  await expect(unselectedCard).toBeVisible();
  await leftPicker.getByRole("searchbox", { name: "Search characters" }).focus();

  const [selectedStyle, unselectedStyle] = await Promise.all([
    selectedCard.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        color: style.color,
        outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`
      };
    }),
    unselectedCard.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        color: style.color,
        outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`
      };
    })
  ]);
  expect(selectedStyle).not.toEqual(unselectedStyle);
});

test("legal page remains reachable and accessible", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("link", { name: "Legal & removal requests" }).click();
  await expect(page).toHaveURL(/\/Nexy\/legal\.html$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Legal & IP notice");

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("rules dialog supports focus, Escape, backdrop close, and accessibility", async ({ page }) => {
  await page.goto("./");
  const rulesButton = page.getByRole("button", { name: "Rules", exact: true });
  const dialog = page.getByRole("dialog", { name: "How Nexy decides" });
  const closeButton = dialog.getByRole("button", { name: "Close rules" });

  await rulesButton.click();
  await expect(dialog).toBeVisible();
  await expect(closeButton).toBeFocused();
  const accessibility = await new AxeBuilder({ page })
    .include("dialog.modal")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(rulesButton).toBeFocused();

  await rulesButton.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(dialog).not.toBeVisible();
  await expect(rulesButton).toBeFocused();
});

test("image dialog restores focus and exposes its artwork disclosure", async ({ page }) => {
  await page.goto("./");
  const leftPicker = page.locator('.fighter-picker[data-side="left"]');
  await selectFighter(leftPicker, "Captain America", /^Captain America,/);
  const expandButton = leftPicker.getByRole("button", { name: /^View full image of Captain America/ });
  await expandButton.click();

  const dialog = page.locator("dialog.image-modal");
  const closeButton = dialog.getByRole("button", { name: "Close image" });
  await expect(dialog).toBeVisible();
  await expect(closeButton).toBeFocused();
  await expect(dialog.locator(".image-modal__disclosure")).toContainText("Rights unverified");
  const accessibility = await new AxeBuilder({ page })
    .include("dialog.image-modal")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(expandButton).toBeFocused();
});
