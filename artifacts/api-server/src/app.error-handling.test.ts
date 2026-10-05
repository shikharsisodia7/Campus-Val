/**
 * The real app.ts error handling: unexpected errors become a generic JSON 500
 * with no SQL, stack trace or file path; malformed bodies stay 4xx.
 */
import { describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
  clerkClient: { users: { getUser: async () => ({}) } },
}));

vi.mock("./routes", async () => {
  const { Router } = await import("express");
  const r = Router();
  r.get("/boom", () => {
    throw new Error('relation "student_profiles" does not exist: SELECT gpa FROM x at C:\\srv\\app\\db.ts:12');
  });
  r.post("/echo", (req, res) => {
    res.json({ ok: true, body: req.body });
  });
  return { default: r };
});

const { default: app } = await import("./app");

describe("app error handling", () => {
  it("returns a generic 500 without internals", async () => {
    const res = await request(app).get("/api/boom").expect(500);
    expect(res.body).toEqual({ error: "Something went wrong. Please try again." });
    expect(res.text).not.toMatch(/SELECT|student_profiles|db\.ts|C:\\|at /);
  });

  it("keeps a malformed JSON body a 400, with a generic message", async () => {
    const res = await request(app).post("/api/echo").set("Content-Type", "application/json").send("{not json").expect(400);
    expect(res.body).toEqual({ error: "The request could not be processed." });
  });

  it("sets baseline security headers", async () => {
    const res = await request(app).get("/api/boom");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
