# Access Control — who can access what

Covers **CampusVal** and **PreHealth Advisor**. Kept identical in both repositories.

> **Terms**
> - **Authentication** — proving who you are (signing in).
> - **Authorization** — what you are allowed to do once signed in.
> - **IAM** (Identity and Access Management) — Google Cloud's system of roles that decides which people and service accounts may touch which cloud resources.
> - **Service account** — a non-human Google identity that a running program (here, the Cloud Run service) uses to reach the database, storage and AI.
> - **Break-glass** — a temporary, logged, approved grant of elevated access for an emergency.

## 1. Inside the applications

### Is there an application administrator?

- **CampusVal:** yes, a narrow one. Accounts whose email is listed in the `ADMIN_EMAILS` environment variable may open `/admin/usage` and `/admin/feedback` (usage counts and the feedback/error-report queue; `routes/usage.ts`, `routes/feedback.ts`, enforced by `requireRole("admin")` in `lib/auth`). **Admins cannot see any student's APR, grades, plans, schedules or conversations** — no admin route reads them. The list is empty unless someone sets it; there is no default admin and none was created in this work.
- **CampusVal data steward:** the single account named by `WORKDAY_SYNC_ADMIN_EMAIL` may replace the shared course-section data by pasting a Workday section list (`POST /api/sections/sync`). It grants no access to any student's data. Unset = nobody can.
- **CampusVal advisors:** not a role. A student may share their degree plan and/or tentative plan with a named advisor email (`plan_shares`). The advisor sees only that student's shared plan(s), checked on every request. APR sharing does not exist.
- **PreHealth Advisor:** **no administrator feature exists.** Every signed-in user has the same access: the public prerequisite database plus their own planner rows.

### What a signed-in user can reach

| | CampusVal | PreHealth Advisor |
|---|---|---|
| Who may use it | Pilot mode (default): only `ADMIN_EMAILS`, `PILOT_TESTER_EMAILS`, `GUEST_REVIEWER_EMAILS` and department administrators with a program scope — an `@scu.edu` address alone is refused. (`institution` mode, not used: every `@scu.edu` account too.) | Any account that can sign in to its Clerk app (pilot group) |
| Own data | Profile, APRs, plans, schedules, checksheets, conversations — owner only | Prerequisite tracker, target schools — owner only |
| Other users' data | None (advisor sees a plan only when the student shares it) | None (fixed in this pass) |
| Shared reference data | Course catalog, requirements, sections | Prerequisite database |

## 2. People and systems — the matrix

**Today** = Vercel + Neon + Vercel Blob + Clerk, all held by the developer's accounts.
**Target** = SCU's GCP project with the controls in section 3.

| Role | Application | Database | Uploaded Files (APRs) | Logs | Secrets |
|---|---|---|---|---|---|
| **Student / User** | Own data only, after sign-in | No direct access | Own APRs only, through the app | No | No |
| **Developer** — today | Same as any user (plus admin if on `ADMIN_EMAILS`) | **Full** (holds Neon credentials) | **Full** (holds the Blob token) | Full (Vercel) | Full (Vercel env vars) |
| **Developer** — target | Same as any user | **None in production** by default; break-glass only | **None in production** | Read logs (no student content is logged) | None in production; may *add* new secret versions if SCU allows |
| **Application administrator** (CampusVal `ADMIN_EMAILS`) | Usage + feedback dashboards | No direct access | **No** | No | No |
| **Database administrator** (SCU) | — | Full on Cloud SQL (can read FERPA tables) | Can read APR **copies** in `progress_reports.workbook`; not the files | Cloud SQL audit logs | Database credentials only |
| **GCP administrator** (SCU) | Can deploy/configure | Can grant themselves access | Can grant themselves access | Full | Full | 
| **Service account** (Cloud Run runtime) | Is the app | Connects as the app's DB user | `roles/storage.objectUser` on the APR bucket only | Writes logs | Reads only its own secrets |
| **Cloud Build service account** | Deploys new versions | Runs migrations (CampusVal) via a job using the runtime SA | No | Writes build logs | No (deploy references secret *names*) |
| **Pilot tester / external reviewer** | CampusVal: only if on `PILOT_TESTER_EMAILS` / `GUEST_REVIEWER_EMAILS`; PreHealth Advisor: pilot account | No | No (only their own uploads) | No | No |

Notes:
- The AI provider (CampusVal) receives only the minimized advisor context per request; it has no standing access to any store.
- Clerk (until SSO) holds identities and can be administered by whoever owns the Clerk application — today the developer.

## 3. Restricting production with GCP IAM (target)

1. **Separate project** for each environment (production vs. staging), owned by SCU.
2. **One runtime service account per app**, granted only:
   - `roles/cloudsql.client` (connect to Cloud SQL),
   - `roles/secretmanager.secretAccessor` **on its own secrets only** (resource-level binding, not project-wide),
   - CampusVal: `roles/storage.objectUser` **on the APR bucket only**; `roles/aiplatform.user` if `AI_PROVIDER=vertex`,
   - `roles/logging.logWriter`.
3. **Developers:** `roles/run.viewer`, `roles/logging.viewer`, `roles/cloudbuild.builds.viewer` on production. No `cloudsql.*`, no `storage.objectViewer` on the APR bucket, no `secretmanager.secretAccessor`. Deploys happen through Cloud Build triggers, not personal credentials.
4. **Database access for humans** through Cloud SQL IAM database authentication with named accounts, granted temporarily (break-glass) with a ticket, and recorded by **Cloud Audit Logs** (enable Data Access logs for Cloud SQL, Cloud Storage and Secret Manager).
5. **No public access:** bucket public-access prevention enforced; Cloud Run ingress `internal-and-cloud-load-balancing` ([NETWORK_ACCESS.md](../migration/NETWORK_ACCESS.md)).
6. **Org policies** SCU may apply: `iam.disableServiceAccountKeyCreation` (no key files — the apps don't need any), `storage.publicAccessPrevention`, `sql.restrictPublicIp`.

## 4. AI requests (CampusVal)

Only the runtime service account (Vertex AI) or the configured API key (Gemini API / Anthropic) can call the AI provider. Requests are made server-side; the browser never holds AI credentials. Prompts and answers are **not** logged. Conversation text is stored in `messages` (owner only).
