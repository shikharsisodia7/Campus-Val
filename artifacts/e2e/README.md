# @workspace/e2e

Authenticated end-to-end tests for CampusVal, using Clerk's officially
supported Playwright testing mechanism (`@clerk/testing`) — never manual
cookie injection, never a CAPTCHA bypass outside Clerk's own test
infrastructure.

## What this covers

- **`tests/responsive.spec.ts`** — authenticated responsive QA at the 7
  required viewport sizes (one Playwright project per size in
  `playwright.config.ts`), using a real browser viewport via
  `page.setViewportSize`/device config, not a manual/extension resize.
- **`tests/multi-account-security.spec.ts`** — real multi-account isolation
  and advisor-sharing security tests (self-access, cross-user denial,
  grant/read/edit-denied, revoke-denies-immediately, scope isolation) against
  three separate synthetic identities and separate auth sessions.

## How authentication works

CampusVal's Clerk instance has **no password or email-code sign-in strategy
enabled** — confirmed live against the production Frontend API, where a
password sign-in attempt returns `supported_first_factors: [oauth_apple,
oauth_github, oauth_google, ticket]` (no `password` entry). Real users sign
in via OAuth. So:

1. `scripts/ensure-test-users.ts` (run automatically via the `pretest` npm
   script) uses Clerk's **Backend API** (`@clerk/backend`, `CLERK_SECRET_KEY`)
   to idempotently create (or reuse) three synthetic test users with
   `+clerk_test@` email addresses. Clerk recognizes this address pattern as
   test-mode and never sends real email. These users are created directly via
   the Backend API, so the public sign-up UI (and its CAPTCHA) is never
   touched.
2. `tests/auth.setup.ts` (a Playwright "setup" project) uses
   `setupClerkTestingToken()` (bot-protection bypass, scoped to this
   Clerk-recognized automated flow) together with a **Backend API sign-in
   token** — the `ticket` strategy, the same mechanism behind real invitation
   links — to sign in as each synthetic user without needing OAuth or a
   password. Each session's `storageState` is saved to `storage/*.json`
   (gitignored — real session cookies, never committed).
3. The `responsive` and `security` Playwright projects reuse those saved
   `storageState` files, so no sign-in flow runs per test.

## Required environment variables

| Variable | Where it comes from | Notes |
|---|---|---|
| `CLERK_SECRET_KEY` | same one already used by the API server | never printed/logged; required to provision test users and obtain the testing token |
| `CLERK_PUBLISHABLE_KEY` | same as `VITE_CLERK_PUBLISHABLE_KEY` | required by `clerkSetup()` |
| `E2E_BASE_URL` | optional | defaults to `https://campus-val.vercel.app` |

**These test users only ever exist on the Clerk Development instance** (see
`docs/CLERK_MODE_DECISION.md`). Do not run `pretest` against a Production
Clerk instance without intending to create real test accounts there.

### Important: `CLERK_SECRET_KEY` must be the current production value

Vercel marks `CLERK_SECRET_KEY` as a **Sensitive** environment variable,
which by design can be *set* but never *read back* via `vercel env pull` or
the API — not even by the project owner. A stale value left over in an old
local `.env.local` will silently point at the wrong (or a defunct) Clerk
instance and every test will fail with a generic "Couldn't find your
account" error, which looks identical to an actual auth bug. If that
happens: open the Vercel dashboard → campusval project → Settings →
Environment Variables → reveal `CLERK_SECRET_KEY` (Production) in the web UI
(this works there; only CLI/API pull is restricted) and put the current
value in a local, gitignored env file before running these tests.

## Running locally

```sh
pnpm --filter @workspace/e2e install
pnpm --filter @workspace/e2e exec playwright install chromium
pnpm --filter @workspace/e2e run test:responsive
pnpm --filter @workspace/e2e run test:security
```

## Running in CI

Not yet wired into a GitHub Actions workflow. To enable it, a repository
maintainer needs to add `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` as
**GitHub Actions repository secrets** (Settings → Secrets and variables →
Actions) with those exact names — never paste the values anywhere else. Once
added, a workflow step can run `pnpm --filter @workspace/e2e run test`.
