/**
 * Liveness vs readiness for SCU monitoring: /healthz never touches a
 * dependency; /readyz reports the database and returns 503 when it is down;
 * neither leaks internals.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import request from "supertest";

import { db } from "@workspace/db";
import healthRouter from "./health";

const app = express();
app.use("/api", healthRouter);

afterEach(() => vi.restoreAllMocks());

describe("GET /api/healthz (liveness)", () => {
  it("is 200 and never calls the database", async () => {
    const exec = vi.spyOn(db, "execute");
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(exec).not.toHaveBeenCalled();
  });

  it("stays 200 even while the database is down (a DB outage must not restart-loop a healthy web process)", async () => {
    vi.spyOn(db, "execute").mockRejectedValue(new Error("ECONNREFUSED"));
    expect((await request(app).get("/api/healthz")).status).toBe(200);
  });
});

describe("GET /api/readyz (readiness)", () => {
  it("is 200 with a coarse per-check report when the database answers", async () => {
    const res = await request(app).get("/api/readyz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ready", checks: { database: "ok" } });
    expect(["configured", "not_configured"]).toContain(res.body.checks.privateStorage);
  });

  it("is 503 when the database is unreachable, and leaks no error text, host or connection detail", async () => {
    vi.spyOn(db, "execute").mockRejectedValue(
      new Error("connect ECONNREFUSED 10.1.2.3:5432 password authentication failed for user campusval"),
    );
    const res = await request(app).get("/api/readyz");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "unavailable", checks: { database: "error" } });
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/ECONNREFUSED|10\.1\.2\.3|password|campusval|stack/i);
  });

  it("is 503 (not a hung request) when the database hangs", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(db, "execute").mockImplementation(() => new Promise(() => undefined) as never);
      const pending = request(app).get("/api/readyz").then((r) => r);
      // supertest needs real I/O; advance the readiness timer after the request is in flight.
      await vi.advanceTimersByTimeAsync(3_500);
      vi.useRealTimers();
      const res = await pending;
      expect(res.status).toBe(503);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fail readiness merely because APR storage is not configured", async () => {
    const saved = { ...process.env };
    delete process.env["PRIVATE_STORAGE_PROVIDER"];
    delete process.env["PRIVATE_STORAGE_DIR"];
    delete process.env["PRIVATE_OBJECT_DIR"];
    delete process.env["VERCEL"];
    try {
      const res = await request(app).get("/api/readyz");
      expect(res.status).toBe(200);
      expect(res.body.checks.privateStorage).toBe("not_configured");
    } finally {
      process.env = saved;
    }
  });
});
