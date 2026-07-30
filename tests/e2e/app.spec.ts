import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hierarchyTrigger(picker: Locator, label: string): Locator {
  return picker.getByRole("button", {
    name: new RegExp(`^${escapeRegExp(label)}:`)
  });
}

async function chooseListOption(
  picker: Locator,
  label: string,
  option: string
): Promise<void> {
  const trigger = hierarchyTrigger(picker, label);
  await trigger.click();
  const listbox = picker.getByRole("listbox", { name: label });
  await expect(listbox).toBeVisible();
  await expect(
    listbox.getByRole("option", { name: option, exact: true })
  ).toBeVisible();
  await listbox.getByRole("option", { name: option, exact: true }).click();
  await expect(trigger).toHaveAccessibleName(`${label}: ${option}`);
  await expect(trigger).toBeFocused();
}

async function selectFighter(
  picker: Locator,
  query: string,
  buttonName: RegExp
): Promise<void> {
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
          element: `${element.tagName.toLowerCase()}${
            element.id ? `#${element.id}` : ""
          }${
            element.classList.length > 0
              ? `.${Array.from(element.classList).join(".")}`
              : ""
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
  ).toBeLessThanOrEqual(
    dimensions.viewportWidth + 1
  );
}

test("loads every core asset and resolves a complete battle", async ({ page }) => {
  const runtimeErrors: string[] = [];
  const failedResponses: string[] = [];
  await page.addInitScript(() => {
    window.localStorage.setItem("nexy-theme", "light");
  });
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
  const chooseSecondFighter = page.getByRole("button", {
    name: "Choose Fighter 02"
  });
  if (await chooseSecondFighter.isVisible()) {
    await chooseSecondFighter.click();
  }
  await selectFighter(rightPicker, "Dagger", /^Dagger,/);

  const visibleProfileImage = page.locator(".profile-visual img:visible").first();
  await expect(visibleProfileImage).toBeVisible();
  await expect.poll(() => visibleProfileImage.evaluate((image) => {
    const element = image as HTMLImageElement;
    return element.complete && element.naturalWidth > 0;
  })).toBe(true);
  await expect(
    page.locator(
      '.profile-artwork-disclosure[data-rights-status="unverified-third-party"]:visible'
    ).first()
  ).toContainText("Source file page: VS Battles Wiki");

  await page.locator('button[aria-label^="View full image of"]:visible').first().click();
  const imageDialog = page.locator("dialog.image-modal");
  await expect(imageDialog).toBeVisible();
  await expect(
    imageDialog.locator(
      '.artwork-disclosure[data-rights-status="unverified-third-party"]'
    )
  ).toContainText("no image licence claimed");
  await imageDialog.getByRole("button", { name: "Close image" }).click();

  const analyze = page.getByRole("button", { name: /Analyze battle/ }).first();
  await expect(analyze).toBeEnabled();
  await analyze.click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Battle report" })
  ).toBeVisible();
  await expect(page.getByText("Ranked comparison")).toBeVisible();
  await page.getByRole("heading", { level: 2, name: "Combatants" }).click();
  const combatantImages = page.locator(".combatant-card__image img");
  await expect(combatantImages).toHaveCount(2);
  await expect.poll(() => combatantImages.evaluateAll((images) =>
    images.every((image) => {
      const element = image as HTMLImageElement;
      return element.complete && element.naturalWidth > 0;
    })
  )).toBe(true);
  await expect(
    page.locator(
      '.combatant-card .artwork-disclosure[data-rights-status="unverified-third-party"]'
    )
  ).toHaveCount(2);

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

  const mediaTrigger = hierarchyTrigger(leftPicker, "Media");
  await expect(mediaTrigger).toHaveAccessibleName("Media: All media");
  await mediaTrigger.click();
  const mediaListbox = leftPicker.getByRole("listbox", { name: "Media" });
  await expect(mediaListbox).toBeVisible();
  await expect(mediaListbox.getByRole("option")).toHaveCount(2);
  await expect(mediaListbox.getByRole("option", {
    name: "All media",
    exact: true
  })).toBeVisible();
  await expect(mediaListbox.getByRole("option", {
    name: "Comics",
    exact: true
  })).toBeVisible();
  await expect(leftPicker.getByRole("searchbox", {
    name: "Search Media choices"
  })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  const openListboxAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(openListboxAccessibility.violations).toEqual([]);
  await mediaListbox.getByRole("option", { name: "Comics", exact: true }).click();
  await expect(mediaTrigger).toHaveAccessibleName("Media: Comics");
  await expect(mediaTrigger).toBeFocused();
  await expect(
    hierarchyTrigger(leftPicker, "Publisher / origin")
  ).toBeEnabled();

  const publisherTrigger = hierarchyTrigger(leftPicker, "Publisher / origin");
  await publisherTrigger.focus();
  await publisherTrigger.press("Enter");
  const publisherListbox = leftPicker.getByRole("listbox", {
    name: "Publisher / origin"
  });
  await expect(publisherListbox).toBeFocused();
  await publisherListbox.press("End");
  await expect(
    publisherListbox.getByRole("option", { name: "Marvel Comics", exact: true })
  ).toHaveAttribute("data-active", "true");
  await publisherListbox.press("Enter");
  await expect(publisherTrigger).toHaveAccessibleName(
    "Publisher / origin: Marvel Comics"
  );
  await expect(publisherTrigger).toBeFocused();
  await expect(
    hierarchyTrigger(leftPicker, "Universe / verse")
  ).toBeEnabled();

  await chooseListOption(leftPicker, "Universe / verse", "Mainstream");
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

test("mobile flow advances only after the explicit Fighter 02 action", async ({
  page
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"), "Mobile-only flow");
  await page.goto("./");

  const leftPicker = page.locator('.fighter-picker[data-side="left"]');
  await selectFighter(leftPicker, "Captain America", /^Captain America,/);

  const firstTab = page.getByRole("tab", { name: /Fighter 01/ });
  const secondTab = page.getByRole("tab", { name: /Fighter 02/ });
  await expect(firstTab).toHaveAttribute("aria-selected", "true");
  await expect(firstTab).toHaveAccessibleName(/Captain America, chosen/);
  await expect(
    page.locator("#mobile-fighter-left-panel")
  ).not.toHaveAttribute("hidden", "");
  await expect(
    page.locator("#mobile-fighter-right-panel")
  ).toHaveAttribute("hidden", "");

  await page.getByRole("button", { name: "Choose Fighter 02" }).click();
  await expect(secondTab).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: "Select fighter", level: 2 })
  ).toBeFocused();
  await expect(
    page.locator("#mobile-fighter-right-panel")
  ).not.toHaveAttribute("hidden", "");
  await expect(page.locator("#mobile-fighter-right-panel")).toBeInViewport();
});

test("mobile spotlight track follows the featured fighter", async ({
  page
}, testInfo) => {
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
  await expect.poll(
    () => track.evaluate(
      (element, previousScrollLeft) => element.scrollLeft - previousScrollLeft,
      scrollLeftBefore
    ),
    { message: "the mobile carousel track should follow its featured fighter" }
  ).toBeGreaterThan(100);
  await expect.poll(async () => {
    const [trackBox, cardBox] = await Promise.all([
      track.boundingBox(),
      featuredCard.boundingBox()
    ]);
    if (!trackBox || !cardBox) return Number.POSITIVE_INFINITY;
    return Math.abs(
      (trackBox.x + (trackBox.width / 2))
      - (cardBox.x + (cardBox.width / 2))
    );
  }).toBeLessThanOrEqual(3);
});

test("desktop spotlight carousel previews fighters before a stable master-detail view", async ({
  page
}, testInfo) => {
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
  const [initialLeftBox, initialRightBox] = await Promise.all([
    leftPicker.boundingBox(),
    rightPicker.boundingBox()
  ]);
  const [initialBodyBox, initialRosterBox] = await Promise.all([
    pickerBody.boundingBox(),
    rosterBrowser.boundingBox()
  ]);
  expect(initialLeftBox).not.toBeNull();
  expect(initialRightBox).not.toBeNull();
  expect(initialBodyBox).not.toBeNull();
  expect(initialRosterBox).not.toBeNull();
  expect(initialRosterBox?.width ?? 0).toBeGreaterThanOrEqual(
    (initialBodyBox?.width ?? 0) * 0.9
  );

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
  expect(featuredBox?.width ?? 0).toBeGreaterThanOrEqual(
    (initialBodyBox?.width ?? 0) * 0.55
  );
  expect(featuredBox?.height ?? 0).toBeGreaterThanOrEqual(
    (initialBodyBox?.height ?? 0) * 0.45
  );
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
  await expect.poll(async () => {
    const [listBox, cardBox] = await Promise.all([
      leftPicker.locator(".roster-list").boundingBox(),
      featuredCard.boundingBox()
    ]);
    if (!listBox || !cardBox) return Number.POSITIVE_INFINITY;
    return Math.abs(
      (listBox.x + (listBox.width / 2))
      - (cardBox.x + (cardBox.width / 2))
    );
  }).toBeLessThanOrEqual(2);

  await featuredCard.scrollIntoViewIfNeeded();
  const pickerViewportYBeforeSelection = await leftPicker.evaluate(
    (element) => element.getBoundingClientRect().y
  );
  await featuredCard.click();
  await expect(leftPicker).toHaveAttribute("data-view", "profile");
  const selectedCard = leftPicker.locator('.roster-card[aria-pressed="true"]');
  await expect(selectedCard).toHaveAccessibleName(/^Aurora,/);
  await expect(selectedCard).toBeFocused();

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
  expect(selectedRosterBox?.width ?? 0).toBeLessThanOrEqual(
    (selectedBodyBox?.width ?? 0) * 0.55
  );
  expect(profileBox?.width ?? 0).toBeGreaterThanOrEqual(
    (selectedBodyBox?.width ?? 0) * 0.45
  );
  expect(Math.abs((leftBox?.height ?? 0) - (rightBox?.height ?? 0)))
    .toBeLessThanOrEqual(1);
  expect(Math.abs((leftBox?.height ?? 0) - (initialLeftBox?.height ?? 0)))
    .toBeLessThanOrEqual(8);
  expect(Math.abs((rightBox?.height ?? 0) - (initialRightBox?.height ?? 0)))
    .toBeLessThanOrEqual(8);

  const [selectedCardBox, selectedRosterViewport] = await Promise.all([
    selectedCard.boundingBox(),
    leftPicker.locator(".roster-list").boundingBox()
  ]);
  expect(selectedCardBox).not.toBeNull();
  expect(selectedRosterViewport).not.toBeNull();
  expect(selectedCardBox?.y ?? 0).toBeGreaterThanOrEqual(
    (selectedRosterViewport?.y ?? 0) - 1
  );
  expect((selectedCardBox?.y ?? 0) + (selectedCardBox?.height ?? 0))
    .toBeLessThanOrEqual(
      (selectedRosterViewport?.y ?? 0) + (selectedRosterViewport?.height ?? 0) + 1
    );
  expect(Math.abs(
    (leftBox?.y ?? pickerViewportYBeforeSelection) - pickerViewportYBeforeSelection
  )).toBeLessThanOrEqual(16);

  await leftPicker.getByRole("button", { name: "Remove fighter" }).click();
  await expect(leftPicker).toHaveAttribute("data-view", "gallery");
  await expect(featuredCard).toHaveAccessibleName(/^Aurora,/);
  const [restoredBodyBox, restoredRosterBox] = await Promise.all([
    pickerBody.boundingBox(),
    rosterBrowser.boundingBox()
  ]);
  expect(restoredRosterBox?.width ?? 0).toBeGreaterThanOrEqual(
    (restoredBodyBox?.width ?? 0) * 0.9
  );
});

test("forced-colors mode preserves selected-state affordances", async ({
  page,
  browserName
}) => {
  test.skip(browserName !== "chromium", "Forced colors emulation is Chromium-only");
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("./");
  const leftPicker = page.locator('.fighter-picker[data-side="left"]');
  await selectFighter(leftPicker, "Captain America", /^Captain America,/);
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
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Legal & IP notice"
  );

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
