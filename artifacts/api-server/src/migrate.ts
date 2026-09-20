/**
 * Database migration runner — bundled to dist/migrate.mjs so a production host
 * can apply schema changes with nothing but Node and DATABASE_URL (no pnpm, no
 * drizzle-kit, no source tree):
 *
 *   node dist/migrate.mjs            apply every pending migration (idempotent)
 *   node dist/migrate.mjs --status   print applied / pending, change nothing
 *   node dist/migrate.mjs --baseline mark ONLY THE FIRST (baseline) migration as
 *                                    applied WITHOUT running it — for a database
 *                                    created by `drizzle-kit push` before
 *                                    migrations existed. Later migrations stay
 *                                    pending, so the next plain run applies them.
 *   node dist/migrate.mjs --baseline-all
 *                                    mark EVERY current migration as applied
 *                                    without running any — ONLY for a database that
 *                                    was pushed from the CURRENT schema (rare).
 *                                    Use it on an older database and the newer
 *                                    migrations' tables are silently never created.
 *
 * Migration files live in lib/db/drizzle (MIGRATIONS_DIR overrides). Applied
 * migrations are recorded in drizzle.__drizzle_migrations, so re-running is a
 * no-op. Migrations run inside a transaction: a failing one changes nothing.
 *
 * Never logs connection strings or row data.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { db, pool } from "@workspace/db";
import { baselineTargets } from "./lib/baseline-targets";

const here = path.dirname(fileURLToPath(import.meta.url));

function resolveMigrationsFolder(): string {
  const candidates = [
    process.env["MIGRATIONS_DIR"],
    path.resolve(here, "../../../lib/db/drizzle"), // from artifacts/api-server/dist (repo checkout)
    path.resolve(here, "../migrations"), // container layout: /app/dist + /app/migrations
    path.resolve(process.cwd(), "lib/db/drizzle"),
  ].filter((p): p is string => !!p);
  const found = candidates.find((p) => fs.existsSync(path.join(p, "meta", "_journal.json")));
  if (!found) {
    throw new Error(
      `Could not find the migrations folder. Looked in: ${candidates.join(", ")}. Set MIGRATIONS_DIR.`,
    );
  }
  return found;
}

async function appliedHashes(): Promise<string[] | null> {
  const tableExists = await db.execute(
    sql`select to_regclass('drizzle.__drizzle_migrations') as t`,
  );
  if (!(tableExists.rows[0] as { t: string | null })?.t) return null;
  const rows = await db.execute(sql`select hash from drizzle.__drizzle_migrations`);
  return rows.rows.map((r) => (r as { hash: string }).hash);
}

async function status(folder: string): Promise<void> {
  const files = readMigrationFiles({ migrationsFolder: folder });
  const applied = new Set((await appliedHashes()) ?? []);
  const pending = files.filter((f) => !applied.has(f.hash));
  console.log(`migrations: ${files.length} total, ${files.length - pending.length} applied, ${pending.length} pending`);
}

async function baseline(folder: string, all: boolean): Promise<void> {
  const files = baselineTargets(readMigrationFiles({ migrationsFolder: folder }), all);
  const existing = await appliedHashes();
  if (existing && existing.length > 0) {
    throw new Error("Refusing to baseline: this database already has recorded migrations. Run without --baseline.");
  }
  const hasSchema = await db.execute(sql`select to_regclass('public.progress_reports') as t`);
  if (!(hasSchema.rows[0] as { t: string | null })?.t) {
    throw new Error(
      "Refusing to baseline: this database has no CampusVal tables. Run without --baseline to create them.",
    );
  }
  await db.execute(sql`create schema if not exists drizzle`);
  await db.execute(
    sql`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`,
  );
  for (const f of files) {
    await db.execute(
      sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${f.hash}, ${f.folderMillis})`,
    );
  }
  console.log(`baselined ${files.length} migration(s); nothing was executed against your tables`);
  if (!all) console.log("run without arguments next to apply any later migrations");
}

async function main(): Promise<void> {
  const folder = resolveMigrationsFolder();
  const args = new Set(process.argv.slice(2));
  if (args.has("--status")) return status(folder);
  if (args.has("--baseline-all")) return baseline(folder, true);
  if (args.has("--baseline")) return baseline(folder, false);
  await migrate(db, { migrationsFolder: folder });
  await status(folder);
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (err: Error) => {
    // Message only — drizzle/pg errors can echo SQL, never the connection string.
    console.error(`migration failed: ${err.message}`);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
