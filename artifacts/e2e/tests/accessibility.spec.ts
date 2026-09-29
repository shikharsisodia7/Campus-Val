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
const OUT = path.resolve(__dirname, "../test-results/accessibility");
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
async function check(page: Page, state: string, scope?: string) {
  let builder = new AxeBuilder({ page }).withTags(TAGS);
  if (scope) builder = builder.include(scope);
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
  expect(blocking, `${state}: serious or critical accessibility violations`).toEqual([]);
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

test.describe.configure({ mode: "serial" });

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
  await check(page, "Checksheets, upload dialog");
  // The dialog can be left from the keyboard.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("checksheet-upload-dialog")).toBeHidden();

  await upload(page, "checklist-workbook", "Accessibility checklist");
  const sheet = card(page, "Accessibility checklist");
  const toggle = sheet.locator('[data-testid^="checksheet-toggle-"]').first();
  // The document opens from the keyboard and says whether it is open.
  await toggle.focus();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
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
    await check(page, "Navigation, Additional Features menu");
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
