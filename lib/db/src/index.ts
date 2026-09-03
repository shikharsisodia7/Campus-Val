import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

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
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
