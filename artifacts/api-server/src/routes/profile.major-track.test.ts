/**
 * PUT /profile/major-track: the student's track / emphasis in a major is planning intent the
 * requirements sidebar resolves. Only a track the major's Bulletin structure defines is accepted,
 * only for the signed-in student, and the sidebar follows it.
 */
import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";

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
const { buildRequirementsResponse } = await import("./requirements");

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: any) => {
  req.log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
  next();
});
app.use("/api", profileRouter);

const USER = `test-track-${Date.now()}`;
const OTHER = `test-track-other-${Date.now()}`;
const as = (user: string, r: request.Test) => r.set("x-test-user", user);

const body = {
  name: "Track Tester",
  studentType: "continuing",
  college: "School of Engineering",
  major: "BIOE",
  additionalMajors: [],
  additionalMinors: [],
  startTerm: "fall",
  startYear: 2025,
  expectedGradTerm: "spring",
  expectedGradYear: 2029,
  unitsCompletedAtSCU: 40,
  unitsTransferredIn: 0,
  completedCourseCodes: ["CHEM 11"],
  priorityRegistration: false,
  currentTerm: "fall",
  currentYear: 2026,
};

describe("PUT /api/profile/major-track", () => {
  beforeAll(async () => {
    await as(USER, request(app).put("/api/profile")).send(body).expect(200);
    await as(OTHER, request(app).put("/api/profile")).send(body).expect(200);
  });
  afterAll(async () => {
    await db.delete(studentProfilesTable).where(inArray(studentProfilesTable.userId, [USER, OTHER]));
  });

  it("requires sign-in", async () => {
    await request(app).put("/api/profile/major-track").send({ major: "BIOE", track: "pre-med" }).expect(401);
  });

  it("starts with no track, and the sidebar asks for one", async () => {
    const res = await as(USER, request(app).get("/api/profile")).expect(200);
    expect(res.body.majorTracks).toEqual({});
    const [row] = await db.select().from(studentProfilesTable).where(eq(studentProfilesTable.userId, USER));
    const major = buildRequirementsResponse(row!).groups.find((g) => g.kind === "major")!;
    expect(major.items.map((i) => i.id)).toContain("major-primary-choose-track");
    expect("variants" in major && major.variants?.selected).toBe(null);
  });

  it("saves a track the Bulletin defines, and the sidebar shows that track only", async () => {
    const res = await as(USER, request(app).put("/api/profile/major-track")).send({ major: "bioe", track: "pre-med" }).expect(200);
    expect(res.body.majorTracks).toEqual({ BIOE: "pre-med" });
    const [row] = await db.select().from(studentProfilesTable).where(eq(studentProfilesTable.userId, USER));
    const major = buildRequirementsResponse(row!).groups.find((g) => g.kind === "major")!;
    const ids = major.items.map((i) => i.id);
    expect(ids).toContain("major-primary-pre-med-science-chem-11");
    expect(ids.some((id) => id.includes("biomolecular"))).toBe(false);
    expect(ids).not.toContain("major-primary-choose-track");
    expect("variants" in major && major.variants?.selected).toBe("pre-med");
    // Another student's profile is untouched.
    const other = await as(OTHER, request(app).get("/api/profile")).expect(200);
    expect(other.body.majorTracks).toEqual({});
  });

  it("refuses a track the major does not have, and a major without tracks, by name", async () => {
    const bad = await as(USER, request(app).put("/api/profile/major-track")).send({ major: "BIOE", track: "astronomy" }).expect(400);
    expect(bad.body.error).toContain("biomolecular");
    const none = await as(USER, request(app).put("/api/profile/major-track")).send({ major: "PHYS", track: "x" }).expect(400);
    expect(none.body.error).toContain("PHYS");
    await as(USER, request(app).put("/api/profile/major-track")).send({ major: "BIOE" }).expect(400);
  });

  it("clears a track with null", async () => {
    const res = await as(USER, request(app).put("/api/profile/major-track")).send({ major: "BIOE", track: null }).expect(200);
    expect(res.body.majorTracks).toEqual({});
  });

  it("is 404 before a profile exists", async () => {
    await as(`nobody-${Date.now()}`, request(app).put("/api/profile/major-track")).send({ major: "BIOE", track: "pre-med" }).expect(404);
  });
});
