/**
 * Hosting behaviour of the real Express app: baseline security headers, a
 * credentialed-CORS allowlist (not an Origin reflector), the public origin used
 * for canonical URLs, SPA route status codes, and that an unauthenticated
 * caller cannot reach protected APIs.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const saved = { ...process.env };
let app: import("express").Express;
let cwdDir: string;

beforeAll(async () => {
  // A minimal built web app so the static/SPA branch of app.ts is active.
  cwdDir = mkdtempSync(join(tmpdir(), "campusval-web-"));
  const pub = join(cwdDir, "artifacts", "scu-advising", "dist", "public");
  mkdirSync(pub, { recursive: true });
  writeFileSync(
    join(pub, "index.html"),
    '<html><head><!-- canonical injected server-side for the root route --></head><body><div id="root"><!--CAMPUSVAL_PRERENDER--></div><meta property="og:image" content="https://campus-val.vercel.app/og.png"></body></html>',
  );
  process.chdir(cwdDir);
  // This test's own page, whatever build happens to be on the machine.
  process.env["WEB_APP_DIR"] = pub;

  process.env["CLERK_SECRET_KEY"] = "sk_test_dummydummydummydummydummydummy";
  process.env["CLERK_PUBLISHABLE_KEY"] = "pk_test_ZHVtbXkuY2xlcmsuYWNjb3VudHMuZGV2JA";
  process.env["PUBLIC_APP_URL"] = "https://campusval.scu.edu";
  process.env["CORS_ALLOWED_ORIGINS"] = "https://portal.scu.edu";
  process.env["NODE_ENV"] = "production";
  app = (await import("./app")).default;
});

afterAll(() => {
  process.chdir(join(import.meta.dirname, ".."));
  rmSync(cwdDir, { recursive: true, force: true });
  process.env = saved;
});

describe("security headers", () => {
  it("are present on API and page responses; x-powered-by is gone", async () => {
    for (const path of ["/api/healthz", "/"]) {
      const res = await request(app).get(path);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
      expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(res.headers["permissions-policy"]).toMatch(/camera=\(\)/);
      expect(res.headers["x-powered-by"]).toBeUndefined();
    }
  });

  it("sends HSTS only when the request is secure (trusted proxy / TLS), never over plain http", async () => {
    const plain = await request(app).get("/api/healthz");
    expect(plain.headers["strict-transport-security"]).toBeUndefined();
  });
});

describe("CORS is an allowlist, not a reflection", () => {
  const acao = async (origin: string) => (await request(app).get("/api/healthz").set("Origin", origin)).headers["access-control-allow-origin"];

  it("allows PUBLIC_APP_URL and CORS_ALLOWED_ORIGINS with credentials", async () => {
    expect(await acao("https://campusval.scu.edu")).toBe("https://campusval.scu.edu");
    expect(await acao("https://portal.scu.edu")).toBe("https://portal.scu.edu");
    const res = await request(app).get("/api/healthz").set("Origin", "https://campusval.scu.edu");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("gives every other origin — including localhost in production — no CORS headers", async () => {
    expect(await acao("https://evil.example")).toBeUndefined();
    expect(await acao("http://localhost:5173")).toBeUndefined();
    expect(await acao("null")).toBeUndefined();
  });
});

describe("public origin and SPA routes", () => {
  it("canonical URL comes from PUBLIC_APP_URL, not the (possibly internal) Host header", async () => {
    const res = await request(app).get("/").set("Host", "internal-node-7:8080");
    expect(res.text).toContain('<link rel="canonical" href="https://campusval.scu.edu/" />');
    expect(res.text).not.toContain("internal-node-7");
    expect(res.text).not.toContain("campus-val.vercel.app");
  });

  it("known client routes answer 200 (including ones that were 404s before), unknown paths 404", async () => {
    for (const p of ["/degree-plan", "/planner", "/progress-report", "/degree-checksheets", "/shared-with-me", "/admin/feedback", "/admin/usage"]) {
      expect((await request(app).get(p)).status, p).toBe(200);
    }
    expect((await request(app).get("/definitely-not-a-page")).status).toBe(404);
  });

  it("unknown /api paths are JSON 404s, never the SPA shell", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/json/);
  });
});

describe("protected APIs need a session", () => {
  it.each(["/api/degree-checksheets", "/api/degree-checksheets/1/render", "/api/degree-checksheets/1/file", "/api/degree-checksheets/1/annotations", "/api/progress-reports", "/api/progress-reports/sidebar", "/api/progress-reports/1/workbook", "/api/progress-reports/1/file", "/api/plans", "/api/profile"])("%s → 401 signed out", async (p) => {
    expect((await request(app).get(p)).status).toBe(401);
  });
});
