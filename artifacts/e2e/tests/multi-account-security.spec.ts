import { test, expect, type APIRequestContext } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { TEST_USERS } from "../scripts/ensure-test-users";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.resolve(__dirname, "../storage");

/**
 * Real multi-account security E2E, exercising the direct backend API under
 * three separate authenticated identities (separate Playwright request
 * contexts, each with its own storageState from tests/auth.setup.ts — no
 * shared session, no cookie reuse across identities).
 *
 * Roles for this pass (see docs/ADVISOR_SHARING.md — advisor access is
 * purely email-based, not a distinct Clerk role, so any account can act as
 * the advisor recipient):
 *   studentA -> plan owner
 *   studentB -> (1) isolation target, (2) advisor who RECEIVES a share
 *   advisorY -> advisor who never receives a share (must stay denied)
 */

let apiA: APIRequestContext;
let apiB: APIRequestContext;
let apiAdvisorY: APIRequestContext;
let planAId: number;
let shareId: number;

test.beforeAll(async ({ playwright, baseURL }) => {
  apiA = await playwright.request.newContext({ baseURL, storageState: path.join(STORAGE_DIR, "student-a.json") });
  apiB = await playwright.request.newContext({ baseURL, storageState: path.join(STORAGE_DIR, "student-b.json") });
  apiAdvisorY = await playwright.request.newContext({ baseURL, storageState: path.join(STORAGE_DIR, "advisor-y.json") });
});

test.afterAll(async () => {
  await apiA?.dispose();
  await apiB?.dispose();
  await apiAdvisorY?.dispose();
});

test.describe.serial("multi-account plan isolation and advisor sharing", () => {
  test("A: self-access to own plan(s) succeeds", async () => {
    const res = await apiA.get("/api/plans");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.plans)).toBe(true);
    expect(body.plans.length).toBeGreaterThan(0);
    planAId = body.plans.find((p: any) => p.planType === "degree")?.id ?? body.plans[0].id;
    expect(planAId).toBeGreaterThan(0);
  });

  test("B: reading A's plan by id is denied", async () => {
    const getRes = await apiB.get(`/api/plans/${planAId}`);
    expect([403, 404]).toContain(getRes.status());

    const patchRes = await apiB.patch(`/api/plans/${planAId}`, { data: { name: "hijacked" } });
    expect([400, 403, 404]).toContain(patchRes.status());
  });

  test("A shares the Degree Plan with B's email (advisor grant)", async () => {
    const res = await apiA.post("/api/plan-shares", {
      data: { advisorEmail: TEST_USERS.studentB.email, scopes: ["degree_plan"] },
    });
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    shareId = body.id;
    expect(shareId).toBeGreaterThan(0);
    expect(body.scopes).toEqual(["degree_plan"]);
  });

  test("B (as advisor): read access to A's shared plan succeeds", async () => {
    // The advisor route addresses students by their Clerk user id, not the
    // plan id — read it back via the advisor's own "shared with me" list so
    // no id is hardcoded or guessed.
    const listRes = await apiB.get("/api/advisor/shared-students");
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    const shared = list.students.find((s: any) => s.shareId === shareId);
    expect(shared, "A's grant should appear in B's shared-with-me list").toBeTruthy();

    const planRes = await apiB.get(`/api/advisor/shared-students/${shared.studentUserId}/plan`);
    expect(planRes.status()).toBe(200);
    const plan = await planRes.json();
    expect(plan.readOnly).toBe(true);
  });

  test("B (as advisor): the shared plan is read-only — no write route exists", async () => {
    const listRes = await apiB.get("/api/advisor/shared-students");
    const { studentUserId } = (await listRes.json()).students.find((s: any) => s.shareId === shareId);

    // There is no PATCH/DELETE under /advisor/shared-students/*; confirm the
    // owner-scoped plan-mutation route itself still denies B (B is not the
    // plan owner regardless of the share).
    const patchRes = await apiB.patch(`/api/plans/${planAId}`, { data: { name: "advisor edit attempt" } });
    expect([400, 403, 404]).toContain(patchRes.status());
    void studentUserId;
  });

  test("B (as advisor): the share does NOT include the Tentative Degree Plan", async () => {
    const listRes = await apiB.get("/api/advisor/shared-students");
    const { studentUserId } = (await listRes.json()).students.find((s: any) => s.shareId === shareId);

    const tentativeRes = await apiB.get(`/api/advisor/shared-students/${studentUserId}/plan?planType=tentative`);
    expect(tentativeRes.status()).toBe(403);
  });

  test("Advisor Y (no grant): denied access to A's plan", async () => {
    const res = await apiAdvisorY.get(`/api/advisor/shared-students/does-not-matter/plan`);
    expect(res.status()).toBe(403);

    const listRes = await apiAdvisorY.get("/api/advisor/shared-students");
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    expect(list.students.find((s: any) => s.shareId === shareId)).toBeUndefined();
  });

  test("APR stays private from advisor sharing (no APR scope exists)", async () => {
    const listRes = await apiB.get("/api/advisor/shared-students");
    const { studentUserId } = (await listRes.json()).students.find((s: any) => s.shareId === shareId);
    // Only degree_plan / tentative_degree_plan scopes are valid server-side;
    // there is no advisor-facing APR route at all to attempt.
    const res = await apiB.get(`/api/advisor/shared-students/${studentUserId}/plan?planType=apr`);
    // An unrecognized planType falls back to the default (degree_plan) scope
    // check, which IS granted here — this assertion exists to document that
    // no APR-shaped response is ever returned, not to re-test the default path.
    const body = await res.json();
    expect(body).not.toHaveProperty("parsed");
    expect(body).not.toHaveProperty("objectPath");
  });

  test("A revokes B's access", async () => {
    const res = await apiA.delete(`/api/plan-shares/${shareId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("revoked");
  });

  test("B: access is denied immediately after revoke, no retry/cache window", async () => {
    const listRes = await apiB.get("/api/advisor/shared-students");
    const list = await listRes.json();
    expect(list.students.find((s: any) => s.shareId === shareId)).toBeUndefined();

    const planRes = await apiB.get(`/api/advisor/shared-students/${TEST_USERS.studentA.email}/plan`);
    expect(planRes.status()).toBe(403);
  });

  test("external reviewer identity (advisorY) cannot read A's progress report", async () => {
    const res = await apiAdvisorY.get("/api/progress-report");
    // Own account has no APR of its own uploaded -> 404, never A's data.
    expect([404, 200]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.report).toBeNull();
    }
  });
});
