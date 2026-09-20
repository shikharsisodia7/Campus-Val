/**
 * End-to-end APR flow against the REAL local-filesystem storage provider and
 * the REAL database (only Clerk auth is stubbed): request signed upload link
 * → PUT bytes → register/parse → read → file access → replace → delete.
 *
 * This is the authorization suite for the private-APR surface: every
 * cross-user attempt (read, download, register someone else's object,
 * fetch via the generic object route) must be refused, and the stored bytes
 * must never be served with a renderable/sniffable type.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { readFileSync, mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { vi } from "vitest";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.header("x-test-user");
    if (!userId) return res.status(401).json({ error: "Sign in required" });
    req.userId = userId;
    next();
  },
}));

import { db, progressReportsTable } from "@workspace/db";
import { resetPrivateObjectStorageForTests } from "../lib/storage";
import { logger } from "../lib/logger";
import storageRouter from "./storage";
import progressReportRouter from "./progress-report";

const PDF_TYPE = "application/pdf";
const FIXTURE = readFileSync(
  join(import.meta.dirname, "..", "__fixtures__", "progress-report", "workday-apr-hierarchical.pdf"),
);

const OWNER = `apr-local-owner-${Date.now()}`;
const OTHER = `apr-local-other-${Date.now()}`;

let dir: string;
let app: express.Express;
const saved = { ...process.env };

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "campusval-private-"));
  process.env["PRIVATE_STORAGE_PROVIDER"] = "local";
  process.env["PRIVATE_STORAGE_DIR"] = dir;
  process.env["STORAGE_SIGNING_SECRET"] = "t".repeat(48);
  resetPrivateObjectStorageForTests();

  app = express();
  app.use((req, _res, next) => {
    (req as any).log = logger;
    next();
  });
  app.use(express.json());
  app.use("/api", storageRouter);
  app.use("/api", progressReportRouter);
});

afterAll(async () => {
  await db.delete(progressReportsTable).where(inArray(progressReportsTable.userId, [OWNER, OTHER]));
  rmSync(dir, { recursive: true, force: true });
  process.env = saved;
  resetPrivateObjectStorageForTests();
});

/** The local provider returns a same-origin path; tolerate an absolute URL too. */
const pathOf = (u: string) => (u.startsWith("/") ? u : new URL(u).pathname);

async function uploadAs(user: string, bytes: Buffer, contentType = PDF_TYPE, fileName = "apr.pdf") {
  const target = await request(app)
    .post("/api/storage/uploads/request-url")
    .set("x-test-user", user)
    .send({ name: fileName, size: bytes.length, contentType });
  expect(target.status).toBe(200);
  const put = await request(app)
    .put(pathOf(target.body.uploadURL))
    .set("Content-Type", contentType)
    .send(bytes);
  return { target: target.body as { uploadURL: string; objectPath: string }, put };
}

function filesOnDisk(): string[] {
  const root = join(dir, "progress-reports");
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const owner of readdirSync(root)) {
    for (const f of readdirSync(join(root, owner))) if (!f.endsWith(".meta.json")) out.push(f);
  }
  return out;
}

describe("local-storage APR lifecycle", () => {
  let objectPath: string;

  it("refuses signed-link minting and every read for an unauthenticated caller", async () => {
    expect((await request(app).post("/api/storage/uploads/request-url").send({ name: "a.pdf", size: 3, contentType: PDF_TYPE })).status).toBe(401);
    expect((await request(app).get("/api/progress-report")).status).toBe(401);
    expect((await request(app).get("/api/progress-report/file")).status).toBe(401);
    expect((await request(app).put("/api/progress-report").send({})).status).toBe(401);
    expect((await request(app).delete("/api/progress-report")).status).toBe(401);
  });

  it("mints an owner-bound signed upload link and accepts the bytes", async () => {
    const { target, put } = await uploadAs(OWNER, FIXTURE);
    // Same-origin path, NOT made absolute from PUBLIC_APP_URL.
    expect(target.uploadURL).toMatch(/^\/api\/storage\/local-upload\//);
    expect(target.objectPath).toMatch(/^\/objects\/uploads\/[0-9a-f]{16}\//);
    expect(put.status).toBe(200);
    objectPath = target.objectPath;
    expect(filesOnDisk()).toHaveLength(1);
  });

  it("registers + parses the upload and returns the structured groups", async () => {
    const res = await request(app)
      .put("/api/progress-report")
      .set("x-test-user", OWNER)
      .send({ objectPath, fileName: "apr.pdf", fileSize: FIXTURE.length, contentType: PDF_TYPE });
    expect(res.status).toBe(200);
    expect(res.body.report.parseStatus).toBe("parsed");
    expect(res.body.report.parsed.groups.length).toBeGreaterThan(0);
  });

  it("lets the owner read the report and stream the original file with hardened headers", async () => {
    const meta = await request(app).get("/api/progress-report").set("x-test-user", OWNER);
    expect(meta.status).toBe(200);
    expect(meta.body.report.fileName).toBe("apr.pdf");

    const file = await request(app)
      .get("/api/progress-report/file")
      .set("x-test-user", OWNER)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toBe(PDF_TYPE);
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    expect(file.headers["cache-control"]).toBe("private, no-store");
    expect(file.headers["content-disposition"]).toMatch(/^inline; filename="academic-progress-report\.pdf"$/);
    expect(Buffer.compare(file.body as Buffer, FIXTURE)).toBe(0);
  });

  it("gives a different signed-in user NO access: no report, no file, no object", async () => {
    expect((await request(app).get("/api/progress-report").set("x-test-user", OTHER)).status).toBe(404);
    expect((await request(app).get("/api/progress-report/file").set("x-test-user", OTHER)).status).toBe(404);
    // Directly addressing the owner's object through the generic route is forbidden.
    const direct = await request(app)
      .get(`/api/storage${objectPath}`)
      .set("x-test-user", OTHER);
    expect(direct.status).toBe(403);
    // ...while the owner can.
    const own = await request(app).get(`/api/storage${objectPath}`).set("x-test-user", OWNER);
    expect(own.status).toBe(200);
  });

  it("refuses to register another user's uploaded object as your own report", async () => {
    const res = await request(app)
      .put("/api/progress-report")
      .set("x-test-user", OTHER)
      .send({ objectPath, fileName: "stolen.pdf", fileSize: FIXTURE.length, contentType: PDF_TYPE });
    expect(res.status).toBe(403);
    expect(await db.select().from(progressReportsTable).where(eq(progressReportsTable.userId, OTHER))).toHaveLength(0);
  });

  it("replaces the report: new object stored, previous object removed from disk", async () => {
    const before = filesOnDisk();
    expect(before).toHaveLength(1);
    const { target } = await uploadAs(OWNER, FIXTURE);
    const res = await request(app)
      .put("/api/progress-report")
      .set("x-test-user", OWNER)
      .send({ objectPath: target.objectPath, fileName: "apr-v2.pdf", fileSize: FIXTURE.length, contentType: PDF_TYPE });
    expect(res.status).toBe(200);
    expect(res.body.report.fileName).toBe("apr-v2.pdf");
    const after = filesOnDisk();
    expect(after).toHaveLength(1);
    expect(after[0]).not.toBe(before[0]);
    objectPath = target.objectPath;
  });

  it("deletes the report row and the stored bytes", async () => {
    const res = await request(app).delete("/api/progress-report").set("x-test-user", OWNER);
    expect(res.status).toBe(200);
    expect(filesOnDisk()).toHaveLength(0);
    expect((await request(app).get("/api/progress-report").set("x-test-user", OWNER)).status).toBe(404);
  });
});

describe("local upload link hardening", () => {
  it("rejects a tampered token", async () => {
    const target = await request(app)
      .post("/api/storage/uploads/request-url")
      .set("x-test-user", OWNER)
      .send({ name: "a.pdf", size: 10, contentType: PDF_TYPE });
    const forged = `${pathOf(target.body.uploadURL).slice(0, -3)}AAA`;
    const put = await request(app).put(forged).set("Content-Type", PDF_TYPE).send(Buffer.from("x"));
    expect(put.status).toBe(401);
  });

  it("rejects a body whose Content-Type differs from the one the link was minted for", async () => {
    const target = await request(app)
      .post("/api/storage/uploads/request-url")
      .set("x-test-user", OWNER)
      .send({ name: "a.pdf", size: 10, contentType: PDF_TYPE });
    const put = await request(app)
      .put(pathOf(target.body.uploadURL))
      .set("Content-Type", "text/html")
      .send(Buffer.from("<script>alert(1)</script>"));
    expect(put.status).toBe(415);
    expect(filesOnDisk()).toHaveLength(0);
  });

  it("enforces the size cap both from Content-Length and mid-stream, leaving nothing on disk", async () => {
    const { LocalFilesystemObjectStorageProvider } = await import("../lib/storage/localProvider");
    const { Readable } = await import("node:stream");
    const provider = new LocalFilesystemObjectStorageProvider({ dir, secret: "t".repeat(48) });
    const { uploadURL } = await provider.createUploadTarget(OWNER, { contentType: PDF_TYPE, maxSizeBytes: 100 });
    const token = uploadURL.split("/").pop()!;

    const fakeReq = (headers: Record<string, string>, chunks: Buffer[]) =>
      Object.assign(Readable.from(chunks), { headers }) as any;

    // Declared length over the cap is refused before a byte is written.
    const declared = await provider.receiveUpload(token, fakeReq({ "content-type": PDF_TYPE, "content-length": "5000" }, [Buffer.alloc(5000)]));
    expect(declared).toMatchObject({ ok: false, status: 413 });

    // No/lying Content-Length: the streaming limiter aborts the write.
    const streamed = await provider.receiveUpload(token, fakeReq({ "content-type": PDF_TYPE }, [Buffer.alloc(60), Buffer.alloc(60)]));
    expect(streamed).toMatchObject({ ok: false, status: 413 });

    // A body within the cap is accepted.
    const ok = await provider.receiveUpload(token, fakeReq({ "content-type": PDF_TYPE }, [Buffer.alloc(50)]));
    expect(ok).toMatchObject({ ok: true, size: 50 });
    await provider.deleteObject((await (async () => provider.verifyToken(token)!.p)()));
    expect(filesOnDisk()).toHaveLength(0);
  });

  it("is inert (404) when the local provider is not the one in use", async () => {
    const prev = process.env["PRIVATE_STORAGE_PROVIDER"];
    process.env["PRIVATE_STORAGE_PROVIDER"] = "replit";
    try {
      const res = await request(app).put("/api/storage/local-upload/whatever").set("Content-Type", PDF_TYPE).send(Buffer.from("x"));
      expect(res.status).toBe(404);
    } finally {
      process.env["PRIVATE_STORAGE_PROVIDER"] = prev;
    }
  });
});

describe("planning view, source-file check, and legacy-record reparse", () => {
  const USER = `apr-local-view-${Date.now()}`;
  let objectPath: string;

  it("uploads and registers a report for the view tests", async () => {
    const { target } = await uploadAs(USER, FIXTURE);
    objectPath = target.objectPath;
    const res = await request(app)
      .put("/api/progress-report")
      .set("x-test-user", USER)
      .send({ objectPath, fileName: "v.pdf", fileSize: FIXTURE.length, contentType: PDF_TYPE });
    expect(res.status).toBe(200);
    // The DTO never exposes the owner id or the internal storage path.
    expect(res.body.report).not.toHaveProperty("userId");
    expect(res.body.report).not.toHaveProperty("objectPath");
  });

  it("full view carries grades + source lines; planning view carries NEITHER", async () => {
    const full = await request(app).get("/api/progress-report").set("x-test-user", USER);
    const plan = await request(app).get("/api/progress-report?view=planning").set("x-test-user", USER);
    const courses = (r: any) => r.body.report.parsed.groups.flatMap((g: any) => g.requirements.flatMap((q: any) => q.courses));
    expect(courses(full).some((c: any) => c.grade)).toBe(true);
    expect(JSON.stringify(full.body)).toContain("sourceText");
    expect(courses(plan).length).toBeGreaterThan(0);
    expect(courses(plan).every((c: any) => c.grade === null)).toBe(true);
    expect(JSON.stringify(plan.body)).not.toContain("sourceText");
    // The structure the sidebar needs is intact.
    expect(plan.body.report.parsed.groups[0]).toMatchObject({ kind: expect.any(String), order: expect.any(Number) });
    expect(plan.body.report.parsed.summary?.totalUnits?.requiredUnits).toBe(180);
  });

  it("checkSource reports 'available' while the stored original is readable, 'missing' once it is gone", async () => {
    const ok = await request(app).get("/api/progress-report?checkSource=true").set("x-test-user", USER);
    expect(ok.body.report.sourceFile).toBe("available");
    // Without the flag the extra storage round trip is not made.
    const plain = await request(app).get("/api/progress-report").set("x-test-user", USER);
    expect(plain.body.report).not.toHaveProperty("sourceFile");

    const seg = objectPath.split("/");
    rmSync(join(dir, "progress-reports", seg[3]!, seg[4]!), { force: true });
    const gone = await request(app).get("/api/progress-report?checkSource=true").set("x-test-user", USER);
    expect(gone.status).toBe(200);
    expect(gone.body.report.sourceFile).toBe("missing");
    // The parsed structure is still served; only the original is gone.
    expect(gone.body.report.parsed.groups.length).toBeGreaterThan(0);
    // And the file endpoint says so honestly rather than crashing.
    expect((await request(app).get("/api/progress-report/file").set("x-test-user", USER)).status).toBe(404);
  });

  it("transparently upgrades a record stored by an older parser version on the next read", async () => {
    // Re-upload so the original exists again.
    const { target } = await uploadAs(USER, FIXTURE);
    await request(app)
      .put("/api/progress-report")
      .set("x-test-user", USER)
      .send({ objectPath: target.objectPath, fileName: "v2.pdf", fileSize: FIXTURE.length, contentType: PDF_TYPE });

    // Simulate a report parsed before the v3 fields existed.
    const [row] = await db.select().from(progressReportsTable).where(eq(progressReportsTable.userId, USER));
    const legacy: any = JSON.parse(JSON.stringify(row!.parsed));
    legacy.parserVersion = "hierarchical-v2";
    delete legacy.summary;
    for (const g of legacy.groups) {
      delete g.kind;
      delete g.order;
    }
    await db.update(progressReportsTable).set({ parsed: legacy }).where(eq(progressReportsTable.userId, USER));

    const res = await request(app).get("/api/progress-report").set("x-test-user", USER);
    expect(res.body.report.parsed.parserVersion).not.toBe("hierarchical-v2");
    expect(res.body.report.parsed.summary?.totalUnits?.requiredUnits).toBe(180);
    expect(res.body.report.parsed.groups[0].kind).toBe("major");
  });

  it("a legacy record whose original is gone is still served (as-is), never a 500", async () => {
    const [row] = await db.select().from(progressReportsTable).where(eq(progressReportsTable.userId, USER));
    const legacy: any = JSON.parse(JSON.stringify(row!.parsed));
    legacy.parserVersion = "hierarchical-v2";
    await db.update(progressReportsTable).set({ parsed: legacy }).where(eq(progressReportsTable.userId, USER));
    const seg = row!.objectPath.split("/");
    rmSync(join(dir, "progress-reports", seg[3]!, seg[4]!), { force: true });

    const res = await request(app).get("/api/progress-report").set("x-test-user", USER);
    expect(res.status).toBe(200);
    expect(res.body.report.parsed.parserVersion).toBe("hierarchical-v2");
  });

  it("cleans up", async () => {
    await db.delete(progressReportsTable).where(eq(progressReportsTable.userId, USER));
  });
});
