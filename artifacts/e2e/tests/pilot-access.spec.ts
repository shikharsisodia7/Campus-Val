import { test, expect, type APIRequestContext } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.resolve(__dirname, "../storage");

/**
 * The pilot as a participant and as an outsider actually experience it
 * (docs/PILOT_STATUS.md). Requires a server in pilot mode where studentA is on
 * PILOT_TESTER_EMAILS and nonPilot (an @scu.edu address) is on no list:
 *
 *   CAMPUSVAL_ACCESS_MODE=pilot
 *   PILOT_TESTER_EMAILS=e2e-student-a+clerk_test@scu.edu,e2e-student-b+clerk_test@scu.edu,...
 *
 * studentA must NOT be in ADMIN_EMAILS: these checks are what an ordinary
 * pilot tester sees.
 */

let apiNonPilot: APIRequestContext;
let apiPilot: APIRequestContext;

test.beforeAll(async ({ playwright, baseURL }) => {
  apiNonPilot = await playwright.request.newContext({ baseURL, storageState: path.join(STORAGE_DIR, "non-pilot.json") });
  apiPilot = await playwright.request.newContext({ baseURL, storageState: path.join(STORAGE_DIR, "student-a.json") });
});

test.afterAll(async () => {
  await apiNonPilot?.dispose();
  await apiPilot?.dispose();
});

test.describe("an @scu.edu account that was not invited", () => {
  test.use({ storageState: path.join(STORAGE_DIR, "non-pilot.json") });

  test("sees one clear pilot message and none of the app", async ({ page }) => {
    for (const route of ["/", "/degree-plan", "/progress-report", "/degree-checksheets"]) {
      await page.goto(route);
      await expect(page.getByTestId("pilot-access-denied"), route).toBeVisible();
      await expect(page.getByText(/invited pilot participants/i)).toBeVisible();
      await expect(page.getByTestId("primary-nav")).toHaveCount(0);
    }
  });

  test("every private API refuses it with pilot_access_required", async () => {
    const access = await apiNonPilot.get("/api/me/access");
    expect(access.status()).toBe(200);
    expect(await access.json()).toMatchObject({ allowed: false, accessMode: "pilot" });

    for (const url of [
      "/api/profile",
      "/api/plans",
      "/api/dashboard/summary",
      "/api/progress-reports",
      "/api/degree-checksheets",
      "/api/sample-plans",
      "/api/me/role",
      "/api/admin/department/programs",
    ]) {
      const res = await apiNonPilot.get(url);
      expect(res.status(), url).toBe(403);
      expect((await res.json()).code, url).toBe("pilot_access_required");
    }
    const upload = await apiNonPilot.post("/api/storage/uploads/request-url", {
      data: { name: "x.xlsx", size: 10, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    });
    expect(upload.status()).toBe(403);
  });
});

test.describe("an invited pilot tester", () => {
  test.use({ storageState: path.join(STORAGE_DIR, "student-a.json") });

  test("is admitted and sees the four primary areas, without R&D or admin tools", async ({ page }) => {
    const access = await apiPilot.get("/api/me/access");
    expect(await access.json()).toMatchObject({ allowed: true, accessMode: "pilot" });
    const role = await (await apiPilot.get("/api/me/role")).json();
    expect(role).toMatchObject({ isAdmin: false, canUseDegreeCompletionRND: false });

    await page.goto("/");
    const nav = page.getByTestId("primary-nav");
    await expect(nav).toBeVisible();
    for (const label of ["Dashboard", "Degree Plan", "Quarter Plan", "Tentative Degree Plan"]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    await expect(page.getByTestId("badge-pilot")).toBeVisible();

    await page.getByTestId("nav-additional-features").click();
    const menu = page.getByRole("menu");
    await expect(menu.getByText("Workday APR (Progress Report)")).toBeVisible();
    await expect(menu.getByText("Degree Checksheets")).toBeVisible();
    await expect(menu.getByText(/Degree Completion|Experimental|Hidden during pilot|Planning Support|Graduation Paths/i)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByText(/Program Requirements Admin/i)).toHaveCount(0);
  });

  test("cannot reach R&D or admin surfaces by URL or API", async ({ page }) => {
    await page.goto("/experimental/apr-assessment");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(/Degree Completion Assessment/i)).toHaveCount(0);

    for (const url of ["/api/progress-reports/assessment", "/api/admin/rnd/generated-sample-plans", "/api/admin/department/programs", "/api/admin/usage/summary"]) {
      const res = await apiPilot.get(url);
      expect([403, 404], url).toContain(res.status());
    }
  });

  test("public Sample Plans are source-backed only, never generated", async () => {
    const res = await apiPilot.get("/api/sample-plans");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { schools: Array<{ programs: Array<{ plans: Array<Record<string, unknown>> }> }> };
    expect(JSON.stringify(body)).not.toMatch(/campusval_generated/);
    const plans = body.schools.flatMap((s) => s.programs.flatMap((p) => p.plans));
    for (const plan of plans) {
      // Every published template names where it came from.
      expect(JSON.stringify(plan)).toMatch(/source/i);
    }
  });
});
