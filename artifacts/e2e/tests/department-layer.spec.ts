/**
 * Live QA of the Bulletin baseline, Department Notes, Program Requirements
 * Admin and Sample Plans, in a real browser against a real production build,
 * with three synthetic identities:
 *
 *   student A  - a student
 *   student B  - made a Biology department administrator by the super admin
 *   advisor Y  - the super admin (ADMIN_EMAILS of the server under test)
 *
 * Needs the server to be started with ADMIN_EMAILS=e2e-advisor-y+clerk_test@scu.edu
 * and the sample plans / department notes imported (docs/BULLETIN_BASELINE.md).
 *
 * Run: E2E_BASE_URL=http://localhost:18080 pnpm --filter @workspace/e2e exec \
 *        playwright test department-layer.spec.ts --project=dept-layer
 * Screenshots land in test-results/qa-department/.
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(__dirname, "../test-results/qa-department");
mkdirSync(SHOTS, { recursive: true });
const STORAGE = (name: string) => path.resolve(__dirname, `../storage/${name}.json`);
const STUDENT_B_EMAIL = "e2e-student-b+clerk_test@scu.edu";
const BIOLOGY = "major:biology";
const BIOL_1A = "major:biology#biol-1a";
const MARK = `e2e-${Date.now()}`;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:18080";

async function sessionReady(page: Page) {
  await expect.poll(async () => (await page.request.get("/api/plans")).status(), { timeout: 30_000 }).toBe(200);
}

/** A fresh page signed in as one of the synthetic users. */
async function as(browser: Browser, state: "student-a" | "student-b" | "advisor-y") {
  const context = await browser.newContext({ storageState: STORAGE(state), baseURL, viewport: { width: 1440, height: 900 } });
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

async function deleteTentatives(page: Page) {
  const { body } = await api(page, "get", "/api/plans");
  for (const p of body.plans.filter((x: any) => x.planType === "tentative")) await api(page, "delete", `/api/plans/${p.id}`);
}

const palette = (page: Page) => page.locator('[data-testid="requirements-palette"]:visible').first();
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });

async function choose(page: Page, triggerTestId: string, option: RegExp | string) {
  await page.getByTestId(triggerTestId).click();
  await page.getByRole("option", { name: option }).first().click();
}

test.describe.configure({ mode: "serial" });

let noteId: number | null = null;

test.beforeAll(async ({ browser }) => {
  // Notes left by an interrupted earlier run would show up in the sidebar; archive them.
  const first = await as(browser, "advisor-y");
  const detail = (await api(first.page, "get", `/api/admin/department/programs/${encodeURIComponent(BIOLOGY)}`)).body;
  for (const n of detail.notes.filter((x: any) => x.body.startsWith("e2e-") && x.status !== "archived")) {
    await api(first.page, "patch", `/api/admin/department/notes/${n.id}`, { status: "archived" });
  }
  await first.context.close();
  // The super admin makes student B a Biology department administrator, through the real API.
  const y = await as(browser, "advisor-y");
  expect((await api(y.page, "post", "/api/admin/department/scopes", { email: STUDENT_B_EMAIL, programKey: BIOLOGY })).status).toBe(201);
  await y.context.close();
  const a = await as(browser, "student-a");
  await deleteTentatives(a.page);
  await a.context.close();
});

test.afterAll(async ({ browser }) => {
  const y = await as(browser, "advisor-y");
  await api(y.page, "delete", "/api/admin/department/scopes", { email: STUDENT_B_EMAIL, programKey: BIOLOGY });
  await y.context.close();
  const a = await as(browser, "student-a");
  await deleteTentatives(a.page);
  await a.context.close();
});

test("A. a student loads a Sample Plan into a NEW Tentative Degree Plan and sees Department Notes", async ({ browser }) => {
  const { page, context } = await as(browser, "student-a");
  const degreeBefore = (await api(page, "get", "/api/plans")).body.plans.find((p: any) => p.planType === "degree");
  await page.goto("/degree-plan");
  await expect(palette(page)).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("button-load-sample-plan").click();
  const dialog = page.getByTestId("sample-plan-dialog");
  await expect(dialog).toBeVisible();
  await choose(page, "sample-plan-school", "College of Arts and Sciences");
  await choose(page, "sample-plan-program", /^Biology/);
  const first = dialog.locator('[data-testid^="sample-plan-choice-"]').first();
  await first.check();
  const preview = page.getByTestId("sample-plan-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("not an official guarantee");
  await expect(preview).toContainText("Source:");
  await shot(page, "sample-plan-preview");
  expect((await new AxeBuilder({ page }).include('[data-testid="sample-plan-dialog"]').analyze()).violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);

  await expect(page.getByTestId("sample-mode-new")).toBeChecked();
  await page.getByTestId("sample-plan-load").click();
  const result = page.getByTestId("sample-plan-result");
  await expect(result).toContainText("Created");
  await expect(result).toContainText("Your Degree Plan was not changed");
  await page.getByTestId("sample-plan-done").click();

  // The Degree Plan is exactly as it was; a new Tentative Degree Plan carries the sample's provenance.
  const plans = (await api(page, "get", "/api/plans")).body.plans;
  expect(plans.find((p: any) => p.planType === "degree").itemCount).toBe(degreeBefore.itemCount);
  const tentative = plans.find((p: any) => p.planType === "tentative");
  expect(tentative.metadata.sampleSource).toMatchObject({ version: expect.any(String) });
  expect(tentative.itemCount).toBeGreaterThan(5);

  // Its requirements sidebar is Biology's, from the Bulletin baseline, with CTW under Core.
  const view = (await api(page, "get", `/api/plans/${tentative.id}/requirements`)).body;
  const cats = Object.fromEntries(view.groups.map((g: any) => [g.category, g]));
  expect(cats.MAJOR.stableKey).toBe(BIOLOGY);
  expect(cats.CORE.items.map((i: any) => i.label)).toContain("Critical Thinking & Writing 1");
  expect(cats.MAJOR.items.some((i: any) => /Critical Thinking/.test(i.label))).toBe(false);
  expect(cats.UNIVERSITY.items.length).toBeGreaterThan(0);
  expect(view.requirementsSource.edition).toBe("2026-27");
  const biol1a = cats.MAJOR.items.find((i: any) => i.stableKey === BIOL_1A);
  expect(biol1a.departmentNotes?.[0]).toMatchObject({ origin: "imported", reviewed: false, programTitle: "Biology" });
  await context.close();
});

test("B. the sidebar shows a Department Note apart from My Note, read-only, and My Note persists", async ({ browser }) => {
  const { page, context } = await as(browser, "student-a");
  await page.goto("/tentative-plans");
  await expect(palette(page)).toBeVisible({ timeout: 30_000 });
  const trigger = palette(page).locator('[data-group-kind="major"] button').first();
  await trigger.click();
  const card = palette(page).locator(`[data-stable-key="${BIOL_1A}"]`);
  await expect(card).toBeVisible();
  const dept = card.getByTestId(/^department-note-\d+$/).first();
  await expect(dept).toContainText("Department Note");
  await expect(dept).toContainText("Recommend concurrent enrollment in CHEM 12");
  await expect(dept).toContainText("not yet reviewed");
  await expect(dept.getByRole("textbox")).toHaveCount(0);

  // Add My Note through Edit requirements.
  await palette(page).getByTestId("toggle-edit-requirements").click();
  await card.getByRole("button", { name: /edit/i }).first().click();
  await page.getByTestId("req-edit-note").fill(`${MARK} ask my advisor`);
  await page.getByRole("button", { name: /^save/i }).click();
  await expect(card.getByTestId(/^my-note-/)).toContainText(`${MARK} ask my advisor`);
  await expect(card.getByTestId(/^my-note-/)).toContainText("My Note:");
  await expect(card.getByTestId(/^department-note-\d+$/).first()).toContainText("Department Note");
  await shot(page, "sidebar-notes-1440");

  await page.reload();
  await expect(palette(page)).toBeVisible({ timeout: 30_000 });
  await palette(page).locator('[data-group-kind="major"] button').first().click();
  await expect(palette(page).locator(`[data-stable-key="${BIOL_1A}"]`).getByTestId(/^my-note-/)).toContainText(`${MARK} ask my advisor`);

  // A student has no way to change a Department Note.
  const view = (await api(page, "get", `/api/plans/${(await api(page, "get", "/api/plans")).body.plans.find((p: any) => p.planType === "tentative").id}/requirements`)).body;
  const id = view.groups.find((g: any) => g.category === "MAJOR").items.find((i: any) => i.stableKey === BIOL_1A).departmentNotes[0].id;
  expect((await api(page, "patch", `/api/admin/department/notes/${id}`, { body: "hijack" })).status).toBe(403);
  expect((await api(page, "post", "/api/admin/department/notes", { programKey: BIOLOGY, targetKey: BIOL_1A, body: "x" })).status).toBe(403);
  expect((await api(page, "get", "/api/admin/department/me")).status).toBe(403);

  // The left rail is wider than the old 230px, and the planner is still usable beside the APR column.
  const width = await palette(page).evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeGreaterThanOrEqual(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('[data-testid="requirements-palette"]').analyze()).violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
  await context.close();
});

test("C. a Biology department admin maintains Biology, sees only Biology, and students see the change", async ({ browser }) => {
  const b = await as(browser, "student-b");
  expect((await api(b.page, "get", "/api/admin/department/programs")).body.programs.map((p: any) => p.programKey)).toEqual([BIOLOGY]);
  // Cross-department and spoofed edits are refused by the server.
  expect((await api(b.page, "post", "/api/admin/department/notes", { programKey: "major:finance", targetKey: null, body: "x" })).status).toBe(403);
  expect((await api(b.page, "put", "/api/admin/department/overrides", { targetKey: "major:finance#acct-11", hidden: true })).status).toBe(403);
  expect((await api(b.page, "put", "/api/admin/department/overrides", { targetKey: "university-core:cas#ctw1", hidden: true })).status).toBe(403);

  await b.page.goto("/admin/program-requirements");
  await expect(b.page.getByTestId("admin-program-content")).toBeVisible({ timeout: 30_000 });
  await b.page.getByTestId("admin-program-select").click();
  await expect(b.page.getByRole("option")).toHaveCount(1);
  await b.page.getByRole("option").first().click();
  const item = b.page.getByTestId(`admin-item-${BIOL_1A}`);
  await expect(item).toBeVisible({ timeout: 15_000 });
  await item.getByTestId("add-department-note").click();
  await item.getByTestId("new-note-text").fill(`${MARK} take BIOL 1A in the fall of year one`);
  await item.getByTestId("save-note-published").click();
  await expect(item).toContainText(`${MARK} take BIOL 1A`);
  await shot(b.page, "admin-program-1440");
  expect((await new AxeBuilder({ page: b.page }).analyze()).violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);

  // Retitle through the inline editor, then reset to the Bulletin.
  await item.getByTestId(`edit-wording-${BIOL_1A}`).click();
  await item.getByTestId("wording-input").fill(`${MARK} BIOL 1A (department wording)`);
  await item.getByTestId("wording-save").click();
  await expect(item).toContainText("department edit");
  await expect(item).toContainText("Bulletin:");
  await b.context.close();

  // The student's sidebar picks both up; the Bulletin wording is kept in `department`.
  const a = await as(browser, "student-a");
  const plan = (await api(a.page, "get", "/api/plans")).body.plans.find((p: any) => p.planType === "tentative");
  const view = (await api(a.page, "get", `/api/plans/${plan.id}/requirements`)).body;
  const biol = view.groups.find((g: any) => g.category === "MAJOR").items.find((i: any) => i.stableKey === BIOL_1A);
  expect(biol.label).toBe(`${MARK} BIOL 1A (department wording)`);
  expect(biol.department.originalLabel).toMatch(/BIOL 1A/);
  expect(biol.departmentNotes.map((n: any) => n.body)).toContain(`${MARK} take BIOL 1A in the fall of year one`);
  noteId = biol.departmentNotes.find((n: any) => n.body.startsWith(MARK))?.id ?? null;
  // The student's own note stayed.
  expect(biol.customization.note).toContain(MARK);
  await a.page.goto("/tentative-plans");
  await expect(palette(a.page)).toBeVisible({ timeout: 30_000 });
  await palette(a.page).locator('[data-group-kind="major"] button').first().click();
  const card = palette(a.page).locator(`[data-stable-key="${BIOL_1A}"]`);
  await expect(card.getByTestId("mark-dept-edit-" + biol.id)).toHaveText("Department edit");
  await shot(a.page, "sidebar-department-edit");
  await a.context.close();
});

test("D. resetting to the Bulletin restores it; archiving the note removes it; the audit trail records both", async ({ browser }) => {
  const b = await as(browser, "student-b");
  await b.page.goto("/admin/program-requirements");
  await b.page.getByTestId("admin-program-select").click();
  await b.page.getByRole("option").first().click();
  const item = b.page.getByTestId(`admin-item-${BIOL_1A}`);
  await item.getByTestId(`reset-${BIOL_1A}`).click();
  await expect(item).not.toContainText("department edit");
  const detail = (await api(b.page, "get", `/api/admin/department/programs/${encodeURIComponent(BIOLOGY)}`)).body;
  const note = detail.notes.find((n: any) => n.body.startsWith(MARK));
  expect((await api(b.page, "patch", `/api/admin/department/notes/${note.id}`, { status: "archived" })).status).toBe(200);
  const audit = (await api(b.page, "get", `/api/admin/department/programs/${encodeURIComponent(BIOLOGY)}/audit`)).body.entries;
  expect(audit.some((e: any) => e.entity === "override" && e.action === "reset" && e.targetKey === BIOL_1A)).toBe(true);
  expect(audit.some((e: any) => e.entity === "note" && e.action === "archived")).toBe(true);
  expect(audit.every((e: any) => !JSON.stringify(e).includes("student-a"))).toBe(true);
  await b.context.close();

  const a = await as(browser, "student-a");
  const plan = (await api(a.page, "get", "/api/plans")).body.plans.find((p: any) => p.planType === "tentative");
  const biol = (await api(a.page, "get", `/api/plans/${plan.id}/requirements`)).body.groups.find((g: any) => g.category === "MAJOR").items.find((i: any) => i.stableKey === BIOL_1A);
  expect(biol.label).not.toContain(MARK);
  expect(biol.department).toBeUndefined();
  expect((biol.departmentNotes ?? []).some((n: any) => n.body.startsWith(MARK))).toBe(false);
  expect(biol.customization.note).toContain(MARK);
  expect(noteId).not.toBeNull();
  // Clean the student's own note up.
  await api(a.page, "delete", `/api/plans/${plan.id}/requirement-customizations?all=true`);
  await a.context.close();
});

test("E. a plain student cannot open the admin page; a super admin can manage scopes", async ({ browser }) => {
  const a = await as(browser, "student-a");
  await a.page.goto("/admin/program-requirements");
  await expect(a.page.getByTestId("admin-program-forbidden")).toBeVisible({ timeout: 30_000 });
  await expect(a.page.getByTestId("link-program-requirements-admin")).toHaveCount(0);
  await a.context.close();
  const y = await as(browser, "advisor-y");
  const scopes = (await api(y.page, "get", "/api/admin/department/scopes")).body.scopes;
  expect(scopes.some((s: any) => s.email === STUDENT_B_EMAIL && s.programKey === BIOLOGY)).toBe(true);
  expect((await api(y.page, "get", "/api/admin/department/programs")).body.programs.length).toBeGreaterThan(100);
  await y.context.close();
});

for (const [name, width, height] of [["tablet-1024", 1024, 768], ["tablet-768", 768, 1024], ["phone-430", 430, 932]] as const) {
  test(`F. the requirements sidebar, notes and Sample Plan dialog are usable at ${name}`, async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE("student-a"), baseURL, viewport: { width, height } });
    const page = await context.newPage();
    await page.goto("/tentative-plans");
    await sessionReady(page);
    await expect(page.getByTestId("degree-plan-layout").or(page.getByTestId("degree-plan-toolbar")).first()).toBeVisible({ timeout: 30_000 });
    // Below xl the requirements live in a drawer opened by the Palette button.
    if (width < 1280) await page.getByRole("button", { name: /palette/i }).click();
    await expect(palette(page)).toBeVisible();
    const box = await palette(page).evaluate((el) => el.getBoundingClientRect().width);
    expect(box).toBeLessThanOrEqual(width);
    await palette(page).locator('[data-group-kind="major"] button').first().click();
    await shot(page, `sidebar-${name}`);
    await page.keyboard.press("Escape");
    // Nothing on the page may force a sideways scroll (the toolbar gained a button; see the offenders if this fails).
    const offenders = await page.evaluate(() =>
      Array.from(document.querySelectorAll("body *"))
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(el).position !== "fixed" && !el.closest("[data-radix-popper-content-wrapper]"))
        .slice(0, 6)
        .map((el) => `${el.tagName}.${String(el.className).slice(0, 60)} ${Math.round(el.getBoundingClientRect().right)}`),
    );
    expect(offenders).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByTestId("button-load-sample-plan").click();
    await expect(page.getByTestId("sample-plan-dialog")).toBeVisible();
    const dialogBox = await page.getByTestId("sample-plan-dialog").boundingBox();
    expect(dialogBox!.width).toBeLessThanOrEqual(width);
    await shot(page, `sample-dialog-${name}`);
    await context.close();
  });
}
