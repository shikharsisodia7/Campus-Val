/**
 * API tests for GET /api/me/role — the one signal the frontend uses to
 * decide between the reduced core-nav tester experience and the full nav
 * (Part 15/16 of the controlled-rollout spec).
 */
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../middlewares/requireAuth", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    requireAuth: (req: any, res: any, next: any) => {
      const email = req.header("x-test-email");
      if (!email) return res.status(401).json({ error: "Sign in required" });
      req.userId = "test-uid";
      req.userEmail = email;
      next();
    },
  };
});

vi.mock("../lib/admin", () => ({
  isAdminUser: (email: string) => email === "admin@scu.edu",
}));

const roleRouter = (await import("./role")).default;
const app = express();
app.use("/api", roleRouter);

describe("GET /api/me/role", () => {
  it("401s when signed out", async () => {
    await request(app).get("/api/me/role").expect(401);
  });

  it("false for a normal signed-in user", async () => {
    const res = await request(app)
      .get("/api/me/role")
      .set("x-test-email", "student@scu.edu")
      .expect(200);
    expect(res.body).toEqual({ isAdmin: false });
  });

  it("true for an allowlisted admin", async () => {
    const res = await request(app)
      .get("/api/me/role")
      .set("x-test-email", "admin@scu.edu")
      .expect(200);
    expect(res.body).toEqual({ isAdmin: true });
  });
});
