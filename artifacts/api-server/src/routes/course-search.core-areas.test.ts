/**
 * HTTP-level behaviour of Core-area discovery: aliases resolve through the one
 * canonical table, the Core click returns the COMPLETE result set (paged, not
 * truncated), and requirement items tell the UI which Core area to search.
 */
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.userId = "u";
    next();
  },
}));

import schedulesRouter from "./schedules";

const app = express();
app.use(express.json());
app.use("/api", schedulesRouter);

describe("GET /api/core-areas", () => {
  it("lists every canonical area (even ones with no tagged courses) with counts and requirement ids", async () => {
    const res = await request(app).get("/api/core-areas");
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.coreAreas.map((a: any) => [a.name, a]));
    expect(byName["Critical Thinking & Writing"]).toMatchObject({ code: "CTW", requirementIds: ["ctw1", "ctw2"] });
    expect(byName["Critical Thinking & Writing"].courseCount).toBeGreaterThanOrEqual(5);
    expect(byName["Experiential Learning for Social Justice"].courseCount).toBeGreaterThan(0);
    expect(byName["Cultures & Ideas 3"].catalogStatedCount).toBeGreaterThan(0);
    expect(res.body.pathwaysAvailable).toBe(false);
  });
});

describe("GET /api/course-search with Core areas", () => {
  it.each(["Critical Thinking & Writing", "CTW", "ctw", "Critical Thinking and Writing"])(
    "coreAreas=%s returns the same complete CTW set",
    async (alias) => {
      const res = await request(app).get("/api/course-search").query({ coreAreas: alias, limit: 100 });
      expect(res.status).toBe(200);
      expect(res.body.state).toBe("results");
      const codes = res.body.courses.map((c: any) => c.code);
      expect(codes).toEqual(expect.arrayContaining(["ENGL 1A", "PHIL 1A", "WGST 1A"]));
      expect(res.body.hasMore).toBe(false);
    },
  );

  it("resolves CNI to Cultures & Ideas and Advanced Writing / AW to Advanced Writing", async () => {
    const cni = await request(app).get("/api/course-search").query({ coreAreas: "CNI", limit: 100 });
    expect(cni.body.courses.map((c: any) => c.code)).toEqual(expect.arrayContaining(["ENGL 11A", "PHIL 11A"]));
    const aw1 = await request(app).get("/api/course-search").query({ coreAreas: "Advanced Writing", limit: 100 });
    const aw2 = await request(app).get("/api/course-search").query({ coreAreas: "AW", limit: 100 });
    expect(aw2.body.totalMatching).toBe(aw1.body.totalMatching);
    expect(aw1.body.courses.map((c: any) => c.code)).toContain("CHEM 132");
  });

  it("typing a bare unambiguous Core code into the text box (q=CTW) finds the Core area's courses", async () => {
    const res = await request(app).get("/api/course-search").query({ q: "CTW", limit: 100 });
    expect(res.body.courses.map((c: any) => c.code)).toEqual(expect.arrayContaining(["ENGL 1A", "PHIL 1A"]));
  });

  it("but typing a department that is also an alias (q=math) still does an ordinary department search", async () => {
    const res = await request(app).get("/api/course-search").query({ q: "MATH 11", limit: 10 });
    expect(res.body.courses[0].code).toBe("MATH 11");
    const dept = await request(app).get("/api/course-search").query({ q: "math", limit: 100 });
    // Ordinary text search: includes MATH courses that carry no Core tag at all.
    expect(dept.body.courses.some((c: any) => c.coreAreas.length === 0)).toBe(true);
  });

  it("pages large areas with offset and reports hasMore", async () => {
    const first = await request(app).get("/api/course-search").query({ coreAreas: "Diversity", limit: 100 });
    expect(first.body.hasMore).toBe(true);
    const second = await request(app).get("/api/course-search").query({ coreAreas: "Diversity", limit: 100, offset: 100 });
    expect(second.body.offset).toBe(100);
    const firstCodes = new Set(first.body.courses.map((c: any) => c.code));
    expect(second.body.courses.some((c: any) => firstCodes.has(c.code))).toBe(false);
  });

  it("with a quarter but offeredOnly=false, still returns the whole catalog set and per-course section counts", async () => {
    const res = await request(app)
      .get("/api/course-search")
      .query({ coreAreas: "CTW", term: "fall", year: 2026, offeredOnly: "false", limit: 100 });
    expect(res.body.totalMatching).toBeGreaterThanOrEqual(5);
    expect(res.body.courses).toHaveLength(res.body.totalMatching);
    expect(res.body.totalWithSections).not.toBeNull();
    expect(res.body.courses.every((c: any) => typeof c.sectionsThisQuarter === "number")).toBe(true);
  });

  it("an unrecognised Core name is an honest empty result, not the whole catalog", async () => {
    const res = await request(app).get("/api/course-search").query({ coreAreas: "Underwater Basket Weaving" });
    expect(res.body.state).toBe("no_matching_courses");
    expect(res.body.courses).toEqual([]);
  });
});
