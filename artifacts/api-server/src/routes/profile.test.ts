/**
 * Profile route validation: invalid bodies must return 400, not 500.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { eq } from "drizzle-orm";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.header("x-test-user");
    if (!userId) return res.status(401).json({ error: "Sign in required" });
    req.userId = userId;
    req.userEmail = `${userId}@scu.edu`;
    next();
  },
}));

const { db, studentProfilesTable } = await import("@workspace/db");
const profileRouter = (await import("./profile")).default;

const stubLogger = (req: any, _res: any, next: any) => {
  req.log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
  next();
};

const app = express();
app.use(express.json());
app.use(stubLogger);
app.use("/api", profileRouter);

const USER = `test-profile-${Date.now()}`;
const asUser = (r: request.Test) => r.set("x-test-user", USER);

const validBody = {
  name: "Profile Tester",
  studentType: "continuing",
  college: "School of Engineering",
  major: "CSE",
  additionalMajors: [],
  additionalMinors: [],
  startTerm: "fall",
  startYear: 2023,
  expectedGradTerm: "spring",
  expectedGradYear: 2027,
  unitsCompletedAtSCU: 40,
  unitsTransferredIn: 0,
  completedCourseCodes: [],
  priorityRegistration: false,
  currentTerm: "fall",
  currentYear: 2026,
};

describe("PUT /api/profile validation", () => {
  afterAll(async () => {
    await db.delete(studentProfilesTable).where(eq(studentProfilesTable.userId, USER));
  });

  it("returns 400 (not 500) for invalid studentType / term casing", async () => {
    const res = await asUser(request(app).put("/api/profile")).send({
      ...validBody,
      studentType: "traditional",
      startTerm: "Fall",
      currentTerm: "Fall",
      expectedGradTerm: "Spring",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid profile/i);
    expect(res.body.details).toBeDefined();
  });

  it("accepts a valid profile body", async () => {
    const res = await asUser(request(app).put("/api/profile")).send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.major).toBe("CSE");
    expect(res.body.name).toBe("Profile Tester");
  });

  it("returns the saved profile on GET", async () => {
    const res = await asUser(request(app).get("/api/profile"));
    expect(res.status).toBe(200);
    expect(res.body.college).toBe("School of Engineering");
  });
});
