# APR Storage Audit

**Scope:** where a student's Academic Progress Report (APR) goes in CampusVal, from the moment they pick the file until it is deleted.
**Method:** traced in source code (branch `scu/gcp-migration-readiness`, October 2026). Every statement below cites the file that implements it. No real student data was opened for this audit.

> **Terms used here**
> - **APR** — the Academic Progress Report a student exports from Workday (as Excel `.xlsx` or PDF). It lists requirements, courses, academic periods, units and **grades**. FERPA-protected.
> - **Object storage** — a service that stores whole files ("objects") by name, like a private file locker. Vercel Blob and Google Cloud Storage are object stores.
> - **Signed / presigned URL** — a web address that grants one specific action (e.g. "upload this one file") for a few minutes, then expires.
> - **Owner segment** — a 16-character fingerprint of the student's user ID (SHA-256, truncated) that is built into every stored file's name, so the file name itself says who owns it.

## Executive Answer

**Original APR file stored permanently:** **YES** — until the student deletes or replaces it, or deletes their account. It is kept on purpose: students can reopen/download the original, and a PDF whose table cannot be read is kept as "original only".

**Current storage provider:** **Vercel Blob**, a *private* store (production env var `BLOB_READ_WRITE_TOKEN`; provider selected in `artifacts/api-server/src/lib/config.ts → resolveStorageProvider`, implemented in `lib/storage/vercelBlobProvider.ts`).

**Current storage location:** object name `progress-reports/<owner segment>/<random UUID>` inside the project's private Blob store. Never written to the server's disk or `/tmp`.

**APR-derived information stored:** a full structural copy of the workbook (every sheet, row and cell — **including the Grade, Academic Period and Units columns**) in PostgreSQL, table `progress_reports`, column `workbook` (JSONB), plus file metadata (name, size, type, SHA-256 hash, upload time, label). Hosted today on Neon PostgreSQL (via Vercel).

**Who can access it:**
- **Through the application:** only the student who uploaded it. Every APR route requires sign-in and filters by the signed-in user's ID. No advisor, admin or share link can read an APR.
- **Outside the application (technically):** anyone holding production credentials — the Neon database password (can read `progress_reports.workbook`), the Vercel Blob read/write token (can read files), or admin access to the Vercel/Neon accounts. Today that is the developer's accounts. See [ACCESS_CONTROL.md](ACCESS_CONTROL.md).

## Upload Flow

1. **Student picks a file** on the APR page (`artifacts/scu-advising/src/pages/progress-report.tsx`). The page says Excel (`.xlsx`) or PDF.
2. **Browser asks CampusVal for an upload link** — `POST /api/storage/uploads/request-url` with name, size and type only, **not the file** (`artifacts/scu-advising/src/hooks/use-apr-documents.ts → useAprUpload.send`). The server requires sign-in, then mints an object path containing the student's owner segment and a random UUID, and a 15-minute signed upload link limited to that one path, the declared content type and the size cap (`routes/storage.ts`, `lib/storage/vercelBlobProvider.ts → createUploadTarget`).
3. **Browser uploads the bytes directly to Vercel Blob** with that signed link (`PUT`). The file does **not** pass through the CampusVal server on Vercel. *(With the new `gcs` and existing `local` providers, the browser instead PUTs to CampusVal at `/api/storage/local-upload/<token>`, which writes to the private bucket/volume.)*
4. **Browser registers the upload** — `POST /api/progress-reports` with the object path, label, file name, size and type (`routes/progress-reports.ts`).
5. **Server validates before saving anything** (`routes/progress-reports.ts → intake`):
   - extension **and** declared type must agree on `.xlsx` or `.pdf` (`resolveSourceFormat`);
   - the object path must have been minted for **this** student (`isUploadPathOwnedBy`) — otherwise 403;
   - real size is read from storage, not trusted from the browser; empty or over the limit (default 10 MB, `APR_MAX_UPLOAD_MB`) → file deleted, 400;
   - the bytes are downloaded **into memory** (never disk) with a hard size cap.
6. **Server reads the file** — Excel: `lib/apr/workbook-reader.ts` (exceljs; zip-bomb guard in `lib/apr/file-guard.ts`, limits in `lib/apr/limits.ts`); PDF: magic-byte check `%PDF-`, then `lib/apr/pdf-table-reader.ts`. Unreadable/malformed → file deleted, 422.
7. **Identity guard** — if the file states a student ID and the student's profile has one on record and they differ, the file is deleted and refused ("appears to belong to a different student"). The other ID is never echoed back (`lib/apr/identity.ts`).
8. **Saved** — one row in `progress_reports` with the structural `workbook` copy and the object path. The response to the browser omits the object path and user ID (`documentDto`). Max 12 APR documents per student.
9. **Shown** — the sidebar endpoint drops the Academic Period, Units and Grade columns **on the server** before sending (`lib/apr/sidebar-projection.ts`); the full workbook and the original file are only returned to their owner (`GET /progress-reports/:id/workbook`, `GET /progress-reports/:id/file`), with `Cache-Control: private, no-store`.

## Code Locations

| Purpose | File | Function/Route |
|---|---|---|
| Upload page | `artifacts/scu-advising/src/pages/progress-report.tsx` | `ProgressReportPage` |
| Browser upload flow | `artifacts/scu-advising/src/hooks/use-apr-documents.ts` | `useAprUpload` |
| Mint signed upload link | `artifacts/api-server/src/routes/storage.ts` | `POST /api/storage/uploads/request-url` |
| Receive upload (local / gcs providers) | `artifacts/api-server/src/routes/storage.ts` | `PUT /api/storage/local-upload/:token` |
| Storage provider choice | `artifacts/api-server/src/lib/config.ts`, `lib/storage/index.ts` | `resolveStorageProvider`, `getPrivateObjectStorage` |
| Vercel Blob (production today) | `artifacts/api-server/src/lib/storage/vercelBlobProvider.ts` | `VercelBlobObjectStorageProvider` |
| Google Cloud Storage (target) | `artifacts/api-server/src/lib/storage/gcsProvider.ts` | `GcsObjectStorageProvider` |
| Owner binding of file paths | `artifacts/api-server/src/lib/uploadPath.ts` | `uploadPathOwnerSegment`, `isUploadPathOwnedBy` |
| Register, list, replace, delete, download | `artifacts/api-server/src/routes/progress-reports.ts` | `/api/progress-reports[...]` |
| Validation + processing | same | `intake`, `resolveSourceFormat`, `readPdfTable` |
| Excel reader / zip guard / limits | `lib/apr/workbook-reader.ts`, `lib/apr/file-guard.ts`, `lib/apr/limits.ts` | `readAprWorkbook`, `guardXlsxBytes`, `APR_LIMITS` |
| PDF table reader | `lib/apr/pdf-table-reader.ts` | `readAprPdf` |
| Grade/period/units removal for sidebar | `lib/apr/sidebar-projection.ts` | `projectForSidebar` |
| Safe file download headers | `lib/private-file-response.ts` | `sendPrivateFile` |
| Database table | `lib/db/src/schema/progress-reports.ts` | `progress_reports` |
| Account deletion | `artifacts/api-server/src/routes/profile.ts` | `DELETE /api/profile` |

## Original File Lifecycle

| Stage | What happens | Where |
|---|---|---|
| Upload | Browser → private object store via 15-minute signed link | Vercel Blob (today) / GCS bucket (target) |
| Validation | Downloaded into server memory, read, discarded from memory | Server RAM only — no disk, no `/tmp` |
| Rejected upload | Deleted from storage immediately (`discard`) | — |
| Accepted | **Kept** under `progress-reports/<owner>/<uuid>` | Object store |
| Replaced | New file validated first; on success the row points to it and the old file is deleted | — |
| Deleted by student | Row deleted, then file deleted (2 attempts; a failure is logged by report ID for an operator) | — |
| Account deleted | All the student's APR rows and files deleted (fixed in this pass — see Identified Risks) | — |
| Download | Only via `GET /api/progress-reports/:id/file` by the owner, streamed through the server with a fixed generic filename, `nosniff`, `no-store` | — |

There is **no public URL** for an APR. Vercel Blob read links are minted server-side for 5 minutes, used by the server itself, and never sent to the browser. With GCS no URL is minted at all — the server reads with its service-account credentials.

## Parsed Data Lifecycle

- `progress_reports.workbook` (JSONB) holds the structural copy, including grades. Created at upload; replaced atomically with the file on replace; deleted with the row.
- `progress_reports.parsed` (JSONB) is a **legacy** column from the retired parser; it is set to null on replace and never written by current code.
- `progress_report_mappings` is a **legacy** table from a retired course-mapping feature; rows are deleted when the student's last APR is deleted and on account deletion.
- Grades are **not** copied into any other table, are not sent to the AI provider, and are not logged.

## Database Tables

| Table / column | Contents | Sensitive |
|---|---|---|
| `progress_reports.workbook` | Every cell of the APR: requirement rows, courses, academic period, units, **grade** | **FERPA** |
| `progress_reports.file_name`, `label`, `category` | Student-chosen file name and label | FERPA (may identify the student) |
| `progress_reports.object_path` | `/objects/uploads/<owner>/<uuid>` — pointer to the original | Internal |
| `progress_reports.file_hash`, `file_size`, `content_type`, `uploaded_at` | File metadata | Low |
| `progress_reports.parsed` | Legacy, unused | — |
| `progress_report_mappings` | Legacy course-code mappings | FERPA (course history) |
| `student_profiles.student_id` | Optional SCU student ID, used by the identity guard | FERPA |

## Authorization Checks

| Route | Signed-in required | Ownership check |
|---|---|---|
| `POST /api/storage/uploads/request-url` | Yes (`requireAuth`) | Path minted with the caller's owner segment |
| `PUT /api/storage/local-upload/:token` | No — the 15-min HMAC token *is* the authorization (like a presigned URL) | Token bound to one path, size and type |
| `GET /api/storage/objects/*` | Yes | `canRead` = owner segment matches caller |
| `GET/POST /api/progress-reports` | Yes | Query `WHERE user_id = caller`; registration refuses another student's path (403) |
| `GET/PATCH/DELETE /api/progress-reports/:id` | Yes | `WHERE id = ? AND user_id = caller` → another student's ID is a 404 |
| `PUT /api/progress-reports/:id/file` | Yes | Same, plus path ownership on the new file |
| `GET /api/progress-reports/:id/workbook`, `/file` | Yes | Same; `/file` re-checks ownership in the storage layer |
| `GET /api/progress-reports/sidebar` | Yes | Caller's documents only; grade/period/units removed |
| Advisor sharing (`/api/advisor/shared-students/...`) | Yes | **No APR access** — `"apr"` is deliberately not a valid share scope (`routes/plan-shares.ts`) |

"Signed in" also means admitted by the access policy (`lib/auth/policy.ts`): in pilot mode, an invited tester, invited reviewer, administrator or department administrator.

Tests: `routes/progress-reports.test.ts`, `routes/features.test.ts`, `lib/uploadPath.test.ts`, `lib/storage/gcsProvider.test.ts`, `routes/profile.delete-account.test.ts`.

## Identified Risks

| # | Risk | Status |
|---|---|---|
| 1 | **Ownership check used `startsWith`.** A path like `/objects/uploads/<mine>/../<other>/<uuid>` passed the owner check; once the Vercel Blob provider turned it into a URL, `..` resolves to another student's object. Exploiting it required guessing the other file's random UUID, but the check was wrong. | **Fixed** — `lib/uploadPath.ts` now accepts only the exact minted shape `/objects/uploads/<16 hex>/<uuid>`. Test: `lib/uploadPath.test.ts`. Affects APR and checksheet routes. |
| 2 | **"Delete account" left APR data behind.** `DELETE /api/profile` (the "Delete account" button) said it wiped everything but removed only the profile and AI chats — APR rows (with grades), APR files, checksheets, plans, schedules and shares survived. | **Fixed** — now deletes every row the student owns in one transaction, then their stored files. Test: `routes/profile.delete-account.test.ts` (16 data categories). |
| 3 | Original APR is retained indefinitely while the account exists. | Open — retention policy is SCU's decision. See [DATA_RETENTION.md](DATA_RETENTION.md). |
| 4 | The structural copy keeps grades in the database even though the sidebar hides them. | By design (the student can view their own full APR). Documented; protected by owner-only routes. |
| 5 | Production database and Blob credentials are held by the developer; Neon credentials are stored on Vercel as "Non-sensitive" variables. | Open — moves to SCU Secret Manager + IAM in the GCP migration. Recommend rotating on cut-over. |
| 6 | No per-user rate limit on upload links. | Mitigated by sign-in, 12-document cap, size cap, 15-minute single-path links. Recommend Cloud Armor rate limiting at SCU's load balancer. |
| 7 | Clerk (an external identity vendor) holds the user's email/session. | Open until SCU SSO replaces it — [SCU_SSO_MIGRATION.md](../migration/SCU_SSO_MIGRATION.md). |
| 8 | Orphaned files if storage deletion fails after a row is deleted. | Logged (`apr_orphaned_object`, `account_delete_orphaned_objects`) with no file names; operator cleanup. |

## Recommended GCP Architecture

- **Keep the original** (current behavior, option B in [CLOUD_STORAGE.md](../migration/CLOUD_STORAGE.md)): set `PRIVATE_STORAGE_PROVIDER=gcs`, `GCS_BUCKET=<private bucket>`, `STORAGE_SIGNING_SECRET` from Secret Manager.
- Bucket: uniform bucket-level access, **public access prevention enforced**, Google-managed or SCU CMEK encryption, no public or `allUsers` bindings, located in the same region as Cloud Run.
- The Cloud Run service account gets `roles/storage.objectUser` **on this bucket only**. No developer has standing access to the bucket in production.
- Uploads flow browser → CampusVal → bucket; no signed GCS URLs and no bucket CORS are needed.
- Database: Cloud SQL for PostgreSQL with private IP, automated backups, and IAM-restricted access ([CLOUD_SQL.md](../migration/CLOUD_SQL.md)).
- Optional, for SCU to decide: an object lifecycle/retention rule and a scheduled purge of inactive accounts ([DATA_RETENTION.md](DATA_RETENTION.md)).
