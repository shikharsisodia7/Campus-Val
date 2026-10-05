# FERPA / Sensitive Data Inventory

Covers **both** SCU applications: **CampusVal** (`Campus-Val` repository) and **PreHealth Advisor** — the SCU Health Professions Peer Advisors prerequisite tool (`prehealth-Advisor` repository). The same file is kept in both repositories.

Built from the database schemas and routes, not from assumptions. October 2026.

> **Terms**
> - **FERPA** — the U.S. law protecting student education records. Grades, course history, schedules and academic progress are education records once a university maintains them.
> - **Clerk** — the third-party sign-in service both apps use *temporarily* until SCU single sign-on (SSO) replaces it.
> - **Persistence** — how long the data is kept.
> - **"Owner only"** — the application returns the data only to the signed-in user it belongs to; every database query filters by that user's ID.

## CampusVal

| Data | Application | Source | Stored Where | Persistence | Access (in the app) | FERPA/Sensitive | Notes |
|---|---|---|---|---|---|---|---|
| Account identity (user ID, sign-in session) | CampusVal | Clerk sign-in | Clerk (vendor). The opaque Clerk user ID is the `user_id` key in every CampusVal table | Until the Clerk account is removed | The user; Clerk admins | Sensitive | Replaced by SCU SSO subject after migration ([SCU_SSO_MIGRATION.md](../migration/SCU_SSO_MIGRATION.md)) |
| Email address | CampusVal | Clerk | Clerk; copies in `student_profiles.email`, `usage_events.user_email`, `feedback.email`, `plan_shares.advisor_email` | Until deleted | Owner; admins see usage/feedback emails | Directory info / PII | Used for the `@scu.edu` / reviewer gate and admin allowlist |
| Name | CampusVal | Student types it at onboarding | `student_profiles.name` | Until account deletion | Owner only | PII | **No longer sent to the AI provider** (this pass) |
| Student identifier | CampusVal | Optional, student types it | `student_profiles.student_id` | Until account deletion | Owner only | **FERPA** | Used only to refuse an APR that names a different student ID |
| GPA (cumulative, major) | CampusVal | Optional, student types it | `student_profiles.cumulative_gpa`, `major_gpa` | Until account deletion | Owner only | **FERPA** | **No longer sent to the AI provider** (this pass) |
| Completed courses | CampusVal | Student enters / marks complete | `student_profiles.completed_course_codes`, `plan_items` (term `completed`), `requirement_completions`, `requirement_customizations` | Until deleted | Owner; an advisor the student shared a plan with (degree plan only) | **FERPA** | Course codes are sent to the AI provider (needed for prerequisite advice) — see AI row |
| Grades | CampusVal | Inside the uploaded APR | `progress_reports.workbook` (JSONB) | Until the APR or account is deleted | Owner only (sidebar strips grades server-side) | **FERPA** | Not sent to AI, not logged, not visible to advisors |
| APR file (original Excel/PDF) | CampusVal | Student uploads Workday export | Private object storage: **Vercel Blob** today → private **GCS bucket** (target) | Until replaced/deleted/account deleted | Owner only | **FERPA** | [APR_STORAGE_AUDIT.md](APR_STORAGE_AUDIT.md) |
| APR parsed contents | CampusVal | Server reads the file | `progress_reports.workbook`; legacy `parsed`, `progress_report_mappings` | Same as file | Owner only | **FERPA** | Structural copy, including grades |
| Degree plan | CampusVal | Student builds it | `academic_plans` (`plan_type = degree`), `plan_items`, `requirement_customizations` | Until deleted | Owner; advisor via share (`degree_plan` scope) | **FERPA** | |
| Quarter plan / schedules | CampusVal | Student builds it | `quarter_schedules`, `schedule_events` (sections, personal commitments: work, athletics, notes) | Until deleted | Owner only | **FERPA** + personal | Commitments may reveal personal life (job, team) |
| Tentative plans | CampusVal | Student builds them | `academic_plans` (`plan_type = tentative`), `plan_items` | Until deleted | Owner; advisor via share (`tentative_degree_plan` scope) | **FERPA** | |
| Degree checksheets | CampusVal | Student uploads program checksheet + marks progress | Object storage (same as APR) + `degree_checksheet_documents`, `degree_checksheet_annotations` | Until deleted | Owner only | **FERPA** (annotations = progress) | Checksheet file itself is usually a public program document |
| Advisor shares | CampusVal | Student grants an advisor email | `plan_shares` | Until revoked/account deleted | Student and named advisor | Sensitive | Never grants APR access |
| AI advisor conversations | CampusVal | Student's questions + AI answers | `conversations`, `messages` | Until deleted | Owner only | **FERPA** (questions may describe the student's record) | Content is sent to the AI provider for each answer |
| Voice questions (audio) | CampusVal | Student's microphone | Memory only for one request; sent to the AI provider for transcription | Not stored | — | Sensitive | No audio is written to disk or database |
| Data sent to AI provider | CampusVal | Built per request | Leaves CampusVal to Gemini/Vertex AI/Claude | Per provider's terms | — | **FERPA (limited)** | Program, timeline, units, completed course codes, the conversation. **Never** name, IDs, GPA, grades, APR, schedules ([AI_PROVIDER_MIGRATION.md](../migration/AI_PROVIDER_MIGRATION.md)) |
| Feedback / error reports | CampusVal | Student submits | `feedback` | Until account deletion | Submitter; admins | Low–PII (email) | |
| Usage analytics | CampusVal | Page/feature visits | `usage_events` (user ID, email, feature, time) | Until account deletion | Admins (aggregate dashboard) | PII | |
| Browser-local planner drafts | CampusVal | Student's browser | `localStorage` keys `campusval.apib.v1`, `campusval.planner.v1`, `campusval.schedule.v2` | Until cleared / "Delete account" | That browser only | FERPA (on shared lab machines) | Cleared by "Delete account" |
| Course catalog, sections, requirements | CampusVal | SCU Bulletin + Registrar (public) | Bundled JSON + `course_sections` | Release lifetime | Everyone signed in | Public | [SCU_BULLETIN_DATA_FLOW.md](../architecture/SCU_BULLETIN_DATA_FLOW.md) |

## PreHealth Advisor

PreHealth Advisor stores **no health information**, no APRs, no transcripts and no uploaded files. It is a lookup tool over **public** program prerequisites plus a small personal planner.

| Data | Application | Source | Stored Where | Persistence | Access (in the app) | FERPA/Sensitive | Notes |
|---|---|---|---|---|---|---|---|
| Account identity (user ID, session) | PreHealth Advisor | Clerk sign-in (its own Clerk app) | Clerk; Clerk user ID stored as `owner_user_id` / `reporter_user_id` | Until Clerk account removal | The user; Clerk admins | Sensitive | |
| Email, name, profile photo | PreHealth Advisor | Clerk (Google sign-in may supply name/photo) | **Clerk only** — not stored in the app database | Clerk's retention | The user | PII | Privacy page: `artifacts/prehealth-advisor/src/pages/privacy.tsx` |
| Prerequisite tracker (course, status, **grade**, credits, notes) | PreHealth Advisor | User types it | `prereq_courses` | Until the user deletes it (per row or "Delete my data") | **Owner only** (fixed this pass — was visible to every signed-in user) | **Sensitive / FERPA-like** (self-reported grades) | 5 legacy rows with no owner exist in production; hidden from everyone |
| Target schools (program, status, deadline, notes) | PreHealth Advisor | User types it | `target_schools` | Until deleted (per row or "Delete my data") | **Owner only** (fixed this pass) | Sensitive (application plans) | 3 legacy unowned rows in production; hidden |
| Error reports | PreHealth Advisor | User submits "Report an Error" | `program_error_reports` (issue, description, program, optional contact email, reporter ID) | Until resolved/purged by an operator; "Delete my data" removes the email and reporter ID | Submitter writes; reviewed by the developer via database tooling | Low–PII | No in-app admin screen |
| Prerequisite database (programs, schools, requirements, sources) | PreHealth Advisor | Public program web pages + accreditor directories | `professions`, `program_schools`, `directory_sources` | Release lifetime | Everyone signed in | Public | Built by the offline research pipeline in `scripts/` |

**Not collected by PreHealth Advisor:** health information, student IDs, GPA, transcripts, APRs, schedules, uploaded files, AI conversations. The web app makes no AI calls.

## Summary for reviewers

- **Highest-sensitivity data:** CampusVal APR files and their parsed copies (grades), GPA, student ID, completed coursework and plans.
- **Where it lives today:** Neon PostgreSQL (via Vercel) and Vercel Blob; Clerk for identity.
- **Target:** Cloud SQL (private IP) and a private GCS bucket inside SCU's GCP project; SCU SSO for identity.
- **Leaves the application:** only the minimized advisor context to the AI provider (CampusVal), and identity data to Clerk until SSO.
