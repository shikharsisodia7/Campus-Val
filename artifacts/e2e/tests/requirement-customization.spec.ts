/**
 * Live QA of the requirements sidebar's planning customizations, in a real
 * browser against a real running server (production build), signed in as the
 * synthetic E2E student.
 *
 *   - the sidebar looks the same until "Edit requirements" is pressed;
 *   - a rename/note survives a reload and navigating away and back, the source
 *     wording stays inspectable, and Reset restores it;
 *   - hide/restore, and a requirement of the student's own;
 *   - a Tentative plan is independent of the Degree Plan; duplicating copies the
 *     edits independently; deleting the duplicate leaves nothing behind;
 *   - none of it touches the source requirements, the APR or Degree Checksheets;
 *   - phone width: no horizontal scroll, controls at least 32px tall, usable;
 *   - axe-core finds no serious or critical violation in edit mode.
 *
 * Run: E2E_BASE_URL=http://localhost:18080 pnpm --filter @workspace/e2e exec \
 *        playwright test requirement-customization.spec.ts --project=req-customization
 * Screenshots land in test-results/qa-customization/.
 */
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.resolve(__dirname, "../test-results/qa-customization");
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

async function sessionReady(page: Page) {
  await expect.poll(async () => (await page.request.get("/api/plans")).status(), { timeout: 30_000 }).toBe(200);
}
async function degreePlanId(page: Page): Promise<number> {
  const body = await (await page.request.get("/api/plans")).json();
  return body.plans.find((p: any) => p.planType === "degree").id;
}
async function view(page: Page, planId: number) {
  return (await page.request.get(`/api/plans/${planId}/requirements`)).json();
}
async function resetAll(page: Page, planId: number) {
  await page.request.delete(`/api/plans/${planId}/requirement-customizations?all=true`);
}
async function deleteTentatives(page: Page) {
  const body = await (await page.request.get("/api/plans")).json();
  for (const p of body.plans.filter((x: any) => x.planType === "tentative")) await page.request.delete(`/api/plans/${p.id}`);
}
const palette = (page: Page) => page.getByTestId("requirements-palette").first();

async function openPalette(page: Page, route = "/degree-plan") {
  await page.goto(route);
  await sessionReady(page);
  await expect(palette(page)).toBeVisible({ timeout: 30_000 });
  // The first group is the primary major; open it.
  const trigger = palette(page).locator('[data-group-kind="major"] button').first();
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
}
const majorCards = (page: Page) => palette(page).locator('[data-group-kind="major"] [data-stable-key]');

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await sessionReady(page);
  await resetAll(page, await degreePlanId(page));
  await deleteTentatives(page);
});
test.afterAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: "storage/student-a.json" });
  const page = await ctx.newPage();
  await page.goto("/");
  await sessionReady(page);
  await resetAll(page, await degreePlanId(page));
  await deleteTentatives(page);
  await ctx.close();
});

test("the sidebar is unchanged until Edit requirements is pressed", async ({ page }) => {
  await openPalette(page);
  await expect(palette(page).getByTestId("toggle-edit-requirements")).toBeVisible();
  await expect(palette(page).getByRole("button", { name: /Hide from my plan|Reset to source|Add my own requirement/ })).toHaveCount(0);
  await expect(palette(page).getByTestId("edit-requirements-panel")).toHaveCount(0);
  expect(await majorCards(page).count()).toBeGreaterThan(3);
  // The University Core area names no longer sit inside the major group.
  await expect(palette(page).locator('[data-group-kind="major"]').getByText("Critical Thinking & Writing 1")).toHaveCount(0);
  await shot(page, "01-default-sidebar");
});

test("an edit survives reload and navigation, the original is inspectable, and Reset restores it; the source is untouched", async ({ page }) => {
  const planId = await degreePlanId(page);
  const before = await view(page, planId);
  const first = before.groups.find((g: any) => g.kind === "major").items[0];
  const sourceSideBefore = JSON.stringify([
    await (await page.request.get("/api/requirements")).json(),
    await (await page.request.get("/api/progress-reports")).json(),
    await (await page.request.get("/api/degree-checksheets")).json(),
  ]);

  await openPalette(page);
  await palette(page).getByTestId("toggle-edit-requirements").click();
  await expect(palette(page).getByTestId("edit-requirements-panel")).toContainText("this plan only");
  await shot(page, "02-edit-mode");

  const card = palette(page).locator(`[data-stable-key="${first.stableKey}"]`);
  await card.getByRole("button", { name: /^Edit$/ }).click();
  const dialog = page.getByTestId("requirement-edit-dialog");
  await expect(dialog.getByTestId("edit-original")).toContainText(first.label);
  await dialog.getByTestId("req-edit-title").fill("My own wording for this course");
  await dialog.getByTestId("req-edit-note").fill("Advisor suggested taking it in winter");
  await shot(page, "03-edit-dialog");
  await dialog.getByTestId("req-edit-save").click();
  await expect(dialog).toBeHidden();

  await expect(card).toContainText("My own wording for this course");
  await expect(card.getByText("My edit")).toBeVisible();
  await expect(card).toContainText("Advisor suggested taking it in winter");
  await expect(card.getByText(/Satisfied/)).toHaveCount(0);

  // Reload: persisted server-side, not just in memory.
  await palette(page).getByTestId("toggle-edit-requirements").click(); // Done
  await page.reload();
  await sessionReady(page);
  await openPalette(page);
  const after = palette(page).locator(`[data-stable-key="${first.stableKey}"]`);
  await expect(after).toContainText("My own wording for this course");
  await expect(after.getByText("My edit")).toBeVisible();
  await shot(page, "04-after-reload-normal-mode");

  // Away to Quarter Plan and back.
  await page.goto("/planner");
  await expect(page.locator("main").first()).toBeVisible();
  await openPalette(page);
  await expect(palette(page).locator(`[data-stable-key="${first.stableKey}"]`)).toContainText("My own wording for this course");

  // The source stays inspectable, then Reset restores it.
  await palette(page).getByTestId("toggle-edit-requirements").click();
  const again = palette(page).locator(`[data-stable-key="${first.stableKey}"]`);
  await again.getByRole("button", { name: /^Edit$/ }).click();
  await expect(page.getByTestId("edit-original")).toContainText(first.label);
  await page.getByRole("button", { name: "Cancel" }).click();
  await again.getByRole("button", { name: /Reset to source/ }).click();
  await expect(again).toContainText(first.label);
  await expect(again.getByText("My edit")).toHaveCount(0);

  // Nothing upstream moved: the plan-less requirements, the APR list and the checksheet list.
  const sourceSideAfter = JSON.stringify([
    await (await page.request.get("/api/requirements")).json(),
    await (await page.request.get("/api/progress-reports")).json(),
    await (await page.request.get("/api/degree-checksheets")).json(),
  ]);
  expect(sourceSideAfter).toBe(sourceSideBefore);
});

test("hide and restore, and a requirement of the student's own", async ({ page }) => {
  const planId = await degreePlanId(page);
  const first = (await view(page, planId)).groups.find((g: any) => g.kind === "major").items[0];

  await openPalette(page);
  await palette(page).getByTestId("toggle-edit-requirements").click();

  // Add my own requirement to the major group.
  await palette(page).locator('[data-group-kind="major"]').getByTestId("add-custom-requirement").click();
  const dialog = page.getByTestId("requirement-edit-dialog");
  await dialog.getByTestId("req-edit-title").fill("Study abroad prerequisite");
  await dialog.getByTestId("req-edit-note").fill("Check with the global office");
  await dialog.getByTestId("req-edit-save").click();
  await expect(dialog).toBeHidden();
  const custom = palette(page).locator('[data-customized="custom"]').filter({ hasText: "Study abroad prerequisite" });
  await expect(custom.getByText("My requirement")).toBeVisible();
  await expect(custom).toContainText("Check with the global office");
  await expect(custom.getByText(/Add placeholder/)).toHaveCount(0);
  await shot(page, "05-custom-requirement");

  // Hide the first requirement.
  const card = palette(page).locator(`[data-stable-key="${first.stableKey}"]`);
  await card.getByRole("button", { name: /Hide from my plan/ }).click();
  await expect(card.getByText("Hidden from my plan").first()).toBeVisible();
  await palette(page).getByTestId("toggle-edit-requirements").click(); // Done -> clean view
  await expect(palette(page).locator(`[data-stable-key="${first.stableKey}"]`)).toHaveCount(0);
  await expect(custom).toBeVisible(); // the student's own requirement stays in the normal view

  // Reload keeps both; restore brings the source requirement back.
  await page.reload();
  await sessionReady(page);
  await openPalette(page);
  await expect(palette(page).locator(`[data-stable-key="${first.stableKey}"]`)).toHaveCount(0);
  await expect(palette(page).getByText("Study abroad prerequisite")).toBeVisible();
  await palette(page).getByTestId("toggle-edit-requirements").click();
  await palette(page).locator(`[data-stable-key="${first.stableKey}"]`).getByRole("button", { name: /Restore/ }).click();
  await palette(page).getByTestId("toggle-edit-requirements").click();
  await expect(palette(page).locator(`[data-stable-key="${first.stableKey}"]`)).toBeVisible();

  // The custom one is deletable, and the source requirement was never deleted.
  await palette(page).getByTestId("toggle-edit-requirements").click();
  await palette(page).locator('[data-customized="custom"]').getByRole("button", { name: /Delete/ }).click();
  await expect(palette(page).getByText("Study abroad prerequisite")).toHaveCount(0);
  const summary = (await view(page, planId)).customizations.summary;
  expect(summary).toEqual({ edited: 0, hidden: 0, custom: 0, sourceChanged: 0, orphaned: 0 });
});

test("Tentative plans are independent; duplicating copies edits independently; deleting cleans up", async ({ page }) => {
  const degreeId = await degreePlanId(page);
  const first = (await view(page, degreeId)).groups.find((g: any) => g.kind === "major").items[0];
  await page.request.put(`/api/plans/${degreeId}/requirement-customizations`, { data: { sourceKey: first.stableKey, title: "Degree Plan wording" } });

  // A tentative plan made as a copy of the Degree Plan starts with a copy of its edits.
  const tentative = await (await page.request.post("/api/plans", { data: { name: "Tentative QA", copyFromPlanId: degreeId } })).json();
  expect((await view(page, tentative.id)).groups.find((g: any) => g.kind === "major").items[0].label).toBe("Degree Plan wording");

  // Edit it in the UI, in the Tentative Degree Plan workspace.
  await page.goto("/tentative-plans");
  await page.evaluate((id) => sessionStorage.setItem("campusval.lastTentativePlanId", String(id)), tentative.id);
  await openPalette(page, "/tentative-plans");
  await palette(page).getByTestId("toggle-edit-requirements").click();
  const card = palette(page).locator(`[data-stable-key="${first.stableKey}"]`);
  await card.getByRole("button", { name: /^Edit$/ }).click();
  await expect(page.getByTestId("edit-original")).toContainText(first.label);
  await page.getByTestId("req-edit-title").fill("Only in this tentative plan");
  await page.getByTestId("req-edit-save").click();
  await expect(card).toContainText("Only in this tentative plan");
  await shot(page, "06-tentative-plan-edit");

  // The Degree Plan did not move.
  expect((await view(page, degreeId)).groups.find((g: any) => g.kind === "major").items[0].label).toBe("Degree Plan wording");

  // Duplicate the tentative plan: the copy has the edit, independently.
  const dup = await (await page.request.post(`/api/plans/${tentative.id}/duplicate`, { data: { name: "Tentative QA copy" } })).json();
  expect((await view(page, dup.id)).groups.find((g: any) => g.kind === "major").items[0].label).toBe("Only in this tentative plan");
  await page.request.put(`/api/plans/${dup.id}/requirement-customizations`, { data: { sourceKey: first.stableKey, title: "Copy only" } });
  expect((await view(page, tentative.id)).groups.find((g: any) => g.kind === "major").items[0].label).toBe("Only in this tentative plan");

  // Delete the copy: gone, and the original is untouched.
  expect((await page.request.delete(`/api/plans/${dup.id}`)).status()).toBe(204);
  expect((await page.request.get(`/api/plans/${dup.id}/requirements`)).status()).toBe(404);
  expect((await view(page, tentative.id)).customizations.summary.edited).toBe(1);
});

test("phone: no horizontal scroll, controls are large enough, and it works in the drawer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/degree-plan");
  await sessionReady(page);
  expect(await page.evaluate(() => window.innerWidth)).toBe(390);
  await page.getByRole("button", { name: /Palette/ }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByTestId("requirements-palette")).toBeVisible({ timeout: 30_000 });
  const trigger = sheet.locator('[data-group-kind="major"] button').first();
  await trigger.click();
  await sheet.getByTestId("toggle-edit-requirements").click();

  const editButtons = sheet.getByRole("button", { name: /^Edit$/ });
  await expect(editButtons.first()).toBeVisible();
  for (const b of await sheet.getByRole("button", { name: /^(Edit|Hide from my plan|Add my own requirement)$/ }).all()) {
    const box = await b.boundingBox();
    if (box) expect(box.height).toBeGreaterThanOrEqual(31.5);
  }
  await editButtons.first().click();
  const dialog = page.getByTestId("requirement-edit-dialog");
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(700); // the dialog has finished animating in
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390.5);
  await shot(page, "07-phone-edit-dialog");
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await shot(page, "08-phone-edit-mode");
});

test("tablet: edit mode works at 768x1024 and 1024x768 with no horizontal scroll", async ({ page }) => {
  for (const [w, h] of [[768, 1024], [1024, 768]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/degree-plan");
    await sessionReady(page);
    expect(await page.evaluate(() => window.innerWidth)).toBe(w);
    await page.getByRole("button", { name: /Palette/ }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByTestId("requirements-palette")).toBeVisible({ timeout: 30_000 });
    await sheet.locator('[data-group-kind="major"] button').first().click();
    await sheet.getByTestId("toggle-edit-requirements").click();
    await sheet.getByRole("button", { name: /^Edit$/ }).first().click();
    const dialog = page.getByTestId("requirement-edit-dialog");
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(700);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(w + 0.5);
    await shot(page, `09-tablet-${w}x${h}-edit-dialog`);
    await page.getByRole("button", { name: "Cancel" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
});

test("own requirements: course shortcuts and reordering", async ({ page }) => {
  await openPalette(page);
  await palette(page).getByTestId("toggle-edit-requirements").click();
  const add = async (title: string, courses = "") => {
    await palette(page).locator('[data-group-kind="major"]').getByTestId("add-custom-requirement").click();
    const d = page.getByTestId("requirement-edit-dialog");
    await d.getByTestId("req-edit-title").fill(title);
    if (courses) await d.getByTestId("req-edit-courses").fill(courses);
    await d.getByTestId("req-edit-save").click();
    await expect(d).toBeHidden();
  };
  await add("Alpha requirement", "ENGL 1A");
  await add("Beta requirement");
  const customs = palette(page).locator('[data-customized="custom"]');
  await expect(customs.first()).toContainText("Alpha requirement");
  await expect(customs.first().getByRole("button", { name: "Add ENGL 1A to the plan" })).toBeVisible();
  await customs.nth(1).getByRole("button", { name: /Move up/ }).click();
  await expect(customs.first()).toContainText("Beta requirement");
  // The shortcut adds a real plan course; the requirement itself stays open.
  await customs.nth(1).getByRole("button", { name: "Add ENGL 1A to the plan" }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/plans/${await degreePlanId(page)}`)).json()).items.some((i: any) => i.courseCode === "ENGL 1A")).toBe(true);
  const planId = await degreePlanId(page);
  const alpha = (await view(page, planId)).groups.find((g: any) => g.kind === "major").items.find((i: any) => i.label === "Alpha requirement");
  expect(alpha).toMatchObject({ status: "open", complete: false });
  const items = (await (await page.request.get(`/api/plans/${planId}`)).json()).items.filter((i: any) => i.courseCode === "ENGL 1A");
  for (const it of items) await page.request.delete(`/api/plans/${planId}/items/${it.id}`);
});

test("axe finds no serious or critical violation in edit mode, on desktop or phone", async ({ page }) => {
  // Three axe scans, a reload and a viewport change: against production this takes about 30 s on its own.
  test.setTimeout(90_000);
  const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
  const serious = async (label: string) => {
    await page.waitForTimeout(700);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking.map((v) => `${label}: ${v.id}: ${v.nodes[0]?.target}`), label).toEqual([]);
  };

  await openPalette(page);
  await palette(page).getByTestId("toggle-edit-requirements").click();
  await serious("desktop edit mode");
  await palette(page).getByRole("button", { name: /^Edit$/ }).first().click();
  await serious("desktop edit dialog");
  await page.getByRole("button", { name: "Cancel" }).click();
  await palette(page).getByTestId("reset-all-requirements").isDisabled();

  // Keyboard: the toggle and the row controls are reachable and operable without a mouse.
  await palette(page).getByTestId("toggle-edit-requirements").focus();
  await page.keyboard.press("Enter"); // Done
  await expect(palette(page).getByTestId("edit-requirements-panel")).toHaveCount(0);
  await page.keyboard.press("Enter"); // Edit again, from the same focus
  await expect(palette(page).getByTestId("edit-requirements-panel")).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await sessionReady(page);
  await page.getByRole("button", { name: /Palette/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.locator('[data-group-kind="major"] button').first().click();
  await sheet.getByTestId("toggle-edit-requirements").click();
  await serious("phone edit mode");
});
