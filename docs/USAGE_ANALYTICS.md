# CampusVal — Usage Analytics

The professor asked to know who is using CampusVal, how often, and which
high-level features they use — without any visibility into academic-record
content. This is a first-party, privacy-preserving usage log, admin-only.

## What is recorded

One row per feature visit, in the `usage_events` table
(`lib/db/src/schema/usage-events.ts`):

- `userId`, `userEmail` — from the verified Clerk session server-side
  (`req.userId`/`req.userEmail`), never from anything the client sends.
- `userType` — `"scu"` or `"external_reviewer"`, derived the same way
  `requireAuth` decides access (`@scu.edu` vs. the `GUEST_REVIEWER_EMAILS`
  allowlist).
- `feature` — one of a fixed, server-enforced allowlist
  (`USAGE_FEATURES` in `artifacts/api-server/src/routes/usage.ts`):
  `dashboard`, `degree_plan`, `tentative_degree_plan`, `quarter_plan`,
  `apr_upload`, `four_year_plan`, `plan_controls`, `find_courses`,
  `workday_handoff`.
- `createdAt` — timestamp.

That's the entire schema. There is no free-text field.

## What is NOT recorded

- Course codes, course titles, grades, GPA, or any Academic Progress Report
  content.
- Uploaded file names or file content.
- Query strings, search terms, or any user-typed text.
- Click coordinates, keystrokes, or session replay of any kind.
- Which specific courses/sections a student plans or schedules.

The server rejects (`400`) any `feature` value outside the fixed allowlist,
so the client can never smuggle a course code or search term into this table
by sending it as the "feature" — see `routes/usage.test.ts`.

## Why it's recorded this way

The professor's stated need was product usage (who's using it, how often,
which features), not academic surveillance. The schema only holds fields
answerable from that need; nothing else was added "in case it's useful
later."

## Who can view it

`GET /api/admin/usage/summary` is gated by `requireAuth` (must be signed in)
**and** `requireAdmin`, which checks the caller's email against `ADMIN_EMAILS`
— a comma-separated env var on the `campusval` Vercel project, matched
case/whitespace-insensitively, mirroring the existing `GUEST_REVIEWER_EMAILS`
pattern in `middlewares/requireAuth.ts`. It is never exposed to the frontend
and never hardcoded in source. A normal SCU user or an external reviewer who
isn't separately listed in `ADMIN_EMAILS` gets `403`.

The dashboard itself lives at `/admin/usage`
(`artifacts/scu-advising/src/pages/admin-usage.tsx`) and shows:

- Active users in the last 7 days.
- Feature usage: visit count and unique users per feature.
- Users: email, SCU/external-reviewer type, first seen, last seen, total
  events.

## Adding an admin

```bash
vercel env rm ADMIN_EMAILS production --yes   # if one already exists
vercel env add ADMIN_EMAILS production
# paste: professor@scu.edu,other-admin@scu.edu
vercel deploy --prod   # env var changes need a fresh deploy to take effect
```

## Client-side instrumentation

`useTrackUsage(feature)` (`artifacts/scu-advising/src/hooks/use-track-usage.ts`)
fires one fire-and-forget `POST /api/usage-events` the first time a component
mounts with that feature. It is wired into `Dashboard`, `Degree Plan`,
`Tentative Degree Plan`, `Quarter Plan`, `APR Upload`, and opening the
`Plan Controls` panel. Failures (signed out, offline, etc.) are swallowed —
analytics must never affect the product experience. `four_year_plan`,
`find_courses`, and `workday_handoff` are defined in the server allowlist but
not yet wired to a UI trigger; wiring one is a single `useTrackUsage(...)`
call at that trigger, same as the others.
