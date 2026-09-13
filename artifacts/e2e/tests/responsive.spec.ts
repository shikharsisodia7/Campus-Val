import { test, expect, type Page } from "@playwright/test";

/**
 * Authenticated responsive QA. The viewport under test comes from the
 * Playwright project config (playwright.config.ts) — one project per
 * required size, each reusing the same authenticated storageState so no
 * sign-in flow runs per test.
 */

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });
  expect(overflow.scrollWidth, `${label}: page-level horizontal overflow (scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth})`).toBeLessThanOrEqual(
    overflow.clientWidth + 1,
  );
}

test.describe("authenticated responsive QA", () => {
  test("Dashboard renders without horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    await assertNoHorizontalOverflow(page, "Dashboard");
  });

  test("Degree Plan, Plan Controls, and program pickers are usable", async ({ page }) => {
    await page.goto("/degree-plan");
    await expect(page.getByText("Degree Plan").first()).toBeVisible();
    await assertNoHorizontalOverflow(page, "Degree Plan");

    const planControls = page.getByRole("button", { name: /plan controls/i });
    await expect(planControls).toBeVisible();
    await planControls.click();
    const panelMarker = page.getByText(/programs for this plan|additional majors/i).first();
    await expect(panelMarker).toBeVisible();
    await assertNoHorizontalOverflow(page, "Plan Controls panel");

    // Regression: this Sheet's Escape dismissal silently did nothing in a
    // real browser (Radix's Presence never unmounted it — confirmed live,
    // not reproducible in a jsdom unit test since jsdom has no real CSS
    // animation for Presence to wait on). A real browser is required to
    // catch this class of bug, which is exactly what this E2E suite is for.
    await page.keyboard.press("Escape");
    await expect(panelMarker).toBeHidden();
  });

  test("APR panel and upload zone are usable", async ({ page }) => {
    await page.goto("/progress-report");
    await expect(page.getByText(/academic progress report/i).first()).toBeVisible();
    await assertNoHorizontalOverflow(page, "APR page");
  });

  test("advisor-sharing panel is usable", async ({ page }) => {
    await page.goto("/degree-plan");
    const shareButton = page.getByRole("button", { name: /^share$/i });
    await expect(shareButton).toBeVisible();
    await shareButton.click();
    const panelMarker = page.getByText(/share with an advisor/i).first();
    await expect(panelMarker).toBeVisible();
    const emailInput = page.getByPlaceholder(/advisor@scu\.edu/i);
    await expect(emailInput).toBeVisible();
    await assertNoHorizontalOverflow(page, "Advisor sharing panel");

    await page.keyboard.press("Escape");
    await expect(panelMarker).toBeHidden();
  });

  test("Tentative Degree Plan renders without horizontal overflow", async ({ page }) => {
    await page.goto("/tentative-plans");
    await expect(page.locator("body")).toBeVisible();
    await assertNoHorizontalOverflow(page, "Tentative Degree Plan");
  });

  test("Quarter Plan, Find Courses, and calendar are usable", async ({ page }) => {
    await page.goto("/planner");
    await expect(page.getByText(/quarter schedule planner|schedule planner/i).first()).toBeVisible();
    await assertNoHorizontalOverflow(page, "Quarter Plan");

    // Find Courses only renders once a schedule exists ("Create a schedule
    // above to search for sections.") — a fresh synthetic test account has
    // none yet, so create one first, matching what a real first-time user
    // does.
    const newScheduleButton = page.getByRole("button", { name: /new schedule/i });
    await expect(newScheduleButton).toBeVisible();
    await newScheduleButton.click();
    const nameInput = page.getByPlaceholder(/plan a|bio major path/i);
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill("E2E Responsive QA Schedule");
      await page.getByRole("button", { name: /^create$/i }).click();
    }

    const findCoursesInput = page.getByPlaceholder(/search by code or title/i);
    await expect(findCoursesInput).toBeVisible();
    await assertNoHorizontalOverflow(page, "Quarter Plan with active schedule");
  });
});

/**
 * Pilot feature-visibility QA, run against the real deployed app (not a
 * jsdom unit test) at every required viewport. student-a is a non-admin
 * pilot tester, so this proves the professor's controlled-pilot contract
 * holds end-to-end: nav hiding and direct-URL blocking never drift apart,
 * and neither reappears on mobile.
 */
const PILOT_HIDDEN_ROUTES = [
  "/professors",
  "/compare",
  "/graduation-paths",
  "/advice",
  "/advisor",
  "/voice",
  "/policies",
  "/evaluation",
  "/sync-workday",
  "/feedback",
];

const PILOT_HIDDEN_LABELS = [
  "Advice Board",
  "Planning Support",
  "Voice Planning Support",
  "SCU Policies",
  "AI Evaluation",
  "Graduation Paths",
  "Sync Workday Sections",
];

async function openAdditionalFeatures(page: Page) {
  // Decide by viewport width, not a one-shot isVisible() probe -- at exactly
  // the lg breakpoint the desktop nav can still be mid-layout on first paint,
  // and a single isVisible() check races that instead of waiting for it.
  const width = page.viewportSize()?.width ?? 0;
  if (width >= 1024) {
    const desktopTrigger = page.getByTestId("nav-additional-features");
    await desktopTrigger.waitFor({ state: "visible", timeout: 10_000 });
    await desktopTrigger.click();
    return;
  }
  await page.getByLabel("Open navigation").click();
  await page.getByTestId("mobile-additional-features").getByText("Additional Features").click();
}

test.describe("pilot feature visibility (non-admin)", () => {
  test("shows the Pilot badge in the header", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("badge-pilot")).toBeVisible();
    await expect(page.getByTestId("badge-pilot")).toHaveText(/pilot/i);
  });

  test("Additional Features shows the conservative kept set and none of the hidden features", async ({ page }) => {
    await page.goto("/");
    await openAdditionalFeatures(page);

    await expect(page.getByText("Course Catalog")).toBeVisible();
    await expect(page.getByText("GPA Calculator")).toBeVisible();
    await expect(page.getByText("Transfer Credit")).toBeVisible();
    await expect(page.getByText(/Workday APR/)).toBeVisible();
    await expect(page.getByText("SCU Resources")).toBeVisible();

    for (const label of PILOT_HIDDEN_LABELS) {
      await expect(page.getByText(label, { exact: true })).toHaveCount(0);
    }
  });

  test("Dashboard Quick Actions are exactly Degree Plan / Quarter Plan / Tentative Degree Plan, no AI assistant action", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("quick-degree-plan")).toBeVisible();
    await expect(page.getByTestId("quick-planner")).toBeVisible();
    await expect(page.getByTestId("quick-tentative-plans")).toBeVisible();
    await expect(page.getByText(/ask the ai assistant/i)).toHaveCount(0);
  });

  for (const route of PILOT_HIDDEN_ROUTES) {
    test(`direct navigation to ${route} redirects a non-admin back to Dashboard`, async ({ page }) => {
      await page.goto(route);
      await page.waitForURL((url) => url.pathname === "/", { timeout: 10_000 });
      await expect(page.locator("body")).toBeVisible();
      await assertNoHorizontalOverflow(page, `redirected from ${route}`);
    });
  }
});
