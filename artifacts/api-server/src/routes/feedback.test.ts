/**
 * API tests for /api/feedback (both entry points -- the plain page and the
 * "Report Error / Suggest Changes" dialog) and its admin review endpoints.
 * Auth stubbed the same way as routes/usage.test.ts; the shared requireAuth
 * middleware itself (401 signed-out, 403 unapproved-domain denial) is
 * covered generically in middlewares/requireAuth.test.ts and applies to
 * every route including this one, so it is not re-tested per-field here.
 */
import { describe, it, expect, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { inArray } from "drizzle-orm";

vi.mock("../middlewares/requireAuth", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    requireAuth: (req: any, res: any, next: any) => {
      const userId = req.header("x-test-user");
      const email = req.header("x-test-email");
      if (!userId || !email) return res.status(401).json({ error: "Sign in required" });
      req.userId = userId;
      req.userEmail = email;
      next();
    },
  };
});

vi.mock("../lib/admin", () => ({
  isAdminUser: (email: string) => email === "admin@scu.edu",
}));

const { db, feedbackTable } = await import("@workspace/db");
const feedbackRouter = (await import("./feedback")).default;

const stubLogger = (req: any, _res: any, next: any) => {
  req.log = {
    error: () => {},
    warn: () => {},
    info: () => {},
    debug: () => {},
  };
  next();
};

const app = express();
app.use(express.json());
app.use(stubLogger);
app.use("/api", feedbackRouter);

const RUN = Date.now();
const SCU_USER = `test-feedback-scu-${RUN}`;
const REVIEWER_USER = `test-feedback-reviewer-${RUN}`;
const TEST_USERS = [SCU_USER, REVIEWER_USER];

const asScuUser = (r: request.Test) =>
  r.set("x-test-user", SCU_USER).set("x-test-email", "student@scu.edu");
const asReviewer = (r: request.Test) =>
  r.set("x-test-user", REVIEWER_USER).set("x-test-email", "reviewer@pdx.edu");
const asAdmin = (r: request.Test) =>
  r.set("x-test-user", "test-admin-feedback").set("x-test-email", "admin@scu.edu");

afterAll(async () => {
  await db.delete(feedbackTable).where(inArray(feedbackTable.userId, TEST_USERS));
});

describe("POST /api/feedback", () => {
  it("401s when signed out", async () => {
    await request(app)
      .post("/api/feedback")
      .send({ category: "bug", message: "Something is broken" })
      .expect(401);
  });

  it("accepts a plain-page submission from an SCU user", async () => {
    const res = await asScuUser(request(app).post("/api/feedback")).send({
      category: "bug",
      message: "The GPA calculator rounds incorrectly on the last digit.",
    });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  it("accepts a Report Error / Suggest Changes submission from an invited external reviewer", async () => {
    const res = await asReviewer(request(app).post("/api/feedback")).send({
      category: "general",
      message: "MATH 11 should not be listed as offered in Spring.",
      type: "incorrect_info",
      subject: "MATH 11 term availability",
      feature: "Degree Plan",
      pathname: "/degree-plan",
      academicItem: "MATH 11",
      officialSourceUrl: "https://www.scu.edu/math11",
      proposedCorrection: "Remove the Spring offering.",
    });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  it("400s a malformed submission (message too short)", async () => {
    await asScuUser(request(app).post("/api/feedback")).send({ message: "hi" }).expect(400);
  });

  it("400s an invalid report type", async () => {
    await asScuUser(request(app).post("/api/feedback"))
      .send({ message: "Valid length message here.", type: "not-a-real-type" })
      .expect(400);
  });

  it("400s a malformed official source URL", async () => {
    await asScuUser(request(app).post("/api/feedback"))
      .send({ message: "Valid length message here.", officialSourceUrl: "not a url" })
      .expect(400);
  });

  it("ignores client-supplied identity and any unrecognized/sensitive fields", async () => {
    const res = await asScuUser(request(app).post("/api/feedback")).send({
      message: "Testing that extra fields are dropped, not stored.",
      userId: "someone-else",
      email: "attacker@evil.com",
      status: "RESOLVED",
      authToken: "should-never-be-stored",
      cookie: "session=abc123",
      aprContent: "GPA 3.9, SSN 123-45-6789",
    });
    expect(res.status).toBe(201);

    const [row] = await db
      .select()
      .from(feedbackTable)
      .where(inArray(feedbackTable.id, [res.body.id]));
    expect(row!.userId).toBe(SCU_USER);
    expect(row!.email).toBe("student@scu.edu");
    expect(row!.status).toBe("OPEN");
    const stored = JSON.stringify(row);
    expect(stored).not.toContain("attacker@evil.com");
    expect(stored).not.toContain("should-never-be-stored");
    expect(stored).not.toContain("123-45-6789");
  });
});

describe("GET /api/admin/feedback", () => {
  it("401s when signed out", async () => {
    await request(app).get("/api/admin/feedback").expect(401);
  });

  it("403s a normal signed-in user (not on ADMIN_EMAILS) -- no enumeration", async () => {
    await asScuUser(request(app).get("/api/admin/feedback")).expect(403);
  });

  it("403s an allowlisted external reviewer who isn't separately an admin", async () => {
    await asReviewer(request(app).get("/api/admin/feedback")).expect(403);
  });

  it("returns the submitted reports for an admin, including dialog-specific fields", async () => {
    const res = await asAdmin(request(app).get("/api/admin/feedback")).expect(200);
    expect(Array.isArray(res.body.feedback)).toBe(true);
    const mine = res.body.feedback.filter((f: any) =>
      TEST_USERS.some((u) => f.email === "student@scu.edu" || f.email === "reviewer@pdx.edu"),
    );
    expect(mine.length).toBeGreaterThan(0);
    const reportRow = res.body.feedback.find((f: any) => f.type === "incorrect_info");
    expect(reportRow).toBeTruthy();
    expect(reportRow.subject).toBe("MATH 11 term availability");
    expect(reportRow.academicItem).toBe("MATH 11");
  });

  it("filters by status", async () => {
    const res = await asAdmin(request(app).get("/api/admin/feedback?status=OPEN")).expect(200);
    expect(res.body.feedback.every((f: any) => f.status === "OPEN")).toBe(true);
  });

  it("400s an invalid status filter", async () => {
    await asAdmin(request(app).get("/api/admin/feedback?status=NOT_A_STATUS")).expect(400);
  });
});

describe("PATCH /api/admin/feedback/:id", () => {
  it("401s when signed out", async () => {
    await request(app).patch("/api/admin/feedback/1").send({ status: "RESOLVED" }).expect(401);
  });

  it("403s a non-admin", async () => {
    await asScuUser(request(app).patch("/api/admin/feedback/1"))
      .send({ status: "RESOLVED" })
      .expect(403);
  });

  it("400s an invalid status value", async () => {
    const created = await asScuUser(request(app).post("/api/feedback")).send({
      message: "Row to attempt an invalid status update on.",
    });
    await asAdmin(request(app).patch(`/api/admin/feedback/${created.body.id}`))
      .send({ status: "CLOSED" })
      .expect(400);
  });

  it("updates status and stamps resolvedAt/resolvedBy for a terminal status", async () => {
    const created = await asScuUser(request(app).post("/api/feedback")).send({
      message: "Row that will be marked resolved by an admin.",
    });
    const res = await asAdmin(request(app).patch(`/api/admin/feedback/${created.body.id}`))
      .send({ status: "RESOLVED" })
      .expect(200);
    expect(res.body.status).toBe("RESOLVED");

    const [row] = await db
      .select()
      .from(feedbackTable)
      .where(inArray(feedbackTable.id, [created.body.id]));
    expect(row!.status).toBe("RESOLVED");
    expect(row!.resolvedBy).toBe("admin@scu.edu");
    expect(row!.resolvedAt).toBeTruthy();
  });

  it("404s an unknown feedback id", async () => {
    await asAdmin(request(app).patch("/api/admin/feedback/999999999"))
      .send({ status: "DISMISSED" })
      .expect(404);
  });
});