/**
 * Authorization audit for the private APR surface.
 *
 *   "No user can access another user's APR through modified IDs."
 *   "A shared plan must not automatically disclose the owner's APR."
 *
 * Two layers, deliberately:
 *  1. STRUCTURAL guards over the source — cheap and permanent; they fail the
 *     moment someone adds a second reader of APR data, trusts a client-sent
 *     user id, or writes an unscoped query.
 *  2. BEHAVIOURAL checks over HTTP with the real database and the real local
 *     storage provider: user B, holding user A's document IDS, gets nothing —
 *     and so does an advisor holding a valid share of A's plan.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
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
import { resetPrivateObjectStorageForTests } from "../lib/storage";
import { buildAprFixture } from "../__fixtures__/apr/build-workbooks";
import storageRouter from "./storage";
import progressReportsRouter from "./progress-reports";
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
const APR = text(join(SRC, "routes", "progress-reports.ts"));

describe("structural guards", () => {
  it("routes/progress-reports.ts is the ONLY server module that reads the APR table", () => {
    const users = ALL.filter((p) => /progressReportsTable/.test(text(p))).map(rel);
    // routes/profile.ts ("Delete account") may DELETE the student's APR rows —
    // and nothing else: no select, no update, no insert.
    expect(users.filter((p) => p !== "routes/profile.ts")).toEqual(["routes/progress-reports.ts"]);
    const profile = text(join(SRC, "routes", "profile.ts"));
    expect(profile).not.toMatch(/(from|update|insert)\(\s*progressReportsTable\s*\)/);
    expect(profile).toMatch(/\.delete\(progressReportsTable\)/);
  });

  it("every APR route (and the generic object route) sits behind requireAuth", () => {
    const handlers = [...APR.matchAll(/router\.(get|put|post|patch|delete)\(\s*"([^"]+)"([^)]*?)async/gs)];
    expect(handlers.map(([, method, path]) => `${method} ${path}`).sort()).toEqual(
      [
        "get /progress-reports",
        "post /progress-reports",
        "get /progress-reports/sidebar",
        "get /progress-reports/:id",
        "patch /progress-reports/:id",
        "delete /progress-reports/:id",
        "get /progress-reports/:id/workbook",
        "get /progress-reports/:id/file",
        "put /progress-reports/:id/file",
      ].sort(),
    );
    for (const [, method, path, middlewares] of handlers) {
      expect(middlewares, `${method} ${path}`).toMatch(/requireAuth/);
    }
    const storage = text(join(SRC, "routes", "storage.ts"));
    expect(storage).toMatch(/'\/storage\/objects\/\*path',\s*requireAuth/);
    expect(storage).toMatch(/canRead\(/);
  });

  it("the APR user is ALWAYS the authenticated one — never a client-supplied id", () => {
    expect(APR).not.toMatch(/req\.(body|query|params)(\.|\[["'])userId/);
    expect(APR).not.toMatch(/req\.(body|query|params)\b[^;\n]*userId/);
    const handlers = APR.split(/\nrouter\.(?:get|put|post|patch|delete)\(/).slice(1);
    expect(handlers).toHaveLength(9);
    for (const handler of handlers) {
      // Storage-unavailable short circuits aside, each handler derives the owner itself.
      expect(handler).toMatch(/const userId = req\.userId!/);
    }
  });

  it("every query against the APR table is scoped to an owner", () => {
    // Each `.from(progressReportsTable)` / `.update(` / `.delete(` statement names user_id.
    const statements = [
      ...APR.matchAll(/\.(?:from|update|delete)\(progressReportsTable\)[\s\S]*?;/g),
    ].map((m) => m[0]);
    expect(statements.length).toBeGreaterThanOrEqual(8);
    for (const statement of statements) {
      expect(statement, statement.slice(0, 120)).toMatch(/progressReportsTable\.userId/);
    }
  });

  it("no advisor-sharing route touches APR data or the storage layer", () => {
    const shares = text(join(SRC, "routes", "plan-shares.ts"));
    expect(shares).not.toMatch(/getPrivateObjectStorage/);
    expect(shares).not.toMatch(/progressReportsTable/);
    expect(shares).not.toMatch(/lib\/apr\//);
  });

  it("the client DTO never carries a storage path, an owner id, or the legacy interpretation", () => {
    const dto = /function documentDto\([\s\S]*?\n\}/.exec(APR)![0];
    expect(dto).not.toMatch(/objectPath|userId|parsed\b/);
  });

  it("stored objects are never served statically", () => {
    const app = text(join(SRC, "app.ts"));
    expect(app).not.toMatch(/PRIVATE_STORAGE_DIR|progress-reports\/|express\.static\([^)]*storage/);
  });

  it("the importer makes no academic judgment: it imports no catalog, requirement or course data", () => {
    const aprLib = ALL.filter((p) => rel(p).startsWith("lib/apr/"));
    expect(aprLib.length).toBeGreaterThanOrEqual(6);
    for (const p of [...aprLib, join(SRC, "routes", "progress-reports.ts")]) {
      expect(text(p), rel(p)).not.toMatch(/from\s+["'][^"']*(data\/courses|degree-requirements|graduation-paths|core-areas)["']/);
    }
  });

  it("nothing in the APR code logs an error object, which could quote file content", () => {
    for (const p of [...ALL.filter((f) => rel(f).startsWith("lib/apr/")), join(SRC, "routes", "progress-reports.ts")]) {
      expect(text(p), rel(p)).not.toMatch(/log\.(error|warn|info)\(\s*\{[^}]*\berr\b/);
      expect(text(p), rel(p)).not.toMatch(/console\.(log|error|warn)/);
    }
  });
});

const RUN = Date.now();
const STUDENT = `apr-ac-student-${RUN}`;
const OTHER = `apr-ac-other-${RUN}`;
const ADVISOR = `apr-ac-advisor-${RUN}`;
const ADVISOR_EMAIL = `advisor-${RUN}@scu.edu`;
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const SECRETS = /Finance Major|FNCE 121|Core: LSB|Not Satisfied|secret-finance|Fall 2026 Quarter/;

let planId: number;
let dir: string;
let docId: number;
let secondDocId: number;
let studentObjectPath: string;
const savedEnv = { ...process.env };

const app = express();
app.use((req, _res, next) => {
  (req as any).log = { error() {}, warn() {}, info() {} };
  next();
});
app.use(express.json());
app.use("/api", storageRouter);
app.use("/api", progressReportsRouter);
app.use("/api", planSharesRouter);

const pathOf = (u: string) => (u.startsWith("/") ? u : new URL(u).pathname);

async function upload(user: string, bytes: Buffer, fileName: string): Promise<string> {
  const target = await request(app)
    .post("/api/storage/uploads/request-url")
    .set("x-test-user", user)
    .send({ name: fileName, size: bytes.length, contentType: XLSX_TYPE });
  await request(app).put(pathOf(target.body.uploadURL)).set("Content-Type", XLSX_TYPE).send(bytes);
  return target.body.objectPath;
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "campusval-apr-ac-"));
  process.env["PRIVATE_STORAGE_PROVIDER"] = "local";
  process.env["PRIVATE_STORAGE_DIR"] = dir;
  process.env["STORAGE_SIGNING_SECRET"] = "s".repeat(48);
  resetPrivateObjectStorageForTests();

  const bytes = await buildAprFixture("finance-major");
  studentObjectPath = await upload(STUDENT, bytes, "secret-finance.xlsx");
  const created = await request(app)
    .post("/api/progress-reports")
    .set("x-test-user", STUDENT)
    .send({ objectPath: studentObjectPath, fileName: "secret-finance.xlsx", fileSize: bytes.length, contentType: XLSX_TYPE, label: "Finance Major", category: "primary_major" });
  expect(created.status).toBe(201);
  docId = created.body.id;

  const minor = await buildAprFixture("data-science-minor");
  const second = await request(app)
    .post("/api/progress-reports")
    .set("x-test-user", STUDENT)
    .send({ objectPath: await upload(STUDENT, minor, "minor.xlsx"), fileName: "minor.xlsx", fileSize: minor.length, contentType: XLSX_TYPE, label: "Data Science Minor", category: "minor" });
  secondDocId = second.body.id;

  const [plan] = await db.insert(academicPlansTable).values({ userId: STUDENT, name: "My plan", planType: "degree" } as any).returning();
  planId = plan!.id;
  await db.insert(planSharesTable).values({ studentUserId: STUDENT, advisorEmail: ADVISOR_EMAIL, scopes: ["degree_plan", "tentative_degree_plan"] });
});

afterAll(async () => {
  await db.delete(planSharesTable).where(eq(planSharesTable.studentUserId, STUDENT));
  await db.delete(academicPlansTable).where(eq(academicPlansTable.id, planId));
  await db.delete(progressReportsTable).where(inArray(progressReportsTable.userId, [STUDENT, OTHER, ADVISOR]));
  rmSync(dir, { recursive: true, force: true });
  process.env = savedEnv;
  resetPrivateObjectStorageForTests();
});

async function studentState() {
  const rows = await db.select().from(progressReportsTable).where(eq(progressReportsTable.userId, STUDENT));
  return rows.map((r) => ({ id: r.id, label: r.label, fileName: r.fileName, objectPath: r.objectPath, hash: r.fileHash, uploadedAt: r.uploadedAt.toISOString() }))
    .sort((a, b) => a.id - b.id);
}

describe("user B, knowing user A's document ids, gets nothing", () => {
  it("cannot LIST user A's documents", async () => {
    const res = await request(app).get("/api/progress-reports").set("x-test-user", OTHER);
    expect(res.status).toBe(200);
    expect(res.body.reports).toEqual([]);
    const side = await request(app).get("/api/progress-reports/sidebar").set("x-test-user", OTHER);
    expect(side.body.documents).toEqual([]);
    expect(JSON.stringify([res.body, side.body])).not.toMatch(SECRETS);
  });

  it("cannot read user A's metadata or workbook — indistinguishable from a missing document", async () => {
    for (const id of [docId, secondDocId]) {
      const meta = await request(app).get(`/api/progress-reports/${id}`).set("x-test-user", OTHER);
      const wb = await request(app).get(`/api/progress-reports/${id}/workbook`).set("x-test-user", OTHER);
      const missing = await request(app).get("/api/progress-reports/2147483000").set("x-test-user", OTHER);
      expect([meta.status, wb.status]).toEqual([404, 404]);
      expect(meta.body).toEqual(missing.body);
      expect(JSON.stringify([meta.body, wb.body])).not.toMatch(SECRETS);
    }
  });

  it("cannot get user A's original file, by id or by storage path", async () => {
    expect((await request(app).get(`/api/progress-reports/${docId}/file`).set("x-test-user", OTHER)).status).toBe(404);
    expect((await request(app).get(`/api/storage${studentObjectPath}`).set("x-test-user", OTHER)).status).toBe(403);
    // Control: the owner can.
    expect((await request(app).get(`/api/progress-reports/${docId}/file`).set("x-test-user", STUDENT)).status).toBe(200);
  });

  it("cannot rename, replace or delete user A's documents", async () => {
    const before = await studentState();
    const bytes = await buildAprFixture("computer-science-major");
    const ownUpload = await upload(OTHER, bytes, "mine.xlsx");

    const rename = await request(app).patch(`/api/progress-reports/${docId}`).set("x-test-user", OTHER).send({ label: "Hijacked" });
    const replace = await request(app)
      .put(`/api/progress-reports/${docId}/file`)
      .set("x-test-user", OTHER)
      .send({ objectPath: ownUpload, fileName: "mine.xlsx", fileSize: bytes.length, contentType: XLSX_TYPE });
    const del = await request(app).delete(`/api/progress-reports/${docId}`).set("x-test-user", OTHER);
    expect([rename.status, replace.status, del.status]).toEqual([404, 404, 404]);
    expect(await studentState()).toEqual(before);
  });

  it("cannot claim user A's uploaded object as a new document or as a replacement", async () => {
    const bytes = await buildAprFixture("finance-major");
    const create = await request(app)
      .post("/api/progress-reports")
      .set("x-test-user", OTHER)
      .send({ objectPath: studentObjectPath, fileName: "stolen.xlsx", fileSize: bytes.length, contentType: XLSX_TYPE, label: "Stolen" });
    expect(create.status).toBe(403);

    // OTHER has a document of their own, and tries to point it at A's file.
    const own = await buildAprFixture("computer-science-major");
    const mine = await request(app)
      .post("/api/progress-reports")
      .set("x-test-user", OTHER)
      .send({ objectPath: await upload(OTHER, own, "own.xlsx"), fileName: "own.xlsx", fileSize: own.length, contentType: XLSX_TYPE, label: "Mine" });
    expect(mine.status).toBe(201);
    const swap = await request(app)
      .put(`/api/progress-reports/${mine.body.id}/file`)
      .set("x-test-user", OTHER)
      .send({ objectPath: studentObjectPath, fileName: "stolen.xlsx", fileSize: bytes.length, contentType: XLSX_TYPE });
    expect(swap.status).toBe(403);
    // A's file is still there for A.
    expect((await request(app).get(`/api/progress-reports/${docId}/file`).set("x-test-user", STUDENT)).status).toBe(200);
  });

  it("no path, query or body trick can address another user's documents", async () => {
    const tricks = [
      `/api/progress-reports?userId=${STUDENT}`,
      `/api/progress-reports?user_id=${STUDENT}`,
      `/api/progress-reports/sidebar?userId=${STUDENT}`,
      `/api/progress-reports/${docId}?userId=${STUDENT}`,
      `/api/progress-reports/${docId}/workbook?owner=${STUDENT}`,
    ];
    for (const url of tricks) {
      const res = await request(app).get(url).set("x-test-user", OTHER);
      // OTHER has a document of their own by now, so look only for text unique to the student's.
      expect(JSON.stringify(res.body), url).not.toMatch(/Finance Major|FNCE 121|Core: LSB|secret-finance/);
    }
    for (const id of ["0", "-1", "1.5", "abc", `${docId} OR 1=1`, `${docId}%20`, "../sidebar"]) {
      const res = await request(app).get(`/api/progress-reports/${encodeURIComponent(id)}`).set("x-test-user", OTHER);
      expect(res.status, id).toBe(404);
    }
    const del = await request(app).delete(`/api/progress-reports/${docId}`).set("x-test-user", OTHER).send({ userId: STUDENT });
    expect(del.status).toBe(404);
  });
});

describe("an advisor with a VALID share still cannot reach the student's APR", () => {
  const asAdvisor = (r: request.Test) => r.set("x-test-user", ADVISOR).set("x-test-email", ADVISOR_EMAIL);

  it("the share itself works (control): the advisor can read the shared plan", async () => {
    const res = await asAdvisor(request(app).get(`/api/advisor/shared-students/${STUDENT}/plan`));
    expect(res.status).toBe(200);
    expect(res.body.readOnly).toBe(true);
  });

  it("…and that response contains no APR data of any kind", async () => {
    const res = await asAdvisor(request(app).get(`/api/advisor/shared-students/${STUDENT}/plan`));
    expect(JSON.stringify(res.body)).not.toMatch(SECRETS);
    expect(JSON.stringify(res.body)).not.toMatch(/workbook|progressReport|importStatus|"grade"/i);
  });

  it("the advisor's APR list and sidebar are THEIR OWN (empty), never the student's", async () => {
    const res = await asAdvisor(request(app).get("/api/progress-reports"));
    expect(res.body.reports).toEqual([]);
    const side = await asAdvisor(request(app).get("/api/progress-reports/sidebar"));
    expect(side.body.documents).toEqual([]);
    for (const path of ["", "/workbook", "/file"]) {
      expect((await asAdvisor(request(app).get(`/api/progress-reports/${docId}${path}`))).status).toBe(404);
    }
  });

  it("sharing cannot be widened to APR: 'apr' is dropped from the granted scopes", async () => {
    const res = await request(app)
      .post("/api/plan-shares")
      .set("x-test-user", STUDENT)
      .set("x-test-email", `student-${RUN}@scu.edu`)
      .send({ advisorEmail: `other-${RUN}@scu.edu`, scopes: ["degree_plan", "apr"] });
    expect(res.status).toBeLessThan(300);
    expect(res.body.scopes).not.toContain("apr");
  });
});

describe("storage stays private", () => {
  it("files live under an owner-bound path, outside anything the web server serves", async () => {
    const [row] = await db.select().from(progressReportsTable).where(eq(progressReportsTable.id, docId));
    expect(row!.objectPath).toMatch(/^\/objects\/uploads\/[0-9a-f]{16}\/[0-9a-f-]{36}$/);
    // Not reachable without the API's owner check.
    for (const url of [studentObjectPath, `/progress-reports${studentObjectPath}`, `/api${studentObjectPath}`]) {
      const res = await request(app).get(url);
      expect([401, 404]).toContain(res.status);
    }
  });

  it("an unauthenticated request for the object is refused", async () => {
    expect((await request(app).get(`/api/storage${studentObjectPath}`)).status).toBe(401);
  });
});
