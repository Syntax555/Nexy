import { defineConfig, devices } from "@playwright/test";

import { createSiteConfig } from "./site.config.js";

const site = createSiteConfig();
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? new URL(site.basePath, "http://127.0.0.1:4173").href;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI
    ? [["github"], ["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure"
  },
  webServer: {
    command: "pnpm preview",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "desktop-firefox",
      use: { ...devices["Desktop Firefox"] }
    },
    {
      name: "desktop-webkit",
      use: { ...devices["Desktop Safari"] }
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] }
    },
    {
      name: "mobile-webkit",
      use: { ...devices["iPhone 15"] }
    }
  ]
});
