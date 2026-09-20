/**
 * Guard for "normal course search and department filters still work" after the
 * Core-area rework: department (subject) filtering, plain text search, and the
 * Core-only switch are independent of the new canonical layer.
 */
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";

import coursesRouter from "./courses";
import schedulesRouter from "./schedules";

const app = express();
app.use(express.json());
app.use("/api", coursesRouter);
app.use("/api", schedulesRouter);

describe("department / subject filtering", () => {
  it.each(["BIOL", "MATH", "CSEN", "ENGL", "PHIL"])("department=%s returns only that subject, and plenty of it", async (dept) => {
    const res = await request(app).get("/api/courses").query({ department: dept });
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(10);
    expect(res.body.every((c: any) => c.department === dept)).toBe(true);
  });

  it("department matching is case-insensitive (Biology courses are found however the filter is typed)", async () => {
    const lower = await request(app).get("/api/courses").query({ department: "biol" });
    const upper = await request(app).get("/api/courses").query({ department: "BIOL" });
    expect(lower.body.length).toBe(upper.body.length);
    expect(lower.body.length).toBeGreaterThan(0);
  });

  it("combines department with a text search", async () => {
    const res = await request(app).get("/api/courses").query({ department: "BIOL", search: "ecology" });
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((c: any) => c.department === "BIOL")).toBe(true);
  });
});

describe("plain text search (course-search) is unchanged", () => {
  it("finds a course by code, with or without the space, and by title words", async () => {
    const a = await request(app).get("/api/course-search").query({ q: "BIOL 1A" });
    const b = await request(app).get("/api/course-search").query({ q: "BIOL1A" });
    expect(a.body.courses[0].code).toBe("BIOL 1A");
    expect(b.body.courses.map((c: any) => c.code)).toContain("BIOL 1A");
    const t = await request(app).get("/api/course-search").query({ q: "organic chemistry" });
    expect(t.body.totalMatching).toBeGreaterThan(0);
  });

  it("'biology' as free text finds Biology courses (a department name is not swallowed by the Core aliases)", async () => {
    const res = await request(app).get("/api/course-search").query({ q: "biology", limit: 100 });
    expect(res.body.courses.some((c: any) => c.code.startsWith("BIOL"))).toBe(true);
  });

  it("the Core-only switch on /courses still filters to tagged courses", async () => {
    const all = await request(app).get("/api/courses");
    const core = await request(app).get("/api/courses").query({ core: "true" });
    expect(core.body.length).toBeGreaterThan(0);
    expect(core.body.length).toBeLessThan(all.body.length);
    expect(core.body.every((c: any) => c.coreAreas.length > 0)).toBe(true);
  });
});
