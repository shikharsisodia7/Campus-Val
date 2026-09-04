# CampusVal — External Reviewer Access

CampusVal is restricted to `@scu.edu` accounts, with an allowlist
mechanism to invite outside reviewers (e.g. a professor at another
university, or students elsewhere) without an SCU email. See
`artifacts/api-server/src/middlewares/requireAuth.ts`
and [docs/DEPLOYMENT.md](DEPLOYMENT.md#external-reviewer-access-guest_reviewer_emails)
for how the mechanism works. This doc is the step-by-step runbook for
activating it, for whenever access is restricted again.

This grants **prototype/testing access only** — it does not enroll anyone as
an SCU student, does not grant university systems access, and every reviewer
gets their own private, isolated CampusVal account (same data model as any
other user: their own Degree Plan, Quarter Plan, Tentative Degree Plan, and
uploaded APR, invisible to everyone else).

## When the professor sends reviewer emails

1. **Collect the email addresses.** Get them directly from the professor in
   writing (e.g. email/Slack) — never guess or invent an address.
2. **Normalize and sanity-check each one.** Trim whitespace, lowercase is not
   required (matching is already case-insensitive) but do check each address
   is a real, correctly-typed email — a typo here silently locks a reviewer
   out with no useful error message.
3. **Update `GUEST_REVIEWER_EMAILS` in the existing Vercel project `campusval`**
   (not a new project), comma-separated, no spaces required (whitespace
   around each entry is trimmed automatically):
   ```bash
   vercel env rm GUEST_REVIEWER_EMAILS production --yes   # if one already exists
   vercel env add GUEST_REVIEWER_EMAILS production
   # paste: reviewer1@pdx.edu,reviewer2@yale.edu
   ```
   Also set it for `preview` if reviewers should be able to test preview
   deployments, but production is normally sufficient.
4. **Never commit reviewer emails to GitHub.** This env var is the only place
   they should ever live. Don't paste them into a PR description, commit
   message, issue, or this doc.
5. **Redeploy production** — env var changes only apply to the *next* deploy,
   not already-built serverless functions:
   ```bash
   vercel deploy --prod
   ```
   (or push any commit to `main`, which redeploys automatically).
6. **Test one approved external user.** Have that reviewer sign up/sign in at
   https://campus-val.vercel.app with their real email, or verify with a
   synthetic stand-in first (see "Local testing" below) if you want to check
   before the reviewer's first real attempt. Confirm they reach the Dashboard.
7. **Test one unapproved external user** (any email not on the list, e.g. a
   personal Gmail) and confirm they're denied with the generic message —
   never a message that reveals who *is* allowlisted.
8. **Verify SCU login still works** — sign in with a `@scu.edu` test account
   and confirm nothing regressed.
9. **Verify cross-user isolation** — confirm the new reviewer's Degree Plan,
   Quarter Plan, Tentative Degree Plan, and APR are empty/their-own and that
   no other user's data is reachable through any API response.
10. **To revoke access later**, remove that email from `GUEST_REVIEWER_EMAILS`
    (comma-separated list, same command as step 3) and redeploy. Their
    CampusVal account and data aren't deleted — they simply can no longer
    sign in. Delete the account/data separately if the professor wants it
    fully removed.

## Local testing (synthetic addresses only)

To dry-run this without touching production or waiting on real reviewer
emails, set a synthetic address locally (`.env.local` or your shell) and run
the existing test suite, which already exercises exactly this decision logic:

```bash
GUEST_REVIEWER_EMAILS=external-reviewer@example.com pnpm --filter @workspace/api-server run test
```

`artifacts/api-server/src/middlewares/requireAuth.test.ts` covers: signed-out
denied, `@scu.edu` allowed, allowlisted external allowed, case/whitespace
normalization, unapproved external denied (both with an allowlist set and
with `GUEST_REVIEWER_EMAILS` unset entirely), and the Clerk API fallback path.
Never add a synthetic address to the production or preview env var — it's
for local/CI use only, and should be removed from your shell/`.env.local`
after testing.

## What reviewers see

The sign-in and landing pages say "CampusVal is currently available to
`@scu.edu` accounts and invited external reviewers" — true for both
populations, and it doesn't reveal whether any specific email is on the
allowlist. Approved reviewers go through the same Clerk sign-up/sign-in and
onboarding flow as any SCU student; nothing in onboarding assumes an
`@scu.edu` address.
