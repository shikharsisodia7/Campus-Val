# GCP Migration Checklist

Covers **CampusVal** and **PeerHeld Educator** (PreHealth Advisor). Kept identical in both repositories. No SCU values (project IDs, hostnames, ranges, client IDs) are assumed anywhere.

## Can be completed in code now — status

| Item | CampusVal | PeerHeld Educator |
|---|---|---|
| Production Dockerfile (multi-stage, non-root, `PORT`, `0.0.0.0`, health check) | [x] built + smoke-tested | [x] built + smoke-tested |
| `.dockerignore` keeps `.env`/secrets/data out | [x] | [x] (new) |
| `cloudbuild.yaml` (build → Artifact Registry → deploy; substitutions, no hardcoded project) | [x] incl. migrations job | [x] |
| Health endpoint | [x] `/api/healthz`, `/api/readyz` | [x] `/api/healthz` |
| Serves web app from the container | [x] (existing) | [x] (new) |
| Startup config validation naming missing variables | [x] (extended: auth, AI, GCS) | [x] (new) |
| Cloud SQL compatible (Unix socket via `DATABASE_URL`) | [x] no change needed | [x] no change needed; pool size configurable |
| Cloud Storage provider | [x] `gcs` provider | n/a — stores no files |
| Internal auth interface (Clerk behind it) | [x] | [x] |
| AI on SCU-approved providers only | [x] Gemini/Vertex/Claude; OpenAI removed | n/a — web app has no AI |
| `.env.example` complete, no values | [x] | [x] |
| Proxy/CORS/headers hardening | [x] (existing + error handler) | [x] (new) |
| SCU OIDC adapter | [ ] needs SCU IdP details | [ ] needs SCU IdP details |

## Requires SCU IT / GCP access

| # | Need | Used by | Notes |
|---|---|---|---|
| 1 | **GCP project(s)** (prod + staging) under SCU's organization | both | Billing, org policies |
| 2 | **IAM**: runtime service account per app; Cloud Build service account; developer read-only roles | both | [ACCESS_CONTROL.md](../security/ACCESS_CONTROL.md) §3 |
| 3 | **Artifact Registry** Docker repository | both | `_AR_REPO` substitution |
| 4 | **Cloud Build trigger** on the GitHub repo (or SCU's mirror) with substitutions set | both | `_SERVICE_ACCOUNT`, `_CLOUDSQL_INSTANCE`, `_PUBLIC_APP_URL`, (CampusVal) `_GCS_BUCKET` |
| 5 | **Cloud SQL for PostgreSQL 16** instance(s), private IP, backups + PITR, database + app user | both | [CLOUD_SQL.md](CLOUD_SQL.md) |
| 6 | **Cloud Storage bucket** (private, uniform access, public-access prevention) | CampusVal | [CLOUD_STORAGE.md](CLOUD_STORAGE.md) |
| 7 | **Secret Manager** secrets created with values | both | [SECRET_MANAGER.md](SECRET_MANAGER.md) |
| 8 | **AI provider decision** + enablement (Vertex AI API + `roles/aiplatform.user`, or an API key) | CampusVal | [AI_PROVIDER_MIGRATION.md](AI_PROVIDER_MIGRATION.md) |
| 9 | **DNS** hostnames + TLS certificates | both | Sets `PUBLIC_APP_URL` |
| 10 | **SCU network / VPN routing**, load balancer, Cloud Armor / internal LB | both | [NETWORK_ACCESS.md](NETWORK_ACCESS.md) |
| 11 | **SCU OIDC client registration** (staging + production) | both | [SSO_INFORMATION_NEEDED.md](SSO_INFORMATION_NEEDED.md) |
| 12 | **Production callback URLs** registered at the IdP | both | `https://<host>/api/auth/callback` |
| 13 | **SCU identity attributes** (user ID claim, email, affiliation/groups) | both | Determines user mapping and advisor roles |
| 14 | **Data move** window: Neon → Cloud SQL; Vercel Blob → GCS | both / CampusVal | Then rotate + decommission old platform |
| 15 | **Retention policy** decisions | both | [DATA_RETENTION.md](../security/DATA_RETENTION.md) |
| 16 | **Audit logging** (Data Access logs) and alerting | both | |
| 17 | Workday availability endpoint + credential (optional) | CampusVal | Currently disabled |

## Deployment order (once the above exists)
1. Create secrets, bucket (CampusVal), Cloud SQL, service accounts.
2. Restore data to Cloud SQL; copy files to the bucket.
3. Run the Cloud Build trigger (CampusVal runs migrations as a job first).
4. Put the load balancer in front; set DNS; confirm campus/VPN-only reachability and that `*.run.app` is not reachable directly.
5. Smoke-test with synthetic accounts: `/api/healthz`, sign-in, a plan edit, a synthetic APR upload/download/delete (CampusVal), a prerequisite search + tracker row (PeerHeld).
6. Switch SSO when the OIDC adapter is delivered and tested in staging.
