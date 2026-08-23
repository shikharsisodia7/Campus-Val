# CampusVal

Academic planning support for Santa Clara University students, grounded in real SCU
policy and each student's own record.

**Production:** https://campus-val.vercel.app
**Production branch:** `replit-main` (this is the repo's default branch — `main` is a
stale leftover from early development and is not used)

---

## What CampusVal is

Four surfaces, each with a distinct job:

| Surface | Purpose |
| --- | --- |
| **Degree Plan** | The student's editable long-term plan: which courses, which quarter. |
| **Tentative Degree Plan** | An independent alternate scenario — a second major, a different sequence, a study-abroad term. Promoting one makes it the Degree Plan and keeps the old one as a dated backup. |
| **Quarter Plan** | Where actual sections are chosen — section numbers, meeting times, instructors, and lecture/lab/recitation components — for Fall, Winter and Spring. |
| **Workday Academic Progress Report** | The university-generated record the student uploads and compares their plan against. Read-only; CampusVal never modifies it. |

## What CampusVal is not

This matters more than the feature list, and the UI says so throughout. CampusVal does
**not** register students for classes, declare majors or minors, certify graduation,
approve overloads, determine registration eligibility, or replace Workday or an advisor.
It cannot confirm seats, holds, restrictions or permission numbers. Workday and SCU
remain the place to verify anything official.

Where data is uncertain, the app says so rather than guessing:

- Course offerings are graded by evidence — `published`, `tentative`, `projected`, or
  `unknown` — and future terms are labelled *Projected*, never presented as official.
- Lecture/lab component types are **inferred** (SCU publishes no component column), so
  they are labelled as inferred and the app tells students to verify linked components
  in Workday rather than pairing them itself.
- Core designations derived from catalog heuristics ask the student to confirm them.
- A planned course is never reported as *Completed*; only verified completion
  provenance earns that.
- Summer is never projected, because no verified Summer schedule exists.

## Repository layout

pnpm workspace monorepo:

```
artifacts/scu-advising     Vite + React web frontend
artifacts/api-server       Express API (also serves the built frontend locally)
artifacts/campusval-mobile Expo companion app
lib/db                     Drizzle schema + Postgres client
lib/api-spec               OpenAPI spec (source of truth for the generated clients)
lib/api-client-react       Generated React Query client
lib/api-zod                Generated Zod schemas
docs/                      Deployment and Workday-integration docs
```

Notable modules worth knowing about:

- `artifacts/scu-advising/src/lib/academic-year.ts` — converts between the two year
  conventions. Plan items store the **academic-year anchor** (2026-winter is calendar
  Winter 2027); SCU schedule data uses **calendar** years. Fall is the only term where
  they coincide, so mixing them silently breaks Winter and Spring. Always convert.
- `artifacts/scu-advising/src/lib/course-offering.ts` — the single source for
  "can this course go in this quarter?", including the evidence grade.
- `artifacts/api-server/src/lib/course-components.ts` — lecture/lab/recitation
  derivation from the bulletin text and published meeting patterns.
- `artifacts/api-server/src/lib/core-cross-satisfaction.ts` — lets a planned major
  course satisfy a matching University Core requirement without duplication.

## Local development

Requires Node 24, pnpm 11, and a Postgres database.

```bash
pnpm install --frozen-lockfile

# Throwaway local database — never point tests at the production Neon URL,
# the DB-backed suites delete rows.
docker run -d --name campusval-pg \
  -e POSTGRES_USER=campusval -e POSTGRES_PASSWORD=campusval -e POSTGRES_DB=campusval \
  -p 55432:5432 postgres:16
export DATABASE_URL='postgresql://campusval:campusval@localhost:55432/campusval'
pnpm --filter @workspace/db run push

pnpm --filter @workspace/api-server run dev:all   # build frontend + API, then serve
```

Environment variables are documented in `.env.example` and
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Tests

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run test       # 287 tests (needs DATABASE_URL)
pnpm --filter @workspace/scu-advising run test     # 162 tests
pnpm --filter @workspace/campusval-mobile run test #   9 smoke tests
pnpm run vercel-build
```

There is **no lint script** in this repository — that is deliberate, not an oversight.

CI (`.github/workflows/ci.yml`) runs typecheck, all three suites and both builds against
a Postgres 16 service on every push and PR to `replit-main`.

## Deployment

Vercel project `campusval`, deployed from `replit-main`:

```bash
git checkout replit-main && git pull --ff-only
npx vercel --prod --yes
```

Two things that have bitten before:

1. **Never alias a preview deployment onto `campus-val.vercel.app`.** Clerk and database
   variables are scoped to the Production environment only, so a preview build has no
   auth config and every `/api/*` route returns 500 while pages still return 200. Use a
   real production deploy, or `vercel promote`.
2. **The free plan caps deployments at 100/day**, and every push to an open PR triggers
   two builds. Batch commits before pushing.

Verifying a deployment means checking more than a 200:

```bash
# target must be "production" and meta.githubCommitSha must match origin/replit-main
curl -o /dev/null -w '%{http_code}\n' https://campus-val.vercel.app/          # 200
curl -o /dev/null -w '%{http_code}\n' https://campus-val.vercel.app/api/plans # 401
```

A protected route returning **401** proves the serverless API and auth middleware are
live. A 500 there means the deployment is missing production environment variables.

## Access

Sign-in is restricted to `@scu.edu` accounts. Invited external reviewers can be allowed
individually through the server-side `GUEST_REVIEWER_EMAILS` allowlist — see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Uploaded Academic Progress Reports live in
private object storage behind owner checks; they are never publicly addressable.

## Workday integration

**Status: ready for SCU authorization — not connected.** CampusVal has no Workday
credentials, tenant or API client, and does not scrape Workday or ask for a student's
Workday password. Academic-record data comes from the report a student uploads
themselves; schedule data comes from the Registrar's published and tentative schedules.

[docs/WORKDAY_INTEGRATION.md](docs/WORKDAY_INTEGRATION.md) documents what SCU would need
to provide before a real read-only integration could exist.
