/**
 * Authorization audit for the private APR surface (professor review, 2026-09):
 * "a shared plan must not automatically disclose the owner's private uploaded
 * APR" and "only the owner can upload/replace/delete/read".
 *
 * Two layers, deliberately:
 *  1. STRUCTURAL guards over the source — cheap and permanent, they fail the
 *     moment anyone adds a second reader of APR data or trusts a client-sent
 *     user id.
 *  2. BEHAVIOURAL checks over HTTP with a real database: an advisor holding a
 *     valid share of the student's plan still gets nothing of the APR.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { eq, inArray } from "drizzle-orm";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.header("x-test-user");
    if (!userId) return res.status(401).json({ error: "Sign in required" });
    req.userId = userId;
    req.userEmail = req.header("x-test-email");
    next();
  },
}));

import { db, progressReportsTable, planSharesTable, academicPlansTable } from "@workspace/db";
import progressReportRouter from "./progress-report";
import planSharesRouter from "./plan-shares";

const SRC = join(import.meta.dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__fixtures__" ? [] : sourceFiles(p);
    return p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}
const ALL = sourceFiles(SRC);
const text = (p: string) => readFileSync(p, "utf8");
const rel = (p: string) => relative(SRC, p).replace(/\\/g, "/");

describe("structural guards", () => {
  it("routes/progress-report.ts is the ONLY server module that reads the APR table", () => {
    const readers = ALL.filter((p) => /progressReportsTable/.test(text(p))).map(rel);
    expect(readers).toEqual(["routes/progress-report.ts"]);
  });

  it("every APR route (and the generic object route) sits behind requireAuth", () => {
    const apr = text(join(SRC, "routes", "progress-report.ts"));
    const handlers = [...apr.matchAll(/router\.(get|put|post|delete)\(\s*"([^"]+)"([^)]*?)async/gs)];
    expect(handlers.length).toBeGreaterThanOrEqual(4);
    for (const [, method, path, middlewares] of handlers) {
      expect(middlewares, `${method} ${path}`).toMatch(/requireAuth/);
    }
    const storage = text(join(SRC, "routes", "storage.ts"));
    expect(storage).toMatch(/'\/storage\/objects\/\*path',\s*requireAuth/);
    expect(storage).toMatch(/canRead\(/);
  });

  it("the APR user is ALWAYS the authenticated one — never a client-supplied id", () => {
    const apr = text(join(SRC, "routes", "progress-report.ts"));
    expect(apr).not.toMatch(/req\.(body|query|params)(\.|\[["'])userId/);
    expect(apr).not.toMatch(/req\.(body|query|params)\b[^;]*userId/);
    // every read/write is keyed on the derived id
    expect(apr).toMatch(/const userId = req\.userId!/);
  });

  it("no advisor-sharing route touches APR data or the storage layer", () => {
    const shares = text(join(SRC, "routes", "plan-shares.ts"));
    expect(shares).not.toMatch(/getPrivateObjectStorage/);
    expect(shares).not.toMatch(/progressReportsTable/);
  });

  it("the private-object API never returns a storage path or owner id to the client", () => {
    const apr = text(join(SRC, "routes", "progress-report.ts"));
    const dto = /function reportDto\([\s\S]*?\n\}/.exec(apr)![0];
    expect(dto).not.toMatch(/objectPath|userId/);
  });

  it("stored objects are never served statically", () => {
    const app = text(join(SRC, "app.ts"));
    expect(app).not.toMatch(/PRIVATE_STORAGE_DIR|progress-reports/);
  });
});

const STUDENT = `apr-ac-student-${Date.now()}`;
const ADVISOR = `apr-ac-advisor-${Date.now()}`;
const ADVISOR_EMAIL = `advisor-${Date.now()}@scu.edu`;
let planId: number;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).log = { error() {}, warn() {}, info() {} };
  next();
});
app.use("/api", progressReportRouter);
app.use("/api", planSharesRouter);

const savedEnv = { ...process.env };

beforeAll(async () => {
  // Storage must be "configured" or the route short-circuits to
  // {available:false} before reaching the authorization path under test.
  process.env["PRIVATE_STORAGE_PROVIDER"] = "local";
  process.env["PRIVATE_STORAGE_DIR"] = join(tmpdir(), "campusval-ac-unused");
  process.env["STORAGE_SIGNING_SECRET"] = "s".repeat(48);
  await db.insert(progressReportsTable).values({
    userId: STUDENT,
    fileName: "secret-student-apr.pdf",
    fileSize: 100,
    contentType: "application/pdf",
    objectPath: "/objects/uploads/aaaaaaaaaaaaaaaa/00000000-0000-0000-0000-000000000000",
    parsed: { completedCourses: [], possibleCourses: [], notes: [], groups: [{ name: "SECRET-GROUP Major Requirements", requirements: [] }] },
    parseStatus: "parsed",
  });
  const [plan] = await db.insert(academicPlansTable).values({ userId: STUDENT, name: "My plan", planType: "degree" } as any).returning();
  planId = plan!.id;
  await db.insert(planSharesTable).values({ studentUserId: STUDENT, advisorEmail: ADVISOR_EMAIL, scopes: ["degree_plan", "tentative_degree_plan"] });
});

afterAll(async () => {
  process.env = savedEnv;
  await db.delete(planSharesTable).where(eq(planSharesTable.studentUserId, STUDENT));
  await db.delete(academicPlansTable).where(eq(academicPlansTable.id, planId));
  await db.delete(progressReportsTable).where(inArray(progressReportsTable.userId, [STUDENT, ADVISOR]));
});

describe("an advisor with a VALID share still cannot reach the student's APR", () => {
  it("the share itself works (control): the advisor can read the shared plan", async () => {
    const res = await request(app)
      .get(`/api/advisor/shared-students/${STUDENT}/plan`)
      .set("x-test-user", ADVISOR)
      .set("x-test-email", ADVISOR_EMAIL);
    expect(res.status).toBe(200);
    expect(res.body.readOnly).toBe(true);
  });

  it("…and that response contains no APR data of any kind", async () => {
    const res = await request(app)
      .get(`/api/advisor/shared-students/${STUDENT}/plan`)
      .set("x-test-user", ADVISOR)
      .set("x-test-email", ADVISOR_EMAIL);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/SECRET-GROUP|secret-student-apr|parsed|parserVersion|reportStudentId|"grade"/);
  });

  it("the advisor's own /progress-report is THEIR report (none), never the student's", async () => {
    const res = await request(app).get("/api/progress-report").set("x-test-user", ADVISOR).set("x-test-email", ADVISOR_EMAIL);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/SECRET-GROUP|secret-student-apr/);
    expect((await request(app).get("/api/progress-report/file").set("x-test-user", ADVISOR)).status).toBe(404);
  });

  it("no query/body/param trick can address another user's report", async () => {
    for (const q of [`?userId=${STUDENT}`, `?user_id=${STUDENT}`, `?view=planning&userId=${STUDENT}`]) {
      const res = await request(app).get(`/api/progress-report${q}`).set("x-test-user", ADVISOR);
      expect(res.status).toBe(404);
    }
    const del = await request(app).delete("/api/progress-report").set("x-test-user", ADVISOR).send({ userId: STUDENT });
    expect(del.status).toBe(404);
    // …and the student's report is untouched.
    expect((await db.select().from(progressReportsTable).where(eq(progressReportsTable.userId, STUDENT))).length).toBe(1);
  });

  it("sharing cannot be widened to APR: 'apr' is dropped from the granted scopes", async () => {
    const res = await request(app)
      .post("/api/plan-shares")
      .set("x-test-user", STUDENT)
      .set("x-test-email", `student-${Date.now()}@scu.edu`)
      .send({ advisorEmail: `other-${Date.now()}@scu.edu`, scopes: ["degree_plan", "apr"] });
    expect(res.status).toBeLessThan(300);
    expect(res.body.scopes).not.toContain("apr");
  });
});
