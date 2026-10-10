/**
 * Live QA of the Bulletin-structured majors in a real browser: a major with required tracks asks for one,
 * the student chooses it in the sidebar, and only that track's requirements appear; a requirement
 * CampusVal cannot count from courses says so; the control is accessible. Uses the student's Degree Plan
 * re-pointed at Bioengineering for the test, restored after.
 *
 * Run: E2E_BASE_URL=http://localhost:18080 pnpm --filter @workspace/e2e exec \
 *        playwright test major-structures.spec.ts --project=major-structures
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(__dirname, "../test-results/qa-major-structures");
mkdirSync(SHOTS, { recursive: true });
const STORAGE = path.resolve(__dirname, "../storage/student-a.json");
const BIOE = "major:bioengineering";

async function as(browser: Browser) {
  const context = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto("/");
  await expect.poll(async () => (await page.request.get("/api/plans")).status(), { timeout: 30_000 }).toBe(200);
  return { page, context };
}
async function api<T = any>(page: Page, method: "get" | "put" | "patch", url: string, data?: unknown) {
  const res = await page.request[method](url, data === undefined ? undefined : { data });
  const text = await res.text();
  return { status: res.status(), body: (text ? JSON.parse(text) : null) as T };
}
const palette = (page: Page) => page.getByTestId("requirements-palette").first();
async function openMajor(page: Page) {
  const group = palette(page).locator('[data-group-kind="major"]').first();
  const header = group.locator("button").first();
  await expect(header).toBeVisible({ timeout: 30_000 });
  if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
  return group;
}

test("a required track: asked for, chosen in the sidebar, then only its requirements", async ({ browser }) => {
  const { page, context } = await as(browser);
  const degree = (await api(page, "get", "/api/plans")).body.plans.find((p: any) => p.planType === "degree");
  const original = degree.programs ?? null;
  expect((await api(page, "patch", `/api/plans/${degree.id}`, { programs: { primaryMajor: "BIOE", additionalMajors: [], minors: [], professionalGoals: [] } })).status).toBe(200);
  expect((await api(page, "put", "/api/profile/major-track", { major: "BIOE", track: null })).status).toBe(200);
  try {
    await page.goto("/degree-plan");
    const major = await openMajor(page);
    await expect(major.locator(`[data-stable-key="${BIOE}#choose-track"]`)).toBeVisible({ timeout: 20_000 });
    await expect(major.getByTestId(/^req-manual-/).first()).toContainText("You track this one");
    const select = major.getByLabel(/your track/i);
    await expect(select).toHaveValue("");
    await page.screenshot({ path: path.join(SHOTS, "bioe-choose-track.png") });

    // Accessible as rendered: the picker and the tracked-by-you note pass axe in the open group.
    const axe = await new AxeBuilder({ page }).include('[data-testid="requirements-palette"]').analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);

    await select.selectOption("pre-med");
    await expect(major.getByTestId("requirement-section-heading").filter({ hasText: "Pre-med track: natural science" })).toBeVisible({ timeout: 20_000 });
    await expect(major.locator(`[data-stable-key="${BIOE}#choose-track"]`)).toHaveCount(0);
    await expect(major.getByText(/Biomolecular track:/)).toHaveCount(0);
    // The technical electives are counted in units: tracked by the student, with the recommended courses to browse.
    const te = major.locator(`[data-stable-key="${BIOE}#te-pre-med"]`);
    await expect(te).toContainText("You track this one");
    await te.getByTestId(/^toggle-course-list-/).click();
    await expect(te.getByText("Recommended technical electives (pre-med track)")).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, "bioe-pre-med.png") });

    // The server agrees, and the choice survives a reload.
    expect((await api(page, "get", "/api/profile")).body.majorTracks).toEqual({ BIOE: "pre-med" });
    await page.reload();
    await expect((await openMajor(page)).getByLabel(/your track/i)).toHaveValue("pre-med");
  } finally {
    await api(page, "put", "/api/profile/major-track", { major: "BIOE", track: null });
    expect((await api(page, "patch", `/api/plans/${degree.id}`, { programs: original })).status).toBe(200);
    await context.close();
  }
});

test("a choice from several areas says so in words", async ({ browser }) => {
  const { page, context } = await as(browser);
  const degree = (await api(page, "get", "/api/plans")).body.plans.find((p: any) => p.planType === "degree");
  const original = degree.programs ?? null;
  expect((await api(page, "patch", `/api/plans/${degree.id}`, { programs: { primaryMajor: "EE", additionalMajors: [], minors: [], professionalGoals: [] } })).status).toBe(200);
  try {
    await page.goto("/degree-plan");
    const major = await openMajor(page);
    const areas = major.locator('[data-stable-key="major:electrical-engineering#technical-electives-areas"]');
    await expect(areas).toBeVisible({ timeout: 20_000 });
    await expect(areas.getByTestId(/^choice-summary-/)).toContainText("Choose 4 from at least 4 of the lists");
    await areas.getByTestId(/^toggle-course-list-/).click();
    for (const area of ["IC Design", "Systems", "RF and Communication", "Power Systems", "Digital and Embedded Systems"]) {
      await expect(areas.getByRole("region", { name: area, exact: true })).toBeVisible();
    }
  } finally {
    expect((await api(page, "patch", `/api/plans/${degree.id}`, { programs: original })).status).toBe(200);
    await context.close();
  }
});
