# CampusVal

A degree- and quarter-planning workspace for Santa Clara University undergraduates. It
organizes and compares planning information from SCU sources; Workday and SCU remain
authoritative for official academic records and decisions.

## Status: pre-pilot

- **Development / engineering deployment:** https://campus-val.vercel.app (Vercel, built from
  `main`). It exists for engineering verification and, once the professor authorizes it,
  controlled pre-pilot testing. It is **not** SCU-hosted, SCU-approved or launched.
- **Access: invited participants only.** Pilot access mode (`CAMPUSVAL_ACCESS_MODE=pilot`, the
  default) admits only `ADMIN_EMAILS`, `PILOT_TESTER_EMAILS`, `GUEST_REVIEWER_EMAILS` and
  department administrators. An `@scu.edu` address alone is refused, on the server.
- **Not promoted and not indexed:** no announcements or invitations are sent by the app, and
  search engines are asked not to index it.
- **Waiting on SCU:** hosting decision, IT/security review, SSO details, an official Workday
  availability source, department confirmation of open academic questions, and the professor's
  rollout plan. Engineering security controls are tested; that is not SCU security approval.
- **Source:** this repository is public. Credentials, student records and uploaded documents are
  never stored in it.

Details, and the full list of what is waiting on whom: [docs/PILOT_STATUS.md](docs/PILOT_STATUS.md).
SCU target hosting (Docker, Cloud Run, Cloud SQL, Cloud Storage, OIDC seam):
[docs/SCU_DEPLOYMENT.md](docs/SCU_DEPLOYMENT.md).

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
docs/                      Deployment (Vercel + SCU hosting), Workday, APR, Core-area and security docs
Dockerfile                 Production image (Node process, no cloud dependency)
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
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). To host CampusVal on a university server or
container instead of Vercel — build, start, migrations, health checks, reverse proxy,
storage, first-deployment checklist — see [docs/SCU_DEPLOYMENT.md](docs/SCU_DEPLOYMENT.md).

## Tests

```bash
pnpm run lint
pnpm run typecheck
pnpm --filter @workspace/api-server run test       # needs DATABASE_URL
pnpm --filter @workspace/scu-advising run test
pnpm --filter @workspace/campusval-mobile run test #   9 smoke tests
pnpm run vercel-build
```

`pnpm run lint` (ESLint, `eslint.config.mjs`) checks **correctness only**: hooks called in a
different order between renders, unused code, duplicate keys, stale `eslint-disable` comments.
Formatting is Prettier's and types are `typecheck`'s, so neither is duplicated. It fails on any
warning, and generated API clients and the design sandbox are excluded. (This repo previously had
no lint step on purpose; it was added on 2026-09-20 after the first run found a real crash — a
hook called after an early return in the mobile sign-in screens — plus a pile of dead code.)

CI (`.github/workflows/ci.yml`) runs lint, typecheck, all three suites and both builds against
a Postgres 16 service on every push and PR to `main`.

## Engineering deployment (Vercel)

This is the development / pre-pilot environment, not institutional hosting
([docs/PILOT_STATUS.md](docs/PILOT_STATUS.md)). Vercel project `campusval`, deployed from `main`:

```bash
git checkout main && git pull --ff-only
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
# target must be "production" and meta.githubCommitSha must match origin/main
curl -o /dev/null -w '%{http_code}\n' https://campus-val.vercel.app/          # 200
curl -o /dev/null -w '%{http_code}\n' https://campus-val.vercel.app/api/plans # 401
```

A protected route returning **401** proves the serverless API and auth middleware are
live. A 500 there means the deployment is missing production environment variables.

## Access

During the pilot only invited people can use CampusVal: the server admits `ADMIN_EMAILS`,
`PILOT_TESTER_EMAILS`, `GUEST_REVIEWER_EMAILS` and department administrators, and answers every
other signed-in account — including any other `@scu.edu` account — with one pilot message and
`403` on every data route ([docs/PILOT_STATUS.md](docs/PILOT_STATUS.md),
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)). Degree Completion Assessment and generated four-year
plans are research features behind a server flag and an admin account; AI features are
administrators-only. Uploaded Academic Progress Reports live in
private object storage behind owner checks; they are never publicly addressable. A
student may upload several (one Workday Excel export per major or minor). They are shown
as exported — CampusVal does not re-evaluate them — and planning pages are never sent
their Academic Period, Units or Grade columns
([docs/SECURITY_AND_PRIVACY.md](docs/SECURITY_AND_PRIVACY.md),
[docs/APR_SOURCE_FIDELITY.md](docs/APR_SOURCE_FIDELITY.md)).

**Degree Checksheets** (Additional Features) hold the department documents a student
uploads: major and minor checksheets, four-year plans, flowcharts, advising resources.
Each is shown as uploaded and is never changed; the student's own status and quarter
for each item are stored separately. They are private to the student, are not shared
with a plan, and do not change any plan or requirement
([docs/DEGREE_CHECKSHEETS.md](docs/DEGREE_CHECKSHEETS.md)).

The Degree Checksheets page is a three-way comparison — **Planning Requirements | Degree Checksheet | Workday APR** — and the Academic Progress Report page puts the same Planning Requirements beside the full APR. A student can explicitly add information from a checksheet to a My Note or a My requirement on the plan they choose; nothing is matched or ticked automatically, and the checksheet, the APR and Department Notes are never changed by it ([docs/CROSS_REFERENCE_WORKSPACE.md](docs/CROSS_REFERENCE_WORKSPACE.md)).

## Workday integration

**Status: ready for SCU authorization — not connected.** CampusVal has no Workday
credentials, tenant or API client, and does not scrape Workday or ask for a student's
Workday password. Academic-record data comes from the report a student uploads
themselves; schedule data comes from the Registrar's published and tentative schedules.

[docs/WORKDAY_INTEGRATION.md](docs/WORKDAY_INTEGRATION.md) documents what SCU would need
to provide before a real read-only integration could exist. Live seat availability
(Open Sections / All Sections) has a complete provider layer that is switched off until
SCU names a supported source: [docs/SECTION_AVAILABILITY.md](docs/SECTION_AVAILABILITY.md).
How Core areas (CTW, Advanced Writing, C&I…) are defined and traced to the bulletin:
[docs/CORE_AREAS.md](docs/CORE_AREAS.md).

## Planning major vs. university record

The major a student plans around ("Set or Change Primary Major" in Plan
Controls) is planning intent stored on the plan — it never changes the profile,
the formal SCU declaration, or the uploaded Workday APR. Tentative Degree Plans
carry their own primary major in isolation until promoted.
[docs/PLANNING_MAJOR_AND_TENTATIVE.md](docs/PLANNING_MAJOR_AND_TENTATIVE.md)
explains the four distinct major values and how promotion carries them.

## Checking the whole repository

```bash
pnpm run typecheck                                    # every workspace
pnpm run lint
pnpm --filter @workspace/api-server run test          # needs DATABASE_URL (a test database)
pnpm --filter @workspace/scu-advising run test
pnpm --filter @workspace/campusval-mobile run test    # the mobile app's logic
pnpm --filter @workspace/campusval-mobile run bundle  # compiles the app for iOS and Android
```

`pnpm run ci:local` runs every step of `.github/workflows/ci.yml` on this machine (a throwaway
Postgres in Docker, the committed code only) and reports the result to GitHub as the commit
status **`ci/local`**. Use it while GitHub Actions is blocked by the account's billing: the
Actions "test" check then fails in seconds without running anything.

Browser tests run against a running server, signed in as synthetic test
students (`artifacts/e2e`, keys in `artifacts/e2e/.env.e2e.local`):

| Project | What |
| --- | --- |
| `qa-flows` | Academic Progress Report and planning, 11 flows |
| `checksheets` | Degree Checksheets, 13 flows and 2 over real documents from a local folder |
| `1440x900` … `390x844` | Every main page at seven sizes |
| `security` | Accounts cannot read each other's plans, reports or documents |
| `a11y-desktop`, `a11y-phone` | axe-core on every page and state; the keyboard |
| `req-customization` | The requirements sidebar's planning edits: persistence, reset, hide, own requirements, plan isolation, phone, axe |
| `dept-layer` | Bulletin baseline, Department Notes beside My Notes, Program Requirements Admin (scoped), Sample Plans, widened sidebar at five sizes |
| `pilot-access` | An uninvited `@scu.edu` account sees only the pilot message and gets 403 everywhere; an invited tester sees no R&D or admin tools (needs `CAMPUSVAL_ACCESS_MODE=pilot` with the synthetic students on `PILOT_TESTER_EMAILS`) |

They are not part of CI: they need Clerk test keys and a running server, and CI
must pass without any secret. CI runs everything in the first block, applies
the migrations to an empty database, and boots the production bundle.

More: `docs/BULLETIN_BASELINE.md` (the sidebar's layers: Bulletin, Department Notes and overrides, student edits; editions, snapshots,
department administration, Sample Plans), `docs/DEGREE_CHECKSHEETS.md`, `docs/REQUIREMENTS_SOURCE.md` (the provider boundary,
student edits, `pnpm run audit:requirements`), `docs/audits/`,
`docs/ACCESSIBILITY_TESTING.md`, `docs/PILOT_QA_CHECKLIST.md`.
