import { test as setup } from "@playwright/test";
import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";
import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { TEST_USERS } from "../scripts/ensure-test-users";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.resolve(__dirname, "../storage");
const STORAGE_FILE: Record<keyof typeof TEST_USERS, string> = {
  studentA: "student-a.json",
  studentB: "student-b.json",
  advisorY: "advisor-y.json",
};

setup.describe.configure({ mode: "serial" });

setup("obtain Clerk testing token", async () => {
  await clerkSetup();
});

/**
 * CampusVal's Clerk instance has no password/email-code sign-in strategy
 * enabled (only OAuth + "ticket" — confirmed live against the production
 * Frontend API: a password attempt returns `supported_first_factors:
 * [oauth_apple, oauth_github, oauth_google, ticket]`, no `password` entry).
 * So each synthetic user authenticates via a Clerk Backend API sign-in
 * token (https://clerk.com/docs/reference/backend-api/tag/sign-in-tokens) —
 * consumed by the app's own `/sign-in?__clerk_ticket=...` handling, exactly
 * like a real invitation link, never a password or OAuth flow.
 */
for (const key of Object.keys(TEST_USERS) as (keyof typeof TEST_USERS)[]) {
  setup(`authenticate ${key}`, async ({ page, baseURL }) => {
    await setupClerkTestingToken({ page });

    const { ids } = JSON.parse(readFileSync(path.join(STORAGE_DIR, "user-ids.json"), "utf-8"));
    const userId: string = ids[key];

    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
    const { token } = await clerk.signInTokens.createSignInToken({ userId, expiresInSeconds: 120 });

    await page.goto(`${baseURL}/sign-in?__clerk_ticket=${token}`);
    await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 20_000 });

    await page.context().storageState({ path: path.join(STORAGE_DIR, STORAGE_FILE[key]) });
  });
}
