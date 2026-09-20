import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
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
  let database: "ok" | "error" = "error";
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), READINESS_DB_TIMEOUT_MS);
      }),
    ]);
    database = "ok";
  } catch {
    database = "error";
  } finally {
    clearTimeout(timer);
  }

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
