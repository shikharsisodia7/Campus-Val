# CampusVal - Report Error / Suggest Changes

A structured error-report / correction / suggestion channel, added at the
professor's request after reviewing the app. Reachable from every
authenticated page via the header control between **Additional Features**
and the account menu (desktop), or from the mobile navigation sheet.

## Purpose

Give faculty, advisors, students, and invited testers a fast, specific way
to flag something wrong or suggest a change, without leaving the page they
were on. This is a companion to the plain `/feedback` page (still reachable
under Additional Features -> Resources & feedback for general product
feedback/ratings) - both write into the same `feedback` table, but this
dialog captures the structured, page-aware context a correction report
actually needs (what page, what academic item, what the official source
says, what should change instead).

## Who can submit

Any authenticated CampusVal user - the same population `requireAuth` already
allows: `@scu.edu` accounts and invited external reviewers
(`GUEST_REVIEWER_EMAILS`). See [docs/TESTING_ROLLOUT.md](TESTING_ROLLOUT.md).

## What to report

- Incorrect academic information (a requirement, course, or program that's
  wrong)
- A broken feature or technical issue
- A correction to something specific
- A suggested feature or change
- Anything else, via "Other"

The dialog auto-captures the current page/feature and pathname, and offers
optional fields for the specific academic item (e.g. "MATH 11"), an
official SCU source URL backing a correction, and a proposed correction in
the reporter's own words.

## What not to include

The dialog shows this warning directly above the form fields:

> Do not include student records, APR contents, grades, or other sensitive
> personal information.

The server never automatically captures APR content, Degree Plan contents,
grades, cookies, auth tokens, or local storage - only the fields the
reporter explicitly typed, plus their verified identity (Clerk user id and
email, taken from the authenticated session, never trusted from the
client).

## Admin review

Admins (`ADMIN_EMAILS` allowlist, same as the usage-analytics dashboard -
see [docs/USAGE_ANALYTICS.md](USAGE_ANALYTICS.md)) review submissions at
`/admin/feedback` (not linked in the nav, same convention as
`/admin/usage` - bookmark the URL). The queue supports filtering by status
and shows full report detail (description, proposed correction, official
source link, page context, reporter) on expand.

## Status lifecycle

`OPEN` -> `IN_REVIEW` -> `RESOLVED` or `DISMISSED`. An admin sets status
from the review queue; the server stamps `resolvedAt`/`resolvedBy` when a
report reaches a terminal status (`RESOLVED`/`DISMISSED`) and clears both
if it's moved back to `OPEN`/`IN_REVIEW`.

## API

- `POST /api/feedback` - authenticated users only. Validates field lengths,
  the report `type` enum, and the official-source URL format server-side
  (`artifacts/api-server/src/routes/feedback.ts`).
- `GET /api/admin/feedback` - admin-only, optional `?status=` filter.
- `PATCH /api/admin/feedback/:id` - admin-only status update.

Non-admins get a 403 on the admin endpoints rather than an empty list, so a
signed-in user can never distinguish "no feedback exists" from "you can't
see it."

## Privacy/analytics

A `feedback_submit` usage event (feature name only, via the same allowlisted
mechanism as every other usage event - see
[docs/USAGE_ANALYTICS.md](USAGE_ANALYTICS.md)) records that the feature was
used. Report subject, description, academic item, source URL, and proposed
correction are never sent to the analytics table.