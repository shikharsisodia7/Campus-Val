/**
 * Live QA of multi-school Planning Requirements in a real browser (professor review, 2026-10-20):
 * any Leavey business major brings the Leavey School of Business requirements, schools compose
 * (Biology + Finance shows both), there is one University Core carrying the Leavey Core statements,
 * a Tentative Finance plan gets the business core, and the expanded sidebar stays usable at every
 * required viewport. Uses the synthetic student's Degree Plan re-pointed for each case, restored after.
 *
 * Run: E2E_BASE_URL=http://localhost:18080 pnpm --filter @workspace/e2e exec \
 *        playwright test multi-school.spec.ts --project=multi-school
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(__dirname, "../test-results/qa-multi-school");
mkdirSync(SHOTS, { recursive: true });
const STORAGE = path.resolve(__dirname, "../storage/student-a.json");
const LEAVEY = "Leavey School of Business Requirements";

async function as(browser: Browser, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ storageState: STORAGE, viewport });
  const page = await context.newPage();
  await page.goto("/");
  await expect.poll(async () => (await page.request.get("/api/plans")).status(), { timeout: 30_000 }).toBe(200);
  return { page, context };
}
async function api<T = any>(page: Page, method: "get" | "post" | "patch" | "delete", url: string, data?: unknown) {
  const res = await page.request[method](url, data === undefined ? undefined : { data });
  const text = await res.text();
  return { status: res.status(), body: (text ? JSON.parse(text) : null) as T };
}
const programs = (primaryMajor: string, additionalMajors: string[] = []) => ({ primaryMajor, additionalMajors, minors: [], professionalGoals: [] });

/** The visible sidebar: the column on wide screens, the drawer (opened) below xl. */
async function sidebar(page: Page) {
  // The layout's xl breakpoint (1280px): a column at or above it, a drawer below. Decided by the
  // viewport, not by a visibility check that can run before the page has rendered.
  if ((page.viewportSize()?.width ?? 0) >= 1280) {
    const column = page.getByTestId("degree-plan-palette-column");
    await expect(column).toBeVisible({ timeout: 30_000 });
    return column.getByTestId("requirements-palette");
  }
  await page.getByRole("button", { name: "Palette" }).click();
  return page.getByRole("dialog").getByTestId("requirements-palette");
}
/** A group's accordion trigger by its title (the trigger also holds the school subtitle). */
const groupTrigger = (palette: ReturnType<Page["getByTestId"]>, title: string) =>
  palette.locator("[data-category-kind] > h3 button").filter({ hasText: title }).first();
const groupTitles = async (palette: ReturnType<Page["getByTestId"]>) =>
  (await palette.locator("[data-category-kind] > h3 button").allInnerTexts()).map((t) => t.split("\n")[0]!.trim());
async function openGroup(palette: ReturnType<Page["getByTestId"]>, title: string) {
  const trigger = groupTrigger(palette, title);
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  return trigger;
}

async function withDegreePlan(page: Page, value: unknown, run: () => Promise<void>) {
  const degree = (await api(page, "get", "/api/plans")).body.plans.find((p: any) => p.planType === "degree");
  const original = degree.programs ?? null;
  expect((await api(page, "patch", `/api/plans/${degree.id}`, { programs: value })).status).toBe(200);
  try {
    await run();
  } finally {
    expect((await api(page, "patch", `/api/plans/${degree.id}`, { programs: original })).status).toBe(200);
  }
}

test("Finance: University, Core, Leavey School and Finance Major requirements, the Core annotated", async ({ browser }) => {
  const { page, context } = await as(browser);
  await withDegreePlan(page, programs("FNCE"), async () => {
    await page.goto("/degree-plan");
    const palette = await sidebar(page);
    await expect(groupTrigger(palette, LEAVEY)).toBeVisible({ timeout: 30_000 });
    const titles = await groupTitles(palette);
    expect(titles.filter((t) => t === "University Core Curriculum")).toHaveLength(1);
    expect(titles.filter((t) => t === LEAVEY)).toHaveLength(1);
    expect(titles).toContain("University Degree Requirements");
    expect(titles).toContain("Major Requirements — Finance (B.S. Commerce)");
    await expect(palette.getByTestId("school-activated-by-LSB")).toHaveText(/Required for Leavey business majors · Finance/);

    await openGroup(palette, LEAVEY);
    for (const label of ["Contemporary Business Issues", "Common Core: FNCE 121", "Capstone: MGMT 162"]) {
      await expect(palette.getByText(label, { exact: true })).toBeVisible();
    }
    await openGroup(palette, "University Core Curriculum");
    const socsci = palette.getByTestId("core-annotation-lsb-core-socsci");
    await expect(socsci).toContainText("Social Science: ECON 1.");
    await expect(socsci).toContainText("Also a Leavey School of Business requirement");
    await socsci.getByRole("button", { name: "Source" }).click();
    await expect(socsci.getByRole("link", { name: "open source" })).toHaveAttribute("href", "https://www.scu.edu/business/undergraduates/core/");
    await expect(palette.getByTestId("core-annotation-lsb-core-advwriting")).toContainText("BUSN 179");
    await page.screenshot({ path: path.join(SHOTS, "finance-sidebar.png"), fullPage: false });

    // The server agrees: SCHOOL for the Leavey core, MAJOR for Finance, CORE for the Core.
    const degree = (await api(page, "get", "/api/plans")).body.plans.find((p: any) => p.planType === "degree");
    const view = (await api(page, "get", `/api/plans/${degree.id}/requirements`)).body;
    const lsb = view.groups.find((g: any) => g.stableKey === "college-lsb");
    expect(lsb.category).toBe("SCHOOL");
    expect(view.groups.filter((g: any) => g.category === "CORE")).toHaveLength(1);
    const finance = view.groups.find((g: any) => g.stableKey === "major:finance-b-s-commerce");
    expect(finance.items.flatMap((i: any) => i.courses)).not.toContain("FNCE 121");
  });
  await context.close();
});

test("Biology + Finance: both schools' requirements, one Core, both majors; accessible", async ({ browser }) => {
  const { page, context } = await as(browser);
  await withDegreePlan(page, programs("BIOL", ["FNCE"]), async () => {
    await page.goto("/degree-plan");
    const palette = await sidebar(page);
    await expect(groupTrigger(palette, LEAVEY)).toBeVisible({ timeout: 30_000 });
    const titles = await groupTitles(palette);
    expect(titles).toEqual(expect.arrayContaining([
      "Major Requirements — Biology",
      "University Core Curriculum",
      "College of Arts and Sciences Requirements",
      LEAVEY,
      "University Degree Requirements",
      expect.stringMatching(/^Major Requirements — Finance \(B\.S\. Commerce\)/),
    ]));
    expect(titles.filter((t) => t === "University Core Curriculum")).toHaveLength(1);
    // CAS before Leavey: the primary major's school first.
    expect(titles.indexOf("College of Arts and Sciences Requirements")).toBeLessThan(titles.indexOf(LEAVEY));
    await openGroup(palette, LEAVEY);
    await openGroup(palette, "University Core Curriculum");
    await page.screenshot({ path: path.join(SHOTS, "biology-finance-sidebar.png") });
    const axe = await new AxeBuilder({ page }).include('[data-testid="degree-plan-palette-column"]').analyze();
    expect(axe.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")).map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
  await context.close();
});

test("Engineering + Finance: the School of Engineering and the Leavey School requirements", async ({ browser }) => {
  const { page, context } = await as(browser);
  await withDegreePlan(page, programs("MECH", ["FNCE"]), async () => {
    await page.goto("/degree-plan");
    const palette = await sidebar(page);
    await expect(groupTrigger(palette, LEAVEY)).toBeVisible({ timeout: 30_000 });
    const titles = await groupTitles(palette);
    expect(titles).toEqual(expect.arrayContaining(["School of Engineering Requirements", LEAVEY, "Major Requirements — Mechanical Engineering"]));
    expect(titles.filter((t) => t === "University Core Curriculum")).toHaveLength(1);
  });
  await context.close();
});

test("a Tentative Finance plan shows the Leavey core; removing Finance removes it", async ({ browser }) => {
  const { page, context } = await as(browser);
  const created = await api(page, "post", "/api/plans", { name: "E2E Tentative Finance" });
  expect(created.status).toBe(201);
  const id = created.body.id;
  try {
    expect((await api(page, "patch", `/api/plans/${id}`, { programs: programs("FNCE") })).status).toBe(200);
    await page.evaluate((planId) => sessionStorage.setItem("campusval.lastTentativePlanId", String(planId)), id);
    const view = (await api(page, "get", `/api/plans/${id}/requirements`)).body;
    expect(view.groups.filter((g: any) => g.stableKey === "college-lsb")).toHaveLength(1);

    await page.goto("/tentative-plans");
    const palette = await sidebar(page);
    await expect(groupTrigger(palette, LEAVEY)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: path.join(SHOTS, "tentative-finance-sidebar.png") });

    // Biology instead of Finance in the same plan: the Leavey group goes away.
    expect((await api(page, "patch", `/api/plans/${id}`, { programs: programs("BIOL") })).status).toBe(200);
    const after = (await api(page, "get", `/api/plans/${id}/requirements`)).body;
    expect(after.groups.some((g: any) => g.stableKey === "college-lsb")).toBe(false);
  } finally {
    await api(page, "delete", `/api/plans/${id}`);
    await context.close();
  }
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`the Leavey group stays usable at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const { page, context } = await as(browser, viewport);
    await withDegreePlan(page, programs("BIOL", ["FNCE"]), async () => {
      await page.goto("/degree-plan");
      expect(await page.evaluate(() => window.innerWidth)).toBe(viewport.width);
      const palette = await sidebar(page);
      if (viewport.width < 1280) {
        // The drawer's close button does not sit on "Edit requirements".
        const close = (await page.getByRole("dialog").getByRole("button", { name: "Close" }).boundingBox())!;
        const edit = (await palette.getByTestId("toggle-edit-requirements").boundingBox())!;
        expect(edit.x + edit.width <= close.x || close.y + close.height <= edit.y).toBe(true);
      }
      await openGroup(palette, LEAVEY);
      const capstone = palette.getByText("Capstone: MGMT 162", { exact: true });
      await capstone.scrollIntoViewIfNeeded();
      await expect(capstone).toBeVisible();
      await openGroup(palette, "University Core Curriculum");
      const note = palette.getByTestId("core-annotation-lsb-core-civic");
      await note.scrollIntoViewIfNeeded();
      await expect(note).toBeVisible();
      // Text wraps inside the sidebar: the note is no wider than the sidebar, and the page does not scroll sideways.
      const [noteBox, paletteBox] = [await note.boundingBox(), await palette.boundingBox()];
      expect(noteBox!.x + noteBox!.width).toBeLessThanOrEqual(paletteBox!.x + paletteBox!.width + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await page.evaluate(() => window.innerWidth)).toBe(viewport.width);
      await page.screenshot({ path: path.join(SHOTS, `leavey-${viewport.width}x${viewport.height}.png`) });
    });
    await context.close();
  });
}
