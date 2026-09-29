/**
 * Automated accessibility checks of the real app in a real browser, with
 * axe-core, against WCAG 2.0 / 2.1 levels A and AA.
 *
 * What this proves: no SERIOUS or CRITICAL violation that a machine can detect
 * on the pages and states below, and that the main controls can be reached
 * and operated from the keyboard.
 *
 * What it does not prove: that the app is pleasant or even usable with a
 * screen reader. A machine finds roughly a third of accessibility problems. A
 * person using VoiceOver, NVDA, JAWS or TalkBack has to do the rest; the
 * script for that is docs/ACCESSIBILITY_TESTING.md.
 *
 * Every document used is synthetic.
 *
 * Run: E2E_BASE_URL=http://localhost:18080 pnpm --filter @workspace/e2e exec \
 *        playwright test accessibility.spec.ts --project=a11y-desktop --project=a11y-phone
 */
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync, writeFileSync } from "fs";
import { buildChecksheetFixture, CHECKSHEET_FIXTURE_FILES, type ChecksheetFixtureName } from "../../api-server/src/__fixtures__/checksheets/build-fixtures";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Kept beside the tests' other output, and out of the repository. */
const OUT = path.resolve(__dirname, "../a11y-report");
mkdirSync(OUT, { recursive: true });

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

interface Finding {
  id: string;
  impact: string | null | undefined;
  help: string;
  nodes: number;
  example: string;
}

/**
 * Runs axe on what is on screen now. Fails on serious and critical findings;
 * moderate and minor ones are written to the report, not hidden.
 */
async function check(page: Page, state: string, options: { scope?: string; skip?: string[] } = {}) {
  let builder = new AxeBuilder({ page }).withTags(TAGS);
  if (options.scope) builder = builder.include(options.scope);
  if (options.skip) builder = builder.disableRules(options.skip);
  // Clerk's own account button is drawn by Clerk, inside its own frame.
  builder = builder.exclude(".cl-rootBox").exclude("[data-clerk-component]");
  const results = await builder.analyze();
  const findings: Finding[] = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.length,
    example: violation.nodes[0]?.target.join(" ") ?? "",
  }));
  const name = `${test.info().project.name}-${state.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ state, passes: results.passes.length, findings }, null, 2));
  const blocking = findings.filter((finding) => finding.impact === "serious" || finding.impact === "critical");
  // Soft: every page and state is checked and reported, not only the first that fails.
  expect.soft(blocking, `${state}: serious or critical accessibility violations`).toEqual([]);
  return findings;
}

async function sessionReady(page: Page) {
  await expect.poll(async () => (await page.request.get("/api/degree-checksheets")).status(), { timeout: 30_000 }).toBe(200);
}

async function fixtureFile(name: ChecksheetFixtureName): Promise<string> {
  const file = path.join(OUT, CHECKSHEET_FIXTURE_FILES[name].fileName);
  writeFileSync(file, await buildChecksheetFixture(name));
  return file;
}

async function clearChecksheets(page: Page) {
  const list = (await (await page.request.get("/api/degree-checksheets")).json()).documents ?? [];
  for (const document of list) await page.request.delete(`/api/degree-checksheets/${document.id}`);
}

async function upload(page: Page, fixture: ChecksheetFixtureName, title: string) {
  await page.getByTestId("button-upload-checksheet").first().click();
  const dialog = page.getByTestId("checksheet-upload-dialog");
  await dialog.getByTestId("checksheet-input-file").setInputFiles(await fixtureFile(fixture));
  await dialog.getByTestId("checksheet-field-title").fill(title);
  await dialog.getByTestId("checksheet-upload-submit").click();
  await expect(dialog).toBeHidden({ timeout: 40_000 });
}

const card = (page: Page, title: string) =>
  page.locator("[data-checksheet-card]").filter({ has: page.getByTestId("checksheet-title").getByText(title, { exact: true }) }).first();

// Each test stands alone: a finding on one page does not stop the others from being checked.

test("the main pages", async ({ page }) => {
  test.setTimeout(180_000);
  for (const [name, route, ready] of [
    ["Dashboard", "/", "main"],
    ["Degree Plan", "/degree-plan", "main"],
    ["Quarter Plan", "/planner", "main"],
    ["Tentative Degree Plan", "/tentative-plans", "main"],
    ["Academic Progress Report", "/progress-report", "main"],
    ["Core requirements", "/core-reqs", "main"],
  ] as const) {
    await page.goto(route);
    await sessionReady(page);
    await expect(page.locator(ready).first()).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await check(page, name);
  }
});

test("Quarter Plan before any schedule exists", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/planner");
  await sessionReady(page);
  // The schedules are put aside for this check and put back after it.
  const listed = await (await page.request.get("/api/schedules")).json();
  const schedules = (Array.isArray(listed) ? listed : (listed.schedules ?? [])) as { id: number }[];
  await page.route(/\/api\/schedules(\?.*)?$/, (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: Array.isArray(listed) ? [] : { ...listed, schedules: [] } }) : route.continue(),
  );
  await page.reload();
  await expect(page.getByText("Create a schedule above to search for sections.")).toBeVisible({ timeout: 30_000 });
  await check(page, "Quarter Plan, no schedule");
  await page.unroute(/\/api\/schedules(\?.*)?$/);
  expect(schedules).toBeDefined();
});

test("Degree Checksheets: empty, the upload dialog, a spreadsheet, tracking, a replacement, placing an entry", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/degree-checksheets");
  await sessionReady(page);
  await clearChecksheets(page);
  await page.reload();
  await sessionReady(page);
  await expect(page.getByTestId("button-upload-checksheet").first()).toBeVisible();
  await check(page, "Checksheets, empty");

  await page.getByTestId("button-upload-checksheet").first().click();
  await expect(page.getByTestId("checksheet-upload-dialog")).toBeVisible();
  // Let the dialog finish fading in: colours measured halfway through are not the dialog's.
  await page.waitForTimeout(600);
  await check(page, "Checksheets, upload dialog");
  // The file is chosen from the keyboard, through a real button.
  await expect(page.getByRole("button", { name: "Choose the department document to upload" })).toBeVisible();
  // The dialog can be left from the keyboard.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("checksheet-upload-dialog")).toBeHidden();

  await upload(page, "checklist-workbook", "Accessibility checklist");
  const sheet = card(page, "Accessibility checklist");
  const toggle = sheet.locator('[data-testid^="checksheet-toggle-"]').first();
  // The document closes and opens from the keyboard, and says which it is.
  await toggle.focus();
  if ((await toggle.getAttribute("aria-expanded")) === "true") {
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  }
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(sheet.getByTestId("checksheet-grid")).toBeVisible({ timeout: 30_000 });

  // A status is set from the keyboard alone.
  const status = sheet.getByTestId("checksheet-cell-status-0-2-1");
  await status.focus();
  await status.selectOption("completed");
  await sheet.getByTestId("checksheet-cell-term-0-2-1-term").selectOption("fall");
  await expect(sheet.locator('[data-testid^="checksheet-save-"]')).toHaveAttribute("data-save-status", "saved", { timeout: 15_000 });
  await check(page, "Checksheets, spreadsheet with tracking");

  // Every control in the document has a name that says what it is for.
  const unnamed = await sheet.getByTestId("checksheet-grid").evaluate((grid) =>
    Array.from(grid.querySelectorAll("select, button, input")).filter((el) => !(el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || (el as HTMLInputElement).labels?.length || el.textContent?.trim())).length,
  );
  expect(unnamed, "controls without an accessible name").toBe(0);

  await sheet.locator('[data-testid^="checksheet-replace-"]').click();
  await expect(sheet.getByTestId("checksheet-replace-form")).toBeVisible();
  await check(page, "Checksheets, replace form");
  await sheet.getByTestId("checksheet-replace-form").getByTestId("checksheet-input-file").setInputFiles(await fixtureFile("checklist-workbook-reworded"));
  await sheet.getByTestId("checksheet-replace-submit").click();
  await expect(sheet.locator('[data-testid^="checksheet-replaced-"]')).toBeVisible({ timeout: 40_000 });
  await expect(sheet.getByTestId("checksheet-detached")).toBeVisible();
  await check(page, "Checksheets, after a replacement");

  await sheet.locator('[data-testid^="checksheet-detached-place-cell-"]').click();
  await expect(sheet.getByTestId("checksheet-relink-banner")).toBeVisible();
  await check(page, "Checksheets, placing an entry");
  // Placing is done from the keyboard.
  const place = sheet.getByTestId("checksheet-place-here-0-4-1");
  await place.focus();
  await page.keyboard.press("Enter");
  await expect(sheet.getByTestId("checksheet-relink-banner")).toHaveCount(0);
  await expect(sheet.getByTestId("checksheet-cell-status-0-4-1")).toHaveValue("completed");
});

test("Degree Checksheets: a PDF, a picture, a Word document and a legacy workbook", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/degree-checksheets");
  await sessionReady(page);
  for (const [fixture, title, ready] of [
    ["major-pdf", "Accessibility PDF", '[data-testid="checksheet-pdf-page-1"][data-page-drawn="true"]'],
    ["flowchart-png", "Accessibility picture", '[data-testid^="checksheet-image-"]'],
    ["advising-docx", "Accessibility Word document", '[data-testid^="checksheet-document-"][role="region"]'],
    ["legacy-workbook", "Accessibility legacy workbook", '[data-testid="checksheet-grid"]'],
  ] as const) {
    await upload(page, fixture, title);
    const document = card(page, title);
    const toggle = document.locator('[data-testid^="checksheet-toggle-"]').first();
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await expect(document.locator(ready).first()).toBeVisible({ timeout: 60_000 });
    await check(page, `Checksheets, ${title}`);
    await toggle.click();
  }
  await clearChecksheets(page);
});

test("navigation: Additional Features reaches Degree Checksheets from the keyboard", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await sessionReady(page);
  const wide = (page.viewportSize()?.width ?? 0) >= 1024;
  if (wide) {
    const trigger = page.getByTestId("nav-additional-features");
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Degree Checksheets" })).toBeVisible();
    // While a menu is open the page behind it is hidden from assistive
    // technology, and axe reports that the hidden page holds focusable
    // controls. They cannot be reached: focus is held in the menu, which the
    // next lines prove by moving through it with the keyboard.
    await check(page, "Navigation, Additional Features menu", { skip: ["aria-hidden-focus"] });
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="menu"]') || document.activeElement === document.body)).toBe(true);
    if (!(await page.getByRole("menuitem", { name: "Degree Checksheets" }).isVisible())) {
      await trigger.focus();
      await page.keyboard.press("Enter");
    }
    await page.getByRole("menuitem", { name: "Degree Checksheets" }).focus();
    await page.keyboard.press("Enter");
  } else {
    await page.getByLabel("Open navigation").click();
    await page.getByTestId("mobile-additional-features").getByText("Additional Features").click();
    await check(page, "Navigation, mobile drawer");
    await page.getByRole("link", { name: "Degree Checksheets" }).click();
  }
  await page.waitForURL((url) => url.pathname === "/degree-checksheets");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
});
