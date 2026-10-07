import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { withExplicitSslMode } from "./ssl-mode";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

/**
 * Connection/statement timeouts matter here specifically because this pool
 * runs inside Vercel serverless functions: node-postgres's default is to
 * wait forever for a connection, so if the pool is briefly exhausted (a
 * burst of concurrent requests — a page routinely fires ~5 API calls in
 * parallel) or Neon's endpoint is slow to respond, a request hangs
 * indefinitely instead of failing fast. `max` is kept modest since each
 * function instance holds its own pool and Neon's pooled endpoint already
 * multiplexes connections upstream.
 */
// DATABASE_POOL_MAX lets a long-running server (VM/container) use a larger
// pool than the deliberately small serverless default.
const poolMax = Number(process.env.DATABASE_POOL_MAX);

export const pool = new Pool({
  // sslmode=require (Neon's default) stays verify-full, as pg 8 already treats it; see ssl-mode.ts.
  connectionString: withExplicitSslMode(process.env.DATABASE_URL),
  max: Number.isInteger(poolMax) && poolMax > 0 ? poolMax : 5,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
