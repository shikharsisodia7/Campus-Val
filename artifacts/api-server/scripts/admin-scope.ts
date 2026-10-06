/**
 * Grants or revokes a department administrator's program scope, from the command line.
 *
 *   pnpm run admin:scope -- grant  --email dept.person@scu.edu --program major:biology
 *   pnpm run admin:scope -- revoke --email dept.person@scu.edu --program major:biology
 *   pnpm run admin:scope -- list
 *   pnpm run admin:scope -- programs            (the program keys that exist)
 *
 * Runs against DATABASE_URL. The same rows can be granted by a super admin
 * (ADMIN_EMAILS) through POST /api/admin/department/scopes. Nothing here is a
 * login: a scope only says what an already signed-in address may maintain.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db, pool, programAdminScopesTable } from "@workspace/db";
import { recordAudit } from "../src/lib/department/service.ts";
import { findProgram, listPrograms } from "../src/lib/department/programs.ts";

const [command, ...rest] = process.argv.slice(2);
const arg = (name: string) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
const email = arg("--email")?.trim().toLowerCase();
const programKey = arg("--program");
const actor = { email: (arg("--by") ?? "cli@campusval.local").toLowerCase(), userId: "cli" };

try {
  if (command === "programs") {
    for (const p of listPrograms()) console.log(`${p.programKey.padEnd(48)} ${p.type.padEnd(6)} ${p.collegeName}  ${p.title}`);
  } else if (command === "list") {
    const rows = await db.select().from(programAdminScopesTable).where(isNull(programAdminScopesTable.revokedAt));
    for (const r of rows.sort((a, b) => a.email.localeCompare(b.email))) console.log(`${r.email}  ${r.programKey}  (granted by ${r.grantedBy})`);
    if (rows.length === 0) console.log("no scopes granted");
  } else if ((command === "grant" || command === "revoke") && email && programKey) {
    if (!findProgram(programKey)) throw new Error(`"${programKey}" is not a program key. Run: pnpm run admin:scope -- programs`);
    if (command === "grant") {
      await db
        .insert(programAdminScopesTable)
        .values({ email, programKey, grantedBy: actor.email })
        .onConflictDoUpdate({ target: [programAdminScopesTable.email, programAdminScopesTable.programKey], set: { revokedAt: null, grantedBy: actor.email, grantedAt: new Date() } });
    } else {
      await db
        .update(programAdminScopesTable)
        .set({ revokedAt: new Date() })
        .where(and(eq(programAdminScopesTable.email, email), eq(programAdminScopesTable.programKey, programKey), isNull(programAdminScopesTable.revokedAt)));
    }
    await recordAudit(actor, { programKey, entity: "scope", action: command, after: { email } });
    console.log(`${command}: ${email} -> ${programKey}`);
  } else {
    console.error("usage: admin:scope -- grant|revoke --email <address> --program <key>   |   list   |   programs");
    process.exitCode = 2;
  }
} finally {
  await pool.end();
}
