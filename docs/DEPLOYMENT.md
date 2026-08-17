# CampusVal — Deployment

## Monorepo structure

pnpm workspace, TypeScript throughout.

- `artifacts/scu-advising` — web frontend (React + Vite + Tailwind + shadcn/ui)
- `artifacts/api-server` — Express API (`/api/*`); also serves the built frontend when run traditionally (local/Replit)
- `artifacts/campusval-mobile` — Expo mobile companion (not deployed by this doc — see Expo/EAS separately)
- `artifacts/mockup-sandbox` — design sandbox, not part of the deployed app
- `lib/db` — Drizzle schema + DB client
- `lib/api-spec` — OpenAPI spec + Orval codegen source
- `lib/api-zod`, `lib/api-client-react` — generated from `lib/api-spec` (committed, not regenerated at deploy time)
- `lib/integrations-openai-ai-server` — OpenAI-compatible client (optional AI features)
- `api/[[...path]].mjs` — the Vercel Function entry, a thin re-export of the built Express app
- `vercel.json` — Vercel build/routing config

## Local setup

Requirements: Node 24, pnpm (version pinned via `packageManager` in the root `package.json` — run `corepack enable` to get it automatically), a Postgres database.

```bash
corepack enable
pnpm install
```

Local Postgres (any Postgres 16+ works; Docker is the fastest path):

```bash
docker run -d --name campusval-pg -e POSTGRES_USER=campusval -e POSTGRES_PASSWORD=campusval -e POSTGRES_DB=campusval -p 5434:5432 postgres:16
export DATABASE_URL="postgresql://campusval:campusval@localhost:5434/campusval"
pnpm --filter @workspace/db run push
```

Copy `.env.example` to `.env.local` (or export the vars directly — this repo does not auto-load `.env` files; Vite's dev server auto-loads `VITE_`-prefixed vars from `artifacts/scu-advising/.env.local`, but the API server reads `process.env` directly). At minimum you need `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` — see [Clerk](#clerk) below for where to get these for local dev.

Run the app:

```bash
pnpm --filter @workspace/scu-advising run build   # frontend
pnpm --filter @workspace/api-server run build     # api-server
PORT=8090 NODE_ENV=development pnpm --filter @workspace/api-server run start
```

(`pnpm --filter @workspace/api-server run dev:all` does all three steps, but its `export VAR=value &&` shell syntax is POSIX-only — it won't run under Windows `cmd.exe`, which is what `pnpm` scripts default to on Windows. Run the three commands above separately on Windows, or run them from a POSIX shell.)

## Environment variables

See `.env.example` at the repo root for the full list with descriptions. Never commit real values — `.env`, `.env.*`, and `.vercel` are gitignored (`.env.example` is explicitly un-ignored).

Required everywhere: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`.
Required on Vercel only: `BLOB_READ_WRITE_TOKEN` (auto-populated once a Blob store is connected).
Replit/local-dev only, not used on Vercel: `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`, `AI_INTEGRATIONS_OPENAI_*`.
Optional features that degrade gracefully when unset: the AI advisor chat (needs `AI_INTEGRATIONS_OPENAI_*`, Replit-only — there is no equivalent configured for Vercel, so AI advisor/voice features are currently Replit-only), voice TTS (`ELEVENLABS_API_KEY`).

## Database

Drizzle ORM against Postgres. Schema lives in `lib/db/src/schema/*`; push changes with:

```bash
pnpm --filter @workspace/db run push
```

This is a live `push` (no migration files) — appropriate for this project's current stage, but be aware it can prompt for destructive confirmations on breaking changes (`push-force` skips the prompt; use with care).

**Production database**: Neon Postgres, provisioned through Vercel's marketplace integration (not a standalone Neon account — the Vercel integration manages the connection string automatically as `DATABASE_URL` and friends). To provision it for a new environment: `vercel integration add neon` from a linked project directory, or use the Vercel dashboard's Storage tab.

## Private object storage (Academic Progress Reports)

FERPA-sensitive uploads use a provider-selecting abstraction (`artifacts/api-server/src/lib/storage/`):

- **Vercel** (detected via the platform's own `VERCEL` env var): Vercel Blob, private access, per-pathname signed URLs. Requires a **private** Blob store connected to the project (`vercel blob create-store <name> --access private`, then it connects automatically and injects `BLOB_READ_WRITE_TOKEN`). Never create a public store for this — APRs must never be publicly readable.
- **Everywhere else** (local dev, Replit): the original Replit object-storage sidecar, requiring `PRIVATE_OBJECT_DIR`/`PUBLIC_OBJECT_SEARCH_PATHS`, only reachable from inside Replit's runtime.

Both providers are lazily loaded (dynamic `import()`, not a static top-level import) — this matters: a static import of the Replit provider's `@google-cloud/storage` dependency would crash *every* request on Vercel, since that package isn't installed there. If you touch `lib/storage/`, keep provider loading lazy.

## Clerk

Authentication. This app's Clerk instance is Replit-managed (no separate Clerk.com dashboard) — the keys live in the Replit project's Secrets pane (Tools → Secrets) if you need to find them again, or in Vercel's Environment Variables (Settings → Environment Variables) once configured there. They are Clerk **development**-mode keys — fine for this project's current stage, but note Clerk's dev-instance usage limits before scaling up.

## External reviewer access (GUEST_REVIEWER_EMAILS)

`requireAuth` (`artifacts/api-server/src/middlewares/requireAuth.ts`) accepts any `@scu.edu` email automatically. To invite an external reviewer without one (e.g. a professor's outside contact), add their exact email to the `GUEST_REVIEWER_EMAILS` env var — comma-separated, case/whitespace-insensitive:

```bash
vercel env add GUEST_REVIEWER_EMAILS production
# paste: jake@example.com,tom.hines@example.org
```

Then redeploy for the change to take effect (`vercel deploy --prod` or push a commit — env var changes don't apply to already-built serverless functions until the next deploy). Remove or replace it the same way (`vercel env rm GUEST_REVIEWER_EMAILS production`) when reviewer access is no longer needed. Never commit real reviewer emails to source — this env var is the only place they should live.

## Deploying to Vercel

### One-time project setup

```bash
vercel link --project campus-val --yes   # creates & links the project if it doesn't exist
vercel blob create-store campusval-private --access private --yes --environment production --environment preview --environment development
vercel integration add neon              # provisions Postgres, sets DATABASE_URL automatically
```

Then set the Clerk vars (values from wherever you found them above — never put real values in a command you'll keep in shell history if you can avoid it):

```bash
vercel env add CLERK_SECRET_KEY production,preview,development --no-sensitive --yes
vercel env add CLERK_PUBLISHABLE_KEY production,preview,development --no-sensitive --yes
vercel env add VITE_CLERK_PUBLISHABLE_KEY production,preview,development --no-sensitive --yes
```

Push the DB schema to the newly-provisioned Neon database (pull the real `DATABASE_URL` first: `vercel env pull --environment=production` writes it to `.env.local`, which is gitignored):

```bash
vercel env pull --environment=production
# then export DATABASE_URL from the pulled file and run:
pnpm --filter @workspace/db run push
```

### Build configuration

Defined in `vercel.json`:

- `buildCommand`: `pnpm run vercel-build` — builds the frontend (`vite build`), bakes SEO metadata into the static output (`artifacts/scu-advising/scripts/postbuild-seo.mjs`, since Vercel serves `index.html` as a static file with no server in front of it to inject anything per-request), then builds the API server bundle.
- `installCommand`: `pnpm install --frozen-lockfile`
- `outputDirectory`: `artifacts/scu-advising/dist/public`
- `functions`: the catch-all API function (`api/[[...path]].mjs`) with `includeFiles` pointing at the built `dist/**` (pino's worker-thread transport files aren't picked up by static dependency tracing, so they're included explicitly — harmless if unused, since `NODE_ENV=production` disables the pretty-print transport that needs them anyway)
- `rewrites`: everything except `/api/*` falls back to `/index.html` (standard SPA rewrite) — the negative-lookahead pattern (`/((?!api/).*)`)  matters here: a plain `/(.*)`  catch-all would intercept API requests before they ever reach the function

Root Directory must stay the **repository root** (not `artifacts/api-server` or `artifacts/scu-advising`) — both packages depend on shared `lib/*` workspace packages that only resolve correctly with pnpm's workspace install running at the root.

### Deploy

```bash
vercel build              # local build validation, no deploy
vercel deploy             # preview deployment (remote build — see note below)
vercel deploy --prod      # production deployment
```

**Use a remote build (`vercel deploy`, not `vercel build && vercel deploy --prebuilt`) whenever the deployment's actual domain matters** — `postbuild-seo.mjs` derives the canonical URL from `VERCEL_URL`/`VERCEL_ENV`/`VERCEL_PROJECT_PRODUCTION_URL`, which are only populated during Vercel's own build execution, not a local one. A `--prebuilt` deploy will bake in the fallback domain instead of the real one.

**Vercel auto-promotes a brand-new project's very first deployment to production**, regardless of whether you passed `--prod`. This is platform default behavior, not something `vercel deploy` alone does afterward — every deployment after the first behaves as expected (preview unless `--prod`).

The project's GitHub repository is connected, with the production branch set to the repo's default branch (`replit-main` as of this writing — confirm in Vercel's Git settings if it's ever changed). Pushes to that branch auto-deploy to production; other branches/PRs get preview deployments automatically.

## Tests & typecheck

```bash
pnpm run typecheck                                # whole workspace
pnpm --filter @workspace/api-server run test      # needs DATABASE_URL pointed at a real (throwaway-safe) Postgres
pnpm --filter @workspace/scu-advising run test
pnpm --filter @workspace/campusval-mobile run test
```

## Rollback

Vercel keeps every deployment. To roll back production:

```bash
vercel ls campus-val                    # find the previous good deployment
vercel promote <deployment-url-or-id>   # re-aliases production to it, no rebuild
```

This is safe and near-instant (it reassigns the alias, it doesn't rebuild). For a database schema rollback, there is currently no automated migration-down path (schema changes are applied via `drizzle-kit push`, not versioned migration files) — revert the schema file(s) in git and re-run `push`, checking the diff `drizzle-kit push` reports before confirming, since a push can be destructive on incompatible changes.
