# Logging Review — CampusVal

> **Structured logs** — each log line is a JSON object with named fields, which Cloud Logging can search and filter without parsing text.

## How logging works
- **Library:** pino (`artifacts/api-server/src/lib/logger.ts`) — JSON to stdout in production (Cloud Run sends stdout to **Cloud Logging** automatically), pretty-printed in development. Level: `LOG_LEVEL` (default `info`).
- **Request log** (`pino-http` in `app.ts`): request ID, method, **sanitized URL** (query string removed; the signed upload token in `/storage/local-upload/<token>` replaced by `[redacted]` — `lib/log-url.ts`), status code. **No headers, no bodies, no response content.**
- **Redaction:** `Authorization` and `Cookie` request headers and `Set-Cookie` response headers.

## What is never logged (verified by code review)
| Item | How it is kept out |
|---|---|
| Grades, APR contents, uploaded file bytes, file names, storage paths | APR/checksheet routes log **event names + categories only** (`apr_upload_started`, `apr_workbook_validated`, `apr_processing_failed { category }`, `apr_orphaned_object { reportId }`). The file header of `routes/progress-reports.ts` states the rule. |
| AI prompts, answers, voice transcripts | `ai_request_failed { errorName, status }` / `voice_request_failed { route, errorName }` only (changed this pass — before, provider error messages were logged and also sent to the browser) |
| Access tokens, session tokens, API keys | Header redaction; tokens never placed in log fields; upload token redacted from URLs |
| Passwords, database credentials | Never logged; config errors name the **variable**, never the value (`lib/config.ts`) |
| Student names, emails, IDs, GPA | Not logged by routes; request log has no user fields |

## Review findings and changes (this pass)
- `console.log` / `console.error` appear only in operator CLIs (`migrate.ts`, `config-check.ts`) — migration names and status, no data.
- **Changed:** AI and voice routes previously wrote the raw provider error into the response (and logs), which could include configuration names; now a fixed message goes to the browser and only the error class/status to the log.
- **Changed:** unhandled errors now go through a final JSON error handler that logs `unhandled_error` server-side and returns a generic message (no stack trace / SQL / paths to the client). Test: `app.error-handling.test.ts`.
- **Residual:** an unexpected exception is logged with its `err` object (stack + message). A PostgreSQL error message can occasionally quote a value (e.g. a unique-constraint violation). Keep Cloud Logging access limited to operators (`roles/logging.viewer`), and keep `LOG_LEVEL=info`.

## Recommended Cloud Logging setup
- Default `_Default` bucket retention (30 days) is sufficient for application logs; route security-relevant audit logs to a locked bucket per SCU policy.
- Enable **Data Access audit logs** for Cloud SQL, Cloud Storage (APR bucket) and Secret Manager.
- Do **not** enable PostgreSQL statement logging with parameters.
- Alert on `apr_orphaned_object`, `account_delete_orphaned_objects`, `unhandled_error`, and 5xx rates.
