/**
 * Live QA of Degree Checksheets against a REAL running server (production
 * build), signed in as the synthetic E2E student:
 *
 *   A  Additional Features -> Degree Checksheets; empty state; the SCU link
 *   B  upload a major checksheet (Excel); status + quarter in place; they
 *      persist through collapse/expand and a browser reload
 *   C  a second document; rename; replace; delete; the first is unaffected
 *   D  a PDF: drawn in the app, zoom, pages, a marker that holds its place
 *   E  a picture and a Word document
 *   F  refused files
 *   G  small screens
 *   H  privacy: another student and a plan-sharing advisor see nothing
 *   I  nothing else changed: APR page, Degree Plan, Quarter Plan, Tentative
 *   J  a requirements checklist (one student column per table); a replacement;
 *      putting an entry the replacement set aside back into a cell
 *   R  (optional) real department documents from a local folder, never
 *      committed: set CHECKSHEET_REAL_DIR to a folder holding eng-*.pdf, lsb-*.pdf,
 *      cas-*.pdf and cas-*.docx files downloaded from scu.edu
 *   S  (optional) every real requirements checklist (checklists/*.xlsx) and
 *      course plan (plans/*.docx) in that folder
 *
 * Every document used here is SYNTHETIC (api-server/src/__fixtures__/checksheets).
 *
 * Run: E2E_BASE_URL=http://localhost:18080 pnpm --filter @workspace/e2e exec \
 *        playwright test degree-checksheets.spec.ts --project=checksheets
 * Screenshots land in test-results/checksheets/.
 */
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import {
  buildChecksheetFixture,
  CHECKSHEET_FIXTURE_FILES,
  type ChecksheetFixtureName,
} from "../../api-server/src/__fixtures__/checksheets/build-fixtures";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(__dirname, "../test-results/checksheets");
const FILES = path.join(SHOTS, "fixtures");
mkdirSync(FILES, { recursive: true });

const SCU_URL = "https://www.scu.edu/drahmann/advising-toolkit/major-and-minor-checksheets/";
const TODAY = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });

async function fixtureFile(name: ChecksheetFixtureName): Promise<string> {
  const file = path.join(FILES, CHECKSHEET_FIXTURE_FILES[name].fileName);
  writeFileSync(file, await buildChecksheetFixture(name));
  return file;
}

/** The exact bytes that were uploaded for a fixture (a rebuilt workbook differs by its timestamps). */
const uploadedBytes = (name: ChecksheetFixtureName): Buffer =>
  readFileSync(path.join(FILES, CHECKSHEET_FIXTURE_FILES[name].fileName));

interface Doc {
  id: number;
  title: string;
  uploadedAt: string;
  fileName: string;
  sourceVersion: number;
  fileFingerprint: string;
}

async function listDocuments(page: Page): Promise<Doc[]> {
  return (await (await page.request.get("/api/degree-checksheets")).json()).documents ?? [];
}

async function deleteAllDocuments(page: Page) {
  for (const d of await listDocuments(page)) await page.request.delete(`/api/degree-checksheets/${d.id}`);
}

async function entriesOf(page: Page, id: number) {
  return (await (await page.request.get(`/api/degree-checksheets/${id}/annotations`)).json()).annotations as Array<{
    id: number;
    anchorType: string;
    anchor: Record<string, number>;
    status: string | null;
    term: string | null;
    termYear: number | null;
    note: string | null;
    itemLabel: string | null;
    detached: boolean;
  }>;
}

/** Console/page errors that are the app's own (not Clerk dev-instance noise or expected 4xx). */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/clerk|favicon|Failed to load resource.*(401|404|409|422)/i.test(m.text())) {
      errors.push(`console: ${m.text()}`);
    }
  });
  page.on("response", (r) => {
    if (r.status() >= 500) errors.push(`http ${r.status()}: ${new URL(r.url()).pathname}`);
  });
  return errors;
}

/** A stored session token is short-lived: wait until the page has refreshed it. */
async function sessionReady(page: Page) {
  await expect
    .poll(async () => (await page.request.get("/api/degree-checksheets")).status(), { timeout: 30_000 })
    .toBe(200);
}

async function noHorizontalOverflow(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontal overflow on ${where}`).toBeLessThanOrEqual(1);
}

interface Details {
  title: string;
  category?: string;
  year?: string;
  program?: string;
  role?: string;
  url?: string;
}

/** Upload one document through the real UI. */
async function uploadDocument(page: Page, fixture: ChecksheetFixtureName, details: Details) {
  await page.getByTestId("button-upload-checksheet").first().click();
  const dialog = page.getByTestId("checksheet-upload-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("checksheet-input-file").setInputFiles(await fixtureFile(fixture));
  await dialog.getByTestId("checksheet-field-title").fill(details.title);
  if (details.category) await dialog.getByTestId("checksheet-field-category").selectOption(details.category);
  if (details.year) await dialog.getByTestId("checksheet-field-year").fill(details.year);
  if (details.program) await dialog.getByTestId("checksheet-field-program").fill(details.program);
  if (details.role) await dialog.getByTestId("checksheet-field-role").selectOption(details.role);
  if (details.url) await dialog.getByTestId("checksheet-field-url").fill(details.url);
  await dialog.getByTestId("checksheet-upload-submit").click();
  await expect(dialog).toBeHidden({ timeout: 40_000 });
  await expect(cardFor(page, details.title)).toBeVisible({ timeout: 20_000 });
}

const cardFor = (page: Page, title: string): Locator =>
  page
    .locator("[data-checksheet-card]")
    .filter({ has: page.getByTestId("checksheet-title").getByText(title, { exact: true }) })
    .first();

const toggleOf = (card: Locator) => card.locator('[data-testid^="checksheet-toggle-"]').first();
const isOpen = async (card: Locator) => (await toggleOf(card).getAttribute("aria-expanded")) === "true";

async function open(card: Locator) {
  if (!(await isOpen(card))) await toggleOf(card).click();
  await expect(toggleOf(card)).toHaveAttribute("aria-expanded", "true");
}
async function collapse(card: Locator) {
  if (await isOpen(card)) await toggleOf(card).click();
  await expect(toggleOf(card)).toHaveAttribute("aria-expanded", "false");
}

const saved = (card: Locator) =>
  expect(card.locator('[data-testid^="checksheet-save-"]')).toHaveAttribute("data-save-status", "saved", { timeout: 15_000 });

async function openFeature(page: Page) {
  const width = page.viewportSize()?.width ?? 0;
  if (width >= 1024) {
    const trigger = page.getByTestId("nav-additional-features");
    await trigger.waitFor({ state: "visible", timeout: 15_000 });
    await trigger.click();
    await page.getByRole("menuitem", { name: "Degree Checksheets" }).click();
  } else {
    await page.getByLabel("Open navigation").click();
    await page.getByTestId("mobile-additional-features").getByText("Additional Features").click();
    await page.getByRole("link", { name: "Degree Checksheets" }).click();
  }
  await page.waitForURL((url) => url.pathname === "/degree-checksheets");
}

test.describe.configure({ mode: "serial" });

test("A. Additional Features -> Degree Checksheets: empty state and the official SCU link", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await page.goto("/");
  await sessionReady(page);
  await deleteAllDocuments(page);

  // It is under Additional Features, among the planning tools; not in the main planning navigation.
  await page.getByTestId("nav-additional-features").click();
  const item = page.getByRole("menuitem", { name: "Degree Checksheets" });
  await expect(item).toBeVisible();
  await expect(item).toHaveAttribute(
    "title",
    "Upload and track department major/minor checksheets, four-year plans, and advising resources.",
  );
  await expect(page.getByTestId("primary-nav").getByRole("link", { name: "Degree Checksheets" })).toHaveCount(0);
  await shot(page, "A1-additional-features-menu");
  await item.click();
  await page.waitForURL((url) => url.pathname === "/degree-checksheets");

  await expect(page.getByRole("heading", { level: 1, name: "Degree Checksheets" })).toBeVisible();
  const empty = page.getByTestId("card-checksheets-empty");
  await expect(empty).toBeVisible({ timeout: 20_000 });
  await expect(empty).toContainText("Upload major and minor checksheets, four-year plans, flowcharts, and other department advising resources");
  await expect(empty.getByTestId("button-upload-checksheet")).toBeEnabled();
  await expect(page.getByTestId("card-checksheets-help")).toContainText("Workday is the definitive reference for degree completion.");
  await shot(page, "A2-empty-state");

  // The official SCU page opens in a NEW tab; CampusVal stays where it is.
  const link = empty.getByTestId("link-scu-checksheets");
  await expect(link).toHaveAttribute("href", SCU_URL);
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  const [popup] = await Promise.all([page.context().waitForEvent("page"), link.click()]);
  expect(popup.url().startsWith("https://www.scu.edu/")).toBe(true);
  // noopener: the new tab has no handle on CampusVal.
  await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  await popup.close();
  expect(new URL(page.url()).pathname).toBe("/degree-checksheets");
  await expect(empty).toBeVisible();

  await noHorizontalOverflow(page, "empty state");
  expect(errors).toEqual([]);
});

test("B. Upload a major checksheet; status and quarter in place; they persist", async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await page.goto("/degree-checksheets");
  await sessionReady(page);
  await deleteAllDocuments(page);
  await page.reload();
  await expect(page.getByTestId("card-checksheets-empty")).toBeVisible({ timeout: 20_000 });

  const title = "Applied Widgetry Major Checksheet";
  await uploadDocument(page, "major-workbook", {
    title,
    category: "major_checksheet",
    year: "Fall 2025 and Later",
    program: "Applied Widgetry",
    role: "major",
    url: SCU_URL,
  });
  const card = cardFor(page, title);
  await expect(card.getByTestId("checksheet-uploaded")).toHaveText(`Uploaded ${TODAY}`);
  await expect(card.getByTestId("checksheet-year")).toHaveText("Fall 2025 and Later");
  await expect(card.getByTestId("checksheet-summary")).toHaveText("Major Checksheet · Applied Widgetry · Major");
  await expect(card.getByTestId("checksheet-status")).toHaveText("Ready");

  // The only document opens by itself, showing the source as uploaded.
  await open(card);
  const grid = card.getByTestId("checksheet-grid");
  await expect(grid).toBeVisible({ timeout: 20_000 });
  await expect(grid).toContainText("Applied Widgetry Major Checksheet (sample)");
  await expect(grid).toContainText("Prerequisite for WIDG 112");
  await expect(grid).toContainText("Senior standing required");
  await expect(card.getByTestId("checksheet-source-notice")).toContainText("never changed");
  const [doc] = await listDocuments(page);
  const original = await (await page.request.get(`/api/degree-checksheets/${doc!.id}/file`)).body();

  // Controls exist only in the two student columns of the six course rows.
  await expect(card.locator('[data-tracking-cell="status"]')).toHaveCount(6);
  await expect(card.locator('[data-tracking-cell="term"]')).toHaveCount(6);
  await expect(card.locator('tr[data-source-row="4"] select')).toHaveCount(0); // "Lower Division"
  await expect(card.locator('tr[data-source-row="3"] select')).toHaveCount(0); // header row
  await shot(page, "B1-major-checksheet-open");

  // Status, then quarter, for "Introduction to Widgetry" (row 5 of the file).
  const status = card.getByLabel("My status for Introduction to Widgetry, WIDG 101");
  await status.selectOption("in_progress");
  await saved(card);
  const quarter = card.getByLabel("My quarter for Introduction to Widgetry, WIDG 101: quarter");
  const year = card.getByLabel("My quarter for Introduction to Widgetry, WIDG 101: year");
  await quarter.selectOption("winter");
  await saved(card);
  await expect(year).toHaveValue("2027");
  await year.selectOption("2026");
  await saved(card);
  // A second row, to be sure rows are independent.
  await card.getByLabel("My status for Widget Ethics, WIDG 130").selectOption("completed");
  await saved(card);
  await shot(page, "B2-status-and-quarter-entered");

  // Collapse, expand: still there.
  await collapse(card);
  await expect(card.getByTestId("checksheet-grid")).toHaveCount(0);
  await open(card);
  await expect(status).toHaveValue("in_progress");
  await expect(quarter).toHaveValue("winter");
  await expect(year).toHaveValue("2026");

  // Reload the browser: still there, read back from the server.
  await page.reload();
  const again = cardFor(page, title);
  await open(again);
  await expect(again.getByLabel("My status for Introduction to Widgetry, WIDG 101")).toHaveValue("in_progress", { timeout: 20_000 });
  await expect(again.getByLabel("My quarter for Introduction to Widgetry, WIDG 101: quarter")).toHaveValue("winter");
  await expect(again.getByLabel("My quarter for Introduction to Widgetry, WIDG 101: year")).toHaveValue("2026");
  await expect(again.getByLabel("My status for Widget Ethics, WIDG 130")).toHaveValue("completed");
  await expect(again.getByLabel("My status for Widget Mathematics I, WIDG 111")).toHaveValue("");

  // Change, then clear.
  await again.getByLabel("My status for Introduction to Widgetry, WIDG 101").selectOption("completed");
  await saved(again);
  await again.getByLabel("My quarter for Introduction to Widgetry, WIDG 101: quarter").selectOption("");
  await saved(again);
  await again.getByLabel("My status for Widget Ethics, WIDG 130").selectOption("");
  await saved(again);
  expect((await entriesOf(page, doc!.id)).map((e) => [e.anchor, e.status, e.term, e.termYear])).toEqual([
    [{ sheet: 0, row: 4, col: 2 }, "completed", null, null],
  ]);

  // My Tracking: the student's own list, with a note that is typed and autosaved.
  const panel = again.locator('[data-testid^="checksheet-my-tracking-"]');
  await panel.getByTestId("checksheet-manual-label").fill("Study abroad elective");
  await panel.getByTestId("checksheet-manual-submit").click();
  await saved(again);
  await panel.getByLabel("My status for Study abroad elective").selectOption("planned");
  await panel.getByLabel("My quarter for Study abroad elective: quarter").selectOption("spring");
  await panel.getByLabel("Note for Study abroad elective").fill("Ask the department first");
  await saved(again);
  await page.reload();
  const third = cardFor(page, title);
  await open(third);
  const list = third.locator('[data-testid^="checksheet-my-tracking-"]');
  await expect(list.getByLabel("My status for Study abroad elective")).toHaveValue("planned", { timeout: 20_000 });
  await expect(list.getByLabel("My quarter for Study abroad elective: quarter")).toHaveValue("spring");
  await expect(list.getByLabel("Note for Study abroad elective")).toHaveValue("Ask the department first");
  await shot(page, "B3-after-reload-with-my-tracking");

  // "Show original only": the source alone.
  await third.locator('[data-testid^="checksheet-toggle-tracking-"]').click();
  await expect(third.locator("select")).toHaveCount(0);
  await expect(third.getByTestId("checksheet-grid")).toContainText("Introduction to Widgetry");
  await shot(page, "B4-original-only");
  await third.locator('[data-testid^="checksheet-toggle-tracking-"]').click();

  // THE SOURCE IS UNCHANGED: same bytes, same version, tracked cells still empty in it.
  const after = await (await page.request.get(`/api/degree-checksheets/${doc!.id}/file`)).body();
  expect(after.equals(original)).toBe(true);
  expect(after.equals(uploadedBytes("major-workbook"))).toBe(true);
  const [now] = await listDocuments(page);
  expect([now!.sourceVersion, now!.fileFingerprint, now!.uploadedAt]).toEqual([1, doc!.fileFingerprint, doc!.uploadedAt]);
  const render = await (await page.request.get(`/api/degree-checksheets/${doc!.id}/render`)).json();
  expect(JSON.stringify(render)).not.toMatch(/in_progress|Study abroad|Ask the department/);

  await noHorizontalOverflow(page, "open spreadsheet");
  expect(errors).toEqual([]);
});

test("C. A second document: tracking, original, rename, replace, delete; the first is unaffected", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await page.goto("/degree-checksheets");
  await sessionReady(page);
  const first = "Applied Widgetry Major Checksheet";
  await expect(cardFor(page, first)).toBeVisible({ timeout: 20_000 });
  const before = (await listDocuments(page)).find((d) => d.title === first)!;
  const firstEntries = await entriesOf(page, before.id);
  const firstBytes = await (await page.request.get(`/api/degree-checksheets/${before.id}/file`)).body();

  await uploadDocument(page, "minor-workbook", { title: "Sprocket Minor", category: "minor_checksheet", role: "minor" });
  await expect(page.getByTestId("checksheet-document-count")).toContainText("2 documents uploaded");
  const firstCard = cardFor(page, first);
  let second = cardFor(page, "Sprocket Minor");
  // Major checksheets come before minor checksheets.
  expect(await page.locator("[data-checksheet-card] [data-testid=checksheet-title]").allTextContents()).toEqual([first, "Sprocket Minor"]);

  await collapse(firstCard);
  await open(second);
  await expect(second.getByTestId("checksheet-grid")).toContainText("Sprocket Basics", { timeout: 20_000 });
  await second.getByLabel("My status for Sprocket Basics, SPRK 1").selectOption("completed");
  await saved(second);
  // The second worksheet has its own columns.
  await second.getByRole("tab", { name: "Electives" }).click();
  await expect(second.getByTestId("checksheet-grid")).toContainText("SPRK 110 Sprocket History");
  await second.getByLabel("My status for SPRK 110 Sprocket History, 4").selectOption("planned");
  await saved(second);
  await second.getByRole("tab", { name: "Minor" }).click();
  await expect(second.getByLabel("My status for Sprocket Basics, SPRK 1")).toHaveValue("completed");
  await shot(page, "C1-two-documents");

  // Open original: the file itself, for this document.
  const minor = (await listDocuments(page)).find((d) => d.title === "Sprocket Minor")!;
  const originalLink = second.locator('[data-testid^="checksheet-original-"]');
  await expect(originalLink).toHaveAttribute("href", new RegExp(`/api/degree-checksheets/${minor.id}/file$`));
  const file = await page.request.get(`/api/degree-checksheets/${minor.id}/file`);
  expect(file.headers()["content-disposition"]).toBe('attachment; filename="degree-checksheet.xlsx"');
  expect(file.headers()["cache-control"]).toBe("private, no-store");
  expect((await file.body()).equals(uploadedBytes("minor-workbook"))).toBe(true);

  // Rename.
  await second.locator('[data-testid^="checksheet-rename-"]').click();
  await second.getByTestId("checksheet-rename-input").fill("Sprocket Studies Minor");
  await second.getByTestId("checksheet-rename-save").click();
  second = cardFor(page, "Sprocket Studies Minor");
  await expect(second).toBeVisible();
  await expect(cardFor(page, "Sprocket Minor")).toHaveCount(0);

  // Edit details.
  await second.locator('[data-testid^="checksheet-details-"]').click();
  await second.getByTestId("checksheet-field-year").fill("Prior to Fall 2025");
  await second.getByTestId("checksheet-field-program").fill("Sprocket Studies");
  await second.getByTestId("checksheet-details-save").click();
  await expect(second.getByTestId("checksheet-year")).toHaveText("Prior to Fall 2025");
  await expect(second.getByTestId("checksheet-summary")).toHaveText("Minor Checksheet · Sprocket Studies · Minor");

  // Replace with an unrelated workbook: nothing may be left on the wrong rows.
  await second.locator('[data-testid^="checksheet-replace-"]').click();
  const form = second.getByTestId("checksheet-replace-form");
  await expect(form.getByTestId("checksheet-replace-tracking-note")).toContainText("You have 2 tracking entries placed on this document");
  await form.getByTestId("checksheet-input-file").setInputFiles(await fixtureFile("second-major-workbook"));
  await form.getByTestId("checksheet-replace-submit").click();
  const notice = second.locator('[data-testid^="checksheet-replaced-"]');
  await expect(notice).toContainText("2 of your tracking entries could not be matched to the new file", { timeout: 40_000 });
  await expect(second.getByTestId("checksheet-grid")).toContainText("Gadget Foundations", { timeout: 20_000 });
  await expect(second.getByTestId("checksheet-grid")).not.toContainText("Sprocket Basics");
  // Every cell of the new file is empty: no old value sits on a new requirement.
  for (const select of await second.getByTestId("checksheet-grid").locator("select").all()) {
    expect(await select.inputValue()).toBe("");
  }
  const detached = second.getByTestId("checksheet-detached");
  await expect(detached).toContainText("2 entries were made on the previous file");
  await expect(detached).toContainText("Sprocket Basics · Completed");
  await expect(detached).toContainText("SPRK 110 Sprocket History · Planned");
  await shot(page, "C2-replaced-with-detached-entries");
  // One is kept in the list, one removed.
  await detached.getByRole("button", { name: "Keep in my list" }).first().click();
  await saved(second);
  await second.getByRole("button", { name: "Remove the entry for SPRK 110 Sprocket History" }).click();
  await saved(second);
  await expect(second.getByTestId("checksheet-detached")).toHaveCount(0);
  await expect(second.getByLabel("My status for Sprocket Basics", { exact: true })).toHaveValue("completed");
  const replaced = (await listDocuments(page)).find((d) => d.id === minor.id)!;
  expect(replaced.title).toBe("Sprocket Studies Minor");
  expect(replaced.sourceVersion).toBe(2);
  expect(replaced.fileName).toBe("gadget-studies-major.xlsx");
  expect(new Date(replaced.uploadedAt).getTime()).toBeGreaterThan(new Date(minor.uploadedAt).getTime());

  // A refused replacement keeps the file that was there.
  await second.locator('[data-testid^="checksheet-replace-"]').click();
  const bad = path.join(FILES, "not-a-workbook.xlsx");
  writeFileSync(bad, "<!doctype html><p>not a workbook</p>");
  await second.getByTestId("checksheet-input-file").setInputFiles(bad);
  await second.getByTestId("checksheet-replace-submit").click();
  await expect(second.getByTestId("checksheet-replace-error")).toContainText("Your previous file was kept", { timeout: 30_000 });
  await expect(second.getByTestId("checksheet-grid")).toContainText("Gadget Foundations");
  expect((await listDocuments(page)).find((d) => d.id === minor.id)!.sourceVersion).toBe(2);

  // THE FIRST DOCUMENT IS UNAFFECTED by all of that.
  const same = (await listDocuments(page)).find((d) => d.id === before.id)!;
  expect(same).toEqual(before);
  expect(await entriesOf(page, before.id)).toEqual(firstEntries);
  expect((await (await page.request.get(`/api/degree-checksheets/${before.id}/file`)).body()).equals(firstBytes)).toBe(true);

  // Delete the second, with confirmation.
  await second.locator('[data-testid^="checksheet-delete-"]').click();
  const dialog = page.getByTestId("checksheet-delete-dialog");
  await expect(dialog).toContainText("Delete “Sprocket Studies Minor”?");
  await dialog.getByTestId("checksheet-delete-cancel").click();
  await expect(second).toBeVisible();
  await second.locator('[data-testid^="checksheet-delete-"]').click();
  await page.getByTestId("checksheet-delete-confirm").click();
  await expect(cardFor(page, "Sprocket Studies Minor")).toHaveCount(0, { timeout: 20_000 });
  await expect(cardFor(page, first)).toBeVisible();
  expect((await listDocuments(page)).map((d) => d.id)).toEqual([before.id]);
  expect((await page.request.get(`/api/degree-checksheets/${minor.id}/file`)).status()).toBe(404);
  expect(await entriesOf(page, before.id)).toEqual(firstEntries);

  expect(errors).toEqual([]);
});

/** Clicks a spot given as a fraction of a page, scrolling it into view first. */
async function clickAt(target: Locator, x: number, y: number) {
  const box = (await target.boundingBox())!;
  await target.click({ position: { x: box.width * x, y: box.height * y } });
}

/** Where a marker's centre is, as a fraction of the page it sits on. */
async function markerFraction(page: Page, marker: Locator, pageBox: Locator) {
  const m = (await marker.boundingBox())!;
  const p = (await pageBox.boundingBox())!;
  return { x: (m.x + m.width / 2 - p.x) / p.width, y: (m.y + m.height / 2 - p.y) / p.height, width: p.width };
}

test("D. A PDF: drawn in the app, zoom, pages, and a marker that holds its place", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await page.goto("/degree-checksheets");
  await sessionReady(page);
  await uploadDocument(page, "major-pdf", { title: "Applied Widgetry (PDF)", category: "major_checksheet" });
  const card = cardFor(page, "Applied Widgetry (PDF)");
  await open(card);

  // Both pages are drawn, by the app, from the original file.
  const page1 = card.getByTestId("checksheet-pdf-page-1");
  const page2 = card.getByTestId("checksheet-pdf-page-2");
  await expect(page1).toHaveAttribute("data-page-drawn", "true", { timeout: 40_000 });
  await expect(card.getByTestId("checksheet-page-count")).toHaveText("of 2");
  await expect(card.locator("iframe, embed, object")).toHaveCount(0);
  // The canvas really has ink on it (it is not a blank page).
  const inked = await page1.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i]! < 128 && data[i + 3]! > 0) dark += 1;
    return dark;
  });
  expect(inked).toBeGreaterThan(500);
  // The document's own words are there as selectable text.
  await expect(page1.locator(".cv-pdf-text")).toContainText("Applied Widgetry Major Checksheet (sample)", { timeout: 20_000 });
  await expect(page1.locator(".cv-pdf-text")).toContainText("WIDG 111");
  await shot(page, "D1-pdf-open");

  // Page navigation.
  await card.getByTestId("checksheet-page-next").click();
  await expect(card.getByTestId("checksheet-page-input")).toHaveValue("2");
  await expect(page2).toHaveAttribute("data-page-drawn", "true", { timeout: 40_000 });
  await expect(page2.locator(".cv-pdf-text")).toContainText("Senior Widget Capstone");
  await card.getByTestId("checksheet-page-prev").click();
  await expect(card.getByTestId("checksheet-page-input")).toHaveValue("1");
  // "Previous page" really brings the TOP of page 1 into the frame.
  const frame = (await card.getByTestId("checksheet-pdf-scroll").boundingBox())!;
  const top = (await page1.boundingBox())!;
  expect(top.y).toBeGreaterThanOrEqual(frame.y);
  expect(top.y - frame.y).toBeLessThan(40);

  // Place a marker on page 1, beside the first course.
  await card.getByTestId("checksheet-add-marker").click();
  await expect(card.getByTestId("checksheet-marker-instructions")).toBeVisible();
  await clickAt(page1, 0.06, 0.15);
  const marker = card.locator('[data-testid^="checksheet-marker-new:"], [data-testid^="checksheet-marker-id:"]').first();
  await expect(marker).toBeVisible();
  const editor = page.locator('[data-testid^="checksheet-marker-editor-"]');
  await expect(editor).toBeVisible();
  await editor.locator('[data-testid^="checksheet-marker-status-"]').selectOption("completed");
  await editor.locator('[data-testid^="checksheet-marker-term-"][data-testid$="-term"]').selectOption("fall");
  await editor.locator('[data-testid^="checksheet-marker-note-"]').fill("Took with lab");
  await saved(card);
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await expect(marker).toHaveText(/^F\d\d$/);
  await expect(marker).toHaveAttribute("aria-label", /^My tracking, marker 1 on page 1: Completed, Fall \d{4}\. Open to edit\.$/);

  const placed = await markerFraction(page, marker, page1);
  expect(placed.x).toBeCloseTo(0.06, 2);
  expect(placed.y).toBeCloseTo(0.15, 2);
  await shot(page, "D2-marker-placed");

  // ZOOM: the page grows, the marker stays on the same spot of it.
  for (const step of ["125%", "150%", "200%"]) {
    await card.getByTestId("checksheet-zoom-in").click();
    await expect(card.getByTestId("checksheet-zoom-level")).toHaveText(step);
    const at = await markerFraction(page, marker, page1);
    expect(at.width).toBeGreaterThan(placed.width);
    expect(at.x).toBeCloseTo(placed.x, 2);
    expect(at.y).toBeCloseTo(placed.y, 2);
  }
  await expect(page1).toHaveAttribute("data-page-drawn", "true");
  await shot(page, "D3-zoomed-200");
  await card.getByTestId("checksheet-zoom-level").click();
  await card.getByTestId("checksheet-zoom-out").click();
  await expect(card.getByTestId("checksheet-zoom-level")).toHaveText("75%");
  const small = await markerFraction(page, marker, page1);
  expect(small.x).toBeCloseTo(placed.x, 2);
  expect(small.y).toBeCloseTo(placed.y, 2);
  await card.getByTestId("checksheet-zoom-level").click();

  // RESIZE the window: same spot.
  await page.setViewportSize({ width: 900, height: 900 });
  await expect.poll(async () => (await markerFraction(page, marker, page1)).width).toBeLessThan(placed.width);
  const narrow = await markerFraction(page, marker, page1);
  expect(narrow.x).toBeCloseTo(placed.x, 2);
  expect(narrow.y).toBeCloseTo(placed.y, 2);
  await page.setViewportSize({ width: 1440, height: 900 });

  // RELOAD: same spot, same values.
  await page.reload();
  const again = cardFor(page, "Applied Widgetry (PDF)");
  await open(again);
  const reloaded = again.locator('[data-testid^="checksheet-marker-id:"]').first();
  await expect(reloaded).toBeVisible({ timeout: 40_000 });
  const back = await markerFraction(page, reloaded, again.getByTestId("checksheet-pdf-page-1"));
  expect(back.x).toBeCloseTo(placed.x, 2);
  expect(back.y).toBeCloseTo(placed.y, 2);
  const doc = (await listDocuments(page)).find((d) => d.title === "Applied Widgetry (PDF)")!;
  let stored = await entriesOf(page, doc.id);
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ anchorType: "point", status: "completed", term: "fall", note: "Took with lab" });
  expect(stored[0]!.anchor["page"]).toBe(0);
  expect(stored[0]!.anchor["x"]).toBeCloseTo(0.06, 2);
  expect(stored[0]!.anchor["y"]).toBeCloseTo(0.15, 2);

  // Edit it, move it with the keyboard controls, then to a clicked spot.
  await reloaded.click();
  const editor2 = page.locator('[data-testid^="checksheet-marker-editor-"]');
  await editor2.locator('[data-testid^="checksheet-marker-status-"]').selectOption("in_progress");
  await editor2.getByRole("button", { name: /^Move marker 1 on page 1 right$/ }).click();
  await editor2.getByRole("button", { name: /^Move marker 1 on page 1 right$/ }).click();
  await saved(again);
  stored = await entriesOf(page, doc.id);
  expect(stored[0]!.status).toBe("in_progress");
  expect(stored[0]!.anchor["x"]).toBeCloseTo(0.08, 2);
  await editor2.locator('[data-testid^="checksheet-marker-move-"]').click();
  await clickAt(again.getByTestId("checksheet-pdf-page-1"), 0.5, 0.3);
  await saved(again);
  stored = await entriesOf(page, doc.id);
  expect(stored).toHaveLength(1);
  expect(stored[0]!.anchor["x"]).toBeCloseTo(0.5, 2);
  expect(stored[0]!.anchor["y"]).toBeCloseTo(0.3, 2);
  await page.keyboard.press("Escape");

  // A marker added without a pointer, listed in My Tracking and editable there.
  await again.getByTestId("checksheet-add-marker").click();
  await again.getByTestId("checksheet-add-marker-here").click();
  await page.keyboard.press("Escape");
  await saved(again);
  const list = again.getByTestId("checksheet-marker-list");
  await expect(list).toContainText("Markers on the document (2)");
  await list.getByLabel("My status for Marker on page 1").last().selectOption("planned");
  await saved(again);
  expect((await entriesOf(page, doc.id)).map((e) => e.status).sort()).toEqual(["in_progress", "planned"]);
  await shot(page, "D4-two-markers-and-list");

  // "Show original only" shows the pages with nothing on them.
  await again.locator('[data-testid^="checksheet-toggle-tracking-"]').click();
  await expect(again.locator('[data-testid^="checksheet-marker-id:"]')).toHaveCount(0);
  await expect(again.getByTestId("checksheet-add-marker")).toHaveCount(0);
  await expect(again.getByTestId("checksheet-pdf-page-1")).toHaveAttribute("data-page-drawn", "true");
  await again.locator('[data-testid^="checksheet-toggle-tracking-"]').click();

  // Remove one from its editor.
  await again.locator('[data-testid^="checksheet-marker-id:"]').first().click();
  await page.locator('[data-testid^="checksheet-marker-delete-"]').click();
  await saved(again);
  expect(await entriesOf(page, doc.id)).toHaveLength(1);

  // The PDF in storage is the PDF that was uploaded, and it is served privately.
  const file = await page.request.get(`/api/degree-checksheets/${doc.id}/file`);
  expect((await file.body()).equals(uploadedBytes("major-pdf"))).toBe(true);
  expect(file.headers()["content-type"]).toBe("application/pdf");
  expect(file.headers()["x-content-type-options"]).toBe("nosniff");

  // Replace with a PDF whose first page is the same and whose second is not.
  await again.getByTestId("checksheet-add-marker").click();
  await again.getByTestId("checksheet-page-next").click();
  await clickAt(again.getByTestId("checksheet-pdf-page-2"), 0.06, 0.12);
  await page.locator('[data-testid^="checksheet-marker-status-"]').selectOption("planned");
  await saved(again);
  await page.keyboard.press("Escape");
  await again.locator('[data-testid^="checksheet-replace-"]').click();
  await again.getByTestId("checksheet-input-file").setInputFiles(await fixtureFile("major-pdf-revised"));
  await again.getByTestId("checksheet-replace-submit").click();
  await expect(again.locator('[data-testid^="checksheet-replaced-"]')).toContainText("1 of your tracking entry could not be matched", { timeout: 40_000 });
  await expect(again.locator('[data-testid^="checksheet-replaced-"]')).toContainText("1 tracking entry stayed in place");
  await expect(again.getByTestId("checksheet-detached")).toContainText("Marker on page 2 · Planned");
  await expect(again.getByTestId("checksheet-pdf-page-2").locator('button[data-testid^="checksheet-marker-"]')).toHaveCount(0);
  await expect(again.getByTestId("checksheet-pdf-page-1").locator('[data-testid^="checksheet-marker-id:"]')).toHaveCount(1);
  await expect(again.getByTestId("checksheet-pdf-page-2").locator(".cv-pdf-text")).toContainText("Widget Fabrication", { timeout: 40_000 });
  await shot(page, "D5-pdf-replaced");

  // The student decides the detached marker belongs beside the new course, and places it.
  await again.getByRole("button", { name: "Place on the document" }).click();
  await expect(again.getByTestId("checksheet-marker-instructions")).toContainText("new spot for this marker");
  await clickAt(again.getByTestId("checksheet-pdf-page-2"), 0.06, 0.12);
  await saved(again);
  await page.keyboard.press("Escape");
  await expect(again.getByTestId("checksheet-detached")).toHaveCount(0);
  await expect(again.getByTestId("checksheet-pdf-page-2").locator('button[data-testid^="checksheet-marker-"]')).toHaveCount(1);
  const relinked = await entriesOf(page, doc.id);
  expect(relinked.filter((e) => e.detached)).toEqual([]);
  expect(relinked.find((e) => e.anchor["page"] === 1)).toMatchObject({ status: "planned", anchorType: "point" });
  await page.reload();
  const afterRelink = cardFor(page, "Applied Widgetry (PDF)");
  await open(afterRelink);
  await expect(afterRelink.getByTestId("checksheet-pdf-page-2").locator('button[data-testid^="checksheet-marker-"]')).toHaveCount(1, { timeout: 40_000 });
  await expect(afterRelink.getByTestId("checksheet-detached")).toHaveCount(0);

  await noHorizontalOverflow(page, "open PDF");
  expect(errors).toEqual([]);
});

test("E. A flowchart picture and a Word document", async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await page.goto("/degree-checksheets");
  await sessionReady(page);

  await uploadDocument(page, "flowchart-png", { title: "Widget Flowchart", category: "flowchart", role: "general" });
  const flow = cardFor(page, "Widget Flowchart");
  await open(flow);
  const image = flow.getByTestId("checksheet-image");
  await expect(image).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(640);
  await expect(image).toHaveAttribute("alt", "Widget Flowchart (uploaded picture)");

  const picture = flow.getByTestId("checksheet-image-page");
  await flow.getByTestId("checksheet-add-marker").click();
  // Beside the first box of the flowchart, not on top of its label area.
  await clickAt(picture, 0.18, 0.32);
  await page.locator('[data-testid^="checksheet-marker-status-"]').selectOption("completed");
  await saved(flow);
  await page.keyboard.press("Escape");
  const marker = flow.locator('button[data-testid^="checksheet-marker-"]').first();
  const placed = await markerFraction(page, marker, picture);
  expect(placed.x).toBeCloseTo(0.18, 2);
  expect(placed.y).toBeCloseTo(0.32, 2);
  await flow.getByTestId("checksheet-zoom-in").click();
  await flow.getByTestId("checksheet-zoom-in").click();
  const zoomed = await markerFraction(page, marker, picture);
  expect(zoomed.width).toBeGreaterThan(placed.width);
  expect(zoomed.x).toBeCloseTo(placed.x, 2);
  expect(zoomed.y).toBeCloseTo(placed.y, 2);
  await shot(page, "E1-flowchart-zoomed-with-marker");
  await collapse(flow);

  await uploadDocument(page, "advising-docx", { title: "Widgetry Advising Guide", category: "advising_resource" });
  const guide = cardFor(page, "Widgetry Advising Guide");
  await open(guide);
  const doc = guide.locator('[data-testid^="checksheet-document-"]').filter({ hasText: "Applied Widgetry Advising Guide (sample)" });
  await expect(doc).toBeVisible({ timeout: 20_000 });
  await expect(doc.getByRole("heading", { name: "Recommended sequence" })).toBeVisible();
  await expect(doc.locator("ul > li")).toHaveText(["Take WIDG 111 before WIDG 112.", "WIDG 120 is offered in fall only."]);
  await expect(doc.getByRole("link", { name: /Department website/ })).toHaveAttribute("href", "https://www.example.edu/widgetry");
  await doc.getByLabel("My status for WIDG 101 Introduction to Widgetry").selectOption("completed");
  await doc.getByLabel("My quarter for WIDG 101 Introduction to Widgetry: quarter").selectOption("fall");
  await saved(guide);
  await page.reload();
  const again = cardFor(page, "Widgetry Advising Guide");
  await open(again);
  await expect(again.getByLabel("My status for WIDG 101 Introduction to Widgetry")).toHaveValue("completed", { timeout: 20_000 });
  await expect(again.getByLabel("My quarter for WIDG 101 Introduction to Widgetry: quarter")).toHaveValue("fall");
  await shot(page, "E2-word-document");

  // A cell that SAYS something can be tracked too, when the student chooses it.
  await expect(again.locator("[data-pickable]")).toHaveCount(0);
  await again.getByTestId("checksheet-pick-item").click();
  await expect(again.getByTestId("checksheet-pick-instructions")).toBeVisible();
  await again.getByRole("button", { name: "Track WIDG 120 Widget Design Studio" }).click();
  await expect(again.locator("[data-pickable]")).toHaveCount(0);
  const chosen = again.locator('[data-tracked-item="true"]');
  await expect(chosen).toHaveCount(1);
  await chosen.getByLabel("My status for WIDG 120 Widget Design Studio").selectOption("planned");
  await chosen.getByLabel("My quarter for WIDG 120 Widget Design Studio: quarter").selectOption("fall");
  await saved(again);
  // The department's words are still in the cell, above the student's entry.
  const sourceCell = again.locator("td").filter({ has: page.locator('[data-tracked-item="true"]') });
  await expect(sourceCell).toContainText("WIDG 120 Widget Design Studio");
  await page.reload();
  const third = cardFor(page, "Widgetry Advising Guide");
  await open(third);
  // (This row also has the department's own Status column; look inside the chosen cell.)
  const kept = third.locator('[data-tracked-item="true"]');
  await expect(kept).toHaveCount(1, { timeout: 20_000 });
  await expect(kept.getByLabel("My status for WIDG 120 Widget Design Studio")).toHaveValue("planned");
  await expect(kept.getByLabel("My quarter for WIDG 120 Widget Design Studio: quarter")).toHaveValue("fall");
  await expect(third.getByTestId("checksheet-pick-count")).toHaveText("You are tracking 1 cell you chose.");
  await shot(page, "E2b-word-cell-chosen");
  await third.locator('[data-testid^="checksheet-toggle-tracking-"]').click();
  await expect(third.locator('[data-tracked-item="true"]')).toHaveCount(0);
  await expect(third.getByText("WIDG 120 Widget Design Studio")).toBeVisible();
  await third.locator('[data-testid^="checksheet-toggle-tracking-"]').click();
  await third.getByRole("button", { name: "Stop tracking WIDG 120 Widget Design Studio" }).click();
  await saved(third);
  await expect(third.locator('[data-tracked-item="true"]')).toHaveCount(0);
  await collapse(third);

  // A hostile Word document is displayed as text and runs nothing.
  await uploadDocument(page, "hostile-docx", { title: "Hostile sample", category: "other" });
  const hostile = cardFor(page, "Hostile sample");
  await open(hostile);
  await expect(hostile).toContainText("<script>window.__checksheetPwned = true</script>", { timeout: 20_000 });
  await expect(hostile).toContainText('<img src=x onerror="window.__checksheetPwned = true">');
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>)["__checksheetPwned"])).toBeUndefined();
  await expect(hostile.locator('a[href^="javascript"]')).toHaveCount(0);
  await expect(hostile.getByText("A link that must not be followed")).toBeVisible();
  await hostile.locator('[data-testid^="checksheet-delete-"]').click();
  await page.getByTestId("checksheet-delete-confirm").click();
  await expect(cardFor(page, "Hostile sample")).toHaveCount(0, { timeout: 20_000 });

  // Four documents now; each is its own, and filters appear.
  expect((await listDocuments(page)).map((d) => d.title)).toEqual([
    "Applied Widgetry Major Checksheet",
    "Applied Widgetry (PDF)",
    "Widget Flowchart",
    "Widgetry Advising Guide",
  ]);
  await expect(page.getByTestId("checksheet-filters")).toBeVisible();
  await page.getByTestId("checksheet-filter-flowchart").click();
  await expect(page.locator("[data-checksheet-card]")).toHaveCount(1);
  await page.getByTestId("checksheet-filter-all").click();
  await expect(page.locator("[data-checksheet-card]")).toHaveCount(4);
  await shot(page, "E3-library-of-four");

  expect(errors).toEqual([]);
});

test("F. Refused and duplicate files", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.goto("/degree-checksheets");
  await sessionReady(page);
  await expect(page.locator("[data-checksheet-card]").first()).toBeVisible({ timeout: 20_000 });
  const count = (await listDocuments(page)).length;

  await page.getByTestId("button-upload-checksheet").first().click();
  const dialog = page.getByTestId("checksheet-upload-dialog");

  // The wrong kind of file is refused before anything is sent.
  const html = path.join(FILES, "page.html");
  writeFileSync(html, "<!doctype html><script>alert(1)</script>");
  await dialog.getByTestId("checksheet-input-file").setInputFiles(html);
  await expect(dialog.getByTestId("checksheet-file-error")).toContainText("isn't supported");
  await expect(dialog.getByTestId("checksheet-upload-submit")).toBeDisabled();

  // A file that only claims to be a PDF is refused by the server, with a reason.
  const fake = path.join(FILES, "fake.pdf");
  writeFileSync(fake, "<!doctype html><script>alert(1)</script>");
  await dialog.getByTestId("checksheet-input-file").setInputFiles(fake);
  await dialog.getByTestId("checksheet-field-title").fill("Fake PDF");
  await dialog.getByTestId("checksheet-upload-submit").click();
  await expect(dialog.getByTestId("checksheet-upload-error")).toContainText("contents don't match its file type", { timeout: 30_000 });

  const broken = path.join(FILES, "broken.pdf");
  writeFileSync(broken, "%PDF-1.7\nnot really a pdf\n%%EOF\n");
  await dialog.getByTestId("checksheet-input-file").setInputFiles(broken);
  await dialog.getByTestId("checksheet-upload-submit").click();
  await expect(dialog.getByTestId("checksheet-upload-error")).toContainText("This PDF is damaged", { timeout: 30_000 });
  await shot(page, "F1-refused-file");

  // The same file as an existing document: pointed out, then allowed.
  // (The picture: its bytes are the same every time it is built, unlike a workbook's.)
  await dialog.getByTestId("checksheet-input-file").setInputFiles(await fixtureFile("flowchart-png"));
  await dialog.getByTestId("checksheet-field-title").fill("Flowchart (second copy)");
  await dialog.getByTestId("checksheet-upload-submit").click();
  const warning = dialog.getByTestId("checksheet-duplicate-warning");
  await expect(warning).toContainText("This file appears to already be uploaded.");
  await expect(warning).toContainText("“Widget Flowchart”");
  await shot(page, "F2-duplicate-warning");
  await warning.getByTestId("checksheet-duplicate-cancel").click();
  expect(await listDocuments(page)).toHaveLength(count);
  await dialog.getByTestId("checksheet-upload-submit").click();
  await dialog.getByTestId("checksheet-duplicate-confirm").click();
  await expect(dialog).toBeHidden({ timeout: 40_000 });
  const copy = cardFor(page, "Flowchart (second copy)");
  await expect(copy).toBeVisible();
  // A separate document with its own, empty, tracking.
  await open(copy);
  await expect(copy.getByTestId("checksheet-image")).toBeVisible({ timeout: 20_000 });
  await expect(copy.locator('button[data-testid^="checksheet-marker-"]')).toHaveCount(0);
  await expect(cardFor(page, "Widget Flowchart")).toBeVisible();
  expect(await listDocuments(page)).toHaveLength(count + 1);
  await copy.locator('[data-testid^="checksheet-delete-"]').click();
  await page.getByTestId("checksheet-delete-confirm").click();
  await expect(cardFor(page, "Flowchart (second copy)")).toHaveCount(0, { timeout: 20_000 });
  // Deleting the copy left the first flowchart, and its marker, alone.
  const flowchart = (await listDocuments(page)).find((d) => d.title === "Widget Flowchart")!;
  expect(await entriesOf(page, flowchart.id)).toHaveLength(1);
  expect((await page.request.get(`/api/degree-checksheets/${flowchart.id}/file`)).status()).toBe(200);

  // Nothing refused was kept.
  expect((await listDocuments(page)).map((d) => d.title)).not.toContain("Fake PDF");
  expect(errors).toEqual([]);
});

for (const size of [
  { name: "tablet", width: 768, height: 1024 },
  { name: "phone", width: 390, height: 844 },
]) {
  test(`G. Small screens: ${size.name} (${size.width}x${size.height})`, async ({ browser }) => {
    test.setTimeout(150_000);
    const context = await browser.newContext({
      storageState: path.resolve(__dirname, "../storage/student-a.json"),
      viewport: { width: size.width, height: size.height },
      isMobile: size.width < 500,
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors = watchErrors(page);
    try {
      await page.goto("/");
      await sessionReady(page);
      expect(await page.evaluate(() => window.innerWidth)).toBe(size.width);
      await openFeature(page);
      await expect(page.getByRole("heading", { level: 1, name: "Degree Checksheets" })).toBeVisible();
      await expect(page.locator("[data-checksheet-card]").first()).toBeVisible({ timeout: 20_000 });
      await noHorizontalOverflow(page, `${size.name} library`);
      await shot(page, `G-${size.name}-1-library`);

      // Spreadsheet: the grid scrolls sideways inside its frame; the page does not.
      const major = cardFor(page, "Applied Widgetry Major Checksheet");
      await open(major);
      const scroll = major.getByTestId("checksheet-grid-scroll");
      await expect(scroll).toBeVisible({ timeout: 20_000 });
      const widths = await scroll.evaluate((el) => ({ inner: el.scrollWidth, outer: el.clientWidth }));
      expect(widths.inner).toBeGreaterThan(widths.outer);
      await noHorizontalOverflow(page, `${size.name} open spreadsheet`);
      // Controls are large enough to touch, and text is readable.
      const control = major.getByLabel("My status for Widget Mathematics I, WIDG 111");
      await control.scrollIntoViewIfNeeded();
      const controlBox = (await control.boundingBox())!;
      expect(controlBox.height).toBeGreaterThanOrEqual(36);
      expect(controlBox.width).toBeGreaterThanOrEqual(110);
      expect(await major.getByTestId("checksheet-grid").evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
      await control.selectOption("planned");
      await saved(major);
      await control.selectOption("");
      await saved(major);
      for (const button of await major.locator('[data-testid^="checksheet-rename-"], [data-testid^="checksheet-delete-"], [data-testid^="checksheet-original-"]').all()) {
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(36);
      }
      await shot(page, `G-${size.name}-2-spreadsheet`);
      await collapse(major);

      // PDF: fits the width, zoom makes it scroll inside its frame, a tap places a marker.
      const pdf = cardFor(page, "Applied Widgetry (PDF)");
      await open(pdf);
      const page1 = pdf.getByTestId("checksheet-pdf-page-1");
      await expect(page1).toHaveAttribute("data-page-drawn", "true", { timeout: 40_000 });
      const fit = (await page1.boundingBox())!;
      expect(fit.width).toBeLessThanOrEqual(size.width);
      expect(fit.width).toBeGreaterThan(size.width * 0.7);
      await noHorizontalOverflow(page, `${size.name} open PDF`);
      const before = await entriesOf(page, (await listDocuments(page)).find((d) => d.title === "Applied Widgetry (PDF)")!.id);

      await pdf.getByTestId("checksheet-zoom-in").click();
      await pdf.getByTestId("checksheet-zoom-in").click();
      await expect.poll(async () => (await page1.boundingBox())!.width).toBeGreaterThan(fit.width * 1.4);
      await noHorizontalOverflow(page, `${size.name} zoomed PDF`);
      await pdf.getByTestId("checksheet-add-marker").click();
      const scroller = pdf.getByTestId("checksheet-pdf-scroll");
      await scroller.evaluate((el) => el.scrollTo(0, 0));
      // Bring the viewer onto the screen: a tap lands where the finger is.
      await scroller.evaluate((el) => el.scrollIntoView({ block: "center" }));
      const at = (await page1.boundingBox())!;
      const frame = (await scroller.boundingBox())!;
      const tap = { x: frame.x + 60, y: Math.max(at.y, frame.y) + 120 };
      expect(tap.y).toBeLessThan(size.height);
      await page.touchscreen.tap(tap.x, tap.y);
      const editor = page.locator('[data-testid^="checksheet-marker-editor-"]');
      await expect(editor).toBeVisible();
      const editorBox = (await editor.boundingBox())!;
      expect(editorBox.x).toBeGreaterThanOrEqual(0);
      expect(editorBox.x + editorBox.width).toBeLessThanOrEqual(size.width + 1);
      await editor.locator('[data-testid^="checksheet-marker-status-"]').selectOption("planned");
      await saved(pdf);
      await shot(page, `G-${size.name}-3-pdf-marker-editor`);
      const doc = (await listDocuments(page)).find((d) => d.title === "Applied Widgetry (PDF)")!;
      const after = await entriesOf(page, doc.id);
      expect(after).toHaveLength(before.length + 1);
      const made = after.find((e) => !before.some((b) => b.id === e.id))!;
      expect(made.anchor["x"]).toBeCloseTo((tap.x - at.x) / at.width, 2);
      expect(made.anchor["y"]).toBeCloseTo((tap.y - at.y) / at.height, 2);
      await page.locator('[data-testid^="checksheet-marker-delete-"]').click();
      await saved(pdf);
      expect(await entriesOf(page, doc.id)).toHaveLength(before.length);
      await noHorizontalOverflow(page, `${size.name} after marker`);

      // The upload dialog fits the screen.
      await page.getByTestId("button-upload-checksheet").first().click();
      const dialog = page.getByTestId("checksheet-upload-dialog");
      await expect(dialog).toBeVisible();
      // The dialog slides in; measure it once it has come to rest.
      await expect.poll(async () => (await dialog.boundingBox())!.x, { timeout: 5_000 }).toBeGreaterThanOrEqual(0);
      const dialogBox = (await dialog.boundingBox())!;
      expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(size.width + 1);
      expect(dialogBox.width).toBeLessThanOrEqual(size.width);
      expect(dialogBox.height).toBeLessThanOrEqual(size.height);
      await shot(page, `G-${size.name}-4-upload-dialog`);
      await dialog.getByTestId("checksheet-upload-cancel").click();

      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

async function signedIn(browser: Browser, who: "student-b" | "advisor-y") {
  const context = await browser.newContext({ storageState: path.resolve(__dirname, `../storage/${who}.json`) });
  const page = await context.newPage();
  await page.goto("/");
  await sessionReady(page);
  return { context, page };
}

/**
 * A request made as a signed-in person. A stored session's token lasts about a
 * minute and the page renews it; a request that falls between two renewals is
 * answered 401, "not signed in", which says nothing about what that person may
 * see. The session is waited for and the request made again, so the answer
 * tested is the one a signed-in person gets.
 */
async function signedInRequest(page: Page, send: () => Promise<import("@playwright/test").APIResponse>) {
  let res = await send();
  for (let attempt = 0; attempt < 3 && res.status() === 401; attempt++) {
    await sessionReady(page);
    res = await send();
  }
  return res;
}

test("H. Privacy: another student and a plan-sharing advisor see nothing", async ({ page, browser }) => {
  test.setTimeout(150_000);
  await page.goto("/degree-checksheets");
  await sessionReady(page);
  const mine = await listDocuments(page);
  expect(mine.length).toBeGreaterThanOrEqual(4);
  const major = mine.find((d) => d.title === "Applied Widgetry Major Checksheet")!;
  const [entry] = await entriesOf(page, major.id);
  const state = async () =>
    JSON.stringify([await listDocuments(page), await Promise.all(mine.map((d) => entriesOf(page, d.id)))]);
  const before = await state();
  const SECRET = /Widget|WIDG|Sprocket|Gadget|Study abroad|Ask the department/;

  // The student shares the Degree Plan with the advisor.
  const me = await (await page.request.get("/api/profile")).json().catch(() => null);
  const share = await page.request.post("/api/plan-shares", {
    data: { advisorEmail: "e2e-advisor-y+clerk_test@scu.edu", scopes: ["degree_plan", "tentative_degree_plan"] },
  });
  expect([200, 201, 409]).toContain(share.status());

  for (const who of ["student-b", "advisor-y"] as const) {
    const other = await signedIn(browser, who);
    try {
      const list = await other.page.request.get("/api/degree-checksheets");
      expect(list.status()).toBe(200);
      const theirs = (await list.json()).documents as Doc[];
      expect(theirs.map((d) => d.id).filter((id) => mine.some((m) => m.id === id))).toEqual([]);
      expect(JSON.stringify(theirs), who).not.toMatch(SECRET);

      for (const doc of mine) {
        for (const suffix of ["", "/render", "/file", "/annotations"]) {
          const res = await signedInRequest(other.page, () => other.page.request.get(`/api/degree-checksheets/${doc.id}${suffix}`));
          expect(res.status(), `${who} GET ${suffix || "/"}`).toBe(404);
          expect(await res.text()).not.toMatch(SECRET);
        }
      }
      const attempts = [
        () => other.page.request.patch(`/api/degree-checksheets/${major.id}`, { data: { title: "Hijacked" } }),
        () => other.page.request.delete(`/api/degree-checksheets/${major.id}`),
        () =>
          other.page.request.post(`/api/degree-checksheets/${major.id}/annotations`, {
            data: { anchorType: "manual", itemLabel: "Planted", status: "completed" },
          }),
        () => other.page.request.patch(`/api/degree-checksheets/${major.id}/annotations/${entry!.id}`, { data: { status: "not_started" } }),
        () => other.page.request.delete(`/api/degree-checksheets/${major.id}/annotations/${entry!.id}`),
        () =>
          other.page.request.put(`/api/degree-checksheets/${major.id}/file`, {
            data: { objectPath: "/objects/uploads/0000000000000000/00000000-0000-4000-8000-000000000000", fileName: "x.pdf", fileSize: 10, contentType: "application/pdf" },
          }),
      ];
      for (const attempt of attempts) expect((await signedInRequest(other.page, attempt)).status(), who).toBe(404);

      // In the browser: their page is their own, and shows none of it.
      await other.page.goto("/degree-checksheets");
      await expect(other.page.getByRole("heading", { level: 1, name: "Degree Checksheets" })).toBeVisible({ timeout: 30_000 });
      await expect(other.page.getByTestId("card-checksheets-empty").or(other.page.getByTestId("checksheet-document-list"))).toBeVisible({ timeout: 20_000 });
      expect(await other.page.locator("body").innerText()).not.toMatch(SECRET);

      if (who === "advisor-y") {
        // The share works, and what it shows contains no checksheet.
        const shared = await other.page.request.get("/api/advisor/shared-students");
        expect(shared.status()).toBe(200);
        const students = ((await shared.json()).students ?? []) as Array<{ studentUserId: string }>;
        for (const student of students) {
          const plan = await other.page.request.get(`/api/advisor/shared-students/${student.studentUserId}/plan`);
          expect(await plan.text()).not.toMatch(/checksheet|WIDG|Widgetry|Sprocket/i);
        }
        await other.page.goto("/shared-with-me");
        await expect(other.page.locator("body")).not.toContainText(/Checksheet/i, { timeout: 15_000 });
      }
    } finally {
      await other.context.close();
    }
  }

  expect(await state()).toBe(before);
  void me;
});

test("I. Nothing else changed: APR, Degree Plan, Quarter Plan, Tentative Degree Plan", async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await page.goto("/");
  await sessionReady(page);
  const documents = await listDocuments(page);
  expect(documents.length).toBeGreaterThanOrEqual(4);

  // APR page: the new wording, and no checksheet in it.
  await page.goto("/progress-report");
  await expect(page.getByRole("heading", { level: 1, name: "Academic Progress Reports" })).toBeVisible({ timeout: 20_000 });
  const body = page.locator("body");
  await expect(body).toContainText("Workday is the definitive reference for degree completion");
  await expect(body).not.toContainText(/source of truth/i);
  await expect(body).not.toContainText(/Widgetry|Checksheet/);
  const aprs = (await (await page.request.get("/api/progress-reports")).json()).reports as Array<{ label: string; fileName: string }>;
  expect(JSON.stringify(aprs)).not.toMatch(/Widget|checksheet/i);
  await shot(page, "I1-apr-page");

  // The planning pages load, and none of them shows or mentions a checksheet.
  for (const [route, name] of [
    ["/degree-plan", "Degree Plan"],
    ["/tentative-plans", "Tentative Degree Plan"],
    ["/planner", "Quarter Plan"],
  ] as const) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("primary-nav").getByRole("link", { name, exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).not.toContainText(/Widgetry|WIDG 1|Degree Checksheet/);
    await noHorizontalOverflow(page, route);
  }
  await shot(page, "I2-quarter-plan");

  // Marking checksheet items Planned/Completed added nothing to any plan.
  const plans = (await (await page.request.get("/api/plans")).json()).plans ?? [];
  for (const plan of plans) {
    const full = await (await page.request.get(`/api/plans/${plan.id}`)).json();
    expect(JSON.stringify(full.items ?? [])).not.toMatch(/WIDG|Widget|Sprocket|Study abroad/);
  }
  const requirements = await page.request.get("/api/requirements");
  if (requirements.ok()) expect(await requirements.text()).not.toMatch(/WIDG|Widgetry|checksheet/i);

  expect(errors).toEqual([]);
});


test("J. A requirements checklist: both values in one column; a replacement; an entry put back in a cell", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await page.goto("/degree-checksheets");
  await sessionReady(page);
  const title = "Applied Widgetry Requirements Checklist";
  await uploadDocument(page, "checklist-workbook", { title, category: "major_checksheet", program: "Applied Widgetry", role: "major" });

  const card = cardFor(page, title);
  await open(card);
  const grid = card.getByTestId("checksheet-grid");
  await expect(grid).toContainText("Introduction to Widgetry", { timeout: 30_000 });

  // One student column per table, and it takes a status AND a quarter.
  const cell = (r: number, c: number) => card.getByTestId(`checksheet-cell-0-${r}-${c}`);
  await expect(cell(2, 1)).toHaveAttribute("data-tracking-cell", "both");
  // A status, and a quarter with its year.
  await expect(cell(2, 1).locator("select")).toHaveCount(3);
  // Headings hold no control, in either table; a row that names nothing for a table holds none there.
  for (const [r, c] of [[1, 1], [1, 4], [5, 1], [5, 4], [4, 4], [7, 4], [8, 4]]) await expect(cell(r!, c!)).toHaveCount(0);
  await expect(cell(2, 4)).toHaveAttribute("data-tracking-cell", "both");
  // Every shaded requirement row is offered: shading is not a heading.
  for (const r of [2, 3, 4, 6, 7, 8]) await expect(cell(r, 1)).toBeVisible();
  // A cell the spreadsheet calculates is left empty, with a plain statement.
  await expect(grid).not.toContainText("#N/A");
  await expect(card.getByTestId("checksheet-calculated-note")).toContainText("does not run formulas");
  // Controls are named after their own table's row.
  await expect(card.getByLabel("My status for Introduction to Widgetry", { exact: true })).toBeVisible();
  await expect(card.getByLabel("My status for WIDG 101", { exact: true })).toBeVisible();

  await card.getByTestId("checksheet-cell-status-0-2-1").selectOption("completed");
  await card.getByTestId("checksheet-cell-term-0-2-1-term").selectOption("fall");
  await card.getByTestId("checksheet-cell-status-0-3-1").selectOption("planned");
  await saved(card);
  await cell(2, 1).scrollIntoViewIfNeeded();
  await shot(page, "J1-checklist-both-values");

  const doc = (await listDocuments(page)).find((d) => d.title === title)!;
  const before = await entriesOf(page, doc.id);
  // Two entries made a moment apart are listed in the order the server received them.
  before.sort((a, b) => a.anchor.row! - b.anchor.row!);
  expect(before.map((e) => [e.anchor.row, e.anchor.col, e.status, e.term, e.detached])).toEqual([
    [2, 1, "completed", "fall", false],
    [3, 1, "planned", null, false],
  ]);

  await page.reload();
  await open(cardFor(page, title));
  await expect(card.getByTestId("checksheet-cell-status-0-2-1")).toHaveValue("completed", { timeout: 30_000 });
  await expect(card.getByTestId("checksheet-cell-term-0-2-1-term")).toHaveValue("fall");
  await expect(card.getByTestId("checksheet-cell-status-0-3-1")).toHaveValue("planned");

  // The department publishes a new version: the first requirement is now a different course.
  await card.locator('[data-testid^="checksheet-replace-"]').click();
  const form = card.getByTestId("checksheet-replace-form");
  await form.getByTestId("checksheet-input-file").setInputFiles(await fixtureFile("checklist-workbook-reworded"));
  await form.getByTestId("checksheet-replace-submit").click();
  const notice = card.locator('[data-testid^="checksheet-replaced-"]');
  await expect(notice).toContainText("1 of your tracking entry could not be matched", { timeout: 40_000 });
  await expect(notice).toContainText("1 tracking entry stayed in place");
  await expect(grid).toContainText("History of Widgets", { timeout: 20_000 });
  // The new requirement did not inherit the old one's values.
  await expect(card.getByTestId("checksheet-cell-status-0-2-1")).toHaveValue("");
  await expect(card.getByTestId("checksheet-cell-status-0-3-1")).toHaveValue("planned");

  const detached = card.getByTestId("checksheet-detached");
  await expect(detached).toContainText("Introduction to Widgetry");
  await expect(detached).toContainText("Completed");
  await shot(page, "J2-checklist-replaced");

  // The student decides where it belongs on the new file.
  await detached.locator('[data-testid^="checksheet-detached-place-cell-"]').click();
  const banner = card.getByTestId("checksheet-relink-banner");
  await expect(banner).toContainText("Introduction to Widgetry");
  await expect(banner).toContainText("Completed, Fall");
  // Only free cells are offered; the one that is taken keeps its controls.
  await expect(card.getByTestId("checksheet-place-here-0-3-1")).toHaveCount(0);
  await expect(card.getByTestId("checksheet-cell-status-0-3-1")).toHaveValue("planned");
  await expect(card.getByTestId("checksheet-place-here-0-2-1")).toBeVisible();
  await card.getByTestId("checksheet-place-here-0-4-1").scrollIntoViewIfNeeded();
  await shot(page, "J3-checklist-placing");

  // Cancelling places nothing.
  await card.getByTestId("checksheet-relink-cancel").click();
  await expect(banner).toHaveCount(0);
  await expect(card.getByTestId("checksheet-detached")).toBeVisible();
  expect((await entriesOf(page, doc.id)).filter((e) => e.detached)).toHaveLength(1);

  await card.locator('[data-testid^="checksheet-detached-place-cell-"]').click();
  await card.getByTestId("checksheet-place-here-0-4-1").click();
  await expect(banner).toHaveCount(0);
  await expect(card.getByTestId("checksheet-detached")).toHaveCount(0);
  await expect(card.getByTestId("checksheet-cell-status-0-4-1")).toHaveValue("completed");
  await expect(card.getByTestId("checksheet-cell-term-0-4-1-term")).toHaveValue("fall");
  await saved(card);
  await cell(4, 1).scrollIntoViewIfNeeded();
  await shot(page, "J4-checklist-placed");

  const after = await entriesOf(page, doc.id);
  expect(after.filter((e) => e.detached)).toEqual([]);
  expect(after.map((e) => [e.id, e.anchor.row, e.anchor.col, e.status, e.term]).sort()).toEqual(
    [
      [before[0]!.id, 4, 1, "completed", "fall"],
      [before[1]!.id, 3, 1, "planned", null],
    ].sort(),
  );

  // It can be changed where it now sits, and all of it survives a reload.
  await card.getByTestId("checksheet-cell-status-0-4-1").selectOption("in_progress");
  await saved(card);
  await page.reload();
  await open(cardFor(page, title));
  await expect(card.getByTestId("checksheet-cell-status-0-4-1")).toHaveValue("in_progress", { timeout: 30_000 });
  await expect(card.getByTestId("checksheet-cell-term-0-4-1-term")).toHaveValue("fall");
  await expect(card.getByTestId("checksheet-cell-status-0-2-1")).toHaveValue("");
  await expect(card.getByTestId("checksheet-detached")).toHaveCount(0);
  expect(await entriesOf(page, doc.id)).toHaveLength(2);

  // The file is the department's, byte for byte.
  const stored = await (await page.request.get(`/api/degree-checksheets/${doc.id}/file`)).body();
  expect(stored.equals(uploadedBytes("checklist-workbook-reworded"))).toBe(true);
  await noHorizontalOverflow(page, "requirements checklist");

  await page.request.delete(`/api/degree-checksheets/${doc.id}`);
  expect(errors).toEqual([]);
});

/**
 * Real department documents, when a folder of them is available on this
 * machine. They are read from outside the repository and are never committed;
 * without the folder this test is skipped.
 */
const REAL_DIR = process.env.CHECKSHEET_REAL_DIR;
const REAL_FILES = REAL_DIR && existsSync(REAL_DIR) ? readdirSync(REAL_DIR).sort() : [];
/** Leavey's documents: its PDF checklists, and its requirement pages saved as PDFs. */
const LEAVEY_DIR = REAL_DIR ? path.join(REAL_DIR, "leavey") : "";
const LEAVEY_PDFS = LEAVEY_DIR && existsSync(LEAVEY_DIR)
  ? readdirSync(LEAVEY_DIR)
      .filter((n) => /\.pdf$/i.test(n))
      .sort()
      .map((n) => path.join("leavey", n))
  : [];
const REAL_PDFS = [...REAL_FILES.filter((n) => /^(eng|cas|lsb)-.*\.pdf$/i.test(n)), ...LEAVEY_PDFS];
const REAL_DOCS = REAL_FILES.filter((n) => /^cas-.*\.docx$/i.test(n));

test("R. Real SCU department PDFs are drawn, tracked and left unchanged", async ({ page }) => {
  test.skip(REAL_PDFS.length + REAL_DOCS.length === 0, "Set CHECKSHEET_REAL_DIR to a folder of real department documents.");
  test.setTimeout(420_000);
  const errors = watchErrors(page);
  await page.goto("/degree-checksheets");
  await sessionReady(page);

  for (const [index, name] of REAL_PDFS.entries()) {
    const file = path.join(REAL_DIR!, name);
    const bytes = readFileSync(file);
    const title = `Real SCU document ${index + 1}`;

    await page.getByTestId("button-upload-checksheet").first().click();
    const dialog = page.getByTestId("checksheet-upload-dialog");
    await dialog.getByTestId("checksheet-input-file").setInputFiles(file);
    await dialog.getByTestId("checksheet-field-title").fill(title);
    await dialog.getByTestId("checksheet-field-category").selectOption("four_year_plan");
    await dialog.getByTestId("checksheet-upload-submit").click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });

    const card = cardFor(page, title);
    await open(card);
    const first = card.getByTestId("checksheet-pdf-page-1");
    await expect(first).toHaveAttribute("data-page-drawn", "true", { timeout: 60_000 });
    // The page has real ink on it, and real words over it.
    const inked = await first.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
      const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      let dark = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i]! + data[i + 1]! + data[i + 2]! < 384 && data[i + 3]! > 0) dark += 1;
      return dark;
    });
    expect(inked, name).toBeGreaterThan(2_000);
    await expect
      .poll(async () => ((await first.locator(".cv-pdf-text").innerText()).match(/[A-Za-z]{3,}/g) ?? []).length, { timeout: 30_000 })
      .toBeGreaterThan(20);
    // A wide (landscape) page still fits the frame at 100%.
    const frame = (await card.getByTestId("checksheet-pdf-scroll").boundingBox())!;
    expect((await first.boundingBox())!.width).toBeLessThanOrEqual(frame.width);

    await card.getByTestId("checksheet-add-marker").click();
    await clickAt(first, 0.5, 0.5);
    await page.locator('[data-testid^="checksheet-marker-status-"]').selectOption("planned");
    await expect(card.locator('button[data-testid^="checksheet-marker-"]')).toHaveCount(1);
    await saved(card);
    await page.keyboard.press("Escape");
    await card.getByTestId("checksheet-zoom-in").click();
    await expect(first).toHaveAttribute("data-page-drawn", "true");
    await page.waitForTimeout(600);
    await shot(page, `R${index + 1}-real-document`);

    const doc = (await listDocuments(page)).find((d) => d.title === title)!;
    const stored = await (await page.request.get(`/api/degree-checksheets/${doc.id}/file`)).body();
    expect(stored.equals(bytes), `${name} is stored byte for byte`).toBe(true);
    expect(await entriesOf(page, doc.id)).toHaveLength(1);
    await noHorizontalOverflow(page, name);

    await card.locator('[data-testid^="checksheet-delete-"]').click();
    await page.getByTestId("checksheet-delete-confirm").click();
    await expect(cardFor(page, title)).toHaveCount(0, { timeout: 20_000 });
  }

  // Real Word documents: first-year course plans, a Fall / Winter / Spring grid per option.
  for (const [index, name] of REAL_DOCS.entries()) {
    const file = path.join(REAL_DIR!, name);
    const bytes = readFileSync(file);
    const title = `Real SCU document W${index + 1}`;

    await page.getByTestId("button-upload-checksheet").first().click();
    const dialog = page.getByTestId("checksheet-upload-dialog");
    await dialog.getByTestId("checksheet-input-file").setInputFiles(file);
    await dialog.getByTestId("checksheet-field-title").fill(title);
    await dialog.getByTestId("checksheet-field-category").selectOption("advising_resource");
    await dialog.getByTestId("checksheet-upload-submit").click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });

    const card = cardFor(page, title);
    await open(card);
    const body = card.locator('[data-testid^="checksheet-document-"][role="region"]');
    await expect(body).toBeVisible({ timeout: 30_000 });
    await expect(body).toContainText(/Major: /);
    await expect(body).toContainText("Option One");
    // Its advising notes are a list, and its plans are tables headed by the quarters.
    expect(await body.locator("li").count()).toBeGreaterThanOrEqual(2);
    expect(await body.locator("table").count()).toBeGreaterThanOrEqual(2);
    await expect(body.locator("table").first().locator("tr").first()).toContainText(/FALL\s*WINTER\s*SPRING/);
    // Nothing in it is offered for editing until the student chooses a cell.
    await expect(body.locator("select, input, textarea, [contenteditable]")).toHaveCount(0);

    // The student tracks the first course of Option One.
    await card.getByTestId("checksheet-pick-item").click();
    const first = body.locator("table").first().locator("tr").nth(1).locator("td, th").first();
    // Only the first row is a header, however the file flagged its rows.
    await expect(body.locator("table").first().locator("tr").first().locator("th")).toHaveCount(3);
    await expect(body.locator("table").first().locator("tr").nth(1).locator("th")).toHaveCount(0);
    const course = (await first.innerText()).trim();
    expect(course.length).toBeGreaterThan(2);
    await first.click();
    const entry = first.locator('[data-tracked-item="true"]');
    await expect(entry).toBeVisible();
    await entry.locator("select").first().selectOption("completed");
    await entry.locator("select").nth(1).selectOption("fall");
    await saved(card);
    await expect(first).toContainText(course);
    await first.scrollIntoViewIfNeeded();
    await shot(page, `RW${index + 1}-real-word-document`);

    await page.reload();
    const again = cardFor(page, title);
    await open(again);
    const kept = again.locator('[data-tracked-item="true"]');
    await expect(kept).toHaveCount(1, { timeout: 30_000 });
    await expect(kept.locator("select").first()).toHaveValue("completed");
    await expect(kept.locator("select").nth(1)).toHaveValue("fall");

    const doc = (await listDocuments(page)).find((d) => d.title === title)!;
    const stored = await (await page.request.get(`/api/degree-checksheets/${doc.id}/file`)).body();
    expect(stored.equals(bytes), `${name} is stored byte for byte`).toBe(true);
    const [saved_] = await entriesOf(page, doc.id);
    expect(saved_).toMatchObject({ anchorType: "doc_item", status: "completed", term: "fall", itemLabel: course });
    await noHorizontalOverflow(page, name);

    await again.locator('[data-testid^="checksheet-delete-"]').click();
    await page.getByTestId("checksheet-delete-confirm").click();
    await expect(cardFor(page, title)).toHaveCount(0, { timeout: 20_000 });
  }

  // A saved sign-in page, named like a document, is refused with a reason.
  const notADocument = path.join(FILES, "saved-sign-in-page.pdf");
  writeFileSync(notADocument, "<!DOCTYPE html><html><head><title>Sign in</title></head><body>Sign in to continue</body></html>");
  {
    await page.getByTestId("button-upload-checksheet").first().click();
    const dialog = page.getByTestId("checksheet-upload-dialog");
    await dialog.getByTestId("checksheet-input-file").setInputFiles(notADocument);
    await dialog.getByTestId("checksheet-field-title").fill("Saved sign-in page");
    await dialog.getByTestId("checksheet-upload-submit").click();
    await expect(dialog.getByTestId("checksheet-upload-error")).toContainText("contents don't match its file type", { timeout: 30_000 });
    await dialog.getByTestId("checksheet-upload-cancel").click();
  }
  expect((await listDocuments(page)).some((d) => d.title.startsWith("Real SCU document") || d.title === "Saved sign-in page")).toBe(false);
  expect(errors).toEqual([]);
});

const filesIn = (folder: string, pattern: RegExp): string[] => {
  const dir = REAL_DIR ? path.join(REAL_DIR, folder) : "";
  return dir && existsSync(dir)
    ? readdirSync(dir)
        .filter((n) => pattern.test(n))
        .sort()
        .map((n) => path.join(dir, n))
    : [];
};
const REAL_CHECKLISTS = filesIn("checklists", /\.xlsx$/i);
const REAL_PLANS = filesIn("plans", /\.docx$/i);

test("S. Every real requirements checklist and course plan is shown, tracked in place and left unchanged", async ({ page }) => {
  test.skip(REAL_CHECKLISTS.length + REAL_PLANS.length === 0, "Set CHECKSHEET_REAL_DIR to a folder with checklists/ and plans/.");
  test.setTimeout(45 * 60_000);
  const errors = watchErrors(page);
  await page.goto("/degree-checksheets");
  await sessionReady(page);
  for (const d of await listDocuments(page)) {
    if (/^Real (checklist|plan) \d+$/.test(d.title)) await page.request.delete(`/api/degree-checksheets/${d.id}`);
  }
  await page.reload();
  await sessionReady(page);

  async function upload(file: string, title: string, category: string) {
    await page.getByTestId("button-upload-checksheet").first().click();
    const dialog = page.getByTestId("checksheet-upload-dialog");
    await dialog.getByTestId("checksheet-input-file").setInputFiles(file);
    await dialog.getByTestId("checksheet-field-title").fill(title);
    await dialog.getByTestId("checksheet-field-category").selectOption(category);
    await dialog.getByTestId("checksheet-upload-submit").click();
    await expect(dialog, path.basename(file)).toBeHidden({ timeout: 60_000 });
    const card = cardFor(page, title);
    await open(card);
    return card;
  }

  async function finish(card: Locator, file: string, title: string, entries: number) {
    const doc = (await listDocuments(page)).find((d) => d.title === title)!;
    const stored = await (await page.request.get(`/api/degree-checksheets/${doc.id}/file`)).body();
    expect(stored.equals(readFileSync(file)), `${path.basename(file)} is stored byte for byte`).toBe(true);
    expect(await entriesOf(page, doc.id), path.basename(file)).toHaveLength(entries);
    await noHorizontalOverflow(page, path.basename(file));
    await card.locator('[data-testid^="checksheet-delete-"]').click();
    await page.getByTestId("checksheet-delete-confirm").click();
    await expect(cardFor(page, title)).toHaveCount(0, { timeout: 20_000 });
  }

  let cells = 0;
  for (const [index, file] of REAL_CHECKLISTS.entries()) {
    const name = path.basename(file);
    const title = `Real checklist ${index + 1}`;
    const card = await upload(file, title, "major_checksheet");
    const grid = card.getByTestId("checksheet-grid");
    await expect(grid, name).toBeVisible({ timeout: 30_000 });
    await expect(grid, name).toContainText(/Quarter|Status/);
    // No value a formula failed to produce is shown as if the department wrote it.
    expect(await grid.innerText(), name).not.toMatch(/#(N\/A|REF!|VALUE!|NAME\?)/);

    const offered = grid.locator("[data-tracking-cell]");
    const count = await offered.count();
    expect(count, `${name}: cells offered in place`).toBeGreaterThan(5);
    cells += count;
    // Every one is an empty cell of the student's column, and holds both controls.
    expect(await grid.locator('[data-tracking-cell="both"]').count(), name).toBe(count);

    const first = offered.first();
    await first.scrollIntoViewIfNeeded();
    await first.locator("select").first().selectOption("completed");
    await first.locator("select").nth(1).selectOption("fall");
    await saved(card);
    if (index < 3 || /history/i.test(name)) await shot(page, `S${index + 1}-real-checklist`);
    await finish(card, file, title, 1);
  }

  for (const [index, file] of REAL_PLANS.entries()) {
    const name = path.basename(file);
    const title = `Real plan ${index + 1}`;
    const card = await upload(file, title, "four_year_plan");
    const body = card.locator('[data-testid^="checksheet-document-"][role="region"]');
    await expect(body, name).toBeVisible({ timeout: 30_000 });
    expect(await body.locator("table").count(), name).toBeGreaterThanOrEqual(1);
    expect(((await body.innerText()).match(/[A-Za-z]{3,}/g) ?? []).length, name).toBeGreaterThan(40);
    // A course plan leaves no column for the student; nothing is editable until a cell is chosen.
    await expect(body.locator("select, input, textarea, [contenteditable]"), name).toHaveCount(0);
    await card.getByTestId("checksheet-pick-item").click();
    const pick = body.locator('[data-pickable="true"]').first();
    await pick.scrollIntoViewIfNeeded();
    await pick.click();
    const entry = body.locator('[data-tracked-item="true"]');
    await expect(entry, name).toHaveCount(1);
    await entry.locator("select").first().selectOption("planned");
    await saved(card);
    if (index < 2) await shot(page, `SP${index + 1}-real-plan`);
    await finish(card, file, title, 1);
  }

  console.log(`real checklists: ${REAL_CHECKLISTS.length}, cells offered in place: ${cells}; real course plans: ${REAL_PLANS.length}`);
  expect(errors).toEqual([]);
});
