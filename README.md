# CampusVal

A planning website for Santa Clara University undergraduates. Students lay out which courses
to take each quarter until graduation, then check that plan against their official Workday
Academic Progress Report.

**Live (pilot):** https://campus-val.vercel.app — invited testers only.

## What it does

| Page | What a student can do |
| --- | --- |
| **Degree Plan** | Build a long-term plan: which courses, in which quarter. |
| **Tentative Degree Plan** | Try a "what if" plan (a second major, study abroad, a different order) without touching the real one. Promote it when ready; the old plan is kept as a backup. |
| **Quarter Plan** | Choose actual class sections for Fall, Winter and Spring: times, instructors, lectures and labs. |
| **Academic Progress Report** | Upload the report exported from Workday and compare it with the plan. CampusVal never changes it. |
| **Degree Checksheets** | Upload department checksheets and four-year plans and compare them with the plan and the progress report. |

There is also a companion phone app (`artifacts/campusval-mobile`).

## What it does *not* do

CampusVal is a planning aid, not an official system. It does **not** register students for
classes, declare majors, approve anything, or certify graduation, and it doesn't replace
Workday or an advisor. When information is uncertain it says so: future quarters are marked
*Projected*, inferred details are marked *inferred*, and a planned course is never shown as
*Completed*.

## Current status

- **Pilot, invite-only.** Only accounts on the admin, tester, reviewer or department lists can
  get in. A plain `@scu.edu` address is not enough.
- Hosted on Vercel for now. It is **not** SCU-hosted or SCU-approved yet.
- Waiting on SCU for: hosting, an IT/security review, single sign-on, an official Workday data
  source, and the rollout plan.

Full list of what's waiting on whom: [docs/PILOT_STATUS.md](docs/PILOT_STATUS.md).

## How it's built

| Part | Folder | Tech |
| --- | --- | --- |
| Website | `artifacts/scu-advising` | React + Vite |
| API | `artifacts/api-server` | Express |
| Phone app | `artifacts/campusval-mobile` | Expo (React Native) |
| Browser tests | `artifacts/e2e` | Playwright |
| Database | `lib/db` | PostgreSQL (Neon) via Drizzle |
| API definition | `lib/api-spec` | OpenAPI; the client code is generated from it |

Sign-in uses Clerk. Uploaded files are stored privately (Vercel Blob today).

## Run it on your computer

You need Node 24, pnpm 11 and Docker.

```bash
pnpm install --frozen-lockfile

# Start a throwaway local database
docker run -d --name campusval-pg \
  -e POSTGRES_USER=campusval -e POSTGRES_PASSWORD=campusval -e POSTGRES_DB=campusval \
  -p 55432:5432 postgres:16
export DATABASE_URL='postgresql://campusval:campusval@localhost:55432/campusval'
pnpm --filter @workspace/db run push        # create the tables

pnpm --filter @workspace/api-server run dev:all   # builds the website and starts everything
```

Environment variables are listed in `.env.example` and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

> Never point local work or tests at the production database. Some tests delete rows.

## Run the checks

```bash
pnpm run ci:local      # everything CI runs, using Docker
```

Or one at a time:

```bash
pnpm run lint
pnpm run typecheck
pnpm --filter @workspace/api-server run test       # needs DATABASE_URL (a test database)
pnpm --filter @workspace/scu-advising run test
pnpm --filter @workspace/campusval-mobile run test
```

Browser tests (`artifacts/e2e`) need a running server and Clerk test keys, so they are not part
of CI.

## Deploying

Production deploys from `main`:

```bash
git checkout main && git pull --ff-only
npx vercel --prod --yes
```

Two rules:

1. **Never point `campus-val.vercel.app` at a preview build.** Previews have no sign-in or
   database settings, so every API call fails.
2. **The Vercel account allows 100 deploys a day.** Batch your commits before pushing.

To check a deploy worked: the home page should return `200` and
`https://campus-val.vercel.app/api/plans` should return `401` (not `500`).

## Things to know before changing code

- **Two kinds of year.** Plans store the *academic* year (Winter 2026–27 is saved as `2026`);
  SCU's schedule uses the *calendar* year (Winter 2027). Always convert with
  `artifacts/scu-advising/src/lib/academic-year.ts`.
- **"Can this course go in this quarter?"** is answered in one place:
  `artifacts/scu-advising/src/lib/course-offering.ts`.
- **Workday is not connected.** Academic records come only from the report a student uploads.

## More documentation

| Topic | File |
| --- | --- |
| Pilot status | [docs/PILOT_STATUS.md](docs/PILOT_STATUS.md) |
| Security and privacy | [docs/SECURITY_AND_PRIVACY.md](docs/SECURITY_AND_PRIVACY.md) |
| Progress report handling | [docs/APR_SOURCE_FIDELITY.md](docs/APR_SOURCE_FIDELITY.md) |
| Degree checksheets | [docs/DEGREE_CHECKSHEETS.md](docs/DEGREE_CHECKSHEETS.md), [docs/CROSS_REFERENCE_WORKSPACE.md](docs/CROSS_REFERENCE_WORKSPACE.md) |
| Where requirements come from | [docs/BULLETIN_BASELINE.md](docs/BULLETIN_BASELINE.md), [docs/REQUIREMENTS_SOURCE.md](docs/REQUIREMENTS_SOURCE.md), [docs/CORE_AREAS.md](docs/CORE_AREAS.md) |
| Business majors and multiple schools | [docs/MULTI_SCHOOL_REQUIREMENTS.md](docs/MULTI_SCHOOL_REQUIREMENTS.md) |
| Workday and seat availability | [docs/WORKDAY_INTEGRATION.md](docs/WORKDAY_INTEGRATION.md), [docs/SECTION_AVAILABILITY.md](docs/SECTION_AVAILABILITY.md) |
| Hosting at SCU | [docs/SCU_DEPLOYMENT.md](docs/SCU_DEPLOYMENT.md), [docs/SCU_TECHNICAL_HANDOFF.md](docs/SCU_TECHNICAL_HANDOFF.md) |
| Testing | [docs/PILOT_QA_CHECKLIST.md](docs/PILOT_QA_CHECKLIST.md), [docs/ACCESSIBILITY_TESTING.md](docs/ACCESSIBILITY_TESTING.md) |
