# Environment Variables

Covers **CampusVal** (CV) and **PreHealth Advisor** (PH). Kept identical in both repositories. **No values here.** Templates: `.env.example` in each repository. Secrets go in Secret Manager ([SECRET_MANAGER.md](migration/SECRET_MANAGER.md)).

Built from the variables the code actually reads (`process.env` / `import.meta.env` search), October 2026.

## Shared by both applications

| Variable | Application | Required | Secret? | Purpose |
|---|---|---|---|---|
| `DATABASE_URL` | CV, PH | Yes | **Yes** | PostgreSQL connection string (Cloud SQL socket form in [CLOUD_SQL.md](migration/CLOUD_SQL.md)) |
| `DATABASE_POOL_MAX` | CV, PH | No | No | DB connections per instance (CV default 5, PH default 8) |
| `PORT` | CV, PH | Yes (container) | No | Listening port (Cloud Run sets 8080) |
| `HOST` | CV, PH | No | No | Bind address (default `0.0.0.0`) |
| `NODE_ENV` | CV, PH | Yes in prod | No | `production` enables production checks |
| `LOG_LEVEL` | CV, PH | No | No | pino level (default `info`) |
| `TRUST_PROXY` | CV, PH | Behind LB | No | Proxy hops to trust (`1` behind Cloud Run/LB) |
| `PUBLIC_APP_URL` | CV, PH | Yes in prod | No | Public https origin; CORS allowlist; canonical URLs (CV) |
| `CORS_ALLOWED_ORIGINS` | CV, PH | No | No | Extra browser origins (comma-separated) |
| `WEB_APP_DIR` | CV, PH | No | No | Override where the built web app is served from |
| `AUTH_PROVIDER` | CV, PH | No (default `clerk`) | No | `clerk` now; `oidc` refused until the SCU adapter exists |
| `CLERK_SECRET_KEY` | CV, PH | Yes while Clerk | **Yes** | Clerk server key (temporary) |
| `CLERK_PUBLISHABLE_KEY` | CV, PH | Yes while Clerk | No (public) | Clerk publishable key (server) |
| `VITE_CLERK_PUBLISHABLE_KEY` | CV, PH | Yes at **build** while Clerk | No (public) | Baked into the web bundle |
| `SCU_OIDC_ISSUER` | CV, PH | Future | No | SCU IdP issuer (placeholder; not read yet) |
| `SCU_OIDC_CLIENT_ID` | CV, PH | Future | No | OIDC client ID (placeholder) |
| `SCU_OIDC_CLIENT_SECRET` | CV, PH | Future | **Yes** | OIDC client secret (placeholder) |
| `SCU_OIDC_REDIRECT_URI` | CV, PH | Future | No | `https://<host>/api/auth/callback` (placeholder) |

## CampusVal only

| Variable | Application | Required | Secret? | Purpose |
|---|---|---|---|---|
| `VITE_CLERK_PROXY_URL` | CV | No | No | Clerk Frontend API proxy (build time) |
| `PRIVATE_STORAGE_PROVIDER` | CV | Yes for APR upload | No | `gcs` (GCP), `vercel-blob`, `local`, `replit` |
| `GCS_BUCKET` | CV | With `gcs` | No | Private APR bucket name |
| `STORAGE_SIGNING_SECRET` | CV | With `gcs`/`local` | **Yes** | Signs 15-minute upload tokens (≥ 32 chars) |
| `PRIVATE_STORAGE_DIR` | CV | With `local` | No | Persistent private directory (not for Cloud Run) |
| `BLOB_READ_WRITE_TOKEN` | CV | With `vercel-blob` | **Yes** | Vercel Blob (current platform only) |
| `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS` | CV | Replit only | No | Legacy Replit object storage |
| `APR_MAX_UPLOAD_MB` | CV | No | No | APR size cap (default 10, max 50) |
| `CHECKSHEET_MAX_UPLOAD_MB` | CV | No | No | Checksheet size cap (default 20, max 50) |
| `AI_PROVIDER` | CV | No (unset = AI off) | No | `gemini`, `vertex`, `anthropic` |
| `GEMINI_API_KEY` | CV | With `gemini` | **Yes** | Gemini API key |
| `GEMINI_MODEL` | CV | No | No | Default `gemini-2.5-flash` |
| `GEMINI_TTS_MODEL`, `GEMINI_TTS_VOICE` | CV | No | No | Voice answers (defaults `gemini-2.5-flash-preview-tts`, `Kore`) |
| `GOOGLE_CLOUD_PROJECT` | CV | With `vertex` | No | Project for Vertex AI (set by `cloudbuild.yaml`) |
| `VERTEX_LOCATION` | CV | No | No | Vertex region (default `us-central1`) |
| `ANTHROPIC_API_KEY` | CV | With `anthropic` | **Yes** | Claude API key |
| `ANTHROPIC_MODEL` | CV | No | No | Default `claude-sonnet-5-5` |
| `ELEVENLABS_API_KEY` | CV | No | **Yes** | Optional extra voice vendor (leave unset unless approved) |
| `VOICE_TTS_VOICE_ID` | CV | No | No | ElevenLabs voice |
| `GUEST_REVIEWER_EMAILS` | CV | No | Sensitive list | Non-SCU emails allowed to sign in |
| `ADMIN_EMAILS` | CV | No | Sensitive list | Admin dashboards (usage, feedback) and the super admins of Program Requirements Admin |
| `WORKDAY_SYNC_ADMIN_EMAIL` | CV | No | Sensitive | Data steward allowed to replace section data |
| `WORKDAY_INTEGRATION_ENABLED` | CV | No | No | Keep `false` until SCU authorizes |
| `WORKDAY_AVAILABILITY_ENABLED` | CV | No | No | Live seat availability (default `false`) |
| `WORKDAY_AVAILABILITY_URL` | CV | If enabled | No | SCU-approved endpoint |
| `WORKDAY_AVAILABILITY_AUTH_TOKEN` | CV | If enabled | **Yes** | Credential issued by SCU |
| `WORKDAY_AVAILABILITY_AUTH_HEADER`, `_AUTH_SCHEME`, `_TIMEOUT_MS`, `_CACHE_TTL_SECONDS`, `_LIVE_WITHIN_SECONDS`, `_STALE_AFTER_SECONDS` | CV | No | No | Availability tuning |
| `AVAILABILITY_FIXTURE_ENABLED` | CV | No | No | Dev-only sample seat data (ignored in production) |
| `REQUIREMENTS_BENCHMARK_PROVIDER` | CV | No | No | Requirements source selector (default current Bulletin) |
| `REQUIREMENTS_BULLETIN_EDITION` | CV | No | No | Which loaded Bulletin edition builds the sidebar (default: the latest). See [BULLETIN_BASELINE.md](BULLETIN_BASELINE.md) |
| `MIGRATIONS_DIR` | CV | No | No | Override migration folder |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_CLERK_PROXY_URL` | CV mobile | Mobile only | No | Expo app (not part of the web deployment) |
| `VERCEL`, `VERCEL_URL`, `VERCEL_ENV`, `VERCEL_PROJECT_PRODUCTION_URL` | CV, PH | Set by Vercel | No | Platform-provided on Vercel only |

## PreHealth Advisor only — offline research pipeline (`scripts/`, not deployed)

| Variable | Application | Required | Secret? | Purpose |
|---|---|---|---|---|
| `GEMINI_API_KEY`, `COMPLETION_GEMINI_MODEL` | PH pipeline | For extraction | **Yes** / No | SCU-approved extraction model |
| `OPENAI_API_KEY`, `COMPLETION_MODEL` | PH pipeline | No | **Yes** / No | Leave unset for SCU use |
| `GROQ_API_KEY`, `COMPLETION_GROQ_MODEL` | PH pipeline | No | **Yes** / No | Leave unset for SCU use |
| `SERPER_API_KEY`, `TAVILY_API_KEY`, `FIRECRAWL_API_KEY`, `JINA_API_KEY`, `KEENABLE_API_KEY`, `BROWSERBASE_API_KEY` | PH pipeline | Optional | **Yes** | Search/crawl services for public program pages |
| `COMPLETION_*` tuning (`CONCURRENCY`, `MAX_RENDERS`, budgets, caps) | PH pipeline | No | No | Pipeline limits |
| `PREHEALTH_TEST_DATABASE_URL` | PH tests | No | Test only | Throwaway DB for the ownership integration test |
