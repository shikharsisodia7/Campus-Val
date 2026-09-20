/**
 * Student mappings of unrecognized APR items to catalog courses (the
 * professor's optional "map this unrecognized item" feature).
 *
 * The rules under test are the ones the feature was scoped with: the mapping is
 * an ANNOTATION beside the report — it never mutates the stored report or its
 * parse, only accepts what the report actually lists as unmatched, only maps
 * onto a real catalog course, is strictly owner-scoped, and disappears with
 * the report it describes.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { eq, inArray } from "drizzle-orm";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.header("x-test-user");
    if (!userId) return res.status(401).json({ error: "Sign in required" });
    req.userId = userId;
    next();
  },
}));

import { db, progressReportsTable, progressReportMappingsTable } from "@workspace/db";
import progressReportRouter from "./progress-report";
import mappingsRouter from "./progress-report-mappings";

const STAMP = Date.now();
const ALICE = `apr-map-alice-${STAMP}`;
const BOB = `apr-map-bob-${STAMP}`;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).log = { error() {}, warn() {}, info() {} };
  next();
});
app.use("/api", progressReportRouter);
app.use("/api", mappingsRouter);

const savedEnv = { ...process.env };
const PARSED = {
  completedCourses: [{ code: "MATH 11", title: "Calculus", units: 4, confidence: "high" }],
  possibleCourses: [{ raw: "ENGL 2A" }, { raw: "TESP 4" }],
  notes: [],
  parserVersion: "hierarchical-v4",
  groups: [],
};
const as = (user: string) => ({ "x-test-user": user });

async function seedReport(userId: string) {
  await db.insert(progressReportsTable).values({
    userId,
    fileName: "apr.pdf",
    fileSize: 100,
    contentType: "application/pdf",
    objectPath: "/objects/uploads/aaaaaaaaaaaaaaaa/00000000-0000-0000-0000-000000000000",
    parsed: PARSED,
    parseStatus: "parsed",
  });
}
const storedReport = async (userId: string) =>
  (await db.select().from(progressReportsTable).where(eq(progressReportsTable.userId, userId)))[0];

beforeAll(async () => {
  process.env["PRIVATE_STORAGE_PROVIDER"] = "local";
  process.env["PRIVATE_STORAGE_DIR"] = join(tmpdir(), "campusval-map-unused");
  process.env["STORAGE_SIGNING_SECRET"] = "s".repeat(48);
  await seedReport(ALICE);
  await seedReport(BOB);
});

afterAll(async () => {
  process.env = savedEnv;
  await db.delete(progressReportMappingsTable).where(inArray(progressReportMappingsTable.userId, [ALICE, BOB]));
  await db.delete(progressReportsTable).where(inArray(progressReportsTable.userId, [ALICE, BOB]));
});

describe("structural guards", () => {
  const src = readFileSync(join(import.meta.dirname, "progress-report-mappings.ts"), "utf8");

  it("every mapping route sits behind requireAuth", () => {
    const handlers = [...src.matchAll(/router\.(get|put|delete)\(\s*"([^"]+)"([^)]*?)async/gs)];
    expect(handlers.length).toBe(3);
    for (const [, method, path, middlewares] of handlers) {
      expect(middlewares, `${method} ${path}`).toMatch(/requireAuth/);
    }
  });

  it("the user is ALWAYS the authenticated one — never client-supplied", () => {
    expect(src).not.toMatch(/req\.(body|query|params)\b[^;]*userId/);
  });

  it("never reads or writes the report table itself (it goes through the APR route's own accessor)", () => {
    expect(src).not.toMatch(/progressReportsTable/);
  });
});

describe("PUT /progress-report/mappings/:rawCode", () => {
  it("requires sign-in", async () => {
    expect((await request(app).put("/api/progress-report/mappings/ENGL%202A").send({ courseCode: "CSCI 10" })).status).toBe(401);
    expect((await request(app).get("/api/progress-report/mappings")).status).toBe(401);
    expect((await request(app).delete("/api/progress-report/mappings/ENGL%202A")).status).toBe(401);
  });

  it("rejects something that is not a course code", async () => {
    const res = await request(app).put("/api/progress-report/mappings/hello%20world").set(as(ALICE)).send({ courseCode: "CSCI 10" });
    expect(res.status).toBe(400);
  });

  it("rejects a target that is not in the catalog, and a missing/oversize target", async () => {
    const url = "/api/progress-report/mappings/ENGL%202A";
    expect((await request(app).put(url).set(as(ALICE)).send({ courseCode: "ZZZZ 999" })).status).toBe(400);
    expect((await request(app).put(url).set(as(ALICE)).send({})).status).toBe(400);
    expect((await request(app).put(url).set(as(ALICE)).send({ courseCode: "X".repeat(50) })).status).toBe(400);
    expect((await request(app).put(url).set(as(ALICE)).send({ courseCode: 12 })).status).toBe(400);
  });

  it("only accepts a code the report actually lists as UNMATCHED (not a recognized course, not an invented one)", async () => {
    // MATH 11 is a completed catalog course on the report — nothing to map.
    const recognized = await request(app).put("/api/progress-report/mappings/MATH%2011").set(as(ALICE)).send({ courseCode: "CSCI 10" });
    expect(recognized.status).toBe(400);
    expect(recognized.body.error).toMatch(/unmatched items on your report/);
    // A code that appears nowhere on the report.
    expect((await request(app).put("/api/progress-report/mappings/PHYS%20999").set(as(ALICE)).send({ courseCode: "CSCI 10" })).status).toBe(400);
  });

  it("404s when the student has no report at all", async () => {
    const res = await request(app)
      .put("/api/progress-report/mappings/ENGL%202A")
      .set(as(`apr-map-nobody-${STAMP}`))
      .send({ courseCode: "CSCI 10" });
    expect(res.status).toBe(404);
  });

  it("creates a mapping, normalizing both codes, and returns the catalog title", async () => {
    const res = await request(app).put("/api/progress-report/mappings/engl2a").set(as(ALICE)).send({ courseCode: "csci10" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rawCode: "ENGL 2A", courseCode: "CSCI 10" });
    expect(typeof res.body.courseTitle).toBe("string");
    expect(res.body.courseUnits).toBeGreaterThan(0);
    // Never exposes the owner.
    expect(JSON.stringify(res.body)).not.toContain(ALICE);
  });

  it("changing a mapping updates it in place (one row per report code)", async () => {
    const res = await request(app).put("/api/progress-report/mappings/ENGL%202A").set(as(ALICE)).send({ courseCode: "MATH 11" });
    expect(res.status).toBe(200);
    expect(res.body.courseCode).toBe("MATH 11");
    const rows = await db.select().from(progressReportMappingsTable).where(eq(progressReportMappingsTable.userId, ALICE));
    expect(rows.filter((r) => r.rawCode === "ENGL 2A")).toHaveLength(1);
  });

  it("does NOT touch the stored report or its parse — a mapping is an annotation, not a correction of Workday", async () => {
    const before = await storedReport(ALICE);
    await request(app).put("/api/progress-report/mappings/TESP%204").set(as(ALICE)).send({ courseCode: "CSCI 10" });
    const after = await storedReport(ALICE);
    expect(after!.parsed).toEqual(before!.parsed);
    expect(after!.updatedAt.getTime()).toBe(before!.updatedAt.getTime());
    // In particular the mapped item is still an unmatched item, and nothing became "completed".
    const parsed = after!.parsed as typeof PARSED;
    expect(parsed.possibleCourses.map((p) => p.raw)).toEqual(["ENGL 2A", "TESP 4"]);
    expect(parsed.completedCourses.map((c) => c.code)).toEqual(["MATH 11"]);
  });
});

describe("GET /progress-report/mappings — owner-scoped", () => {
  it("returns only the caller's own mappings, sorted", async () => {
    const mine = await request(app).get("/api/progress-report/mappings").set(as(ALICE));
    expect(mine.status).toBe(200);
    expect(mine.body.mappings.map((m: any) => m.rawCode)).toEqual(["ENGL 2A", "TESP 4"]);
    const theirs = await request(app).get("/api/progress-report/mappings").set(as(BOB));
    expect(theirs.body.mappings).toEqual([]);
  });

  it("another student cannot change or delete someone else's mapping", async () => {
    // Bob's own report also lists ENGL 2A, so he can create HIS mapping…
    const bobPut = await request(app).put("/api/progress-report/mappings/ENGL%202A").set(as(BOB)).send({ courseCode: "ECON 1" });
    expect(bobPut.status).toBe(200);
    // …which is a separate row: Alice's is unchanged.
    const alice = await request(app).get("/api/progress-report/mappings").set(as(ALICE));
    expect(alice.body.mappings.find((m: any) => m.rawCode === "ENGL 2A").courseCode).toBe("MATH 11");
    // Bob deleting removes only his.
    expect((await request(app).delete("/api/progress-report/mappings/ENGL%202A").set(as(BOB))).status).toBe(200);
    const aliceAfter = await request(app).get("/api/progress-report/mappings").set(as(ALICE));
    expect(aliceAfter.body.mappings.map((m: any) => m.rawCode)).toContain("ENGL 2A");
    // And a student with no such mapping gets a 404, not a silent success.
    expect((await request(app).delete("/api/progress-report/mappings/TESP%204").set(as(BOB))).status).toBe(404);
  });
});

describe("lifecycle", () => {
  it("survives replacing the report (a re-upload rewrites the report row, not the student's notes)", async () => {
    await db.update(progressReportsTable).set({ parsed: { ...PARSED, notes: ["reparsed"] } }).where(eq(progressReportsTable.userId, ALICE));
    const res = await request(app).get("/api/progress-report/mappings").set(as(ALICE));
    expect(res.body.mappings.map((m: any) => m.rawCode)).toEqual(["ENGL 2A", "TESP 4"]);
  });

  it("DELETE removes a mapping; deleting it twice is a 404", async () => {
    expect((await request(app).delete("/api/progress-report/mappings/TESP%204").set(as(ALICE))).status).toBe(200);
    expect((await request(app).delete("/api/progress-report/mappings/TESP%204").set(as(ALICE))).status).toBe(404);
  });

  it("deleting the report deletes the student's mappings with it", async () => {
    expect((await request(app).delete("/api/progress-report").set(as(ALICE))).status).toBe(200);
    const rows = await db.select().from(progressReportMappingsTable).where(eq(progressReportMappingsTable.userId, ALICE));
    expect(rows).toEqual([]);
    // Bob's report and his (empty) mappings are untouched.
    expect(await storedReport(BOB)).toBeDefined();
  });
});
