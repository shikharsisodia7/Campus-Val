# Secrets and Google Secret Manager

Covers **CampusVal** and **PreHealth Advisor**. Kept identical in both repositories. **No secret values appear in this document or anywhere in git.**

> **Terms**
> - **Secret** — a value that grants access (password, API key, signing key). Anyone holding it can act as the application.
> - **Secret Manager** — Google Cloud's encrypted, access-controlled, versioned secret store. Cloud Run reads secrets at startup and exposes them to the app as environment variables.
> - **Rotation** — replacing a secret with a new value and revoking the old one.

## ⚠ Finding: a database password in PreHealth Advisor's git history

`scripts/run-chain.sh` in the **prehealth-Advisor** repository, as committed in `9077bf8` (2026-08-19), contained a full PostgreSQL connection string **including the production database password** (Neon, `neondb_owner` role). The current version of the file no longer contains it, but git history does, on `origin/main` and `origin/cursor/completion-checkpoint`. The repository is private.

**Action required before the repository is shared with anyone new (including SCU):** rotate the Neon `neondb_owner` password (Neon console → Roles → reset password), update `DATABASE_URL` in Vercel, and redeploy. Rewriting git history is optional after rotation (a rotated password is useless) and should not be done without the owner's decision because it disrupts every clone.

Other scan results (full history of both repos, patterns for Clerk, Google, Anthropic, OpenAI, GitHub, Vercel Blob keys and Postgres URLs): CampusVal — one **dummy** test value (`artifacts/api-server/src/app.hosting.test.ts`), not a credential. PreHealth — a Google Maps browser key inside a cached copy of a university's public web page (`data/prereq-source-cache/…`), belonging to that site, not this project. No `.env` file has ever been committed to either repository; both `.gitignore`s exclude `.env*` except `.env.example`.

## Current storage of secrets
Vercel project environment variables (both apps). CampusVal's Clerk keys and allowlists are marked *Sensitive*; its Neon database variables (`DATABASE_URL`, `PGPASSWORD`, `POSTGRES_PASSWORD`, …) and `BLOB_READ_WRITE_TOKEN` are stored as **Non-sensitive** (readable in the Vercel dashboard by any project member) — another reason to rotate at cut-over.

## Secrets inventory → Secret Manager

| Secret | Application | Current Env Var | GCP Secret Name Recommendation |
|---|---|---|---|
| Database connection string (includes password) | CampusVal | `DATABASE_URL` | `campusval-database-url` |
| Clerk secret key (temporary, until SSO) | CampusVal | `CLERK_SECRET_KEY` | `campusval-clerk-secret-key` |
| Clerk publishable key (public; stored for convenience) | CampusVal | `CLERK_PUBLISHABLE_KEY` | `campusval-clerk-publishable-key` |
| Upload-token signing key (32+ random chars) | CampusVal | `STORAGE_SIGNING_SECRET` | `campusval-storage-signing-secret` |
| Gemini API key (only if `AI_PROVIDER=gemini`) | CampusVal | `GEMINI_API_KEY` | `campusval-gemini-api-key` |
| Anthropic API key (only if `AI_PROVIDER=anthropic`) | CampusVal | `ANTHROPIC_API_KEY` | `campusval-anthropic-api-key` |
| Vertex AI (recommended) | CampusVal | — none: uses the service account | — |
| SCU OIDC client secret (future) | CampusVal | `SCU_OIDC_CLIENT_SECRET` | `campusval-oidc-client-secret` |
| Workday availability token (only if SCU enables it) | CampusVal | `WORKDAY_AVAILABILITY_AUTH_TOKEN` | `campusval-workday-availability-token` |
| ElevenLabs key (optional; leave unset unless approved) | CampusVal | `ELEVENLABS_API_KEY` | `campusval-elevenlabs-api-key` |
| Vercel Blob token (old platform only) | CampusVal | `BLOB_READ_WRITE_TOKEN` | — not migrated; revoke after files are copied |
| Database connection string | PreHealth Advisor | `DATABASE_URL` | `prehealth-database-url` |
| Clerk secret key (temporary) | PreHealth Advisor | `CLERK_SECRET_KEY` | `prehealth-clerk-secret-key` |
| Clerk publishable key (public) | PreHealth Advisor | `CLERK_PUBLISHABLE_KEY` | `prehealth-clerk-publishable-key` |
| SCU OIDC client secret (future) | PreHealth Advisor | `SCU_OIDC_CLIENT_SECRET` | `prehealth-oidc-client-secret` |
| Research-pipeline keys (Gemini, OpenAI, Groq, Serper, Tavily, Firecrawl, Jina, Keenable, Browserbase) | PreHealth Advisor — **offline tools only** | `GEMINI_API_KEY`, `OPENAI_API_KEY`, … | **Not deployed** — keep on the operator's machine; not needed in GCP |

Configuration that is **not** secret stays in plain env vars: `AI_PROVIDER`, model names, `GCS_BUCKET`, `PUBLIC_APP_URL`, `ADMIN_EMAILS`, `GUEST_REVIEWER_EMAILS`, `VITE_CLERK_PUBLISHABLE_KEY` (baked into the public web bundle).
`ADMIN_EMAILS` / `GUEST_REVIEWER_EMAILS` / `WORKDAY_SYNC_ADMIN_EMAIL` are not credentials but they list people; SCU may keep them in Secret Manager to limit who can read them.

## How the apps receive them
`cloudbuild.yaml` (`_SECRETS` substitution) deploys with `--set-secrets=ENV_VAR=secret-name:latest,...`. Each app's runtime service account gets `roles/secretmanager.secretAccessor` **on its own secrets only** (bind on each secret, not the project). Pin a version number instead of `latest` if SCU wants deploys to be reproducible.

```bash
# Example — run by an SCU administrator; the value is typed/pasted, never committed.
printf '%s' "$VALUE" | gcloud secrets create campusval-storage-signing-secret --data-file=- --replication-policy=automatic
gcloud secrets add-iam-policy-binding campusval-storage-signing-secret \
  --member="serviceAccount:<campusval-runtime-sa>" --role=roles/secretmanager.secretAccessor
```

## Rotation
- Database password: add a new Cloud SQL user password → new secret version → redeploy (new revision picks it up) → revoke the old one.
- `STORAGE_SIGNING_SECRET`: rotate any time; only uploads in progress (15-minute links) are affected.
- Clerk keys: rotate in the Clerk dashboard (until Clerk is retired).
- AI keys: rotate in the provider console. With Vertex AI there is nothing to rotate.

## Rules the code already follows
- The server never logs secret values; startup errors name the **variable**, not its value (`lib/config.ts` in both apps).
- Request logs redact `Authorization`/`Cookie` headers and the upload token in URLs (`lib/logger.ts`, `lib/log-url.ts`).
- Docker images contain no `.env` (`.dockerignore`) and no secrets; verified by inspecting both built images.
