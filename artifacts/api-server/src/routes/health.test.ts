/**
 * Liveness vs readiness for SCU monitoring: /healthz never touches a
 * dependency; /readyz reports the database and returns 503 when it is down;
 * neither leaks internals; and a hung database can never drain the connection
 * pool through repeated readiness polls.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import request from "supertest";

import { db, pool } from "@workspace/db";
import healthRouter from "./health";

const app = express();
app.use("/api", healthRouter);

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A pool client double: records how it was released ("destroy" = released WITH an error). */
function fakeClient(query: () => Promise<unknown>) {
  return {
    on: vi.fn(),
    off: vi.fn(),
    query: vi.fn(query),
    release: vi.fn(),
  };
}

describe("GET /api/healthz (liveness)", () => {
  it("is 200 and never touches the database", async () => {
    const exec = vi.spyOn(db, "execute");
    const connect = vi.spyOn(pool, "connect");
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(exec).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("stays 200 even while the database is down (a DB outage must not restart-loop a healthy web process)", async () => {
    vi.spyOn(pool, "connect").mockRejectedValue(new Error("ECONNREFUSED") as never);
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

  it("returns a healthy connection to the pool (not destroyed) after a successful probe", async () => {
    const client = fakeClient(() => Promise.resolve({ rows: [{ "?column?": 1 }] }));
    vi.spyOn(pool, "connect").mockResolvedValue(client as never);
    const res = await request(app).get("/api/readyz");
    expect(res.status).toBe(200);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it("does not leave its error listener on a healthy connection that goes back into the pool", async () => {
    const client = fakeClient(() => Promise.resolve({}));
    vi.spyOn(pool, "connect").mockResolvedValue(client as never);
    expect((await request(app).get("/api/readyz")).status).toBe(200);
    expect(client.on).toHaveBeenCalledTimes(1);
    expect(client.off).toHaveBeenCalledTimes(1);
    // The very function that was added is the one removed.
    expect(client.off.mock.calls[0]![1]).toBe(client.on.mock.calls[0]![1]);
  });

  it("keeps the listener on a connection it destroys (it must absorb the error from closing it)", async () => {
    const client = fakeClient(() => Promise.reject(new Error("boom")));
    vi.spyOn(pool, "connect").mockResolvedValue(client as never);
    expect((await request(app).get("/api/readyz")).status).toBe(503);
    expect(client.off).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledWith(true);
  });

  it("repeated polls against the REAL pool leave no stray listeners on the recycled connection", async () => {
    const before = await pool.connect();
    const baseline = before.listenerCount("error");
    before.release();
    for (let i = 0; i < 25; i++) {
      expect((await request(app).get("/api/readyz")).status).toBe(200);
    }
    const after = await pool.connect();
    try {
      // Without cleanup this would be 25 and Node would have warned about a listener leak.
      expect(after.listenerCount("error")).toBe(baseline);
    } finally {
      after.release();
    }
  });

  it("is 503 when the database is unreachable, and leaks no error text, host or connection detail", async () => {
    vi.spyOn(pool, "connect").mockRejectedValue(
      new Error("connect ECONNREFUSED 10.1.2.3:5432 password authentication failed for user campusval") as never,
    );
    const res = await request(app).get("/api/readyz");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "unavailable", checks: { database: "error" } });
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/ECONNREFUSED|10\.1\.2\.3|password|campusval|stack/i);
  });

  it("destroys the connection when the probe query fails", async () => {
    const client = fakeClient(() => Promise.reject(new Error("boom")));
    vi.spyOn(pool, "connect").mockResolvedValue(client as never);
    const res = await request(app).get("/api/readyz");
    expect(res.status).toBe(503);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledWith(true);
  });

  it("is 503 (not a hung request) when the database hangs, and DESTROYS the hung connection instead of leaving it checked out", async () => {
    const client = fakeClient(() => new Promise(() => undefined));
    vi.spyOn(pool, "connect").mockResolvedValue(client as never);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = request(app).get("/api/readyz").then((r) => r);
    // supertest needs real I/O; advance the readiness timer once the request is in flight.
    await vi.advanceTimersByTimeAsync(3_500);
    vi.useRealTimers();
    const res = await pending;
    expect(res.status).toBe(503);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledWith(true);
  });

  it("destroys a connection that only arrives AFTER the probe already timed out", async () => {
    const late = fakeClient(() => Promise.resolve({}));
    let deliver!: (c: unknown) => void;
    vi.spyOn(pool, "connect").mockImplementation(
      () => new Promise((resolve) => (deliver = resolve as (c: unknown) => void)) as never,
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = request(app).get("/api/readyz").then((r) => r);
    await vi.advanceTimersByTimeAsync(3_500);
    vi.useRealTimers();
    expect((await pending).status).toBe(503);
    deliver(late);
    await new Promise((r) => setImmediate(r));
    expect(late.query).not.toHaveBeenCalled(); // never used for a probe that is already over
    expect(late.release).toHaveBeenCalledWith(true);
  });

  it("coalesces concurrent polls into one probe, so readiness can never hold more than one pool client", async () => {
    let finishQuery!: () => void;
    const client = fakeClient(() => new Promise<void>((resolve) => (finishQuery = resolve)));
    const connect = vi.spyOn(pool, "connect").mockResolvedValue(client as never);
    const polls = Array.from({ length: 8 }, () => request(app).get("/api/readyz").then((r) => r));
    // Let every request reach the handler before the single probe completes.
    await new Promise((r) => setTimeout(r, 100));
    finishQuery();
    const results = await Promise.all(polls);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(connect).toHaveBeenCalledTimes(1);
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
