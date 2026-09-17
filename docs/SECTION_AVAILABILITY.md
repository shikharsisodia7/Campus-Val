# Current-quarter section availability

Professor feedback (2026-09 pass): students scheduling during registration
need to know whether a section is open, closed, waitlisted, full, or unknown
— truthfully, with a visible freshness timestamp, never presented as "real
time" unless it actually is.

## Status: CODE READY. AUTHORIZED SCU DATA SOURCE REQUIRED for true live data.

CampusVal has **no** automatic live feed of Workday seat counts, and does not
scrape one (see `docs/WORKDAY_INTEGRATION.md` for why, and what SCU would
need to authorize). What exists today, verified in this pass, is the
complete provider/schema/API/UI/test layer described below, running on top
of the one legitimate data source CampusVal already has: a student
voluntarily pasting their own Workday "Find Course Sections" table.

## The four states, and what each one truthfully means

| Label the UI shows | When it applies | Backed by |
| --- | --- | --- |
| **Live/current** | Never shown today — reserved for a future authorized real-time feed. | n/a until SCU authorizes one |
| **Recently refreshed** (`lastUpdatedAt` shown, `sourceType: workday_self_paste`) | A student pasted their own Workday seat data for this section; the seat count and its refresh timestamp both come from that paste. | `course_sections` DB table (`syncedAt` column) |
| **Tentative** | Winter/Spring terms before the Registrar publishes real sections (no real section numbers/instructors yet). | `data/offered-sections.ts` (`isTentativeTerm`) — always reports `availabilityStatus: "unknown"` |
| **Unknown** (`sourceType: registrar_schedule`) | The official Registrar schedule lists the section (what/when), but nobody has pasted live seat data for it yet. This is the default state for most sections, most of the time. | `data/offered-sections.json` |

`availabilityStatus` itself is one of `open` / `waitlist` / `full` /
`unknown` — derived once, server-side, in
`artifacts/api-server/src/lib/section-availability.ts`
(`deriveAvailability`), never computed client-side and never wired directly
into a UI component. CampusVal has no source that distinguishes an
instructor-closed section from a merely-full one, so both collapse honestly
into `full` rather than inventing a fifth state without evidence.

## Where this shows up

- **Quarter Plan → Find Courses** (`QuickAddSearch.tsx`): every section shows
  an OPEN/WAITLIST/FULL/UNKNOWN text badge (color is additive only), a
  freshness line ("Updated <date> (Your own Workday paste-in)" or "SCU
  Registrar schedule (no live seat data)"), and a filter — **Show all
  sections** (default), **Show open + waitlist**, **Show open only**. The
  filter only ever hides a section CampusVal is *confident* doesn't match —
  `unknown` sections are never hidden by any filter tier, since hiding them
  could hide a section that's actually open.
- **Closed/full sections stay visible and addable.** Adding one shows an
  inline warning ("This section is full/waitlisted... line up a backup Plan
  B") rather than blocking the add.
- **Already-scheduled sections that later show full/waitlisted** are flagged
  by `ScheduleAvailabilityBanner` (fed by
  `useScheduleAvailabilityWarnings.ts`) directly on the Quarter Plan
  calendar page — the section is never removed from the schedule, only
  flagged.
- **Future tentative terms** (Winter/Spring before Registrar publication)
  always report `unknown` and keep the existing "Tentative" badge and
  Instructor-TBA behavior — never a fabricated open/closed claim.
- **Degree Plan** intentionally does not show seat availability at all — it
  is about sequencing, not registration-moment seat counts (the professor's
  own on-camera correction).

## What SCU/Tony-IT would need to provide for true live data

This is additive to, not a replacement for, `docs/WORKDAY_INTEGRATION.md` —
that document already covers the approved-endpoint/OAuth/RaaS/refresh-
cadence/rate-limit/FERPA questions in full. Specific to *section
availability* on top of that:

1. **Section identifiers.** What key would a feed use to identify a section
   (Workday's internal Course Section ID, or the human "course code + section
   number + term" tuple CampusVal already uses)? CampusVal's schema
   (`courseSectionsTable`) is keyed on `(courseCode, sectionNumber, term,
   year)` today — an authorized feed would need to map cleanly onto that, or
   CampusVal would add a `workdaySectionId` column.
2. **Status semantics.** Does Workday expose a section status distinct from
   raw seat counts (e.g. an explicit "Closed" state set by a department even
   with open seats, separate from "full")? If so, CampusVal would add a real
   `closed` status instead of collapsing it into `full`.
3. **Hosting.** Can this integration run from CampusVal's existing Vercel
   deployment (serverless functions calling an authorized endpoint on a
   schedule), or does SCU require the polling/service-account job to run on
   an SCU-managed service instead?
4. **Refresh cadence and rate limits**, and whether they differ from the
   cadence already asked about for the broader Workday integration.

Until SCU authorizes and provisions this, the honest status for **live**
current-quarter availability is `AUTHORIZED SCU DATA SOURCE REQUIRED` — every
other part of this feature (schema, API contract, provider interface,
importer/self-paste path, UI, freshness display, filters, retention warning,
and tests) is complete and does not need to change when that source arrives;
only `deriveAvailability`'s inputs would gain a new provider.
