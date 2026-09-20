import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { isPrivateStorageConfigured } from "../lib/storage";

const router: IRouter = Router();

/**
 * GET /api/healthz — LIVENESS. "Is the process up and serving HTTP?" Never
 * touches the database or any third party, so a database outage cannot make
 * an orchestrator restart-loop a perfectly healthy web process.
 */
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

const READINESS_DB_TIMEOUT_MS = 3_000;

/** The slice of a pooled connection the probe uses (`release(true)` destroys it rather than recycling it). */
interface ProbeClient {
  on(event: "error", listener: (err: Error) => void): unknown;
  off(event: "error", listener: (err: Error) => void): unknown;
  query(text: string): Promise<unknown>;
  release(destroy?: boolean): void;
}

/**
 * Swallows an `error` event on the probe's connection while it is checked out
 * (a checked-out pg client has no pool listener, and an unhandled `error` event
 * would crash the process). ONE shared function, so it can be removed again: a
 * healthy client goes back into the pool and is reused by the next probe, and a
 * listener left behind would stack up on it until Node warns about a leak.
 */
const swallowClientError = (): void => undefined;

/**
 * One bounded `select 1` on a dedicated pool client.
 *
 * Racing a query against a timer does NOT cancel it: the hung round trip keeps
 * its pool client checked out after the handler has already answered 503, and a
 * load balancer polling every few seconds would slowly drain the pool until
 * real requests block too. So the client is released WITH an error on failure or
 * timeout, which makes the pool destroy that connection instead of recycling
 * it, and a late-arriving connection or result is discarded the same way.
 */
function probeDatabase(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    // A holder object (not a bare `let`) because it is assigned inside a callback.
    const held: { client?: ProbeClient } = {};
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // A healthy connection is recycled, so it must not keep our listener. A failed
      // one is destroyed — its listener stays to absorb the error from closing it.
      if (ok) held.client?.off("error", swallowClientError);
      held.client?.release(!ok);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), READINESS_DB_TIMEOUT_MS);
    pool
      .connect()
      .then((c) => {
        // A late connection (after the timeout already answered) must not linger in the pool.
        c.on("error", swallowClientError);
        if (settled) {
          c.release(true);
          return undefined;
        }
        held.client = c;
        return c.query("select 1").then(() => finish(true));
      })
      .catch(() => finish(false));
  });
}

/**
 * Concurrent readiness polls share ONE in-flight probe, so readiness can never
 * hold more than a single pool client no matter how often it is polled.
 */
let probeInFlight: Promise<boolean> | null = null;
function isDatabaseReady(): Promise<boolean> {
  probeInFlight ??= probeDatabase().finally(() => {
    probeInFlight = null;
  });
  return probeInFlight;
}

/**
 * GET /api/readyz — READINESS. "Can this instance do useful work right now?"
 * Verifies the one critical dependency (Postgres) with a bounded round trip.
 * Returns 503 while the database is unreachable so a load balancer can hold
 * traffic. The body reports only coarse pass/fail per check — no hostnames,
 * versions, connection strings, error text or other internals.
 *
 * `privateStorage` is informational and NEVER fails readiness: a deployment
 * without APR storage still plans courses correctly.
 */
router.get("/readyz", async (_req, res) => {
  const database: "ok" | "error" = (await isDatabaseReady()) ? "ok" : "error";
  const ready = database === "ok";
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "unavailable",
    checks: {
      database,
      privateStorage: isPrivateStorageConfigured() ? "configured" : "not_configured",
    },
  });
});

export default router;
