/**
 * What `migrate.mjs --status` says, and that a checkout's line endings cannot
 * make an applied migration look pending.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatMigrationReport, hashesOf, migrationReport, type MigrationFile } from "./migration-status";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

const LF = "CREATE TABLE a (id int);\n--> statement-breakpoint\nCREATE TABLE b (id int);\n";
const CRLF = LF.replace(/\n/g, "\r\n");
const files: MigrationFile[] = [
  { tag: "0000_first", content: LF, folderMillis: 1 },
  { tag: "0001_second", content: "ALTER TABLE a ADD COLUMN n int;\n", folderMillis: 2 },
];

describe("migration status", () => {
  it("counts a migration recorded with the file's own hash", () => {
    const report = migrationReport(files, [{ hash: sha(LF), createdAt: 1 }]);
    expect(report.migrations.map((m) => m.state)).toEqual(["applied", "pending"]);
    expect([report.total, report.applied, report.pending]).toEqual([2, 1, 1]);
  });

  it("counts a migration recorded from a CRLF checkout, and says that it was", () => {
    const report = migrationReport(files, [
      { hash: sha(CRLF), createdAt: 1 },
      { hash: sha(files[1]!.content), createdAt: 2 },
    ]);
    expect(report.migrations.map((m) => m.state)).toEqual(["applied_other_line_endings", "applied"]);
    expect([report.applied, report.pending, report.unrecognized]).toEqual([2, 0, 0]);
    expect(formatMigrationReport(report)).toEqual([
      "migrations: 2 total, 2 applied, 0 pending",
      "  0000_first: applied (recorded from a checkout with different line endings; same statements)",
      "  0001_second: applied",
    ]);
  });

  it("works the other way round: a CRLF checkout against a database migrated with LF", () => {
    const onWindows = files.map((file) => ({ ...file, content: file.content.replace(/\n/g, "\r\n") }));
    const report = migrationReport(onWindows, files.map((file) => ({ hash: sha(file.content), createdAt: file.folderMillis })));
    expect(report.pending).toBe(0);
  });

  it("does not count a migration whose STATEMENTS differ", () => {
    const report = migrationReport(files, [{ hash: sha(LF.replace("id int", "id bigint")), createdAt: 1 }]);
    expect(report.migrations[0]!.state).toBe("pending");
    expect(report.unrecognized).toBe(1);
    expect(formatMigrationReport(report).at(-1)).toMatch(/match no file here/);
  });

  it("reports everything pending for a database with no record", () => {
    expect(migrationReport(files, []).pending).toBe(2);
  });

  it("gives a file without line breaks no variants", () => {
    expect(hashesOf("SELECT 1;").variants).toEqual([]);
  });
});

describe("the repository's migration files", () => {
  const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../lib/db/drizzle");
  const journal = JSON.parse(readFileSync(path.join(folder, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };

  it("are all in the journal, and the journal lists nothing else", () => {
    const onDisk = readdirSync(folder).filter((name) => name.endsWith(".sql")).map((name) => name.replace(/\.sql$/, "")).sort();
    expect(journal.entries.map((entry) => entry.tag).sort()).toEqual(onDisk);
  });

  it("are pinned to LF by .gitattributes, so their hash is the same on every machine", () => {
    const attributes = readFileSync(path.resolve(folder, "../../../.gitattributes"), "utf8");
    expect(attributes).toMatch(/lib\/db\/drizzle\/\*\.sql\s+text\s+eol=lf/);
  });
});
