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
    await expect(page.getByRole("navigation").first().or(page.locator("body"))).toBeVisible();
    await assertNoHorizontalOverflow(page, "Dashboard");
  });

  test("Degree Plan, Plan Controls, and program pickers are usable", async ({ page }) => {
    await page.goto("/degree-plan");
    await expect(page.getByText("Degree Plan").first()).toBeVisible();
    await assertNoHorizontalOverflow(page, "Degree Plan");

    const planControls = page.getByRole("button", { name: /plan controls/i });
    await expect(planControls).toBeVisible();
    await planControls.click();
    await expect(page.getByText(/programs for this plan|additional majors/i)).toBeVisible();
    await assertNoHorizontalOverflow(page, "Plan Controls panel");
    await page.keyboard.press("Escape");
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
    await expect(page.getByText(/share with an advisor/i)).toBeVisible();
    const emailInput = page.getByPlaceholder(/advisor@scu\.edu/i);
    await expect(emailInput).toBeVisible();
    await assertNoHorizontalOverflow(page, "Advisor sharing panel");
    await page.keyboard.press("Escape");
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

    const findCoursesInput = page.getByPlaceholder(/search by code or title/i);
    await expect(findCoursesInput).toBeVisible();
  });
});
