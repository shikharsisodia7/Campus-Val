/**
 * Which migrations a database has, told from what it recorded.
 *
 * drizzle records a migration by the SHA-256 of the file's BYTES. The same
 * migration checked out with Windows line endings has different bytes and so a
 * different hash, although every statement in it is the same. A database that
 * was migrated from such a checkout is fully migrated; comparing only the
 * hash of today's file would call its migrations "pending".
 *
 * So a migration counts as applied when the database recorded the hash of the
 * file with EITHER line ending. Which one it was is reported, never hidden.
 *
 * (drizzle's own `migrate` does not compare hashes at all: it runs the
 * migrations newer than the newest recorded `created_at`. It was never at risk
 * of running one twice; only this report was wrong.)
 *
 * Kept in its own module (not migrate.ts) because migrate.ts runs on import.
 */
import { createHash } from "node:crypto";

export interface MigrationFile {
  tag: string;
  /** The file as it is on disk. */
  content: string;
  /** `when` in the journal; what drizzle stores as `created_at`. */
  folderMillis: number;
}

export interface RecordedMigration {
  hash: string;
  createdAt: number | null;
}

export type MigrationState =
  /** Recorded with the hash of the file as it is on disk. */
  | "applied"
  /** Recorded with the hash of the same file with the other line ending. */
  | "applied_other_line_endings"
  | "pending";

export interface MigrationReport {
  migrations: { tag: string; state: MigrationState }[];
  total: number;
  applied: number;
  pending: number;
  /** Rows in the database that match no migration file, with either line ending. */
  unrecognized: number;
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** The hashes a file can have been recorded under: as it is, with LF, with CRLF. */
export function hashesOf(content: string): { exact: string; variants: string[] } {
  const lf = content.replace(/\r\n/g, "\n");
  const crlf = lf.replace(/\n/g, "\r\n");
  const exact = sha256(content);
  return { exact, variants: [sha256(lf), sha256(crlf)].filter((hash) => hash !== exact) };
}

export function migrationReport(files: readonly MigrationFile[], recorded: readonly RecordedMigration[]): MigrationReport {
  const hashes = new Set(recorded.map((row) => row.hash));
  const known = new Set<string>();
  const migrations = files.map((file) => {
    const { exact, variants } = hashesOf(file.content);
    for (const hash of [exact, ...variants]) known.add(hash);
    const state: MigrationState = hashes.has(exact)
      ? "applied"
      : variants.some((hash) => hashes.has(hash))
        ? "applied_other_line_endings"
        : "pending";
    return { tag: file.tag, state };
  });
  const pending = migrations.filter((m) => m.state === "pending").length;
  return {
    migrations,
    total: files.length,
    applied: files.length - pending,
    pending,
    unrecognized: recorded.filter((row) => !known.has(row.hash)).length,
  };
}

/** The report as printed. The first line keeps the form other tools read. */
export function formatMigrationReport(report: MigrationReport): string[] {
  const lines = [`migrations: ${report.total} total, ${report.applied} applied, ${report.pending} pending`];
  for (const { tag, state } of report.migrations) {
    const note =
      state === "applied"
        ? "applied"
        : state === "pending"
          ? "PENDING"
          : "applied (recorded from a checkout with different line endings; same statements)";
    lines.push(`  ${tag}: ${note}`);
  }
  if (report.unrecognized > 0) {
    lines.push(
      `  warning: ${report.unrecognized} recorded migration(s) match no file here. This database was migrated from different migration files.`,
    );
  }
  return lines;
}
