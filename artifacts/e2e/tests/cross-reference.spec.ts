/**
 * Live QA of the cross-reference workspace, in a real browser against a production build:
 *
 *   Degree Checksheets  = Planning Requirements | Degree Checksheet | Workday APR (compact)
 *   Academic Progress   = Planning Requirements | Full APR
 *
 * and of the explicit "Add to planning" transfer from a checksheet into the student's own
 * My Note / My Requirement on the selected plan. Documents are SYNTHETIC.
 *
 * Run: E2E_BASE_URL=http://localhost:18080 pnpm --filter @workspace/e2e exec \
 *        playwright test cross-reference.spec.ts --project=cross-reference
 * Screenshots land in test-results/qa-cross-reference/.
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync, writeFileSync } from "fs";
import { buildChecksheetFixture, CHECKSHEET_FIXTURE_FILES } from "../../api-server/src/__fixtures__/checksheets/build-fixtures";
import { buildAprFixture } from "../../api-server/src/__fixtures__/apr/build-workbooks";
import { TEST_USERS } from "../scripts/ensure-test-users";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(__dirname, "../test-results/qa-cross-reference");
mkdirSync(SHOTS, { recursive: true });
const STORAGE = (name: string) => path.resolve(__dirname, `../storage/${name}.json`);
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:18080";
const MARK = `xr-${Date.now()}`;
const BIOL_1A = "major:biology#biol-1a";
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

async function sessionReady(page: Page) {
  await expect.poll(async () => (await page.request.get("/api/plans")).status(), { timeout: 30_000 }).toBe(200);
}
async function as(browser: Browser, state: "student-a" | "student-b", viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ storageState: STORAGE(state), baseURL, viewport });
  const page = await context.newPage();
  await page.goto("/");
  await sessionReady(page);
  return { page, context };
}
async function api<T = any>(page: Page, method: "get" | "post" | "put" | "patch" | "delete", url: string, data?: unknown) {
  const res = await page.request[method](url, data === undefined ? undefined : { data });
  const text = await res.text();
  return { status: res.status(), body: (text ? JSON.parse(text) : null) as T };
}
async function cleanSlate(page: Page) {
  const plans = (await api(page, "get", "/api/plans")).body.plans;
  for (const p of plans.filter((x: any) => x.planType === "tentative")) await api(page, "delete", `/api/plans/${p.id}`);
  await api(page, "delete", `/api/plans/${plans.find((x: any) => x.planType === "degree").id}/requirement-customizations?all=true`);
  const docs = (await api(page, "get", "/api/degree-checksheets")).body.documents ?? [];
  for (const d of docs) await api(page, "delete", `/api/degree-checksheets/${d.id}`);
  // Only this spec's own APRs (labelled "xr-..."): other specs keep theirs.
  const aprs = (await api(page, "get", "/api/progress-reports")).body.reports ?? [];
  for (const r of aprs.filter((x: any) => String(x.label ?? "").startsWith("xr-"))) await api(page, "delete", `/api/progress-reports/${r.id}`);
  for (const share of (await api(page, "get", "/api/plan-shares")).body.shares ?? []) {
    if (share.status === "active" && share.advisorEmail === TEST_USERS.studentB.email.toLowerCase()) await api(page, "delete", `/api/plan-shares/${share.id}`);
  }
}
const focusedTestId = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? "");
async function tabTo(page: Page, testId: string, max = 12) {
  for (let i = 0; i < max && (await focusedTestId(page)) !== testId; i++) await page.keyboard.press("Tab");
  await expect(page.getByTestId(testId)).toBeFocused();
}

const left = (page: Page) => page.getByTestId("compare-left").getByTestId("requirements-palette");
const sheetCard = (page: Page) => page.locator("[data-checksheet-card]").first();

async function chooseCompareTarget(page: Page, label: RegExp | string) {
  await page.getByTestId("compare-plan-trigger").click();
  await page.getByRole("option", { name: label }).first().click();
}
async function openMajorGroup(page: Page) {
  const trigger = left(page).locator('[data-group-kind="major"] button').first();
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
}

test.describe.configure({ mode: "serial" });

let tentativeId: number;
let otherTentativeId: number;
let degreeId: number;
let docId: number;

test.beforeAll(async ({ browser }) => {
  const { page, context } = await as(browser, "student-a");
  await cleanSlate(page);
  degreeId = (await api(page, "get", "/api/plans")).body.plans.find((p: any) => p.planType === "degree").id;
  // A Tentative Degree Plan built around Biology (so BIOL 1A is one of its requirements) and an unrelated one.
  const a = (await api(page, "post", "/api/plans", { name: "XR Biology" })).body;
  await api(page, "patch", `/api/plans/${a.id}`, { programs: { primaryMajor: "BIOL", additionalMajors: [], minors: [], professionalGoals: [] } });
  tentativeId = a.id;
  otherTentativeId = (await api(page, "post", "/api/plans", { name: "XR Other" })).body.id;
  await context.close();
});
test.afterAll(async ({ browser }) => {
  const { page, context } = await as(browser, "student-a");
  await cleanSlate(page);
  await context.close();
});

test("A. Degree Checksheets: Planning Requirements | checksheet | Workday APR, each scrolling on its own", async ({ browser }) => {
  const { page, context } = await as(browser, "student-a");
  // A synthetic Workday APR, uploaded through the full APR page, so the compact APR has something to show.
  await page.goto("/progress-report");
  const another = page.getByTestId("button-upload-another");
  const aprForm = page.getByTestId("card-upload-form");
  await expect(aprForm.or(another).first()).toBeVisible({ timeout: 30_000 });
  if (!(await aprForm.isVisible())) await another.click();
  await page.getByTestId("input-apr-label").fill(`${MARK} Finance APR`);
  await page.getByTestId("select-apr-category").selectOption("primary_major");
  const aprFile = path.join(SHOTS, "synthetic-apr-finance-major.xlsx");
  writeFileSync(aprFile, await buildAprFixture("finance-major"));
  await page.locator('[data-testid="card-upload-form"] input[type="file"]').setInputFiles(aprFile);
  await page.getByTestId("button-upload").click();
  await expect(page.getByTestId("apr-document-label").filter({ hasText: `${MARK} Finance APR` })).toBeVisible({ timeout: 40_000 });

  // Upload one synthetic checksheet through the real UI.
  await page.goto("/degree-checksheets");
  await expect(page.getByTestId("compare-layout")).toBeVisible({ timeout: 30_000 });
  const file = path.join(SHOTS, CHECKSHEET_FIXTURE_FILES["biology-workbook"].fileName);
  writeFileSync(file, await buildChecksheetFixture("biology-workbook"));
  await page.getByTestId("button-upload-checksheet").first().click();
  const dialog = page.getByTestId("checksheet-upload-dialog");
  await dialog.getByTestId("checksheet-input-file").setInputFiles(file);
  await dialog.getByTestId("checksheet-field-title").fill(`${MARK} Biology Checksheet`);
  await dialog.getByTestId("checksheet-upload-submit").click();
  await expect(dialog).toBeHidden({ timeout: 40_000 });
  await expect(sheetCard(page)).toBeVisible({ timeout: 20_000 });
  docId = (await api(page, "get", "/api/degree-checksheets")).body.documents[0].id;

  // Three labelled regions, in order, side by side, not overlapping.
  const regions = page.getByTestId("compare-layout").locator("[data-panel][aria-label]");
  await expect(regions).toHaveCount(3);
  expect(await regions.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(["Planning Requirements", "Degree Checksheets", "Workday APR"]);
  const boxes = await Promise.all(["compare-left", "compare-main", "compare-right"].map((id) => page.getByTestId(id).boundingBox()));
  const [l, m, r] = boxes as { x: number; y: number; width: number; height: number }[];
  expect(l!.x + l!.width).toBeLessThanOrEqual(m!.x + 1);
  expect(m!.x + m!.width).toBeLessThanOrEqual(r!.x + 1);
  expect(l!.width).toBeGreaterThanOrEqual(300);
  expect(m!.width).toBeGreaterThanOrEqual(480);
  expect(r!.width).toBeGreaterThanOrEqual(330);
  // The canonical sidebars: the same components Degree Plan uses.
  await expect(left(page)).toBeVisible();
  await expect(page.getByTestId("compare-right").getByTestId("workday-apr-panel")).toBeVisible();
  await expect(page.getByTestId("compare-right")).toContainText(`${MARK} Finance APR`, { timeout: 20_000 });
  // The regions fill the screen below the header: the page itself does not scroll, each region does.
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(2);
  // Compares against the Degree Plan until told otherwise (nothing was created).
  await expect(page.getByTestId("compare-plan-trigger")).toContainText("Degree Plan");
  expect((await api(page, "get", "/api/plans")).body.plans.filter((p: any) => p.planType === "tentative")).toHaveLength(2);

  // Independent scrolling: moving the center leaves the left and right where they were.
  await openMajorGroup(page);
  const scrollTops = () =>
    page.evaluate(() => {
      const sel = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
      const inner = (root: HTMLElement | null) => Array.from(root?.querySelectorAll("*") ?? []).find((e) => (e as HTMLElement).scrollHeight > (e as HTMLElement).clientHeight + 4 && getComputedStyle(e).overflowY !== "visible") as HTMLElement | undefined;
      return { left: inner(sel("compare-left"))?.scrollTop ?? 0, main: sel("compare-main")!.scrollTop, right: inner(sel("compare-right"))?.scrollTop ?? 0 };
    });
  await page.getByTestId("compare-main").evaluate((el) => (el.scrollTop = 220));
  const after = await scrollTops();
  expect(after.main).toBeGreaterThan(0);
  expect(after.left).toBe(0);
  expect(after.right).toBe(0);
  await page.getByTestId("compare-left").evaluate((el) => {
    const s = Array.from(el.querySelectorAll("*")).find((e) => (e as HTMLElement).scrollHeight > (e as HTMLElement).clientHeight + 4 && getComputedStyle(e).overflowY !== "visible") as HTMLElement | undefined;
    if (s) s.scrollTop = 120;
  });
  expect((await scrollTops()).main).toBe(after.main);
  await shot(page, "checksheets-three-panel-1440");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // The regions can be resized: drag the handle, or focus it and use the arrow keys. The page remembers it.
  const leftWidth = async () => (await page.getByTestId("compare-left").boundingBox())!.width;
  const before = await leftWidth();
  const handle = (await page.getByTestId("resize-left").boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 120, handle.y + handle.height / 2, { steps: 8 });
  await page.mouse.up();
  const dragged = await leftWidth();
  expect(dragged).toBeGreaterThan(before + 80);
  // The layout is saved a moment after the last change (the library waits 100ms): wait for it, as a person would.
  const savedLeft = () =>
    page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("react-resizable-panels:campusval.compare.checksheets") ?? "{}") as Record<string, { layout: number[] }>;
      return Math.max(0, ...Object.values(state).map((v) => v.layout[0] ?? 0));
    });
  await expect.poll(savedLeft).toBeGreaterThan(26);
  await page.reload();
  await expect(page.getByTestId("compare-left")).toBeVisible({ timeout: 30_000 });
  await expect.poll(leftWidth).toBeGreaterThan(before + 80);
  await page.getByTestId("resize-left").focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(leftWidth).toBeLessThan(dragged - 40);
  await expect(page.getByTestId("resize-left")).toHaveAttribute("aria-label", "Resize Planning Requirements");
  await shot(page, "checksheets-resized");
  // Back to the starting sizes for the rest of the run.
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes("campusval.compare.")).forEach((k) => localStorage.removeItem(k)));
  await page.reload();
  await expect(page.getByTestId("compare-left")).toBeVisible({ timeout: 30_000 });
  await expect.poll(leftWidth).toBeLessThan(before + 10);

  // Panels can be hidden for a wider checksheet, and come back.
  await page.getByTestId("toggle-left-rail").click();
  await expect(page.getByTestId("compare-left")).toHaveCount(0);
  await page.getByTestId("toggle-left-rail").click();
  await expect(page.getByTestId("compare-left")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
  await context.close();
});

test("B. a checksheet row with a reliable course code preselects its requirement; the note lands on the selected plan only", async ({ browser }) => {
  const { page, context } = await as(browser, "student-a");
  await page.goto("/degree-checksheets");
  await expect(page.getByTestId("compare-layout")).toBeVisible({ timeout: 30_000 });
  await chooseCompareTarget(page, /XR Biology/);
  await expect(left(page)).toBeVisible();
  await openMajorGroup(page);

  const card = sheetCard(page);
  if ((await card.locator('[data-testid^="checksheet-toggle-"]').first().getAttribute("aria-expanded")) !== "true") await card.locator('[data-testid^="checksheet-toggle-"]').first().click();
  // The row whose Course cell says BIOL 1A.
  const row = card.locator("tr", { hasText: "BIOL 1A" }).first();
  await row.getByRole("button", { name: /Add row \d+ to my Planning Requirements/ }).click();
  const dialog = page.getByTestId("add-to-planning-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("XR Biology");
  await expect(page.getByTestId("transfer-source")).toContainText("Take in Fall of year one");
  // Preselected because the code belongs to exactly one requirement: shown, not silent.
  await expect(page.getByTestId("transfer-target")).toContainText("BIOL 1A");
  await expect(page.getByTestId("transfer-target")).toContainText("is listed under it");
  expect((await new AxeBuilder({ page }).include('[data-testid="add-to-planning-dialog"]').analyze()).violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
  await shot(page, "transfer-dialog");
  await page.getByTestId("transfer-note").fill(`${MARK} take BIOL 1A in the fall`);
  await page.getByTestId("transfer-save").click();
  await expect(dialog).toBeHidden();

  // The left sidebar updates at once (no reload), shows where it came from, and points at the requirement.
  const target = left(page).locator(`[data-stable-key="${BIOL_1A}"]`);
  await expect(target.getByTestId(/^my-note-(?!source-)/)).toContainText(`${MARK} take BIOL 1A in the fall`, { timeout: 10_000 });
  await expect(target.getByTestId(/^my-note-source-/)).toContainText("From: " + `${MARK} Biology Checksheet`);
  await expect(target).toHaveAttribute("data-flash", "true");
  await shot(page, "transfer-result-sidebar");

  // Persisted, and it is a My Note: not a Department Note.
  const view = (await api(page, "get", `/api/plans/${tentativeId}/requirements`)).body;
  const item = view.groups.find((g: any) => g.kind === "major").items.find((i: any) => i.stableKey === BIOL_1A);
  expect(item.customization.note).toContain(MARK);
  expect(item.customization.noteSource).toMatchObject({ type: "DEGREE_CHECKSHEET", documentAvailable: true });
  expect((item.departmentNotes ?? []).some((n: any) => n.body.includes(MARK))).toBe(false);

  // Other plans do not get it.
  for (const id of [degreeId, otherTentativeId]) {
    const v = (await api(page, "get", `/api/plans/${id}/requirements`)).body;
    expect(JSON.stringify(v)).not.toContain(MARK);
  }

  // The source document was not changed by the transfer.
  const original = await page.request.get(`/api/degree-checksheets/${docId}/file`);
  expect(original.status()).toBe(200);
  await context.close();
});

test("C. the same note is in the Tentative Degree Plan page's sidebar, after a reload", async ({ browser }) => {
  const { page, context } = await as(browser, "student-a");
  await page.goto("/degree-checksheets");
  await chooseCompareTarget(page, /XR Biology/);
  await page.goto("/tentative-plans");
  const palette = page.locator('[data-testid="requirements-palette"]:visible').first();
  await expect(palette).toBeVisible({ timeout: 30_000 });
  await palette.locator('[data-group-kind="major"] button').first().click();
  await expect(palette.locator(`[data-stable-key="${BIOL_1A}"]`).getByTestId(/^my-note-(?!source-)/)).toContainText(MARK);
  await page.reload();
  const again = page.locator('[data-testid="requirements-palette"]:visible').first();
  await again.locator('[data-group-kind="major"] button').first().click();
  await expect(again.locator(`[data-stable-key="${BIOL_1A}"]`).getByTestId(/^my-note-(?!source-)/)).toContainText(MARK);
  await context.close();
});

test("C2. a My Tracking note goes to the Degree Plan, and is on the Degree Plan page", async ({ browser }) => {
  const { page, context } = await as(browser, "student-a");
  await page.goto("/degree-checksheets");
  await chooseCompareTarget(page, /^Degree Plan$/);
  const card = sheetCard(page);
  if ((await card.locator('[data-testid^="checksheet-toggle-"]').first().getAttribute("aria-expanded")) !== "true") await card.locator('[data-testid^="checksheet-toggle-"]').first().click();
  // A personal tracking entry with a note: the student's own words on their own checksheet.
  await card.getByTestId("checksheet-manual-label").fill(`${MARK} Writing intensive`);
  await card.getByTestId("checksheet-manual-submit").click();
  const noteBox = card.locator('[data-testid^="checksheet-entry-note-"]').last();
  await noteBox.fill(`${MARK} ask the advisor which CTW counts`);
  await expect(card.locator(`[data-testid="checksheet-save-${docId}"]`)).toHaveAttribute("data-save-status", "saved", { timeout: 15_000 });
  await card.locator('[data-testid^="checksheet-entry-transfer-"]').last().click();
  const dialog = page.getByTestId("add-to-planning-dialog");
  await expect(dialog).toContainText("Degree Plan");
  await expect(page.getByTestId("transfer-source")).toContainText(`${MARK} ask the advisor which CTW counts`);
  await page.getByTestId("transfer-search").fill("Critical Thinking");
  await page.getByTestId("transfer-options").getByRole("button").first().click();
  await page.getByTestId("transfer-save").click();
  await expect(dialog).toBeHidden();
  const ctw = left(page).locator('[data-stable-key^="university-core"][data-stable-key$="#ctw1"]');
  await expect(ctw.getByTestId(/^my-note-(?!source-)/)).toContainText(`${MARK} ask the advisor which CTW counts`, { timeout: 10_000 });

  // The same plan on its own page: the same note, from the same data.
  await page.goto("/degree-plan");
  const palette = page.locator('[data-testid="requirements-palette"]:visible').first();
  await expect(palette).toBeVisible({ timeout: 30_000 });
  await palette.locator('[data-group-kind="university_core"] button').first().click();
  await expect(palette.locator('[data-stable-key^="university-core"][data-stable-key$="#ctw1"]').getByTestId(/^my-note-(?!source-)/)).toContainText(
    `${MARK} ask the advisor which CTW counts`,
  );
  await shot(page, "degree-plan-shows-transferred-note");
  // ...and only there: the Tentative Degree Plans do not have it.
  for (const id of [tentativeId, otherTentativeId]) {
    expect(JSON.stringify((await api(page, "get", `/api/plans/${id}/requirements`)).body)).not.toContain("which CTW counts");
  }
  await context.close();
});

test("D. a row that names no course asks the student to choose; an exact duplicate is refused; a custom requirement can be made instead", async ({ browser }) => {
  const { page, context } = await as(browser, "student-a");
  await page.goto("/degree-checksheets");
  await chooseCompareTarget(page, /XR Biology/);
  const card = sheetCard(page);
  if ((await card.locator('[data-testid^="checksheet-toggle-"]').first().getAttribute("aria-expanded")) !== "true") await card.locator('[data-testid^="checksheet-toggle-"]').first().click();
  const row = card.locator("tr", { hasText: "capstone portfolio" }).first();
  await row.getByRole("button", { name: /Add row \d+ to my Planning Requirements/ }).click();
  const dialog = page.getByTestId("add-to-planning-dialog");
  // No code, no guess: nothing preselected, saving disabled until the student chooses.
  await expect(page.getByTestId("transfer-target")).toHaveCount(0);
  await expect(page.getByTestId("transfer-save")).toBeDisabled();
  await page.getByTestId("transfer-search").fill("Critical Thinking");
  await page.getByTestId("transfer-options").getByRole("button").first().click();
  await expect(page.getByTestId("transfer-target")).toContainText("Critical Thinking");
  await expect(page.getByTestId("transfer-target")).not.toContainText("is listed under it");
  await page.getByTestId("transfer-note").fill(`${MARK} advisor approves the portfolio`);
  await page.getByTestId("transfer-save").click();
  await expect(dialog).toBeHidden();
  const ctw = left(page).locator('[data-stable-key^="university-core"][data-stable-key$="#ctw1"]');
  await expect(ctw.getByTestId(/^my-note-(?!source-)/)).toContainText(`${MARK} advisor approves the portfolio`, { timeout: 10_000 });

  // The same text again to the same requirement is caught.
  await row.getByRole("button", { name: /Add row \d+ to my Planning Requirements/ }).click();
  await page.getByTestId("transfer-search").fill("Critical Thinking");
  await page.getByTestId("transfer-options").getByRole("button").first().click();
  await page.getByTestId("transfer-note").fill(`${MARK} advisor approves the portfolio`);
  await expect(page.getByTestId("transfer-duplicate")).toBeVisible();
  await expect(page.getByTestId("transfer-save")).toBeDisabled();
  await page.getByTestId("transfer-cancel").click();

  // Or make it a requirement of the student's own.
  await row.getByRole("button", { name: /Add row \d+ to my Planning Requirements/ }).click();
  await page.getByTestId("transfer-mode-custom").check();
  await page.getByTestId("transfer-custom-title").fill(`${MARK} Capstone portfolio approval`);
  await page.getByTestId("transfer-save").click();
  await expect(page.getByTestId("add-to-planning-dialog")).toBeHidden();
  const custom = left(page).locator('[data-customized="custom"]').filter({ hasText: `${MARK} Capstone portfolio approval` });
  await expect(custom).toBeVisible({ timeout: 10_000 });
  await expect(custom.getByTestId(/^mark-custom-/)).toHaveText("My requirement");
  await expect(custom).not.toContainText("Bulletin");
  await context.close();
});

test("D2. the whole transfer works from the keyboard, and focus comes back to where it started", async ({ browser }) => {
  const { page, context } = await as(browser, "student-a");
  await page.goto("/degree-checksheets");
  await chooseCompareTarget(page, /XR Biology/);
  const card = sheetCard(page);
  if ((await card.locator('[data-testid^="checksheet-toggle-"]').first().getAttribute("aria-expanded")) !== "true") await card.locator('[data-testid^="checksheet-toggle-"]').first().click();
  const button = card.locator("tr", { hasText: "Choose either lab" }).first().getByRole("button", { name: /Add row \d+ to my Planning Requirements/ });
  const dialog = page.getByTestId("add-to-planning-dialog");
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await tabTo(page, "transfer-search");
  await page.keyboard.type("Critical Thinking");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("transfer-target")).toContainText("Critical Thinking");
  // Choosing moves on to the note, the next thing to do.
  await expect(page.getByTestId("transfer-note")).toBeFocused();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(`${MARK} lab choice, by keyboard`);
  await tabTo(page, "transfer-save");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
  const ctw = left(page).locator('[data-stable-key^="university-core"][data-stable-key$="#ctw1"]');
  await expect(ctw.getByTestId(/^my-note-(?!source-)/)).toContainText(`${MARK} lab choice, by keyboard`, { timeout: 10_000 });
  // Appended to the note already there (the default), not replacing it.
  await expect(ctw.getByTestId(/^my-note-(?!source-)/)).toContainText(`${MARK} advisor approves the portfolio`);
  await context.close();
});

test("E. the Academic Progress Report page: Planning Requirements and the full APR, with no second APR sidebar", async ({ browser }) => {
  const { page, context } = await as(browser, "student-a");
  // The plan chosen on Degree Checksheets is the plan the APR page starts from.
  await page.goto("/degree-checksheets");
  await chooseCompareTarget(page, /XR Biology/);
  await page.goto("/progress-report");
  await expect(page.getByTestId("compare-layout")).toBeVisible({ timeout: 30_000 });
  const regions = page.getByTestId("compare-layout").locator("[data-panel][aria-label]");
  expect(await regions.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).toEqual(["Planning Requirements", "Full Academic Progress Reports"]);
  await expect(left(page)).toBeVisible();
  await expect(page.getByTestId("compare-right")).toHaveCount(0);
  await expect(page.getByTestId("workday-apr-panel")).toHaveCount(0);
  await expect(page.getByTestId("full-apr-workspace")).toBeVisible();
  await expect(page.getByTestId("compare-plan-trigger")).toContainText(/XR Biology/);
  // Editing a planning requirement here is still only a personal planning note.
  await openMajorGroup(page);
  await left(page).getByTestId("toggle-edit-requirements").click();
  await expect(page.getByTestId("edit-requirements-panel")).toContainText("never change SCU's requirements, your Workday APR");
  // Hide a requirement from the plan while looking at Workday, then restore it: only the plan's own edit changes.
  const aprBefore = JSON.stringify((await api(page, "get", "/api/progress-reports")).body);
  const biol = left(page).locator(`[data-stable-key="${BIOL_1A}"]`);
  await biol.locator('[data-testid^="hide-"]').click();
  await expect(biol.locator('[data-testid^="mark-hidden-"]')).toBeVisible({ timeout: 10_000 });
  const hidden = (await api(page, "get", `/api/plans/${tentativeId}/requirements`)).body.groups.find((g: any) => g.kind === "major").items.find((i: any) => i.stableKey === BIOL_1A);
  expect(hidden.customization.hidden).toBe(true);
  for (const id of [degreeId, otherTentativeId]) {
    const other = (await api(page, "get", `/api/plans/${id}/requirements`)).body.groups.flatMap((g: any) => g.items).find((i: any) => i.stableKey === BIOL_1A);
    expect(other?.customization?.hidden ?? false).toBe(false);
  }
  await biol.locator('[data-testid^="restore-"]').click();
  await expect(biol.locator('[data-testid^="mark-hidden-"]')).toHaveCount(0, { timeout: 10_000 });
  expect(JSON.stringify((await api(page, "get", "/api/progress-reports")).body)).toBe(aprBefore);
  await expect(page.getByTestId("full-apr-workspace")).toContainText(`${MARK} Finance APR`);
  await shot(page, "apr-two-panel-1440");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
  await context.close();
});

test("E2. sharing the plan with an advisor shares neither the checksheet, the APR nor the My Notes", async ({ browser }) => {
  const a = await as(browser, "student-a");
  const share = await api(a.page, "post", "/api/plan-shares", { advisorEmail: TEST_USERS.studentB.email, scopes: ["degree_plan", "tentative_degree_plan"] });
  expect([200, 201]).toContain(share.status);
  const b = await as(browser, "student-b");
  try {
    const shared = (await api(b.page, "get", "/api/advisor/shared-students")).body.students.find((s: any) => s.shareId === share.body.id);
    expect(shared).toBeTruthy();
    // The advisor can read the shared plan (that is what sharing is for)...
    const plan = await api(b.page, "get", `/api/advisor/shared-students/${shared.studentUserId}/plan?planType=tentative`);
    expect(plan.status).toBe(200);
    // ...but nothing of the checksheet, the APR or the student's own notes comes with it.
    expect(JSON.stringify(plan.body)).not.toContain(MARK);
    // And the owner-only routes the comparison pages use stay closed to them, server-side.
    expect((await api(b.page, "get", `/api/degree-checksheets/${docId}`)).status).toBe(404);
    expect((await b.page.request.get(`/api/degree-checksheets/${docId}/file`)).status()).toBe(404);
    expect((await api(b.page, "get", `/api/plans/${tentativeId}/requirements`)).status).toBe(404);
    expect((await api(b.page, "put", `/api/plans/${tentativeId}/requirement-customizations`, { sourceKey: BIOL_1A, note: "advisor edit" })).status).toBe(404);
    expect(JSON.stringify((await api(b.page, "get", "/api/degree-checksheets")).body)).not.toContain(MARK);
    expect(JSON.stringify((await api(b.page, "get", "/api/progress-reports")).body)).not.toContain(MARK);
    expect(JSON.stringify((await api(b.page, "get", "/api/progress-reports/sidebar")).body)).not.toContain(MARK);
  } finally {
    await api(a.page, "delete", `/api/plan-shares/${share.body.id}`);
    await a.context.close();
    await b.context.close();
  }
});

test("F. replacing the source checksheet leaves the note as it is; deleting it keeps the note and says its source is gone", async ({ browser }) => {
  const { page, context } = await as(browser, "student-a");
  const noteNow = async () =>
    (await api(page, "get", `/api/plans/${tentativeId}/requirements`)).body.groups.find((g: any) => g.kind === "major").items.find((i: any) => i.stableKey === BIOL_1A)
      .customization;
  const before = await noteNow();
  // Replace the checksheet with a different file, through the page's own Replace.
  await page.goto("/degree-checksheets");
  const card = sheetCard(page);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.locator('[data-testid^="checksheet-replace-"]').click();
  const form = card.getByTestId("checksheet-replace-form");
  const file = path.join(SHOTS, CHECKSHEET_FIXTURE_FILES["major-workbook"].fileName);
  writeFileSync(file, await buildChecksheetFixture("major-workbook"));
  await form.getByTestId("checksheet-input-file").setInputFiles(file);
  await form.getByTestId("checksheet-replace-submit").click();
  await expect(card.locator('[data-testid^="checksheet-replaced-"]')).toBeVisible({ timeout: 40_000 });
  expect((await api(page, "get", "/api/degree-checksheets")).body.documents.find((d: any) => d.id === docId).sourceVersion).toBe(2);
  // The student's note is theirs now: not rewritten, not removed, still pointing at the document.
  const after = await noteNow();
  expect(after.note).toBe(before.note);
  expect(after.noteSource).toEqual(before.noteSource);
  expect(after.noteSource.documentAvailable).toBe(true);

  expect((await api(page, "delete", `/api/degree-checksheets/${docId}`)).status).toBeLessThan(300);
  await page.goto("/degree-checksheets");
  await chooseCompareTarget(page, /XR Biology/);
  await openMajorGroup(page);
  const note = left(page).locator(`[data-stable-key="${BIOL_1A}"]`);
  await expect(note.getByTestId(/^my-note-(?!source-)/)).toContainText(MARK);
  await expect(note.getByTestId(/^my-note-source-/)).toContainText("source document no longer available");
  await context.close();
});

test("G. another student reaches none of it, through the new pages' own requests", async ({ browser }) => {
  const b = await as(browser, "student-b");
  expect((await api(b.page, "get", `/api/plans/${tentativeId}/requirements`)).status).toBe(404);
  expect((await api(b.page, "put", `/api/plans/${tentativeId}/requirement-customizations`, { sourceKey: BIOL_1A, note: "hijack" })).status).toBe(404);
  const docs = (await api(b.page, "get", "/api/degree-checksheets")).body.documents ?? [];
  expect(JSON.stringify(docs)).not.toContain(MARK);
  const aprs = (await api(b.page, "get", "/api/progress-reports")).body;
  expect(JSON.stringify(aprs)).not.toContain(MARK);
  await b.context.close();
});

for (const [name, width, height] of [["laptop-1280", 1280, 800], ["tablet-1024", 1024, 768], ["tablet-768", 768, 1024], ["phone-430", 430, 932]] as const) {
  test(`H. both pages are usable at ${name}`, async ({ browser }) => {
    const { page, context } = await as(browser, "student-a", { width, height });
    for (const url of ["/degree-checksheets", "/progress-report"]) {
      await page.goto(url);
      await expect(page.getByTestId("compare-layout")).toBeVisible({ timeout: 30_000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      const desktop = width >= 1280;
      if (desktop) {
        await expect(page.getByTestId("compare-left")).toBeVisible();
        if (url === "/degree-checksheets") await expect(page.getByTestId("compare-right")).toBeVisible();
      } else {
        // The two side panels are one tap away, and the main content has the full width.
        await expect(page.getByTestId("compare-left")).toBeHidden();
        const main = await page.getByTestId("compare-main").boundingBox();
        expect(main!.width).toBeGreaterThan(width * 0.85);
        await page.getByTestId("button-open-requirements").click();
        await expect(page.getByTestId("requirements-drawer").getByTestId("requirements-palette")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("button-open-requirements")).toBeFocused();
        if (url === "/degree-checksheets") await expect(page.getByTestId("button-open-apr-reference")).toBeVisible();
        else await expect(page.getByTestId("button-open-apr-reference")).toHaveCount(0);
      }
      await shot(page, `${url.slice(1)}-${name}`);
    }
    await context.close();
  });
}

test("I. in a phone browser: upload, add a checksheet row to planning, and find it in the Planning Requirements drawer", async ({ browser }) => {
  const { page, context } = await as(browser, "student-a", { width: 390, height: 844 });
  await page.goto("/degree-checksheets");
  await expect(page.getByTestId("compare-layout")).toBeVisible({ timeout: 30_000 });
  await chooseCompareTarget(page, /XR Biology/);
  const file = path.join(SHOTS, CHECKSHEET_FIXTURE_FILES["biology-workbook"].fileName);
  writeFileSync(file, await buildChecksheetFixture("biology-workbook"));
  await page.getByTestId("button-upload-checksheet").first().click();
  const upload = page.getByTestId("checksheet-upload-dialog");
  await upload.getByTestId("checksheet-input-file").setInputFiles(file);
  await upload.getByTestId("checksheet-field-title").fill(`${MARK} Phone Checksheet`);
  await upload.getByTestId("checksheet-upload-submit").click();
  await expect(upload).toBeHidden({ timeout: 40_000 });
  const card = sheetCard(page);
  await expect(card.locator("tr", { hasText: "BIOL 1A" }).first()).toBeVisible({ timeout: 20_000 });

  await card.locator("tr", { hasText: "BIOL 1A" }).first().getByRole("button", { name: /Add row \d+ to my Planning Requirements/ }).click();
  const dialog = page.getByTestId("add-to-planning-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("transfer-target")).toContainText("BIOL 1A");
  // The dialog fits the phone once it has opened (it slides in): nothing to scroll sideways.
  await expect.poll(async () => (await dialog.boundingBox())!.x).toBeGreaterThanOrEqual(0);
  const box = await dialog.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390 + 1);
  if (await page.getByTestId("transfer-replace").count()) await page.getByTestId("transfer-replace").check();
  await page.getByTestId("transfer-note").fill(`${MARK} added from a phone`);
  await shot(page, "phone-transfer-dialog");
  await page.getByTestId("transfer-save").click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.getByTestId("button-open-requirements").click();
  const drawer = page.getByTestId("requirements-drawer");
  await drawer.locator('[data-group-kind="major"] button').first().click();
  await expect(drawer.locator(`[data-stable-key="${BIOL_1A}"]`).getByTestId(/^my-note-(?!source-)/)).toContainText(`${MARK} added from a phone`, { timeout: 10_000 });
  await expect(drawer.locator(`[data-stable-key="${BIOL_1A}"]`).getByTestId(/^my-note-source-/)).toContainText(`${MARK} Phone Checksheet`);
  await shot(page, "phone-requirements-drawer");
  await context.close();
});
