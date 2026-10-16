# Hosting CampusVal on SCU infrastructure

**Status: the repository is deployable on a standard university host. It has NOT
been deployed to any SCU server** — no SCU host, database, domain, network or
credentials were available. Everything below was verified locally (a production
container built and run against a fresh PostgreSQL); the parts that depend on SCU
IT are listed in [What SCU IT must provide](#12-what-scu-it-must-provide).

CampusVal is one Node process that serves the API (`/api/*`) and the built web
app on a single port, plus a PostgreSQL database. It has no dependency on Vercel
or Replit at runtime: those are optional platforms selected automatically when
their environment variables are present.

---

## 1. What must be hosted

| Component | What it is | Notes |
| --- | --- | --- |
| **App** | `node artifacts/api-server/dist/index.mjs` (or the Docker image) | Stateless except for uploaded APR files (see storage). One port. |
| **PostgreSQL 16+** | All application data | Any managed or self-run Postgres. |
| **Private file storage** | Uploaded Academic Progress Reports (student records) | A persistent, backed-up, **private** directory — see §4. Optional: without it APR upload is disabled and everything else works. |
| **Reverse proxy / TLS** | nginx, Apache, an F5, an SCU load balancer… | Terminates HTTPS. See §5. |
| **Authentication** | Clerk (hosted service) | The one external SaaS dependency. See §5 and [Open decision: sign-in](#open-decision-sign-in). |

No scheduler or background worker is required: CampusVal has no cron jobs. (A
live availability feed, when SCU provides one, is fetched on demand and cached in
process — see `docs/SECTION_AVAILABILITY.md`.)

## 2. Environment variables

The authoritative, commented list is [`.env.example`](../.env.example). The server
**validates this at startup** and exits with a message naming every missing or
invalid variable (nothing else is printed — values are never logged).

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | yes | TCP port (e.g. `8080`). |
| `DATABASE_URL` | yes | `postgresql://user:pass@host:5432/db`. Add `?sslmode=require` if the DB requires TLS. |
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | yes (production) | Server-side Clerk keys. |
| `VITE_CLERK_PUBLISHABLE_KEY` | yes, **at build time** | Public key baked into the web bundle. |
| `PUBLIC_APP_URL` | recommended | e.g. `https://campusval.scu.edu`. Canonical/OG URLs, CORS allowlist. |
| `TRUST_PROXY` | when behind a proxy | `1` for one proxy hop. Unset = trust none. |
| `HOST` | no | Bind address (default `0.0.0.0`). |
| `PRIVATE_STORAGE_PROVIDER=local`, `PRIVATE_STORAGE_DIR`, `STORAGE_SIGNING_SECRET` | for APR and Degree Checksheet upload | See §4. |
| `APR_MAX_UPLOAD_MB`, `CHECKSHEET_MAX_UPLOAD_MB` | no | Largest upload in MB. Defaults 10 and 20; each 1–50. The proxy's body limit must be at least the larger. |
| `CORS_ALLOWED_ORIGINS` | no | Extra browser origins; the bundled app needs none. |
| `DATABASE_POOL_MAX` | no | Default 5; use 10–20 on a long-running host. |
| `LOG_LEVEL` | no | Default `info`. |
| `WORKDAY_AVAILABILITY_*` | no | Off by default. §11 and `docs/SECTION_AVAILABILITY.md`. |
| `GUEST_REVIEWER_EMAILS`, `ADMIN_EMAILS`, `WORKDAY_SYNC_ADMIN_EMAIL` | no | Access lists; emails only. |

**Never commit secrets.** `.env`, `.env.*`, `.vercel/` and uploaded files are
gitignored; the Docker build context also excludes them (`.dockerignore`).
Generate `STORAGE_SIGNING_SECRET` with e.g. `openssl rand -base64 48`.

## 3. Database

Requirements: PostgreSQL 16+, a dedicated database and user with DDL rights (for
migrations) — the running app needs only DML.

**Migrations are versioned SQL** in `lib/db/drizzle/`, applied by a runner that
ships inside the app bundle (no pnpm, no source tree needed):

```bash
node artifacts/api-server/dist/migrate.mjs            # apply pending migrations (idempotent)
node artifacts/api-server/dist/migrate.mjs --status   # applied / pending, changes nothing
```

- **New (empty) database**: run the command above. It creates the whole schema.
  This was verified to produce a schema byte-identical to `drizzle-kit push`.
- **Existing database that was created by `drizzle-kit push`** (the current Vercel/
  Neon production database): run `node dist/migrate.mjs --baseline` **once**, then
  run `node dist/migrate.mjs` again. `--baseline` records ONLY the first (baseline)
  migration as applied *without executing it*, because a push-created database matches
  the schema as of that migration and nothing later; every later migration stays
  pending and the plain run applies it. It refuses to run on an empty database or one
  that already has migration records. Check with `--status` in between: right after
  `--baseline` it should say `N total, 1 applied, N-1 pending`.
  - `--baseline-all` records *every* migration as applied without running any. Use it
    **only** for a database that was pushed from the *current* schema. On an older
    database it is a trap: the newer migrations' tables are never created, yet
    `--status` reports `0 pending`. (This happened once, on the production database,
    with an earlier version of `--baseline` that recorded everything; it was caught
    and repaired before the code that needed the table went live.)
- **Changing the schema**: edit `lib/db/src/schema/*`, run `pnpm db:generate`,
  commit the new file in `lib/db/drizzle/`. CI fails if the schema and the
  migrations disagree, and CI applies the migrations to an empty database.
- Each migration runs in a transaction; a failing one changes nothing.
- **Reading `--status`.** It lists every migration:

  ```
  migrations: 6 total, 6 applied, 0 pending
    0000_baseline: applied (recorded from a checkout with different line endings; same statements)
    0001_tiny_doctor_octopus: applied (recorded from a checkout with different line endings; same statements)
    0002_apr_documents: applied
    0003_section_component: applied
    0004_degree_checksheets: applied
    0005_requirement_customizations: applied
  ```

  A migration is recorded by the SHA-256 of its file's bytes. The same file
  checked out with Windows line endings has other bytes and another hash,
  though every statement in it is the same. A database migrated from such a
  checkout is fully migrated, and `--status` counts it as applied and says how
  it was recorded. (Before 2026-09-28 it compared one hash only and reported
  such migrations as pending. That report was wrong; the runner itself was
  never at risk of running one twice, because it goes by date, not by hash.)
  `.gitattributes` pins the migration files to LF, so a new database records
  the same hash on every machine.

  "N recorded migration(s) match no file here" means the database was migrated
  from different files. Stop and find out which before applying anything.
- **Order of a release**: run migrations *before* starting the new app version.
  Migrations here are additive; the previous app version keeps working against
  them, which is what makes rollback (§9) safe.

**Backup/restore**: use your standard `pg_dump` / PITR. The database holds
student plans, profiles, feedback, and the structural copy of uploaded APR workbooks (which
include course names and, in the stored parse, grades). Treat dumps as FERPA-
sensitive: encrypt at rest, restrict access, never commit them. Restore =
`pg_restore` into an empty database, then `node dist/migrate.mjs --status` (a
restored dump already carries its migration records).

### Migration 0005 (2026-09-30): `requirement_customizations`

One new table (plan-scoped planning edits of the requirements sidebar) and one index
pair; no existing table is touched. Apply it before deploying the code that reads it,
though the code degrades safely if it is not there yet
([REQUIREMENTS_SOURCE.md](REQUIREMENTS_SOURCE.md#deploying)).

### Migration 0006 (2026-10-06): department layer and sample plans

Six new tables (`department_requirement_notes`, `department_requirement_overrides`, `department_audit_log`,
`program_admin_scopes`, `sample_plans`, `sample_plan_items`); no existing table is touched. Apply it before the code that
reads it; if the code is live first the sidebar still loads (without the department layer), the admin routes answer
503 and nothing else changes. Verified on a fresh database (7 of 7 applied) and as an upgrade from 0005 (6 applied, 1 pending,
then 7 of 7), with `drizzle-kit generate` reporting no schema drift.

After the migration, in this order, against the production database and only after reading each **dry run**:

1. **Department Notes** from an offline canonical-resource package: in Program Requirements Admin, register each source with its program, school, HTTPS source URL, exact `.xlsx` file name, academic year and document version; then record verified provenance, approved review and published status. Run `pnpm --filter @workspace/api-server run import:department-notes -- --dir <folder>` (then `--apply`). The importer skips unregistered, non-ready, duplicate, or archived resources and never reads student checksheet uploads.
2. **Sample plans**: `pnpm --filter @workspace/api-server run import:sample-plans -- --engineering --cas-dir <folder>` (then `--apply`; add `--publish` to make them visible).
3. **Department administrators**: `pnpm --filter @workspace/api-server run admin:scope -- grant --email <address> --program <program key>`
   (`-- programs` lists the keys). Never put an address in code or a migration.
4. **Checks**: `pnpm run audit:requirements --db`, `pnpm --filter @workspace/api-server run snapshot:bulletin -- --check`.

Full description: [BULLETIN_BASELINE.md](BULLETIN_BASELINE.md).

### Migrations in the 2026-09-26 release

| Migration | Change | Notes |
| --- | --- | --- |
| `0002_apr_documents` | `progress_reports`: many documents per student (drops the one-per-user constraint; adds `label`, `category`, `display_order`, `source_format`, `file_hash`, `workbook`, `import_error`) | Additive. Existing reports are kept as each student's first document, labelled "Academic Progress Report". |
| `0003_section_component` | `course_sections.component` (nullable) | The instructional format a source publishes for a section. |

Both are additive, so apply them **before** deploying the new application code:
the previous release keeps working against the migrated schema, while the new
release requires the new columns.

## 4. Uploaded APR storage

APRs are student records. Requirements: **persistent** across restarts and
redeploys, **backed up** with the same care as the database, **private** (never
web-served), owner-only readable.

Set `PRIVATE_STORAGE_PROVIDER=local` and point `PRIVATE_STORAGE_DIR` at a
persistent volume (the container declares `/var/lib/campusval/private`). Properties
(all covered by `progress-reports.test.ts` and `progress-reports.access-control.test.ts`):

- The only read path is the authenticated, owner-checked API route. The directory
  is never served statically and no public or presigned-forever URL exists.
- Upload links are HMAC-signed with `STORAGE_SIGNING_SECRET`, expire in 15
  minutes, and are bound to one path, one size cap (`APR_MAX_UPLOAD_MB`, default
  10 MB; `CHECKSHEET_MAX_UPLOAD_MB`, default 20 MB, for Degree Checksheets) and
  one content type.
- Degree Checksheets use this same storage and need nothing further: no extra
  directory, no native package, no background worker. The web build includes a
  `pdfjs/` folder of static files (fonts and image decoders for the in-app PDF
  viewer) that is served with the rest of the web app.
- Filesystem paths are built only from a strictly validated identifier — path
  traversal is not expressible.
- Files are written `0600` in `0700` directories; uploads write to a temp file and
  rename, so a partial upload is never readable.
- Downloads are `no-store`, `nosniff`, served under a fixed generic file name.

If SCU prefers object storage (S3-compatible, Azure Blob), implement the small
`PrivateObjectStorage` interface (`artifacts/api-server/src/lib/storage/types.ts`,
7 methods) and register it in `lib/storage/index.ts`. Nothing else changes.

## 5. Authentication, domain, cookies, proxy

- **Clerk** issues sessions. Add the SCU domain to the Clerk instance's allowed
  origins / redirect URLs and update `CLERK_*` / `VITE_CLERK_PUBLISHABLE_KEY` for the
  instance SCU wants (`docs/SECURITY_AND_PRIVACY.md` explains the current
  Development-instance decision). The sign-in/callback URLs are relative to the
  site origin — there is no hard-coded domain to change in the code.
- **HTTPS**: terminate TLS at the reverse proxy and set `PUBLIC_APP_URL=https://…`.
  The app sends `Strict-Transport-Security` only on requests it sees as secure
  (`req.secure`, which requires `TRUST_PROXY`). Clerk sets its own Secure cookies
  on HTTPS.
- **Reverse proxy**: forward `Host`, `X-Forwarded-Proto` and `X-Forwarded-For`, and
  set `TRUST_PROXY=1`. Without it the app treats the proxy as the client and
  believes the request is plain HTTP. Example nginx:

  ```nginx
  location / {
      proxy_pass         http://127.0.0.1:8080;
      proxy_set_header   Host $host;
      proxy_set_header   X-Forwarded-Proto $scheme;
      proxy_set_header   X-Forwarded-For $remote_addr;
      client_max_body_size 22m;      # must be >= the larger of APR_MAX_UPLOAD_MB (10) and CHECKSHEET_MAX_UPLOAD_MB (20)
  }
  ```
- **CORS**: production allows only `PUBLIC_APP_URL` plus `CORS_ALLOWED_ORIGINS`.
  The bundled app is same-origin and needs nothing.
- **Static assets**: served by the app with normal caching; put a CDN/proxy cache in
  front if desired. Hashed asset filenames make long caching safe.

### Open decision: sign-in

Clerk is a hosted third party. If SCU requires campus SSO (SAML/Shibboleth/Azure
AD), Clerk supports enterprise SAML/OIDC connections, so this can be configured
in Clerk without code changes; replacing Clerk entirely would be a separate
project (`middlewares/requireAuth.ts` is the single server integration point).
SCU should decide this early — it is the one part of the stack that is not
self-hosted.

## 6. Build and start

From a checkout (Node 24, pnpm via `corepack enable`):

```bash
pnpm install --frozen-lockfile
export VITE_CLERK_PUBLISHABLE_KEY=pk_...        # baked into the web bundle
pnpm run build:server                            # web app + API bundle (deterministic)
node artifacts/api-server/dist/migrate.mjs       # schema
PORT=8080 node --enable-source-maps artifacts/api-server/dist/index.mjs   # == pnpm start
```

Or the container:

```bash
docker build -t campusval --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_... .
docker run --rm --env-file campusval.env campusval node artifacts/api-server/dist/migrate.mjs
docker run -d --name campusval -p 8080:8080 --env-file campusval.env \
  -v campusval-private:/var/lib/campusval/private campusval
```

The image is ~430 MB, has no `node_modules` (the server is one esbuild bundle),
runs as an unprivileged user, and has a `HEALTHCHECK`. It handles `SIGTERM` by
draining in-flight requests (15 s cap) before exiting, so rolling restarts do not
cut off an APR upload being processed.

`VITE_CLERK_PUBLISHABLE_KEY` is a public key; Docker warns about `ARG` names that
look secret — that warning is expected for this variable only.

## 7. Health checks

| Endpoint | Meaning | Use for |
| --- | --- | --- |
| `GET /api/healthz` | Process is up. No dependencies touched. | Liveness / restart decisions. |
| `GET /api/readyz` | Database answers within 3 s. `503` if not. Also reports `privateStorage: configured \| not_configured` (informational, never fails readiness). | Load-balancer readiness / SCU monitoring. |

Neither exposes versions, hostnames, connection strings or error text.

## 8. Logging and errors

Structured JSON (pino) on stdout, one line per request with method, path (no
query string), status and timing. `Authorization` and cookie headers are redacted.
APR contents are never logged (asserted by tests). Ship stdout to
your log platform; set `LOG_LEVEL=warn` to reduce volume. Startup configuration
errors are printed once, in plain text, then the process exits with status 1.

## 9. Rollback

- **App**: redeploy the previous image/bundle. Migrations are additive and the
  previous version tolerates them, so no database rollback is needed for a normal
  release.
- **Schema**: there is no automated "down" migration. To undo one, restore from
  backup, or write and review a corrective forward migration.
- **APR files** are not touched by a deploy.

## 10. First-deployment checklist

1. Provision PostgreSQL 16+, a database, and a migration-capable user.
2. Provision a persistent, backed-up, private directory for APR files.
3. Create the Clerk instance (or reuse) and add the SCU domain; note the keys.
4. Fill in the environment (§2); generate `STORAGE_SIGNING_SECRET`.
5. Build (or pull) the image with `VITE_CLERK_PUBLISHABLE_KEY`.
6. Run migrations (`--baseline`, then a plain run, if adopting the existing database).
7. Start the app; check `/api/healthz` then `/api/readyz`.
8. Configure the reverse proxy + TLS; set `PUBLIC_APP_URL` and `TRUST_PROXY=1`.
9. Add `GUEST_REVIEWER_EMAILS` / `ADMIN_EMAILS` as needed.
10. Run the smoke tests below.

### Post-deployment smoke tests

```bash
curl -fsS https://HOST/api/healthz                       # {"status":"ok"}
curl -fsS https://HOST/api/readyz                        # {"status":"ready","checks":{"database":"ok",...}}
curl -sI  https://HOST/ | grep -i strict-transport       # HSTS present over HTTPS
curl -s   https://HOST/ | grep 'rel="canonical"'         # uses PUBLIC_APP_URL
curl -s -o /dev/null -w "%{http_code}\n" https://HOST/api/progress-reports  # 401 when signed out
curl -s -o /dev/null -w "%{http_code}\n" https://HOST/admin/feedback        # 200 (SPA route)
```

Then sign in with an @scu.edu account and check: Dashboard loads; Degree Plan
shows the Academic Progress Reports panel on the right; APR page → upload a Workday
Excel export (.xlsx) with a label → the full workbook appears with its upload date →
upload a second one → both are listed → "Original file" downloads the workbook; sign
in as a *different* user and confirm the first user's APRs are not reachable; Quarter Plan → Filter → a Core chip lists
courses; kill the DB briefly and confirm `/api/readyz` returns 503 while
`/api/healthz` stays 200.

## 11. Live Workday availability

Not connected. The CampusVal side is complete and switched off
(`WORKDAY_AVAILABILITY_ENABLED=false`). Connecting it is configuration, not
development — see `docs/SECTION_AVAILABILITY.md`.

## 12. What SCU IT must provide

- A host or container platform to run the app (or a decision to use the image),
  outbound HTTPS access to Clerk (`*.clerk.accounts.dev` / `clerk.com` or the
  custom domain) and, later, to the approved Workday availability source.
- A PostgreSQL 16+ instance, credentials, backup policy and network path.
- A persistent, backed-up, access-restricted volume for APR files (or a chosen
  object store).
- A DNS name, TLS certificate and reverse proxy/load balancer configuration.
- The **sign-in decision** (keep Clerk, or Clerk + campus SAML/SSO).
- Secrets storage (where `CLERK_SECRET_KEY`, `DATABASE_URL`, `STORAGE_SIGNING_SECRET`
  live) and log/monitoring destinations.
- Confirmation of data-handling requirements for stored APRs (retention,
  encryption at rest, FERPA review).

## 13. What Tony must provide (Workday availability)

See `docs/SECTION_AVAILABILITY.md#what-scu-must-provide`: the supported endpoint or
report, authentication mechanism, section identifier, status semantics, refresh
cadence and rate limits, and whether it may run from the SCU-hosted service.

### State on 2026-09-28

| Database | Migrations | Checked how |
| --- | --- | --- |
| Production (Neon) | 5 of 5 applied, 0 pending. Every recorded hash is the hash of the committed file. | The five rows of `drizzle.__drizzle_migrations` compared with `sha256` of each file |
| Local test database | 5 of 5 applied, 0 pending. 0000 and 0001 were recorded from a CRLF checkout on 2026-09-19 and 2026-09-20, before the files were pinned to LF. | The two recorded hashes equal the hash of each file with CRLF line endings, and no other; the schema was then compared, with `pg_dump --schema-only`, against a database built fresh from the five files: identical |

Nothing was changed in either database to reach this. No migration was pending
and none was run.
