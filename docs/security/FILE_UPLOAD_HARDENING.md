# APR Upload Hardening — CampusVal

| Control | Implementation | Limit / behavior |
|---|---|---|
| Authentication | `requireAuth` on upload-link minting, registration, read, replace, delete | 401 signed out; 403 non-SCU |
| Ownership | Object path minted with the caller's owner fingerprint; registration and reads require an **exact** path match (`lib/uploadPath.ts`, tightened this pass) | Another student's path → 403; another student's report ID → 404 |
| Allowed extension + type | `resolveSourceFormat`: `.xlsx` with the XLSX MIME type, or `.pdf` with `application/pdf` (or a generic type some browsers send) | Anything else → 400 `unsupported_type` |
| Content sniffing | PDF must start with `%PDF-`; XLSX must be a real zip with SpreadsheetML parts (`lib/apr/file-guard.ts`) | Wrong bytes → 422, file deleted |
| Maximum file size | Signed upload link capped at `APR_MAX_UPLOAD_MB` (default **10 MB**, hard max 50); server re-reads the real size from storage and caps the in-memory read | Over → 400, file deleted |
| Empty file | Real size 0 → rejected | 400, file deleted |
| Malformed workbook / zip bomb | Zip directory checked before inflating: ≤ 150 MB inflated, ≤ 2,000 entries; workbook ≤ 25 sheets, 20,000 rows, 80 columns, 200,000 cells, 4,000 chars per cell (`lib/apr/limits.ts`) | 422 with a plain-language message, file deleted |
| Macros | `xl/vbaProject.bin` detected (`file-guard.ts`) — CampusVal never executes workbook content; it reads cell values only | Never run |
| Parsing errors | Caught per document; a bad upload never replaces a good one (validated before the database is touched); other documents unaffected | 422 / "import failed" state |
| Filename handling | The user's file name is stored as text only; it is **never** used to build a storage path or a download header — downloads use a fixed name `academic-progress-report.pdf/.xlsx` | No header injection, no path traversal |
| Path traversal | Storage keys are built only from a regex-validated `/objects/uploads/<16 hex>/<uuid>` (all providers) | `..`, extra segments → refused |
| Served content | Only PDF/XLSX types echoed; anything else forced to `application/octet-stream` download; `X-Content-Type-Options: nosniff`; `Content-Security-Policy: sandbox` on downloads; `Cache-Control: private, no-store` (`lib/private-file-response.ts`) | Stored content can't execute in CampusVal's origin |
| Identity mismatch | Report stating a different student ID than the profile → refused, file deleted, other ID never echoed | 422 |
| Abuse / rate | Max **12** APR documents per student; 15-minute single-use-path links; sign-in required | No request-rate limiter in the app — recommend Cloud Armor rate rules at SCU's load balancer |
| Disk | Upload bytes are never written to the server's disk or `/tmp` (except the `local` provider's own private directory) | — |

Tests: `routes/progress-reports.test.ts`, `lib/apr/*.test.ts`, `routes/features.test.ts`, `lib/uploadPath.test.ts`, `lib/storage/gcsProvider.test.ts`.
