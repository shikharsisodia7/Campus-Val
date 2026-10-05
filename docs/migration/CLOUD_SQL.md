# Cloud SQL for PostgreSQL — CampusVal

> **Terms**
> - **Cloud SQL** — Google's managed PostgreSQL service (Google runs patching, backups, failover).
> - **ORM** — the code library that turns application code into SQL. CampusVal uses **Drizzle ORM** on top of the **node-postgres (`pg`)** driver.
> - **Migration** — a versioned SQL file that changes the database structure (adds a table/column). Applied in order, once.
> - **Connection pool** — a small set of open database connections each server instance reuses.
> - **Private IP** — the database has an address only inside SCU's GCP network, not on the internet.

## Current state
- **Database today:** Neon PostgreSQL (serverless Postgres), connected through Vercel's Neon integration.
- **Client:** `lib/db/src/index.ts` — `pg.Pool` with `connectionString: DATABASE_URL`, `max = DATABASE_POOL_MAX || 5`, 10 s connect timeout, 30 s idle timeout. Drizzle wraps the pool. Nothing is Neon-specific in code.
- **Schema:** `lib/db/src/schema/*.ts` (17 tables). **Migrations:** `lib/db/drizzle/0000_baseline.sql … 0005_requirement_customizations.sql`, line endings pinned to LF by `.gitattributes` (the runner hashes file bytes).
- **Migration runner:** bundled into the image as `artifacts/api-server/dist/migrate.mjs`; needs only Node and `DATABASE_URL`. Modes: apply (default, idempotent), `--status`, `--baseline`, `--baseline-all` (see the file header in `artifacts/api-server/src/migrate.ts`). Each migration runs in a transaction.
- **CI** (`.github/workflows/ci.yml`) fails a schema change that ships without a migration, applies all migrations to an empty Postgres 16, and runs the test suites against it.

## Environment variables
Only one is required by the code:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Full connection string (secret — contains the password) |
| `DATABASE_POOL_MAX` | Connections per Cloud Run instance (default 5; suggest 5–10) |
| `MIGRATIONS_DIR` | Override migration folder (not needed in the image) |

`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `INSTANCE_CONNECTION_NAME` etc. are **not** read by the code and were deliberately not added — the instance connection name goes inside `DATABASE_URL` (below) and into Cloud Run's `--add-cloudsql-instances` flag.

## Cloud Run → Cloud SQL connection
Recommended: **Cloud SQL Auth Proxy Unix socket** that Cloud Run mounts automatically when the service is deployed with `--add-cloudsql-instances=PROJECT:REGION:INSTANCE` (already in `cloudbuild.yaml` via `_CLOUDSQL_INSTANCE`). The connection string, stored in Secret Manager as `campusval-database-url`, is:

```
postgresql://campusval_app:<PASSWORD>@/campusval?host=/cloudsql/PROJECT:REGION:INSTANCE
```

`node-postgres` reads the `host` query parameter as the socket directory — **no code change is needed** (verified: the code passes `DATABASE_URL` straight to `pg.Pool`). The socket connection is encrypted and authorized by the service account's `roles/cloudsql.client`; TLS settings in the URL are not needed for it.

Alternative: private IP over Direct VPC egress (`--network/--subnet`, `_VPC_CONNECTOR_ARGS`) with `?sslmode=require` and the Cloud SQL server CA. Use if SCU standardizes on private-IP connections.

### Pool sizing
Total connections = instances × `DATABASE_POOL_MAX`. With `cloudbuild.yaml` defaults (max 10 instances, pool 10) that is ≤ 100 — set Cloud SQL `max_connections` above that plus admin headroom, or lower `--max-instances`.

## Recommended instance settings
- PostgreSQL **16** (CI tests against 16).
- **Private IP only**; no public IP (org policy `sql.restrictPublicIp`).
- High availability (regional) for production; single zone acceptable for staging.
- **Automated daily backups** + **point-in-time recovery** (7+ days of logs); backup retention per SCU policy (e.g. 30 days).
- **Encryption at rest:** on by default (Google-managed keys); use **CMEK** if SCU policy requires customer-managed keys.
- Enforce SSL for any non-socket connection.
- Database flags: `log_min_duration_statement` only if needed — **do not enable statement logging with parameters** (`log_statement=all`), which would write student data into logs.
- Users: an application user (`campusval_app`) that owns the schema; optional read-only role for break-glass investigations. Prefer **IAM database authentication** for humans.

## Production migration procedure (first move from Neon)
1. **Freeze writes** — announce a maintenance window; stop the Vercel deployment from accepting writes (e.g. pause the project) after confirming with the product owner.
2. **Export** from Neon with `pg_dump --format=custom --no-owner --no-acl` over TLS from an SCU-controlled machine or Cloud Shell. The dump contains FERPA data: keep it only in an SCU-controlled encrypted location and delete it after verification.
3. **Create** the Cloud SQL database and `campusval_app` user.
4. **Restore** with `pg_restore --no-owner --role=campusval_app` (via Cloud SQL Auth Proxy).
5. **Verify** migration state: run the image with `node artifacts/api-server/dist/migrate.mjs --status` — every migration must show `applied` (the `drizzle.__drizzle_migrations` table is carried in the dump). Then run the plain migrate (should be a no-op).
6. **Compare** row counts per table between Neon and Cloud SQL (counts only — no row contents).
7. **Copy APR/checksheet files** from Vercel Blob to the GCS bucket under the **same object names** (`progress-reports/<owner>/<uuid>`) — object paths stored in the database stay valid ([CLOUD_STORAGE.md](CLOUD_STORAGE.md)).
8. **Deploy** CampusVal on Cloud Run pointing at Cloud SQL; smoke-test with a synthetic account only.
9. **Rotate** every credential used on the old platform; decommission Neon, Vercel Blob and the Vercel project after the rollback window, deleting their data.

## Ongoing schema changes
`cloudbuild.yaml` runs migrations as a Cloud Run **Job** (`campusval-migrate`, same image, `node artifacts/api-server/dist/migrate.mjs`) **before** deploying the new service revision. Migrations are additive by convention; the runner refuses unsafe baselining.

## Rollback
- **Application:** route traffic back to the previous Cloud Run revision (`gcloud run services update-traffic campusval --to-revisions=<previous>=100`). Additive migrations are compatible with the previous revision.
- **Database:** restore from automated backup / point-in-time recovery to a **new** instance, verify, then repoint `DATABASE_URL` (new Secret Manager version). Never restore over the live instance.
- **Platform cut-over:** keep the Neon database read-only and the Vercel project paused (not deleted) until SCU signs off; repoint DNS back if needed.
