/**
 * Which migrations `migrate.mjs --baseline` may record as applied WITHOUT running them.
 *
 * A database created by `drizzle-kit push` before migrations existed matches the schema
 * of the FIRST migration and nothing later. Recording a later migration as applied
 * without running it would leave that migration's tables missing while the runner
 * reports "0 pending" — a state that looks healthy and fails at the first query. So the
 * default records only the baseline (the first migration); `all` is the explicit opt-in
 * (`--baseline-all`) for a database that was pushed from the CURRENT schema.
 *
 * Kept in its own module (not migrate.ts) because migrate.ts runs on import.
 */
export function baselineTargets<T>(files: readonly T[], all: boolean): T[] {
  return all ? [...files] : files.slice(0, 1);
}
