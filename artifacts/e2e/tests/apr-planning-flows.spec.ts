/**
 * Live QA against a REAL running server (production build), signed in as the
 * synthetic E2E student:
 *
 *   A  APR page — several Workday Excel APRs, each with its own label, upload
 *      date and collapsible full workbook; replace one; delete one
 *   B  Degree Plan — APR reference in the RIGHT column, grouped, grade-free;
 *      Core requirement discovery; add a course
 *   C  Tentative Degree Plan — label and APR reference
 *   D  Quarter Plan — APR reference, Filter tab, Open vs All Sections
 *   E  small screens — the APR becomes an accessible drawer
 *   F  APR privacy under advisor sharing
 *   G  Plan Controls
 *   K  A Workday PDF export: shown as uploaded, and its table read for the sidebar
 *   H  Lecture + lab scheduling for Chemistry, Biology and Physics, conflicts,
 *      swapping one component, removing a course, a tentative future term
 *
 * Every APR used here is SYNTHETIC (api-server/src/__fixtures__/apr).
 *
 * Run: E2E_BASE_URL=http://localhost:18080 pnpm --filter @workspace/e2e exec \
 *        playwright test apr-planning-flows.spec.ts --project=qa-flows
 * Needs seat data for MATH 11 / Fall 2026 (see docs/SECTION_AVAILABILITY.md).
 * Screenshots land in test-results/qa/.
 */
import { test, expect, type Page, type Browser } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync, writeFileSync } from "fs";
import { buildAprFixture, type AprFixtureName } from "../../api-server/src/__fixtures__/apr/build-workbooks";
import { buildAprPdf } from "../../api-server/src/__fixtures__/apr/build-pdf";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(__dirname, "../test-results/qa");
const FILES = path.join(SHOTS, "fixtures");
mkdirSync(FILES, { recursive: true });

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });

async function fixtureFile(name: AprFixtureName): Promise<string> {
  const file = path.join(FILES, `synthetic-apr-${name}.xlsx`);
  writeFileSync(file, await buildAprFixture(name));
  return file;
}

async function listAprs(page: Page): Promise<Array<{ id: number; label: string; uploadedAt: string; fileName: string }>> {
  return (await (await page.request.get("/api/progress-reports")).json()).reports ?? [];
}

async function deleteAllAprs(page: Page) {
  for (const r of await listAprs(page)) await page.request.delete(`/api/progress-reports/${r.id}`);
}

/** Remove any course this spec added to the student's plans so re-runs start clean. */
async function removePlanItems(page: Page, codes: string[]) {
  const plans = (await (await page.request.get("/api/plans")).json()).plans ?? [];
  for (const plan of plans) {
    const full = await (await page.request.get(`/api/plans/${plan.id}`)).json();
    for (const item of full.items ?? []) {
      if (item.courseCode && codes.includes(item.courseCode)) {
        await page.request.delete(`/api/plans/${plan.id}/items/${item.id}`);
      }
    }
  }
}

/** Upload one APR through the real UI: label, category, file, Upload. */
async function uploadApr(page: Page, fixture: AprFixtureName, label: string, category: string) {
  await page.goto("/progress-report");
  const another = page.getByTestId("button-upload-another");
  const form = page.getByTestId("card-upload-form");
  await expect(form.or(another).first()).toBeVisible({ timeout: 20_000 });
  if (!(await form.isVisible())) await another.click();
  await page.getByTestId("input-apr-label").fill(label);
  await page.getByTestId("select-apr-category").selectOption(category);
  await page.locator('[data-testid="card-upload-form"] input[type="file"]').setInputFiles(await fixtureFile(fixture));
  await page.getByTestId("button-upload").click();
  await expect(page.getByTestId("apr-document-label").filter({ hasText: label })).toBeVisible({ timeout: 30_000 });
}

const cardFor = (page: Page, label: string) =>
  page.locator('[data-apr-card]').filter({ has: page.getByTestId("apr-document-label").filter({ hasText: label }) }).first();

const TODAY = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const PRIVATE = ["Fall 2026 Quarter", "Fall 2025 Quarter", "Winter 2026 Quarter", "Spring 2026 Quarter"];

/** Console/page errors that are the app's own (not Clerk dev-instance noise or expected 4xx). */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/clerk|favicon|Failed to load resource.*(401|404|409|422)/i.test(m.text())) {
      errors.push(`console: ${m.text()}`);
    }
  });
  return errors;
}

/**
 * A stored session token is short-lived. After the first page load, wait until
 * the page has refreshed it before calling the API directly.
 */
async function sessionReady(page: Page) {
  await expect
    .poll(async () => (await page.request.get("/api/progress-reports")).status(), { timeout: 30_000 })
    .toBe(200);
}

test.describe.configure({ mode: "serial" });

test("A. APR page: several Excel APRs, full workbook, upload dates, replace one, delete one", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.goto("/");
  await sessionReady(page);
  await deleteAllAprs(page);

  // No APR yet -> the upload form, Excel-first.
  await page.goto("/progress-report");
  await expect(page.getByTestId("card-upload-form")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("upload-supported-format")).toContainText(".xlsx");
  await shot(page, "A1-no-apr");

  // 1) Primary major.
  await uploadApr(page, "finance-major", "Finance Major", "primary_major");
  const finance = cardFor(page, "Finance Major");
  await expect(finance.getByTestId("apr-document-uploaded")).toContainText(`Uploaded ${TODAY}`);
  await expect(finance.getByTestId("apr-document-status")).toHaveText("Ready");

  // Full workbook: every column, source order, source wording.
  const table = finance.getByTestId("apr-workbook-table");
  await expect(table).toBeVisible({ timeout: 20_000 });
  const header = table.locator("tbody tr").filter({ hasText: "Requirement" }).first();
  await expect(header.locator("td")).toHaveText([
    "Requirement",
    "Status",
    "Remaining",
    "Satisfied With",
    "Academic Period",
    "Units",
    "Grade",
  ]);
  const text = await table.innerText();
  for (const expected of ["Fall 2026 Quarter", "4.5", "B+", "CR", "Core: LSB: 2nd Language (Level 2)", "Finance Major : FNCE 121 & 124"]) {
    expect(text, expected).toContain(expected);
  }
  const requirements = await table.locator("tbody tr td:nth-of-type(1)").allInnerTexts();
  const order = requirements.map((t) => t.trim()).filter((t) => /^(University|Core|Sample|Finance)/.test(t));
  expect(order).toEqual([
    "University Requirement: Must have a minimum 2.000 Cumulative GPA",
    "University Requirement: Must complete a minimum 60 Upper Division Units",
    "Core: LSB: CTW 1",
    "Core: LSB: C&I 1",
    "Core: LSB: C&I 2",
    "Core: LSB: 2nd Language (Level 2)",
    "Sample School of Business Core Knowledge: Accounting 11",
    "Finance Major : Major GPA",
    "Finance Major : FNCE 121 & 124",
    "Finance Major : Upper Division Electives",
  ]);
  // Read-only, and nothing reinterpreted.
  expect(await table.locator("input, textarea, select, button, [contenteditable]").count()).toBe(0);
  expect(await page.locator("body").innerText()).not.toMatch(/Needs Review|Auto-verified|Completed Courses|Matched|Verify in Workday/);
  // Scrolls inside its own region, never the page.
  const scroll = finance.getByTestId("apr-workbook-scroll");
  expect(await scroll.evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await shot(page, "A2-full-workbook");

  // Collapse it.
  await finance.locator('[data-testid^="apr-document-toggle-"]').click();
  await expect(finance.getByTestId("apr-workbook-table")).toHaveCount(0);

  // 2) Second major, 3) minor — each added BESIDE the others.
  await uploadApr(page, "computer-science-major", "Computer Science Major", "second_major");
  await uploadApr(page, "data-science-minor", "Data Science Minor", "minor");
  await expect(page.getByTestId("apr-document-count")).toContainText("3 APRs uploaded");
  await expect(page.getByTestId("apr-document-label")).toHaveText(["Finance Major", "Computer Science Major", "Data Science Minor"]);
  await expect(page.getByTestId("apr-document-uploaded")).toHaveCount(3);
  // With several documents, none is forced open.
  await page.reload();
  await expect(page.getByTestId("apr-document-count")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("apr-workbook-table")).toHaveCount(0);
  await shot(page, "A3-three-aprs-collapsed");

  // Independently expandable.
  const cs = cardFor(page, "Computer Science Major");
  await cs.locator('[data-testid^="apr-document-toggle-"]').click();
  await expect(cs.getByTestId("apr-workbook-table")).toContainText("Computer Science Major : CSCI 10");
  await expect(cs.getByTestId("apr-workbook-table")).not.toContainText("Finance Major");
  await expect(cardFor(page, "Finance Major").getByTestId("apr-workbook-table")).toHaveCount(0);
  await cs.locator('[data-testid^="apr-document-toggle-"]').click();

  // Original file: private, owner-only, never cached, never rendered as HTML.
  const before = await listAprs(page);
  const minorId = before.find((r) => r.label === "Data Science Minor")!.id;
  const file = await page.request.get(`/api/progress-reports/${minorId}/file`);
  expect(file.status()).toBe(200);
  expect(file.headers()["cache-control"]).toBe("private, no-store");
  expect(file.headers()["x-content-type-options"]).toBe("nosniff");
  expect(file.headers()["content-disposition"]).toContain("attachment");
  const dto = JSON.stringify(before);
  expect(dto).not.toMatch(/objectPath|userId|\/objects\//);

  // Replace ONLY the minor; the others keep their file and date.
  await page.waitForTimeout(1100);
  const minor = cardFor(page, "Data Science Minor");
  await minor.locator('[data-testid^="apr-replace-"]').click();
  await expect(minor.getByTestId("apr-replace-form")).toContainText("Only this APR is replaced");
  await minor.locator('[data-testid="apr-replace-form"] input[type="file"]').setInputFiles(await fixtureFile("two-sheets"));
  await minor.getByTestId("apr-replace-submit").click();
  await expect(minor.getByTestId("apr-replace-form")).toHaveCount(0, { timeout: 30_000 });
  const after = await listAprs(page);
  const replaced = after.find((r) => r.id === minorId)!;
  expect(replaced.fileName).toBe("synthetic-apr-two-sheets.xlsx");
  expect(new Date(replaced.uploadedAt).getTime()).toBeGreaterThan(new Date(before.find((r) => r.id === minorId)!.uploadedAt).getTime());
  expect(after.filter((r) => r.id !== minorId)).toEqual(before.filter((r) => r.id !== minorId));
  // The new file has several worksheets: none is dropped.
  await expect(minor.getByTestId("apr-sheet-tabs").getByRole("tab")).toHaveText(["Finance Major", "Data Science Minor", "Empty (empty)"]);
  await minor.getByTestId("apr-sheet-tab-1").click();
  await expect(minor.getByTestId("apr-workbook-table")).toContainText("Data Science Minor : Minor GPA");
  await shot(page, "A4-replaced-multi-sheet");

  // A replacement that cannot be read leaves the good file in place.
  await minor.locator('[data-testid^="apr-replace-"]').click();
  const broken = path.join(FILES, "broken.xlsx");
  writeFileSync(broken, (await buildAprFixture("finance-major")).subarray(0, 1500));
  await minor.locator('[data-testid="apr-replace-form"] input[type="file"]').setInputFiles(broken);
  await minor.getByTestId("apr-replace-submit").click();
  await expect(minor.getByTestId("apr-replace-error")).toContainText(/damaged|could not be opened/i, { timeout: 30_000 });
  await expect(minor.getByTestId("apr-replace-error")).toContainText("Your previous file was kept");
  expect((await listAprs(page)).find((r) => r.id === minorId)).toEqual(replaced);
  await shot(page, "A5-bad-replacement-kept-old");
  await minor.getByRole("button", { name: "Cancel" }).click();

  // Put the real minor back for the planning tests.
  await minor.locator('[data-testid^="apr-replace-"]').click();
  await minor.locator('[data-testid="apr-replace-form"] input[type="file"]').setInputFiles(await fixtureFile("data-science-minor"));
  await minor.getByTestId("apr-replace-submit").click();
  await expect(minor.getByTestId("apr-replace-form")).toHaveCount(0, { timeout: 30_000 });

  // Rename.
  await cs.locator('[data-testid^="apr-rename-"]').click();
  await cs.getByTestId("apr-rename-label").fill("Computer Science Major (BS)");
  await cs.getByTestId("apr-rename-save").click();
  await expect(page.getByTestId("apr-document-label").filter({ hasText: "Computer Science Major (BS)" })).toBeVisible({ timeout: 15_000 });

  // Delete asks first; cancelling keeps the APR; confirming removes only that one.
  const extraLabel = "Scratch APR";
  await uploadApr(page, "unrecognized-layout", extraLabel, "other");
  const scratch = cardFor(page, extraLabel);
  await scratch.locator('[data-testid^="apr-delete-"]').click();
  await expect(page.getByTestId("apr-delete-dialog")).toContainText(`Delete “${extraLabel}”?`);
  await page.getByTestId("apr-delete-cancel").click();
  await expect(page.getByTestId("apr-document-label").filter({ hasText: extraLabel })).toBeVisible();
  // Even an unrecognised layout is shown IN FULL here.
  await scratch.locator('[data-testid^="apr-document-toggle-"]').click();
  await expect(scratch.getByTestId("apr-workbook-table")).toContainText("Calculus");
  await shot(page, "A6-unrecognized-layout-full-view");

  expect(errors, errors.join("\n")).toEqual([]);
});

test("B. Degree Plan: APR reference in the RIGHT column (grouped, grade-free), Core requirement discovery, add course", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = watchErrors(page);
  await page.goto("/");
  await sessionReady(page);
  await removePlanItems(page, ["ENGL 1A"]);
  await page.goto("/degree-plan");
  const panel = page.getByTestId("workday-apr-panel").first();
  await expect(panel).toBeVisible({ timeout: 30_000 });

  // It is the right-hand column, and wide enough to read.
  const board = await page.getByTestId("degree-plan-board-column").boundingBox();
  const column = await page.getByTestId("degree-plan-progress-column").boundingBox();
  expect(column!.x).toBeGreaterThan(board!.x + board!.width - 1);
  expect(column!.width).toBeGreaterThanOrEqual(330);
  expect(board!.width).toBeGreaterThan(600); // the planning workspace keeps its room

  // Every APR is listed with its label and upload date; the first is open.
  const docs = panel.locator('[data-testid^="apr-sidebar-document-"]:not([data-testid*="toggle"])');
  await expect(docs).toHaveCount(4);
  const toggles = panel.locator('[data-testid^="apr-sidebar-document-toggle-"]');
  await expect(toggles.nth(0)).toContainText("Finance Major");
  await expect(toggles.nth(0)).toContainText(`Uploaded ${TODAY}`);
  await expect(toggles.nth(1)).toContainText("Computer Science Major (BS)");
  await expect(toggles.nth(2)).toContainText("Data Science Minor");
  await expect(toggles.nth(0)).toHaveAttribute("aria-expanded", "true");
  await expect(toggles.nth(1)).toHaveAttribute("aria-expanded", "false");
  await shot(page, "B1-degree-plan-1440");

  // Groups, from Workday's own headings.
  const finance = docs.nth(0);
  const groups = finance.locator("[data-group-key] h4 button");
  await expect(groups).toContainText(["University Requirements", "Core", "Sample School of Business Core Knowledge", "Finance Major"]);
  const open = async (scope: typeof finance, name: string) => {
    const b = scope.locator("[data-group-key] h4 button").filter({ hasText: name }).first();
    if ((await b.getAttribute("aria-expanded")) !== "true") await b.click();
    await expect(b).toHaveAttribute("aria-expanded", "true");
    return b;
  };
  for (const name of ["University Requirements", "Core", "Finance Major"]) await open(finance, name);
  await expect(finance.getByRole("columnheader")).toHaveText(
    Array(3).fill(["Requirement", "Status", "Remaining", "Satisfied With"]).flat(),
  );
  const shown = await finance.innerText();
  for (const expected of [
    "University Requirement: Must have a minimum 2.000 Cumulative GPA",
    "Core: LSB: 2nd Language (Level 2)",
    "Minimum Combination Required",
    "Finance Major : FNCE 121 & 124",
    "Not Satisfied",
    "In Progress",
    "FNCE 121 - Corporate Finance",
  ]) {
    expect(shown, expected).toContain(expected);
  }
  await shot(page, "B2-sidebar-groups-open");

  // Academic Period / Units / Grade: not on screen, not in the DOM, not in the payload.
  const dom = await panel.evaluate((el) => el.outerHTML);
  for (const period of PRIVATE) expect(dom, period).not.toContain(period);
  const cells = await panel.getByRole("cell").allInnerTexts();
  for (const token of ["A-", "B+", "C+", "CR", "4.5", "4", "5"]) expect(cells, token).not.toContain(token);
  expect(await panel.getByRole("columnheader").allInnerTexts()).not.toEqual(expect.arrayContaining(["Grade"]));
  const payload = await (await page.request.get("/api/progress-reports/sidebar")).text();
  for (const period of PRIVATE) expect(payload, period).not.toContain(period);
  expect(payload).not.toMatch(/"(A-|B\+|C\+|CR|4\.5)"/);
  expect(payload).not.toMatch(/objectPath|completedCourses|inCatalog/);

  // No CampusVal verdict beside Workday's words.
  expect(await panel.innerText()).not.toMatch(/verified|needs review|matched|not in the campusval catalog/i);
  await expect(page.getByTestId("apr-plan-mismatch")).toHaveCount(0);
  await expect(page.getByTestId("apr-major-mismatch-warning")).toHaveCount(0);

  // Collapse the first APR entirely; open the second for comparison.
  await toggles.nth(0).click();
  await expect(finance.locator("[data-group-key]")).toHaveCount(0);
  await toggles.nth(1).click();
  await open(docs.nth(1), "Core");
  await expect(docs.nth(1)).toContainText("Core: CAS: CTW 1");
  await toggles.nth(2).click();
  await expect(docs.nth(2)).toContainText("Data Science Minor : Minor GPA");
  // The layout CampusVal does not recognise is flagged, not guessed at.
  await toggles.nth(3).click();
  await expect(docs.nth(3).getByTestId("apr-sidebar-unrecognized")).toContainText("Nothing was lost");
  await shot(page, "B3-second-apr-and-minor");

  // Keyboard: the accordion is operable without a mouse.
  await toggles.nth(1).focus();
  await page.keyboard.press("Enter");
  await expect(toggles.nth(1)).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Space");
  await expect(toggles.nth(1)).toHaveAttribute("aria-expanded", "true");

  // To the full APRs and back.
  await panel.getByTestId("link-view-full-aprs").click();
  await expect(page).toHaveURL(/\/progress-report$/);
  await expect(page.getByTestId("apr-document-count")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("link-back-degree-plan").click();
  await expect(page).toHaveURL(/\/degree-plan$/);
  await expect(page.getByTestId("workday-apr-panel").first()).toBeVisible({ timeout: 30_000 });

  // Core requirement: expand the University Core group, then "Find courses" → complete list in a real scroll region.
  await page.getByRole("button", { name: /University Core Curriculum/ }).first().click();
  const findCtw = page.getByTestId("find-courses-ctw1");
  await findCtw.scrollIntoViewIfNeeded();
  await findCtw.click();
  const list = page.getByTestId("course-results-list").first();
  await expect(list).toBeVisible({ timeout: 15_000 });
  const items = await list.getByRole("listitem").count();
  console.log(`CTW results in Degree Plan palette: ${items}`);
  expect(items).toBeGreaterThanOrEqual(5);
  const box = await list.boundingBox();
  console.log(`CTW list box: ${box?.width}x${box?.height}`);
  expect(box!.height).toBeGreaterThan(120);
  await shot(page, "B2-ctw-results");

  // Advanced Writing: the bulletin-stated designations are all there.
  await page.getByTestId("find-courses-ctw1").click(); // collapse CTW
  const findAw = page.getByTestId("find-courses-advwriting");
  await findAw.scrollIntoViewIfNeeded();
  await findAw.click();
  const awList = page.getByTestId("course-results-list").first();
  await expect(awList).toBeVisible();
  const awText = await awList.innerText();
  for (const c of ["CHEM 132", "COMM 165M", "ENGL 28"]) expect(awText).toContain(c);
  await shot(page, "B3-advanced-writing");

  // A requirement with no catalog mapping says so and links to its source.
  const pathway = page.getByTestId("no-mapping-pathway");
  await pathway.scrollIntoViewIfNeeded();
  await expect(pathway).toContainText("doesn't have course tagging");

  // Add a discovered course; it lands in the plan.
  await findAw.click();
  await page.getByTestId("find-courses-ctw1").click();
  await page.getByRole("button", { name: "Add ENGL 1A" }).click();
  await expect(page.getByTestId("degree-plan-board-column").getByText("ENGL 1A").first()).toBeVisible({ timeout: 15_000 });
  await shot(page, "B4-added-course");
  // …and it flows into Quarter Planning's "From your Degree Plan" reference (checked in D), so clean up after D.
  expect(errors, errors.join("\n")).toEqual([]);
});

test("C. Tentative Degree Plan: label, APR reference", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tentative-plans");
  await expect(page.getByRole("heading", { name: "Tentative Degree Plan" }).first()).toBeVisible({ timeout: 20_000 });
  const startBlank = page.getByTestId("button-start-blank-tentative");
  if (await startBlank.isVisible().catch(() => false)) await startBlank.click();
  const panel = page.getByTestId("workday-apr-panel").first();
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.locator('[data-testid^="apr-sidebar-document-toggle-"]').first()).toContainText("Finance Major");
  await expect(page.getByTestId("degree-plan-progress-column")).toBeVisible();
  await shot(page, "C1-tentative-1440");
  // No stray variants of the label anywhere on the page.
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/Tentative Plan\b|Degree Planner|Degree Planning Plan|Official Degree Plan|Tentitive|Tenative/);

  // Plan Controls: exactly one Degree Plan; every other plan says what it is.
  await page.getByTestId("button-open-plan-controls").click();
  const sheet = page.getByTestId("sheet-plan-controls");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Degree Plan$/ })).toHaveCount(1);
  const tentative = sheet.locator('[data-testid^="select-tentative-plan-"]');
  expect(await tentative.count()).toBeGreaterThan(0);
  for (const label of await tentative.allInnerTexts()) expect(label).toMatch(/Tentative Degree Plan/i);
  await expect(sheet.getByRole("button", { name: /New Tentative Degree Plan/ })).toBeVisible();
  const plans = (await (await page.request.get("/api/plans")).json()).plans as Array<{ planType: string }>;
  expect(plans.filter((p) => p.planType === "degree")).toHaveLength(1);
  await shot(page, "C2-plan-selector");
  await page.keyboard.press("Escape");
});

test("D. Quarter Plan: APR reference, Filter tab Core results, Open vs All Sections", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/planner");
  await expect(page.getByTestId("quarter-plan-layout")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("quarter-plan-apr-column").getByTestId("workday-apr-panel")).toBeVisible();
  await shot(page, "D1-quarter-plan-1440");

  // Ensure a Fall 2026 schedule exists (created through the same API the UI's "+" uses), then reload.
  const existing = await (await page.request.get("/api/schedules")).json();
  const schedules = Array.isArray(existing) ? existing : existing.schedules ?? [];
  if (!schedules.some((sc: any) => sc.term === "fall" && sc.year === 2026)) {
    const res = await page.request.post("/api/schedules", { data: { name: "QA Fall 2026", term: "fall", year: 2026 } });
    expect(res.status()).toBeLessThan(300);
  }
  // Start from an empty schedule so re-runs are repeatable.
  const all = await (await page.request.get("/api/schedules")).json();
  for (const sc of (Array.isArray(all) ? all : all.schedules ?? []).filter((x: any) => x.term === "fall" && x.year === 2026)) {
    const full = await (await page.request.get(`/api/schedules/${sc.id}`)).json();
    for (const ev of full.events ?? []) await page.request.delete(`/api/schedules/${sc.id}/events/${ev.id}`);
  }
  await page.reload();
  await expect(page.getByTestId("quarter-plan-layout")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("tab", { name: /Filter/ })).toBeVisible({ timeout: 30_000 });

  // Filter tab: click the CTW chip → the FULL list, in a usable (not one-row) window.
  await page.getByRole("tab", { name: /Filter/ }).click();
  await page.getByTestId("core-chip-CTW").click();
  const list = page.getByTestId("course-results-list");
  await expect(list).toBeVisible({ timeout: 15_000 });
  const n = await list.getByRole("listitem").count();
  const box = await list.boundingBox();
  console.log(`Quarter Plan CTW results: ${n}, list box ${box?.width}x${box?.height}`);
  expect(n).toBeGreaterThanOrEqual(5);
  expect(box!.height).toBeGreaterThan(150); // not the old one-row sliver
  await shot(page, "D2-filter-ctw");

  for (const chip of ["AW", "C&I"]) {
    await page.getByTestId("button-clear-filters").click();
    await page.getByTestId(`core-chip-${chip}`).click();
    await expect(page.getByTestId("course-results-list")).toBeVisible({ timeout: 15_000 });
    const count = await page.getByTestId("course-results-list").getByRole("listitem").count();
    console.log(`${chip}: ${count} listed`);
    expect(count).toBeGreaterThan(5);
  }
  // Keyword alias: typing CTW finds Core courses; ordinary text search still works.
  await page.getByTestId("button-clear-filters").click().catch(() => undefined);
  await page.getByTestId("input-filter-keyword").fill("CTW");
  await expect(page.getByTestId("course-results-list")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("input-filter-keyword").fill("abstract data");
  await expect(page.getByTestId("course-results-list")).toContainText("CSEN");

  // View sections hands a course to the Find tab, where Open vs All applies.
  await page.getByTestId("input-filter-keyword").fill("MATH 11");
  await page.getByRole("button", { name: "View sections for MATH 11" }).first().click();
  await expect(page.getByTestId("availability-view")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("availability-banner")).toContainText(/manual snapshot|not connected|Live/);
  await shot(page, "D3-sections-all");
  const banner = await page.getByTestId("availability-banner").getAttribute("data-state");
  console.log(`availability banner state: ${banner}`);

  const badge = (n: string) => page.getByTestId(`availability-badge-${n}`);
  for (const [n, label] of [["1", "OPEN"], ["2", "FULL"], ["3", "WAITLIST"], ["5", "UNKNOWN"]] as const) {
    await expect(badge(n)).toContainText(label);
  }
  // Never a LIVE chip on a manual snapshot.
  await expect(page.getByText("LIVE", { exact: true })).toHaveCount(0);

  await page.getByTestId("availability-view-open").click();
  await expect(badge("1")).toBeVisible();
  await expect(badge("2")).toHaveCount(0); // full hidden
  await expect(badge("3")).toHaveCount(0); // waitlist hidden
  await expect(badge("5")).toBeVisible(); // unknown stays, labelled
  await shot(page, "D4-sections-open-only");
  await page.getByTestId("availability-view-all").click();
  await expect(badge("2")).toBeVisible();

  // Add a section, confirm it persists across reload.
  await page.getByTestId("add-section-1").click();
  await expect(page.getByText("Added").first()).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByTestId("quarter-plan-layout")).toBeVisible({ timeout: 30_000 });
  await shot(page, "D5-after-reload");
});

test("E. small screens: the APR becomes an accessible drawer; the full APR scrolls sideways", async ({ page }) => {
  test.setTimeout(180_000);
  for (const [w, h, name] of [[1024, 768, "1024"], [768, 1024, "768"], [390, 844, "390"]] as const) {
    await page.setViewportSize({ width: w, height: h });
    expect(await page.evaluate(() => window.innerWidth)).toBe(w);

    for (const route of ["/degree-plan", "/planner"]) {
      await page.goto(route);
      const tag = `${route.slice(1)}-${name}`;
      // The permanent column is not rendered as a squeezed sliver.
      const trigger = page.getByTestId("button-open-apr-reference").first();
      await expect(trigger).toBeVisible({ timeout: 30_000 });
      await expect(trigger).toHaveAccessibleName(/Academic Progress Report/);
      // No horizontal page scroll.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${tag} horizontal overflow`).toBeLessThanOrEqual(1);
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const first = dialog.locator('[data-testid^="apr-sidebar-document-toggle-"]').first();
      await expect(first).toBeVisible({ timeout: 20_000 });
      await expect(first).toContainText(`Uploaded ${TODAY}`);
      const core = dialog.locator("[data-group-key] h4 button").filter({ hasText: /^Core/ }).first();
      await core.click();
      await expect(dialog.getByText("Core: LSB: CTW 1")).toBeVisible();
      // Readable: the table fits the drawer instead of being clipped.
      const box = await dialog.getByRole("table").first().boundingBox();
      expect(box!.width).toBeLessThanOrEqual(w);
      const font = await dialog.getByRole("cell").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(font).toBeGreaterThanOrEqual(11);
      await shot(page, `E-${tag}-drawer`);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      // Focus returns to the trigger.
      await expect(trigger).toBeFocused();
    }

    // Full APR page: the workbook keeps its columns and scrolls inside its own region.
    await page.goto("/progress-report");
    const card = cardFor(page, "Finance Major");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.locator('[data-testid^="apr-document-toggle-"]').click();
    const scroll = card.getByTestId("apr-workbook-scroll");
    await expect(scroll).toBeVisible({ timeout: 20_000 });
    const dims = await scroll.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    if (w < 1000) expect(dims.scroll).toBeGreaterThan(dims.client);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await expect(card.getByTestId("apr-workbook-table")).toContainText("Grade");
    await shot(page, `E-full-apr-${name}`);
  }
});

test("F. APR stays private under advisor sharing", async ({ browser }: { browser: Browser }) => {
  const student = await browser.newContext({ storageState: path.resolve(__dirname, "../storage/student-a.json") });
  const advisor = await browser.newContext({ storageState: path.resolve(__dirname, "../storage/advisor-y.json") });
  const base = process.env.E2E_BASE_URL ?? "http://localhost:18080";
  const sp = await student.newPage();
  const ap = await advisor.newPage();
  await sp.goto(base + "/");
  await ap.goto(base + "/");
  // A stored session token is short-lived; wait until each page has refreshed
  // it before calling the API directly.
  for (const p of [sp, ap]) {
    await expect
      .poll(async () => (await p.request.get(base + "/api/progress-reports")).status(), { timeout: 30_000 })
      .toBe(200);
  }

  // Student has APRs (from test A).
  const mine = (await (await sp.request.get(base + "/api/progress-reports")).json()).reports as Array<{ id: number }>;
  expect(mine.length).toBeGreaterThanOrEqual(3);

  // Share the plan with the synthetic advisor.
  const advisorEmail = "e2e-advisor-y+clerk_test@scu.edu";
  const grant = await sp.request.post(base + "/api/plan-shares", { data: { advisorEmail, scopes: ["degree_plan", "apr"] } });
  expect(grant.status()).toBeLessThan(300);
  expect((await grant.json()).scopes).not.toContain("apr");

  const shared = await (await ap.request.get(base + "/api/advisor/shared-students")).json();
  const studentUserId = shared.students?.[0]?.studentUserId ?? shared[0]?.studentUserId;
  expect(studentUserId).toBeTruthy();
  const plan = await ap.request.get(base + `/api/advisor/shared-students/${studentUserId}/plan`);
  expect(plan.status()).toBe(200);
  expect(await plan.text()).not.toMatch(/workbook|importStatus|"grade"|Finance Major|Core: LSB|FNCE 121/);

  // The advisor's APR list is their own (empty); the student's documents do not exist for them.
  expect((await (await ap.request.get(base + "/api/progress-reports")).json()).reports).toEqual([]);
  expect((await (await ap.request.get(base + "/api/progress-reports/sidebar")).json()).documents).toEqual([]);
  expect((await (await ap.request.get(base + `/api/progress-reports?userId=${studentUserId}`)).json()).reports).toEqual([]);
  for (const { id } of mine) {
    for (const suffix of ["", "/workbook", "/file"]) {
      expect((await ap.request.get(base + `/api/progress-reports/${id}${suffix}`)).status()).toBe(404);
    }
    expect((await ap.request.patch(base + `/api/progress-reports/${id}`, { data: { label: "x" } })).status()).toBe(404);
    expect((await ap.request.delete(base + `/api/progress-reports/${id}`)).status()).toBe(404);
  }
  // In the advisor's browser, the shared-plan pages show no APR content.
  await ap.goto(base + "/shared-with-me");
  await expect(ap.locator("body")).not.toContainText("Core: LSB");
  expect((await (await sp.request.get(base + "/api/progress-reports")).json()).reports).toHaveLength(mine.length);

  // Cleanup: revoke.
  const list = await (await sp.request.get(base + "/api/plan-shares")).json();
  for (const s of list.shares ?? list) {
    if (s.advisorEmail === advisorEmail && !s.revokedAt) await sp.request.delete(base + `/api/plan-shares/${s.id}`);
  }
  await student.close();
  await advisor.close();
});

test("G. Plan Controls: the primary-major selector lists the FULL catalog of majors and stays scrollable; Share panel offers only plan scopes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/clerk|favicon|Failed to load resource.*(401|404)/i.test(m.text())) errors.push(`console: ${m.text()}`);
  });

  const majors = await (await page.request.get("/api/graduation-paths/majors")).json();
  const total = (majors.majors ?? majors).length;
  expect(total).toBeGreaterThan(30);

  await page.goto("/degree-plan");
  await page.getByTestId("button-open-plan-controls").click();
  const sheet = page.getByTestId("sheet-plan-controls");
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId("plan-primary-major-current")).toBeVisible();

  await page.getByTestId("select-plan-primary-major").click();
  const options = page.locator('[data-testid^="major-option-"]');
  await expect(options.first()).toBeVisible({ timeout: 10_000 });
  const count = await options.count();
  console.log(`major options rendered: ${count} of ${total} in the catalog`);
  expect(count).toBe(total);
  // The list is a bounded scroll region, not a page-height wall.
  const scroller = await options.first().evaluateHandle((el) => {
    let n: HTMLElement | null = el as HTMLElement;
    while (n && n.scrollHeight <= n.clientHeight + 1) n = n.parentElement;
    return n;
  });
  const scrollable = await scroller.evaluate((n) => !!n && (n as HTMLElement).scrollHeight > (n as HTMLElement).clientHeight);
  expect(scrollable).toBe(true);
  await shot(page, "G1-major-selector");

  // Selecting a major works and is reflected (Escape/reselect the original afterwards).
  const before = (await page.getByTestId("plan-primary-major-current").innerText()).trim();
  // Pick an option that is NOT the current major, so re-runs always change it.
  let pickIndex = 3;
  const currentName = before.replace(/^Planning around:\s*/i, "");
  if ((await options.nth(pickIndex).innerText()).includes(currentName)) pickIndex = 4;
  await options.nth(pickIndex).scrollIntoViewIfNeeded();
  await options.nth(pickIndex).click();
  await expect(page.getByTestId("plan-primary-major-current")).not.toHaveText(before, { timeout: 10_000 });
  // Restore the original major so the run is repeatable, then close the sheet.
  await page.getByTestId("select-plan-primary-major").click();
  const originalOption = page.locator('[data-testid^="major-option-"]', { hasText: before.split(/\s*[—-]\s*/)[0]! }).first();
  if (await originalOption.count()) await originalOption.click();
  await page.keyboard.press("Escape");
  if (await sheet.isVisible().catch(() => false)) {
    await sheet.getByRole("button", { name: /close/i }).first().click();
  }
  await expect(sheet).toBeHidden({ timeout: 10_000 });

  // Share panel: scopes are the two PLAN scopes; APR is not an option.
  await page.getByTestId("button-open-advisor-sharing").click();
  const panel = page.getByTestId("advisor-sharing-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("input-advisor-email")).toBeVisible();
  await expect(panel.getByTestId("checkbox-scope-degree_plan")).toBeVisible();
  expect(await panel.locator('[data-testid^="checkbox-scope-"]').count()).toBe(2);
  // No share OPTION concerns the APR, and the panel tells the student it is never shared.
  const scopeLabels = (await panel.locator('[data-testid^="checkbox-scope-"]').evaluateAll((els) => els.map((e) => e.closest("label")?.textContent ?? e.parentElement?.textContent ?? ""))).join("|").toLowerCase();
  expect(scopeLabels).not.toMatch(/apr|progress report/);
  expect((await panel.innerText()).toLowerCase()).toContain("workday apr is never shared with advisors");
  await shot(page, "G2-share-panel");

  expect(errors, errors.join("\n")).toEqual([]);
});

// ─── H. Lecture + lab scheduling ─────────────────────────────────────────────

type ApiSection = { sectionNumber: string; componentType: string; meetingDays: string[]; startTime: string; endTime: string };
type ApiEvent = { id: number; courseCode: string; sectionNumber: string; componentType: string };

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const overlaps = (a: ApiSection, b: ApiSection) =>
  a.meetingDays.some((d) => b.meetingDays.includes(d)) &&
  minutes(a.startTime) < minutes(b.endTime) &&
  minutes(b.startTime) < minutes(a.endTime);

async function sectionsOf(page: Page, code: string, term: string, year: number): Promise<ApiSection[]> {
  return (await page.request.get(`/api/courses/${encodeURIComponent(code)}/sections?term=${term}&year=${year}`)).json();
}

/** One empty schedule for the quarter, so the run is repeatable. */
async function freshSchedule(page: Page, term: string, year: number, name: string): Promise<number> {
  const all = await (await page.request.get("/api/schedules")).json();
  for (const sc of (all.schedules ?? []).filter((x: any) => x.term === term && x.year === year)) {
    await page.request.delete(`/api/schedules/${sc.id}`);
  }
  const created = await page.request.post("/api/schedules", { data: { name, term, year } });
  expect(created.status()).toBe(201);
  return (await created.json()).id;
}

async function scheduleState(page: Page, id: number) {
  const body = await (await page.request.get(`/api/schedules/${id}`)).json();
  return {
    parts: (code: string) =>
      (body.events as ApiEvent[])
        .filter((e) => e.courseCode === code)
        .map((e) => `${e.componentType}:${e.sectionNumber}`)
        .sort(),
    status: (code: string) => (body.courseStatus as any[]).find((c) => c.courseCode === code),
    events: body.events as ApiEvent[],
  };
}

async function openCourse(page: Page, code: string) {
  const find = page.getByTestId("quick-add-search");
  await expect(find).toBeVisible({ timeout: 30_000 });
  await find.getByPlaceholder(/Search by code or title/).fill(code);
  await find.getByRole("button", { name: new RegExp(`^View sections for ${code}:`) }).first().click();
  await expect(find.getByRole("heading", { name: code, exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(find.locator('[data-testid^="section-group-"]').first()).toBeVisible({ timeout: 20_000 });
  return find;
}

test("H. Quarter Plan: lecture + lab for Chemistry, Biology and Physics; conflicts; swapping; removing; a tentative term", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = watchErrors(page);
  await page.goto("/");
  await sessionReady(page);
  const scheduleId = await freshSchedule(page, "fall", 2026, "QA Labs Fall 2026");

  // Pick sections from the real Registrar data: a lecture and a lab per course,
  // with the BIOL and PHYS labs chosen so that they OVERLAP each other.
  const data = Object.fromEntries(
    await Promise.all(["CHEM 11", "BIOL 1B", "PHYS 11"].map(async (c) => [c, await sectionsOf(page, c, "fall", 2026)] as const)),
  ) as Record<string, ApiSection[]>;
  const of = (code: string, type: string) => data[code]!.filter((s) => s.componentType === type);
  for (const code of Object.keys(data)) {
    expect(of(code, "lecture").length, `${code} lectures`).toBeGreaterThan(0);
    expect(of(code, "lab").length, `${code} labs`).toBeGreaterThan(0);
    expect(of(code, "lecture").length + of(code, "lab").length, `${code}: every section is a lecture or a lab`).toBe(data[code]!.length);
  }
  let clash: [ApiSection, ApiSection] | null = null;
  for (const b of of("BIOL 1B", "lab")) for (const p of of("PHYS 11", "lab")) if (!clash && overlaps(b, p)) clash = [b, p];
  expect(clash, "an overlapping BIOL 1B / PHYS 11 lab pair exists in Fall 2026").not.toBeNull();
  const [bioLab, physLab] = clash!;
  // Lectures that clash with nothing chosen here.
  const chosen: ApiSection[] = [bioLab, physLab];
  const pickFree = (list: ApiSection[]) => {
    const free = list.find((s) => chosen.every((c) => !overlaps(s, c)));
    expect(free, "a non-conflicting section exists").toBeTruthy();
    chosen.push(free!);
    return free!;
  };
  const bioLecture = pickFree(of("BIOL 1B", "lecture"));
  const physLecture = pickFree(of("PHYS 11", "lecture"));
  const chemLecture = pickFree(of("CHEM 11", "lecture"));
  const chemLab = pickFree(of("CHEM 11", "lab"));

  await page.goto("/planner");
  await expect(page.getByTestId("quarter-plan-layout")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("focus-quarter-fall").click();

  // ── CHEM 11: the behaviour that already worked ──
  let find = await openCourse(page, "CHEM 11");
  await expect(find.getByTestId("component-requirement")).toHaveText("This course requires Lecture + Lab.");
  await expect(find.getByTestId("section-group-lecture").getByRole("heading")).toHaveText("Lecture sections");
  await expect(find.getByTestId("section-group-lab").getByRole("heading")).toHaveText("Lab sections");
  await find.getByTestId(`add-section-${chemLecture.sectionNumber}`).click();
  await expect(find.getByTestId("missing-components")).toContainText("Lab required", { timeout: 15_000 });
  await find.getByTestId(`add-section-${chemLab.sectionNumber}`).click();
  await expect(find.getByTestId("all-components-scheduled")).toBeVisible({ timeout: 15_000 });
  await shot(page, "H1-chem-lecture-and-lab");

  // ── BIOL 1B: its labs are LABS, not lectures ──
  find = await openCourse(page, "BIOL 1B");
  await expect(find.getByTestId("component-requirement")).toHaveText("This course requires Lecture + Lab.");
  expect(await find.getByTestId("section-group-lecture").locator('[data-testid^="add-section-"]').count()).toBe(of("BIOL 1B", "lecture").length);
  expect(await find.getByTestId("section-group-lab").locator('[data-testid^="add-section-"]').count()).toBe(of("BIOL 1B", "lab").length);
  await expect(find.getByTestId("section-group-lab").getByTestId(`add-section-${bioLab.sectionNumber}`)).toContainText("Add lab");
  await shot(page, "H2-biol-lecture-and-lab-groups");
  await find.getByTestId(`add-section-${bioLecture.sectionNumber}`).click();
  await expect(find.getByTestId("scheduled-components")).toContainText("Lecture", { timeout: 15_000 });
  await expect(find.getByTestId("missing-components")).toContainText("Lab required");
  // A lecture alone is not a scheduled course, in the quarter summary either.
  expect((await scheduleState(page, scheduleId)).status("BIOL 1B")).toMatchObject({ missing: ["lab"], complete: false });
  await find.getByTestId(`add-section-${bioLab.sectionNumber}`).click();
  await expect(find.getByTestId("all-components-scheduled")).toBeVisible({ timeout: 15_000 });

  // ── PHYS 11 ──
  find = await openCourse(page, "PHYS 11");
  await expect(find.getByTestId("component-requirement")).toHaveText("This course requires Lecture + Lab.");
  await find.getByTestId(`add-section-${physLecture.sectionNumber}`).click();
  await expect(find.getByTestId("missing-components")).toContainText("Lab required", { timeout: 15_000 });
  await find.getByTestId(`add-section-${physLab.sectionNumber}`).click();
  await expect(find.getByTestId("all-components-scheduled")).toBeVisible({ timeout: 15_000 });
  await shot(page, "H3-phys-lecture-and-lab");

  let state = await scheduleState(page, scheduleId);
  expect(state.parts("CHEM 11")).toEqual([`lab:${chemLab.sectionNumber}`, `lecture:${chemLecture.sectionNumber}`]);
  expect(state.parts("BIOL 1B")).toEqual([`lab:${bioLab.sectionNumber}`, `lecture:${bioLecture.sectionNumber}`]);
  expect(state.parts("PHYS 11")).toEqual([`lab:${physLab.sectionNumber}`, `lecture:${physLecture.sectionNumber}`]);

  // Both components of each course are on the calendar, labelled.
  const calendar = page.getByTestId("quarter-plan-calendar-column");
  for (const [code, lec, lab] of [["BIOL 1B", bioLecture, bioLab], ["PHYS 11", physLecture, physLab], ["CHEM 11", chemLecture, chemLab]] as const) {
    await expect(calendar.getByRole("button", { name: new RegExp(`^${code}-${lec.sectionNumber} \\(Lecture\\)`) }).first()).toBeVisible();
    await expect(calendar.getByRole("button", { name: new RegExp(`^${code}-${lab.sectionNumber} \\(Lab\\)`) }).first()).toBeVisible();
  }

  // ── The lab conflict is detected, and named as a lab ──
  await expect(calendar.getByText(/1 time conflict/)).toBeVisible({ timeout: 15_000 });
  await expect(calendar).toContainText(`BIOL 1B-${bioLab.sectionNumber} (Lab)`);
  await expect(calendar).toContainText(`PHYS 11-${physLab.sectionNumber} (Lab)`);
  await expect(calendar.getByRole("button", { name: /PHYS 11-\S+ \(Lab\).*time conflict/ }).first()).toBeVisible();
  await shot(page, "H4-lab-conflict");

  // ── Change ONLY the PHYS lab (to one that does not clash): lecture stays, conflict clears ──
  const otherLab = of("PHYS 11", "lab").find((s) => s.sectionNumber !== physLab.sectionNumber && chosen.every((c) => c === physLab || !overlaps(s, c)));
  expect(otherLab, "a second, non-conflicting PHYS 11 lab exists").toBeTruthy();
  const swapLab = find.getByTestId(`add-section-${otherLab!.sectionNumber}`);
  await expect(swapLab).toContainText("Replace this lab");
  await swapLab.click();
  await expect(calendar.getByText("No time conflicts")).toBeVisible({ timeout: 15_000 });
  state = await scheduleState(page, scheduleId);
  expect(state.parts("PHYS 11")).toEqual([`lab:${otherLab!.sectionNumber}`, `lecture:${physLecture.sectionNumber}`]);

  // ── Change ONLY the PHYS lecture: lab stays ──
  const otherLecture = of("PHYS 11", "lecture").find((s) => s.sectionNumber !== physLecture.sectionNumber);
  expect(otherLecture, "a second PHYS 11 lecture exists").toBeTruthy();
  const swapLecture = find.getByTestId(`add-section-${otherLecture!.sectionNumber}`);
  await expect(swapLecture).toContainText("Replace this lecture");
  await swapLecture.click();
  await expect.poll(async () => (await scheduleState(page, scheduleId)).parts("PHYS 11"), { timeout: 15_000 }).toEqual([
    `lab:${otherLab!.sectionNumber}`,
    `lecture:${otherLecture!.sectionNumber}`,
  ]);
  await shot(page, "H5-phys-swapped-independently");

  // ── Remove the WHOLE course: both components go, the other courses stay ──
  await calendar.getByRole("button", { name: new RegExp(`^PHYS 11-${otherLab!.sectionNumber} \\(Lab\\)`) }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("component-actions")).toContainText("This is the lab of PHYS 11.");
  await shot(page, "H6-remove-course-dialog");
  await dialog.getByTestId("button-remove-whole-course").click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect.poll(async () => (await scheduleState(page, scheduleId)).parts("PHYS 11"), { timeout: 15_000 }).toEqual([]);
  state = await scheduleState(page, scheduleId);
  expect(state.parts("BIOL 1B")).toHaveLength(2);
  expect(state.parts("CHEM 11")).toHaveLength(2);
  await expect(calendar.getByRole("button", { name: /^PHYS 11/ })).toHaveCount(0);

  // Survives a reload.
  await page.reload();
  await expect(page.getByTestId("quarter-plan-layout")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("quarter-plan-calendar-column").getByRole("button", { name: /^BIOL 1B-\S+ \(Lab\)/ }).first()).toBeVisible({ timeout: 20_000 });

  // ── A tentative future term: the Registrar lists lectures only ──
  const springId = await freshSchedule(page, "spring", 2027, "QA Labs Spring 2027");
  await page.reload();
  await expect(page.getByTestId("quarter-plan-layout")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("focus-quarter-spring").click();
  find = await openCourse(page, "BIOL 1B");
  await expect(find.getByTestId("component-requirement")).toHaveText("This course requires Lecture + Lab.");
  await expect(find.getByTestId("unpublished-components")).toContainText(/Lab times are not\s+published yet/);
  await expect(find.getByTestId("section-group-lab")).toHaveCount(0);
  // Spring's own sections — not Fall's twelve.
  const spring = await sectionsOf(page, "BIOL 1B", "spring", 2027);
  expect(spring.length).toBe(await find.locator('[data-testid^="add-section-"]').count());
  expect(spring.length).not.toBe(data["BIOL 1B"]!.length);
  await find.locator('[data-testid^="add-section-"]').first().click();
  await expect(find.getByTestId("scheduled-components")).toContainText("Lecture", { timeout: 15_000 });
  expect((await scheduleState(page, springId)).status("BIOL 1B")).toMatchObject({
    scheduled: ["lecture"],
    missing: [],
    notYetPublished: ["lab"],
  });
  await shot(page, "H7-spring-lab-not-yet-published");

  await page.request.delete(`/api/schedules/${springId}`);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("J. one export holding several programs (the layout of a real Workday report)", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = watchErrors(page);
  await uploadApr(page, "workday-combined", "All Programs", "other");

  // Full APR: block titles, summary lines and the two-row header are all there.
  const card = cardFor(page, "All Programs");
  // With several APRs uploaded, a new one starts collapsed like the rest.
  await card.locator('[data-testid^="apr-document-toggle-"]').click();
  const table = card.getByTestId("apr-workbook-table");
  await expect(table).toBeVisible({ timeout: 20_000 });
  for (const text of [
    "Finance Major Requirements",
    "Mathematics Major Requirements",
    "Healthcare Innovation and Design Minor Requirements",
    "Program of Study GPA",
    "Requirements Not Assigned",
    "Satisfied With",
    "Registrations Used",
    "Academic Period",
    "Mathematics Major GPA",
    "Core: CAS: CTW 1",
  ]) {
    await expect(table, text).toContainText(text);
  }
  // The spanning header is one merged cell.
  await expect(table.locator("td", { hasText: /^Satisfied With$/ }).first()).toHaveAttribute("colspan", "4");
  await shot(page, "J1-combined-full");

  // Sidebar: one collapsible block per program, Core kept apart, no GPA lines.
  await page.goto("/degree-plan");
  const panel = page.getByTestId("workday-apr-panel").first();
  await expect(panel).toBeVisible({ timeout: 30_000 });
  const doc = panel.locator('[data-testid^="apr-sidebar-document-"]:not([data-testid*="toggle"])').filter({ hasText: "All Programs" });
  const toggle = doc.locator('[data-testid^="apr-sidebar-document-toggle-"]');
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  const blocks = doc.getByTestId("apr-sidebar-block");
  await expect(blocks).toHaveCount(4);
  expect(await blocks.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.blockTitle))).toEqual([
    "Finance Major Requirements",
    "Mathematics Major Requirements",
    "Healthcare Innovation and Design Minor Requirements",
    "Sample Center Requirements",
  ]);
  const math = blocks.nth(1);
  await math.locator(":scope > h4 > button").click();
  await math.locator("[data-group-key] button").filter({ hasText: /^Core/ }).click();
  await math.locator("[data-group-key] button").filter({ hasText: /^Mathematics Major/ }).click();
  await expect(math).toContainText("Core: CAS: CTW 1");
  await expect(math).not.toContainText("Core: LSB");
  await expect(math).toContainText("Mathematics Major GPA");
  await expect(math.getByRole("columnheader").first()).toHaveText("Requirement");
  expect(await math.getByRole("columnheader").allInnerTexts()).toContain("Registrations Used");
  const text = await doc.innerText();
  expect(text).not.toMatch(/Program of Study GPA|Last Evaluated|2\.800|3\.100|Quarter/);
  await shot(page, "J2-combined-sidebar");

  for (const r of await listAprs(page)) if (r.label === "All Programs") await page.request.delete(`/api/progress-reports/${r.id}`);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("K. a Workday PDF export: shown as uploaded, table read for the sidebar", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = watchErrors(page);
  const file = path.join(FILES, "synthetic-apr-workday.pdf");
  writeFileSync(file, buildAprPdf({ fuseFirstStatus: true }));

  await page.goto("/progress-report");
  await page.getByTestId("button-upload-another").click();
  await expect(page.getByTestId("upload-supported-format")).toContainText("PDF");
  await page.getByTestId("input-apr-label").fill("My PDF Export");
  await page.locator('[data-testid="card-upload-form"] input[type="file"]').setInputFiles(file);
  await page.getByTestId("button-upload").click();
  await expect(page.getByTestId("apr-document-label").filter({ hasText: "My PDF Export" })).toBeVisible({ timeout: 30_000 });

  const card = cardFor(page, "My PDF Export");
  await expect(card.getByTestId("apr-document-status")).toHaveText("Ready");
  await expect(card.getByTestId("apr-document-uploaded")).toContainText(`Uploaded ${TODAY}`);
  await card.locator('[data-testid^="apr-document-toggle-"]').click();

  // The original PDF is embedded, served privately, as a PDF.
  const frame = card.locator('iframe[data-testid^="apr-pdf-frame-"]');
  await expect(frame).toBeVisible({ timeout: 20_000 });
  const src = await frame.getAttribute("src");
  const original = await page.request.get(src!);
  expect(original.status()).toBe(200);
  expect(original.headers()["content-type"]).toBe("application/pdf");
  expect(original.headers()["content-disposition"]).toContain("inline");
  expect(original.headers()["cache-control"]).toBe("private, no-store");
  expect((await original.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // The table CampusVal read from it is there to check, all seven columns.
  await card.locator('[data-testid^="apr-pdf-table-toggle-"]').click();
  const table = card.getByTestId("apr-workbook-table");
  await expect(table).toBeVisible({ timeout: 20_000 });
  for (const text of ["Finance Major Requirements", "Registrations Used", "Academic Period", "Grade", "Mathematics Major GPA", "Fall 2025 Quarter"]) {
    await expect(table, text).toContainText(text);
  }
  await shot(page, "K1-pdf-full");

  // Sidebar: grouped like an Excel upload, and says it came from the PDF.
  await page.goto("/degree-plan");
  const panel = page.getByTestId("workday-apr-panel").first();
  await expect(panel).toBeVisible({ timeout: 30_000 });
  const doc = panel.locator('[data-testid^="apr-sidebar-document-"]:not([data-testid*="toggle"])').filter({ hasText: "My PDF Export" });
  const toggle = doc.locator('[data-testid^="apr-sidebar-document-toggle-"]');
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(doc.getByTestId("apr-sidebar-from-pdf")).toContainText("Read from the table in your PDF");
  const blocks = doc.getByTestId("apr-sidebar-block");
  await expect(blocks).toHaveCount(4);
  const math = blocks.nth(1);
  await math.locator(":scope > h4 > button").click();
  await math.locator("[data-group-key] button").filter({ hasText: /^Mathematics Major/ }).click();
  await expect(math).toContainText("Mathematics Major GPA");
  await expect(math).toContainText("Satisfied");
  const text = await doc.innerText();
  expect(text).not.toMatch(/Program of Study GPA|Last Evaluated|2\.800|3\.100|Quarter|Page \d+ of/);
  const cells = await doc.getByRole("cell").allInnerTexts();
  for (const token of ["A-", "B+", "CR", "4.5"]) expect(cells, token).not.toContain(token);
  await shot(page, "K2-pdf-sidebar");

  for (const r of await listAprs(page)) if (r.label === "My PDF Export") await page.request.delete(`/api/progress-reports/${r.id}`);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("I. deleting one APR leaves the others", async ({ page }) => {
  await page.goto("/progress-report");
  await expect(page.getByTestId("apr-document-count")).toContainText("4 APRs uploaded", { timeout: 20_000 });
  const before = await listAprs(page);
  await cardFor(page, "Scratch APR").locator('[data-testid^="apr-delete-"]').click();
  await page.getByTestId("apr-delete-confirm").click();
  await expect(page.getByTestId("apr-document-count")).toContainText("3 APRs uploaded", { timeout: 20_000 });
  await expect(page.getByTestId("apr-document-label")).toHaveText(["Finance Major", "Computer Science Major (BS)", "Data Science Minor"]);
  const after = await listAprs(page);
  expect(after).toEqual(before.filter((r) => r.label !== "Scratch APR"));
  const gone = before.find((r) => r.label === "Scratch APR")!;
  expect((await page.request.get(`/api/progress-reports/${gone.id}/file`)).status()).toBe(404);
  await shot(page, "I1-after-delete");
});
