import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "https://campus-val.vercel.app";

/**
 * Real, viewport-accurate authenticated E2E for CampusVal, using Clerk's
 * officially supported testing-token mechanism (@clerk/testing) — never a
 * cookie-injection hack, never a CAPTCHA bypass outside Clerk's own test
 * infrastructure. See scripts/ensure-test-users.ts and setup/auth.setup.ts.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "1440x900",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: "storage/student-a.json" },
      testMatch: /responsive\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      name: "1366x768",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 }, storageState: "storage/student-a.json" },
      testMatch: /responsive\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      name: "1280x800",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, storageState: "storage/student-a.json" },
      testMatch: /responsive\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      name: "1024x768",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 }, storageState: "storage/student-a.json" },
      testMatch: /responsive\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      name: "768x1024",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 }, storageState: "storage/student-a.json" },
      testMatch: /responsive\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      name: "430x932",
      use: { ...devices["Desktop Chrome"], viewport: { width: 430, height: 932 }, storageState: "storage/student-a.json", isMobile: true, hasTouch: true },
      testMatch: /responsive\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      name: "390x844",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, storageState: "storage/student-a.json", isMobile: true, hasTouch: true },
      testMatch: /responsive\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      name: "security",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /multi-account-security\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],
});
