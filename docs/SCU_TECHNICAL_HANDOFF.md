# CampusVal — SCU Technical Handoff

Start here if you have never seen this project.

## 1. What it is
CampusVal is a web app that helps SCU undergraduates plan their degree: requirements from the SCU Bulletin, four-year and quarter plans, a view of the Academic Progress Report (APR) they export from Workday, and an AI planning advisor. It handles **FERPA-protected** student records. It is a planning aid, not a system of record.

## 2. Words you will see
| Term | Meaning |
|---|---|
| **APR** | Academic Progress Report — exported from Workday by the student (Excel or PDF); contains courses and grades |
| **Monorepo / pnpm workspace** | One repository holding several packages; `pnpm` is the package manager that installs them |
| **React / Vite** | The web front end (what runs in the browser) and its build tool |
| **Node.js / Express** | The server (API) that the web app calls under `/api` |
| **TypeScript** | JavaScript with type checking; every package is TypeScript |
| **PostgreSQL / Drizzle ORM** | The database and the library the server uses to query it |
| **Migration** | A versioned SQL file that changes the database structure |
| **Clerk** | Third-party sign-in service used temporarily until SCU SSO |
| **OIDC / SSO** | The protocol and the experience of signing in with an SCU account |
| **Cloud Run** | Google service that runs the app's container and scales it |
| **Container image / Dockerfile** | A packaged, runnable copy of the app / the recipe that builds it |
| **Cloud Build / Artifact Registry** | Google's build pipeline / where built images are stored |
| **Secret Manager** | Google's store for passwords and keys |
| **Service account** | The Google identity the running app uses to reach the database, bucket and AI |

## 3. Technology at a glance
| Area | What the code uses |
|---|---|
| Frontend | React 19 + TypeScript, Vite, Tailwind, TanStack Query (`artifacts/scu-advising`) |
| Backend | Node.js 24 + TypeScript, Express 5, bundled with esbuild (`artifacts/api-server`) |
| Package manager | pnpm 11 (workspace; `pnpm-lock.yaml` frozen in builds) |
| Database | PostgreSQL via Drizzle ORM + `pg` (`lib/db`); migrations in `lib/db/drizzle` |
| API contract | OpenAPI spec (`lib/api-spec`) → generated client (`lib/api-client-react`) + validators (`lib/api-zod`) |
| Auth | Clerk today, behind `artifacts/api-server/src/lib/auth` |
| File storage | Pluggable private storage: Vercel Blob today; Google Cloud Storage (`gcs`) for SCU |
| AI | Gemini (Gemini API or Vertex AI) or Claude, behind `artifacts/api-server/src/lib/ai`; off unless configured |
| Mobile | Expo app (`artifacts/campusval-mobile`) — not part of the SCU web deployment |
| Tests | Vitest (API, web, mobile), Playwright end-to-end (`artifacts/e2e`) |
| CI | GitHub Actions `.github/workflows/ci.yml` (lint, typecheck, migrations on empty DB, tests, builds, container boot check) |
| Hosting today | Vercel (`vercel.json`, `api/[[...path]].mjs`) + Neon PostgreSQL + Vercel Blob |
| Hosting target | Cloud Run + Cloud SQL + Cloud Storage + Secret Manager (`Dockerfile`, `cloudbuild.yaml`) |
| Cron / background jobs | **None.** Migrations run as a one-off Cloud Run Job during deploys |

## 4. Repository map
```
artifacts/scu-advising/     web app (React)
artifacts/api-server/       API server (Express) — routes/, lib/, data/ (bundled Bulletin data)
artifacts/campusval-mobile/ Expo mobile app
artifacts/e2e/              Playwright end-to-end tests
lib/db/                     database schema + migrations
lib/api-spec, api-zod, api-client-react   API contract + generated code
docs/                       all documentation (this folder)
Dockerfile, cloudbuild.yaml production container + GCP pipeline
```

## 5. Run it locally
Prerequisites: Node 24, pnpm (via `corepack enable`), Docker (for a throwaway Postgres).
```bash
pnpm install
docker run -d --name campusval-dev-pg -e POSTGRES_USER=campusval -e POSTGRES_PASSWORD=campusval \
  -e POSTGRES_DB=campusval -p 55432:5432 postgres:16
export DATABASE_URL=postgresql://campusval:campusval@localhost:55432/campusval
node artifacts/api-server/dist/migrate.mjs   # after a build, or: pnpm --filter @workspace/db run push
cp .env.example .env    # fill in Clerk development keys; leave AI_PROVIDER empty unless testing AI
pnpm --filter @workspace/api-server run dev:all   # builds web + API, serves both on $PORT
```

## 6. Test it
```bash
pnpm run lint
pnpm run typecheck
DATABASE_URL=<throwaway db> pnpm --filter @workspace/api-server run test   # deletes test rows — never production
pnpm --filter @workspace/scu-advising run test
pnpm --filter @workspace/campusval-mobile run test
pnpm --filter @workspace/scu-advising run build && pnpm --filter @workspace/api-server run build
docker build -t campusval --build-arg VITE_CLERK_PUBLISHABLE_KEY=<public key> .
```
No test calls a real AI provider, sends email, or touches production.

## 7. Deploy to GCP
See [migration/GCP_MIGRATION_CHECKLIST.md](migration/GCP_MIGRATION_CHECKLIST.md). In short: create the project resources and secrets, set the Cloud Build trigger substitutions, run the trigger (build → push → migrate → deploy), put SCU's load balancer in front.

## 8. Documentation index
| Topic | Document |
|---|---|
| Architecture (diagrams) | [architecture/CAMPUSVAL_ARCHITECTURE.md](architecture/CAMPUSVAL_ARCHITECTURE.md), [CAMPUSVAL_DATA_FLOW.md](architecture/CAMPUSVAL_DATA_FLOW.md), [CURRENT_VS_TARGET.md](architecture/CURRENT_VS_TARGET.md) |
| Bulletin data | [architecture/SCU_BULLETIN_DATA_FLOW.md](architecture/SCU_BULLETIN_DATA_FLOW.md) |
| **Where APRs go** | [security/APR_STORAGE_AUDIT.md](security/APR_STORAGE_AUDIT.md) |
| FERPA data | [security/FERPA_DATA_INVENTORY.md](security/FERPA_DATA_INVENTORY.md) |
| Who can access what | [security/ACCESS_CONTROL.md](security/ACCESS_CONTROL.md) |
| Trust boundaries | [security/TRUST_BOUNDARIES.md](security/TRUST_BOUNDARIES.md) |
| Retention & deletion | [security/DATA_RETENTION.md](security/DATA_RETENTION.md) |
| Logging | [security/LOGGING.md](security/LOGGING.md) |
| Upload hardening | [security/FILE_UPLOAD_HARDENING.md](security/FILE_UPLOAD_HARDENING.md) |
| Security checklist | [security/SCU_SECURITY_CHECKLIST.md](security/SCU_SECURITY_CHECKLIST.md) |
| SSO migration / IdP questions | [migration/SCU_SSO_MIGRATION.md](migration/SCU_SSO_MIGRATION.md), [migration/SSO_INFORMATION_NEEDED.md](migration/SSO_INFORMATION_NEEDED.md) |
| AI provider | [migration/AI_PROVIDER_MIGRATION.md](migration/AI_PROVIDER_MIGRATION.md) |
| Cloud SQL / Storage / Secrets / Network | [migration/CLOUD_SQL.md](migration/CLOUD_SQL.md), [CLOUD_STORAGE.md](migration/CLOUD_STORAGE.md), [SECRET_MANAGER.md](migration/SECRET_MANAGER.md), [NETWORK_ACCESS.md](migration/NETWORK_ACCESS.md) |
| Environment variables | [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) |
| Earlier SCU hosting notes (VM/container) | [SCU_DEPLOYMENT.md](SCU_DEPLOYMENT.md), [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md) |
| Overall summary | [SCU_MIGRATION_README.md](../SCU_MIGRATION_README.md), [IMPLEMENTATION_REPORT.md](../IMPLEMENTATION_REPORT.md) |
