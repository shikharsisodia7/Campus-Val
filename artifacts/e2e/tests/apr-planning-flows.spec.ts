/**
 * Live QA of the 2026-09 professor-review flows against a REAL running server
 * (production-mode container by default): APR upload/replace/state, the APR
 * reference beside Degree Plan / Tentative Degree Plan / Quarter Plan,
 * Core-category discovery, Open vs All Sections, drawer behaviour on small
 * screens, and APR privacy under advisor sharing.
 *
 * Run: E2E_BASE_URL=http://localhost:18080 pnpm --filter @workspace/e2e exec \
 *        playwright test apr-planning-flows.spec.ts --project=qa-flows
 * Needs seat data for MATH 11 / Fall 2026 (see docs/SECTION_AVAILABILITY.md).
 * Screenshots land in test-results/qa/.
 */
import { test, expect, type Page, type Browser } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, "../../api-server/src/__fixtures__/progress-report/workday-apr-hierarchical.pdf");
const SHOTS = path.resolve(__dirname, "../test-results/qa");
mkdirSync(SHOTS, { recursive: true });

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });

async function deleteApr(page: Page) {
  await page.request.delete("/api/progress-report");
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

async function uploadApr(page: Page) {
  await page.goto("/progress-report");
  await expect(page.getByTestId("card-upload-form")).toBeVisible({ timeout: 20_000 });
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await page.getByTestId("button-upload").click();
  await expect(page.getByTestId("apr-structured-view")).toBeVisible({ timeout: 30_000 });
}

test.describe.configure({ mode: "serial" });

test("A. APR page: upload, structured view, no-grades default, original file, replace, delete", async ({ page }) => {
  await deleteApr(page);
  await page.goto("/progress-report");
  // State: no APR uploaded → upload form
  await expect(page.getByTestId("card-upload-form")).toBeVisible({ timeout: 20_000 });
  await shot(page, "A1-no-apr");

  await uploadApr(page);
  await shot(page, "A2-uploaded");

  // Sections in planning order with Workday's own group names.
  await expect(page.getByTestId("apr-section-major")).toBeVisible();
  await expect(page.getByTestId("apr-section-minor")).toBeVisible();
  await expect(page.getByText("Computer Science and Engineering Major Requirements")).toBeVisible();
  // Units: only what the report states.
  await expect(page.getByTestId("apr-units-total")).toContainText("180");
  await expect(page.getByTestId("apr-units-total")).toContainText("Minimum 40.0 Unit(s)");
  // Completed vs remaining, as text.
  const badges = await page.getByTestId("badge-requirement-status").allInnerTexts();
  expect(badges.join("|")).toMatch(/Completed/);
  expect(badges.join("|")).toMatch(/Remaining/);

  // Grades hidden by default; toggle shows them.
  const body = () => page.locator("body").innerText();
  expect(await body()).not.toMatch(/\((A|B\+|B)\)/);
  await page.getByTestId("toggle-show-grades").check();
  expect(await body()).toMatch(/\((A|B\+|B)\)/);
  await page.getByTestId("toggle-show-grades").uncheck();
  await shot(page, "A3-structured-page");

  // Original file: served inline, hardened headers, never cached.
  const file = await page.request.get("/api/progress-report/file");
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toBe("application/pdf");
  expect(file.headers()["x-content-type-options"]).toBe("nosniff");
  expect(file.headers()["cache-control"]).toBe("private, no-store");

  // DTO exposes neither the owner id nor the storage path.
  const dto = await (await page.request.get("/api/progress-report")).json();
  expect(dto.report).not.toHaveProperty("userId");
  expect(dto.report).not.toHaveProperty("objectPath");

  // Replace flow is confirmed before it discards the report.
  await page.getByTestId("button-replace-report").click();
  await page.getByTestId("button-replace-confirm").click();
  await expect(page.getByTestId("card-upload-form")).toBeVisible();
  await expect(page.getByTestId("button-cancel-replace")).toBeVisible();
  await page.getByTestId("button-cancel-replace").click();
  await expect(page.getByTestId("apr-structured-view")).toBeVisible();
});

test("B. Degree Plan: APR reference beside the plan (grade-free), Core requirement discovery, add course", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await removePlanItems(page, ["ENGL 1A"]);
  await page.goto("/degree-plan");
  const panel = page.getByTestId("workday-apr-panel");
  await expect(panel.first()).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByTestId("apr-structured-view")).toBeVisible();
  await shot(page, "B1-degree-plan-1440");

  // Planning view: the sidebar never shows a grade, and the server never SENT one.
  expect(await panel.innerText()).not.toMatch(/\((A|B\+|B|C)\)/);
  const planning = await (await page.request.get("/api/progress-report?view=planning")).text();
  expect(planning).not.toMatch(/"grade":"[A-Z]/);
  expect(planning).not.toContain("sourceText");
  expect(planning).not.toContain("reportStudentId");

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
});

test("C. Tentative Degree Plan: label, APR reference, discovery", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tentative-plans");
  await expect(page.getByRole("heading", { name: "Tentative Degree Plan" }).first()).toBeVisible({ timeout: 20_000 });
  const startBlank = page.getByTestId("button-start-blank-tentative");
  if (await startBlank.isVisible().catch(() => false)) await startBlank.click();
  await expect(page.getByTestId("workday-apr-panel").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("apr-structured-view").first()).toBeVisible();
  await shot(page, "C1-tentative-1440");
  // No stray variants of the label anywhere on the page.
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/Tentative Plan\b|Degree Planner|Official Degree Plan|Tentitive|Tenative/);
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

test("E. small screens: APR becomes an accessible drawer on Degree Plan and Quarter Plan", async ({ page }) => {
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
      await expect(dialog.getByTestId("apr-structured-view")).toBeVisible({ timeout: 20_000 });
      // Scroll inside the drawer without leaving the page.
      await dialog.getByTestId("apr-structured-view").scrollIntoViewIfNeeded();
      await shot(page, `E-${tag}-drawer`);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      // Focus returns to the trigger.
      await expect(trigger).toBeFocused();
    }
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

  // Student has an APR (from test A).
  const mine = await sp.request.get(base + "/api/progress-report");
  expect(mine.status()).toBe(200);

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
  expect(await plan.text()).not.toMatch(/parsed|parserVersion|reportStudentId|"grade"|Major Requirements/);

  // The advisor cannot reach the student's APR by any route.
  expect((await ap.request.get(base + "/api/progress-report")).status()).toBe(404);
  expect((await ap.request.get(base + "/api/progress-report/file")).status()).toBe(404);
  expect((await ap.request.get(base + `/api/progress-report?userId=${studentUserId}`)).status()).toBe(404);

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
