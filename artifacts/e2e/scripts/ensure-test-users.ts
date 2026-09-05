/**
 * Idempotently creates (or reuses) the synthetic Clerk test users used by
 * the multi-account security E2E suite. Uses Clerk's Backend API directly
 * (never the public sign-up UI), so no CAPTCHA/Turnstile is ever shown and
 * no real inbox is needed — `+clerk_test@` addresses are recognized by
 * Clerk's test mode: https://clerk.com/docs/testing/test-emails-and-phones
 *
 * CampusVal's Clerk instance only has OAuth (Apple/GitHub/Google) and the
 * "ticket" strategy enabled for sign-in — no password/email-code strategy
 * (confirmed live: a password sign-in attempt returns
 * `supported_first_factors: [oauth_apple, oauth_github, oauth_google,
 * ticket]`, with no `password` entry). So authentication in
 * tests/auth.setup.ts uses Clerk Backend API sign-in tokens (the "ticket"
 * strategy) rather than a password, and no password is set here.
 *
 * Never run this against a Clerk Production instance from CI without
 * intending to create real test users there. Requires CLERK_SECRET_KEY.
 */
import { createClerkClient } from "@clerk/backend";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) {
  console.error("CLERK_SECRET_KEY is not set. Cannot provision E2E test users.");
  process.exit(1);
}

const clerk = createClerkClient({ secretKey });

export const TEST_USERS = {
  studentA: { email: "e2e-student-a+clerk_test@scu.edu", firstName: "E2E", lastName: "StudentA" },
  studentB: { email: "e2e-student-b+clerk_test@scu.edu", firstName: "E2E", lastName: "StudentB" },
  advisorY: { email: "e2e-advisor-y+clerk_test@scu.edu", firstName: "E2E", lastName: "AdvisorY" },
} as const;

async function ensureUser(email: string, firstName: string, lastName: string) {
  const existing = await clerk.users.getUserList({ emailAddress: [email] });
  if (existing.data.length > 0) {
    return existing.data[0]!;
  }
  return clerk.users.createUser({
    emailAddress: [email],
    firstName,
    lastName,
    skipPasswordRequirement: true,
    skipLegalChecks: true,
  });
}

async function main() {
  const outDir = path.resolve(__dirname, "../storage");
  mkdirSync(outDir, { recursive: true });

  const ids: Record<string, string> = {};
  for (const [key, { email, firstName, lastName }] of Object.entries(TEST_USERS)) {
    const user = await ensureUser(email, firstName, lastName);
    ids[key] = user.id;
    console.log(`${key}: ${email} -> ${user.id}`);
  }

  writeFileSync(
    path.join(outDir, "user-ids.json"),
    JSON.stringify({ users: TEST_USERS, ids }, null, 2),
  );
}

main().catch((err) => {
  console.error("Failed to provision E2E test users:", err);
  process.exit(1);
});
