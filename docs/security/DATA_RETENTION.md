# Data Retention and Deletion — CampusVal

This is a **design review**. Nothing here deletes existing data automatically; retention periods are SCU's decision. "Delete account" behavior was fixed in this pass (see below).

## Per data type

| Data | Why it is needed | Needs permanent persistence? | Recommended retention | How it is deleted today |
|---|---|---|---|---|
| Original APR file | Student can reopen/download it; PDF may be "original only"; lazy re-import | No — only while the student uses CampusVal | Until the student deletes it; purge after **N months of account inactivity** (SCU to set, e.g. 12) | Delete/replace in the APR page; "Delete account" |
| APR structured copy (`progress_reports.workbook`, grades) | Shows the report as exported | No | Same as the file (deleted together) | Same |
| Legacy `progress_reports.parsed`, `progress_report_mappings` | None (retired features) | No | Could be dropped by a migration after SCU review | Last-APR delete; "Delete account" |
| Profile (name, student ID, GPA, completed courses) | Personalizes planning | No | Account lifetime + inactivity purge | "Delete account" |
| Degree / tentative plans, plan items, customizations, completions | Core feature | No | Account lifetime | Per-item delete; "Delete account" |
| Quarter schedules + commitments | Core feature | No | Account lifetime; old terms could be purged after 1 year | Per-schedule delete; "Delete account" |
| Degree checksheets + annotations | Feature | No | Account lifetime | Delete; "Delete account" |
| Advisor shares | Student-controlled sharing | No | Until revoked | Revoke; "Delete account" |
| AI conversations | History for the student | No | e.g. 1 academic year; or not stored at all if SCU prefers | Per-conversation delete; "Delete account" |
| Feedback / error reports | Data-quality fixes | No | Until resolved + 1 year | "Delete account" (own reports) |
| Usage events (user, email, feature) | Pilot analytics | No | 90–180 days, then aggregate | "Delete account" |
| Logs | Operations, security | No | Cloud Logging default 30 days; security audit logs per SCU policy | Automatic (log retention) |
| Database backups | Recovery | Bounded | Per SCU policy (e.g. 30 days); deleted data persists in backups until they expire — document this to students | Backup expiry |
| Identity (Clerk today) | Sign-in | No | Until account deletion | **Not deleted by CampusVal** — Clerk account remains (see gap) |

## What happens when a student deletes their account
`DELETE /api/profile` (the "Delete account" button on the profile page, `artifacts/scu-advising/src/pages/onboarding.tsx`):

1. **One database transaction** deletes every row the student owns: APR records (with the grade-bearing copy), legacy mappings, checksheets + annotations, plans + plan items + customizations, requirement completions, schedules + events, advisor shares they granted, AI conversations + messages, their feedback, their usage events, and the profile.
2. Then their **stored files** (APRs, checksheets) are deleted from object storage. A file that cannot be removed is logged by **count only** for an operator to clear.
3. The browser clears CampusVal's local planner drafts and signs out.

**Fixed in this pass:** previously only the profile and AI conversations were deleted; APRs, files, plans and everything else silently remained. Test: `artifacts/api-server/src/routes/profile.delete-account.test.ts` (checks all 16 data categories, and that another student's data is untouched).

**Remaining gaps:**
- The identity-provider account (Clerk today) is not deleted; with SCU SSO this is moot (SCU owns identities).
- Data remains in database backups until they expire.
- Shares where this student is the *advisor* belong to other students and are kept.

## After testing
- Use only synthetic accounts (`e2e-*+clerk_test@scu.edu`, `qatest@scu.edu`) and synthetic APR fixtures (`artifacts/api-server/src/__fixtures__/apr`). Never a real student's APR.
- Test suites that touch a database delete their own rows; run them only against a throwaway database (never production).
- After a staging test cycle, delete the synthetic users via "Delete account" (removes all their rows and files).

## Recommended (not implemented — needs SCU policy)
- A scheduled Cloud Run Job that purges accounts inactive longer than SCU's retention period, using the same deletion code.
- A bucket lifecycle rule as a backstop (delete objects older than the maximum retention).
- A short retention notice on the APR and AI pages.
