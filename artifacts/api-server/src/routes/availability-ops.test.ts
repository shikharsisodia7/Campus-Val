/**
 * The operational availability routes for Fall registration: a student's
 * bounded "Refresh availability", the administrators' diagnostics, and the
 * secret-protected scheduled-ingestion hook.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.header("x-test-user");
    if (!userId) return res.status(401).json({ error: "Sign in required" });
    req.userId = userId;
    req.userEmail = req.header("x-test-email") ?? `${userId}@scu.edu`;
    next();
  },
}));

const RUN = Date.now();
const ADMIN = `ops-admin-${RUN}@scu.edu`;
process.env["ADMIN_EMAILS"] = ADMIN;
const saved = { ...process.env };

const { AvailabilityService } = await import("../lib/availability/service");
const { setAvailabilityServiceForTests } = await import("../lib/availability");
const coursesRouter = (await import("./courses")).default;

const app = express();
app.use(express.json());
app.use("/api", coursesRouter);

let calls = 0;
function liveService() {
  calls = 0;
  const live = {
    id: "workday_live",
    isLive: true,
    async getAvailability() {
      calls += 1;
      return { ok: true as const, records: [], fetchedAt: new Date().toISOString() };
    },
  };
  const manual = { id: "manual_workday_paste", isLive: false, async getAvailability() { return { ok: true as const, records: [], fetchedAt: new Date().toISOString() }; } };
  return new AvailabilityService({ live: live as any, manual: manual as any, cacheTtlMs: 300_000, minRefreshIntervalMs: 30_000 });
}

beforeEach(() => setAvailabilityServiceForTests(liveService()));
afterAll(() => {
  setAvailabilityServiceForTests(null);
  process.env = saved;
});

describe("POST /section-availability/refresh", () => {
  it("needs a signed-in student and a valid term", async () => {
    await request(app).post("/api/section-availability/refresh").send({ term: "fall", year: 2026 }).expect(401);
    await request(app).post("/api/section-availability/refresh").set("x-test-user", `s1-${RUN}`).send({ term: "autumn", year: 2026 }).expect(400);
  });

  it("refreshes once, then makes the same student wait (bounded upstream traffic)", async () => {
    const first = await request(app).post("/api/section-availability/refresh").set("x-test-user", `s2-${RUN}`).send({ term: "fall", year: 2026 }).expect(200);
    expect(first.body).toEqual({ refreshed: true });
    expect(calls).toBe(1);
    const again = await request(app).post("/api/section-availability/refresh").set("x-test-user", `s2-${RUN}`).send({ term: "fall", year: 2026 }).expect(429);
    expect(again.body).toMatchObject({ refreshed: false, reason: "too_soon" });
    // Another student right after: the service's own bound answers, without another upstream call.
    const other = await request(app).post("/api/section-availability/refresh").set("x-test-user", `s3-${RUN}`).send({ term: "fall", year: 2026 }).expect(200);
    expect(other.body).toMatchObject({ refreshed: false, reason: "too_soon" });
    expect(calls).toBe(1);
  });
});

describe("GET /admin/availability/status", () => {
  it("is for administrators only, and carries no URL or credential", async () => {
    await request(app).get("/api/admin/availability/status").expect(401);
    await request(app).get("/api/admin/availability/status").set("x-test-user", "plain").set("x-test-email", `plain-${RUN}@scu.edu`).expect(403);
    await request(app).post("/api/section-availability/refresh").set("x-test-user", `s4-${RUN}`).send({ term: "winter", year: 2027 }).expect(200);
    const res = await request(app).get("/api/admin/availability/status").set("x-test-user", "admin").set("x-test-email", ADMIN).expect(200);
    expect(res.body).toMatchObject({ liveConfigured: true, provider: "workday_live", minRefreshSeconds: 30 });
    expect(res.body.terms).toEqual([expect.objectContaining({ term: "winter", year: 2027, totalSuccesses: 1, consecutiveFailures: 0 })]);
    expect(JSON.stringify(res.body)).not.toMatch(/https?:|token|Bearer/i);
  });
});

describe("POST /internal/availability/refresh (scheduled ingestion)", () => {
  const SECRET = "x".repeat(40);

  it("does not exist unless a secret is configured", async () => {
    delete process.env["AVAILABILITY_INGEST_SECRET"];
    await request(app).post("/api/internal/availability/refresh").set("authorization", `Bearer ${SECRET}`).expect(404);
  });

  it("refuses a wrong secret, and refreshes the configured terms with the right one", async () => {
    process.env["AVAILABILITY_INGEST_SECRET"] = SECRET;
    process.env["AVAILABILITY_INGEST_TERMS"] = "fall-2026, winter-2027, bogus";
    await request(app).post("/api/internal/availability/refresh").set("authorization", `Bearer ${"y".repeat(40)}`).expect(401);
    await request(app).post("/api/internal/availability/refresh").expect(401);
    const ok = await request(app).post("/api/internal/availability/refresh").set("authorization", `Bearer ${SECRET}`).expect(200);
    expect(ok.body.results).toEqual([
      { term: "fall", year: 2026, outcome: { refreshed: true } },
      { term: "winter", year: 2027, outcome: { refreshed: true } },
    ]);
    expect(calls).toBe(2);
  });
});
