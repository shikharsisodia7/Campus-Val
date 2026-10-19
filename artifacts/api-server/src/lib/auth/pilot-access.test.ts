/**
 * Pilot access policy (lib/auth/policy.ts + requireUser): during the pilot an
 * @scu.edu address alone is not enough. Only ADMIN_EMAILS, PILOT_TESTER_EMAILS,
 * GUEST_REVIEWER_EMAILS and department administrators with a program scope get
 * in, and the decision is made on the server from the verified session email —
 * nothing the browser sends can change it.
 *
 * Clerk is mocked (session -> email); the program-scope lookup is mocked so the
 * department-administrator path is exercised without database rows. The second
 * half mounts the REAL /api router to prove private routes refuse a non-pilot
 * account before any handler runs.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";

let mockAuth: { userId: string | null; sessionClaims?: Record<string, unknown> } = { userId: null };

vi.mock("@clerk/express", () => ({
  getAuth: () => mockAuth,
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddressId: null, emailAddresses: [] }) } },
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const scopedEmails = new Set<string>();
vi.mock("../department/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../department/authz")>();
  return {
    ...actual,
    loadAdminScopes: async (email: string) => ({
      email: email.toLowerCase(),
      superAdmin: false,
      programKeys: new Set(scopedEmails.has(email.toLowerCase()) ? ["major:biology"] : []),
    }),
  };
});

const { requireUser, requireRole } = await import("./index");
const policy = await import("./policy");
const { collectConfigProblems } = await import("../config");

const ENV_KEYS = ["CAMPUSVAL_ACCESS_MODE", "PILOT_TESTER_EMAILS", "GUEST_REVIEWER_EMAILS", "ADMIN_EMAILS", "NODE_ENV"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.CAMPUSVAL_ACCESS_MODE = "pilot";
  process.env.PILOT_TESTER_EMAILS = "pilot-student@scu.edu, Second.Tester@SCU.edu";
  process.env.GUEST_REVIEWER_EMAILS = "reviewer@pdx.edu";
  process.env.ADMIN_EMAILS = "admin@scu.edu";
  process.env.NODE_ENV = "test";
  scopedEmails.clear();
  mockAuth = { userId: null };
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function signIn(email: string, extraClaims: Record<string, unknown> = {}) {
  mockAuth = { userId: `user_${email.replace(/\W/g, "_")}`, sessionClaims: { email, ...extraClaims } };
}

function gateApp() {
  const app = express();
  app.use(express.json());
  app.all("/protected", requireUser, (req, res) => {
    res.json({ userEmail: req.userEmail, basis: req.accessBasis });
  });
  app.get("/admin-only", requireUser, requireRole("admin"), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("pilot mode — who gets in", () => {
  it("signed-out request: 401", async () => {
    const res = await request(gateApp()).get("/protected");
    expect(res.status).toBe(401);
  });

  it("random external account: 403 with the pilot message", async () => {
    signIn("random@gmail.com");
    const res = await request(gateApp()).get("/protected");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("pilot_access_required");
    expect(res.body.error).toBe(policy.PILOT_ACCESS_DENIED_MESSAGE);
  });

  it("an @scu.edu account that is not invited: 403 (SCU membership alone is not enough)", async () => {
    signIn("not-invited@scu.edu");
    const res = await request(gateApp()).get("/protected");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("pilot_access_required");
    expect(res.body.error).toContain("invited pilot participants");
  });

  it("an allowlisted @scu.edu pilot tester gets in (case-insensitive list)", async () => {
    signIn("pilot-student@scu.edu");
    let res = await request(gateApp()).get("/protected");
    expect(res.status).toBe(200);
    expect(res.body.basis).toBe("pilot_tester");

    signIn("second.tester@scu.edu");
    res = await request(gateApp()).get("/protected");
    expect(res.status).toBe(200);
  });

  it("an invited external reviewer gets in as an ordinary user, not an admin", async () => {
    signIn("reviewer@pdx.edu");
    const ok = await request(gateApp()).get("/protected");
    expect(ok.status).toBe(200);
    expect(ok.body.basis).toBe("external_reviewer");
    const admin = await request(gateApp()).get("/admin-only");
    expect(admin.status).toBe(403);
  });

  it("an admin gets in and passes the admin role gate", async () => {
    signIn("admin@scu.edu");
    const res = await request(gateApp()).get("/protected");
    expect(res.status).toBe(200);
    expect(res.body.basis).toBe("admin");
    expect((await request(gateApp()).get("/admin-only")).status).toBe(200);
  });

  it("a department administrator with a program scope gets in, without becoming an app admin", async () => {
    scopedEmails.add("chair@scu.edu");
    signIn("chair@scu.edu");
    const res = await request(gateApp()).get("/protected");
    expect(res.status).toBe(200);
    expect(res.body.basis).toBe("department_admin");
    expect((await request(gateApp()).get("/admin-only")).status).toBe(403);
  });

  it("a pilot tester is not an admin", async () => {
    signIn("pilot-student@scu.edu");
    expect((await request(gateApp()).get("/admin-only")).status).toBe(403);
  });
});

describe("pilot mode — the client cannot claim pilot status", () => {
  it("ignores headers, query strings, bodies and cookies that claim pilot or admin status", async () => {
    signIn("not-invited@scu.edu");
    const res = await request(gateApp())
      .post("/protected?pilot=true&role=admin&accessMode=institution")
      .set("x-pilot-tester", "true")
      .set("x-campusval-access-mode", "institution")
      .set("x-test-email", "pilot-student@scu.edu")
      .set("Cookie", "campusval_pilot=1; role=admin")
      .send({ pilot: true, isAdmin: true, email: "pilot-student@scu.edu", accessMode: "institution" });
    expect(res.status).toBe(403);
  });

  it("ignores extra session claims (only the verified email decides)", async () => {
    signIn("not-invited@scu.edu", { pilot: true, role: "admin", metadata: { pilotTester: true } });
    const res = await request(gateApp()).get("/protected");
    expect(res.status).toBe(403);
  });

  it("a look-alike address does not match an allowlisted one", async () => {
    for (const email of ["pilot-student@scu.edu.evil.com", "xpilot-student@scu.edu", "pilot-student@scu.edux"]) {
      signIn(email);
      expect((await request(gateApp()).get("/protected")).status).toBe(403);
    }
  });
});

describe("access mode resolution", () => {
  it("unset means pilot", () => {
    expect(policy.resolveAccessMode({})).toBe("pilot");
    expect(policy.effectiveAccessMode({})).toBe("pilot");
  });

  it("an unrecognised value fails closed to pilot and is a startup error", async () => {
    expect(policy.resolveAccessMode({ CAMPUSVAL_ACCESS_MODE: "open" })).toBeNull();
    expect(policy.effectiveAccessMode({ CAMPUSVAL_ACCESS_MODE: "open" })).toBe("pilot");
    process.env.CAMPUSVAL_ACCESS_MODE = "everyone";
    signIn("not-invited@scu.edu");
    expect((await request(gateApp()).get("/protected")).status).toBe(403);
    const problems = collectConfigProblems({ CAMPUSVAL_ACCESS_MODE: "everyone" });
    expect(problems.find((p) => p.variable === "CAMPUSVAL_ACCESS_MODE")?.severity).toBe("error");
  });

  it("institution mode is a startup warning, and an empty pilot list is a warning", () => {
    const inst = collectConfigProblems({ CAMPUSVAL_ACCESS_MODE: "institution" });
    expect(inst.find((p) => p.variable === "CAMPUSVAL_ACCESS_MODE")?.severity).toBe("warning");
    const empty = collectConfigProblems({ CAMPUSVAL_ACCESS_MODE: "pilot" });
    expect(empty.find((p) => p.variable === "PILOT_TESTER_EMAILS")?.severity).toBe("warning");
  });
});

describe("institution mode (future, after SCU approval)", () => {
  it("admits any @scu.edu account", async () => {
    process.env.CAMPUSVAL_ACCESS_MODE = "institution";
    signIn("anyone@scu.edu");
    const res = await request(gateApp()).get("/protected");
    expect(res.status).toBe(200);
    expect(res.body.basis).toBe("scu_institution");
  });

  it("still refuses a non-SCU account that is not invited, with the institution message", async () => {
    process.env.CAMPUSVAL_ACCESS_MODE = "institution";
    signIn("random@gmail.com");
    const res = await request(gateApp()).get("/protected");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("access_not_approved");
  });

  it("in production, an unverifiable Clerk test address does not qualify by domain alone", async () => {
    process.env.CAMPUSVAL_ACCESS_MODE = "institution";
    process.env.NODE_ENV = "production";
    signIn("someone+clerk_test@scu.edu");
    expect((await request(gateApp()).get("/protected")).status).toBe(403);
    process.env.PILOT_TESTER_EMAILS = "someone+clerk_test@scu.edu";
    expect((await request(gateApp()).get("/protected")).status).toBe(200);
  });
});

describe("the real /api router refuses a non-pilot account before any handler", () => {
  async function realApp() {
    const router = (await import("../../routes")).default;
    const app = express();
    app.use(express.json());
    app.use("/api", router);
    return app;
  }

  const PRIVATE_ROUTES: Array<["get" | "post", string]> = [
    ["get", "/api/profile"],
    ["get", "/api/plans"],
    ["get", "/api/dashboard/summary"],
    ["get", "/api/progress-reports"],
    ["get", "/api/degree-checksheets"],
    ["get", "/api/me/role"],
    ["get", "/api/sample-plans"],
    ["get", "/api/admin/department/programs"],
    ["get", "/api/admin/usage/summary"],
    ["get", "/api/plan-shares"],
    ["post", "/api/storage/uploads/request-url"],
  ];

  it("returns 403 pilot_access_required on every private route for an uninvited @scu.edu account", async () => {
    const app = await realApp();
    signIn("not-invited@scu.edu");
    for (const [method, path] of PRIVATE_ROUTES) {
      const res = await request(app)[method](path).send({});
      expect(res.status, `${method.toUpperCase()} ${path}`).toBe(403);
      expect(res.body.code, `${method.toUpperCase()} ${path}`).toBe("pilot_access_required");
    }
  });

  it("/api/me/access tells a signed-in account its own decision and nothing else", async () => {
    const app = await realApp();
    expect((await request(app).get("/api/me/access")).status).toBe(401);

    signIn("not-invited@scu.edu");
    const denied = await request(app).get("/api/me/access");
    expect(denied.status).toBe(200);
    expect(denied.body).toEqual({
      allowed: false,
      accessMode: "pilot",
      message: policy.PILOT_ACCESS_DENIED_MESSAGE,
    });
    expect(JSON.stringify(denied.body)).not.toContain("pilot-student@scu.edu");
    expect(denied.headers["cache-control"]).toBe("no-store");

    signIn("pilot-student@scu.edu");
    const allowed = await request(app).get("/api/me/access");
    expect(allowed.body).toEqual({ allowed: true, accessMode: "pilot", message: null });
  });
});
