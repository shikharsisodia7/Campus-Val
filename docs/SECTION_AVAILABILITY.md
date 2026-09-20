# Section availability (Open Sections / All Sections)

## Status

| Layer | State |
| --- | --- |
| Provider architecture, normalized model, freshness rules, caching, failure handling | **Complete and tested** |
| Student-facing control (All Sections / Open Sections), freshness banner, badges | **Complete and tested** |
| Configuration for a live source (URL, credential, timeouts, TTLs) | **Complete, switched off** (`WORKDAY_AVAILABILITY_ENABLED=false`) |
| A real, SCU-approved live seat source | **Not available.** No endpoint, credential or mechanism has been provided, so nothing live was connected or verified. |

CampusVal does **not** know live seat counts today and the UI never claims to.
The remaining step is external: SCU (Tony) must name the supported mechanism —
see [What SCU must provide](#what-scu-must-provide). Everything else is done, so
that step is configuration (or, at worst, replacing one mapping function), not a
redesign of Quarter Planning.

## The honest states

`availabilityStatus` is `open`, `waitlist`, `full` or `unknown`, decided once,
server-side (`lib/availability`). `unknown` is a first-class state, never a
failure. CampusVal has no source that separates an instructor-closed section from a
merely full one, so both are `full`.

| Where the data came from | Label shown | Can it say "Live"? |
| --- | --- | --- |
| A real, authorized live feed, refreshed within `LIVE_WITHIN` (default 2 min) | **LIVE** chip; banner "Live availability · updated N min ago" | **Yes — the only case** |
| Live feed, older than that but within `STALE_AFTER` (default 15 min) | "Updated N min ago"; banner "…not live right now" | No |
| Anything older than `STALE_AFTER` | **OUT OF DATE** chip; status shown as **UNKNOWN**; banner explains | No |
| The data steward's manual Workday paste (`WORKDAY_SYNC_ADMIN_EMAIL`) | **SNAPSHOT** chip; banner "manual snapshot … not live"; older than 24 h ⇒ stale ⇒ UNKNOWN | No |
| Development fixture (`AVAILABILITY_FIXTURE_ENABLED`, never in production) | **SAMPLE DATA** chip; banner "SAMPLE DATA for development" | No |
| Registrar schedule only (what is offered/when, no seats) | **UNKNOWN** | No |
| Winter/Spring before the Registrar publishes sections | **UNKNOWN**, "Tentative" | No |
| Live feed configured but unreachable, nothing cached | banner "Availability currently unavailable"; sections listed as UNKNOWN; planning continues | No |

A stale observation is **never** displayed as open: past the stale limit its
status is downgraded to `unknown` on the server (`trustedStatus`) and its seat
numbers are withheld.

## Architecture

```
routes/courses.ts  ── /courses/:code/sections, /section-availability/status
        │   (official Registrar rows + availability; never decides open/full itself)
        ▼
lib/availability/service.ts      AvailabilityService.getTermAvailability(term, year, course?)
        │   precedence per section:  live → fixture (dev) → manual paste → unknown
        │   live: single-flight TTL cache, stale-if-error, never throws
        ├── providers/workday.ts       WorkdayAvailabilityProvider   (isLive)
        ├── providers/fixture.ts       FixtureAvailabilityProvider   (refuses to exist in production)
        ├── providers/manualPaste.ts   ManualPasteAvailabilityProvider (DB snapshot by the data steward)
        └── providers/staticCatalog.ts StaticCatalogAvailabilityProvider (Registrar schedule; always unknown)
```

Everything downstream — the routes, the API contract, the Quarter Plan UI — sees
only the **normalized** model (`lib/availability/types.ts`): course, section,
term, instructor, meetings, capacity, enrolled, seats available, waitlist count,
status, `lastUpdatedAt`, and a `source` `{id, label, isLive}`. Optional fields stay
optional. **No Workday payload shape reaches the frontend.**

- **Caching**: one upstream request per term per `WORKDAY_AVAILABILITY_CACHE_TTL_SECONDS`
  (default 60 s) no matter how many students ask (single-flight), bounded to 32 terms.
  Process-local: N instances ⇒ at most N requests per TTL. No extra infrastructure.
- **Outage backoff**: a failed upstream call suppresses further attempts for
  min(cache TTL, 15 s). Without it every student request during an outage would block for
  the full upstream timeout (5 s by default) before answering "unknown". Terms are fetched
  concurrently, so one slow upstream costs a request one timeout, not one per term. Each
  real failure is reported once, not once per waiting student.
- **Failure**: the last good answer keeps being served, flagged by age (live → cached
  → stale ⇒ unknown). With nothing cached the state is "unavailable". A failure
  is logged as a reason only — never the URL, credential or upstream body.
- **Security**: the live provider follows no redirects (the credential never travels
  to another host), enforces a timeout, requires `https://`, and the credential
  is server-side only.
- **Degree Plan** intentionally shows no seat data (it is about sequencing).

## The UI

Quarter Plan → Find → a course's sections:

- Header banner stating the true source/freshness of the data (table above).
- **Section availability: [ All Sections ] [ Open Sections ]** (default All).
  *Open Sections* hides only what CampusVal **knows** is full or waitlisted;
  sections whose availability is unknown stay visible and labelled UNKNOWN (hiding
  them could hide a genuinely open section), with a note saying so. If no section has
  known seat data, *Open Sections* is disabled with an explanation instead of
  showing an empty list.
- Each section: text badge (OPEN / WAITLIST / FULL / UNKNOWN — color is additive),
  source chip, and a freshness line ("Updated 2 minutes ago (…)").
- Full/waitlisted sections stay addable, with a "line up a backup" warning.

## Configuration

All from the environment (`.env.example`); nothing is hard-coded.

| Variable | Default | Meaning |
| --- | --- | --- |
| `WORKDAY_AVAILABILITY_ENABLED` | `false` | Master switch. Also needs URL + credential (startup validation refuses an enabled-but-incomplete config). |
| `WORKDAY_AVAILABILITY_URL` | — | `https://` endpoint. |
| `WORKDAY_AVAILABILITY_AUTH_TOKEN` | — | Credential issued by SCU. |
| `WORKDAY_AVAILABILITY_AUTH_HEADER` / `_AUTH_SCHEME` | `Authorization` / `Bearer` | How it is sent. Empty scheme = bare token. |
| `WORKDAY_AVAILABILITY_TIMEOUT_MS` | 5000 | Upstream timeout. |
| `WORKDAY_AVAILABILITY_CACHE_TTL_SECONDS` | 60 | One upstream call per term per TTL. |
| `WORKDAY_AVAILABILITY_LIVE_WITHIN_SECONDS` | 120 | Younger than this ⇒ "live". |
| `WORKDAY_AVAILABILITY_STALE_AFTER_SECONDS` | 900 | Older ⇒ stale ⇒ unknown. |
| `AVAILABILITY_FIXTURE_ENABLED` | `false` | Dev only; ignored (with a warning) in production. |

## The input contract

CampusVal does not know Workday's real API and does not pretend to. The live
adapter implements CampusVal's **own documented contract**: `GET <URL>?term=fall&year=2026`
with the credential header, returning JSON:

```json
{
  "asOf": "2026-09-19T20:00:00Z",
  "sections": [
    { "course": "CSCI 10", "section": "01", "term": "fall", "year": 2026,
      "instructor": "A. Instructor", "capacity": 30, "enrolled": 21, "waitlist": 0,
      "status": "open", "updatedAt": "2026-09-19T20:00:00Z" }
  ]
}
```

All fields except `course`, `section`, `term`, `year` are optional. Status comes
from `status` (`open` / `waitlist` / `full` / `closed`) or, absent that, from seat
numbers (`seatsAvailable`, or `capacity − enrolled`, plus `waitlist`); with neither
it is `unknown` — never guessed. `updatedAt` → `asOf` → the time CampusVal received
the response, in that order. Records that fail validation are dropped, not guessed
at. (`lib/availability/providers/workday.ts`, fixture:
`__fixtures__/availability/upstream-payload.json`.)

If SCU's real mechanism can be fronted to emit this shape, connecting it is
`ENABLED=true` + URL + credential. If it cannot, only `normalizeUpstreamPayload`
changes; the service, cache, freshness rules, API and UI do not.

## What was verified, and what was not

Verified (automated): open, full/closed, waitlist, unknown, missing optional fields,
upstream 401/403/5xx/timeout/network/non-JSON failure, stale data, stale-if-error,
single upstream call under concurrent load, provider precedence, fixture refusal
in production, "LIVE" never shown for non-live data, the two-option filter, banner
wording per state, and the manual-snapshot path end to end in a real browser.

**Not verified: any real Workday data.** No endpoint or credentials existed, and no
authenticated Workday page was scraped.

## What SCU must provide

For Tony/SCU (also: `docs/WORKDAY_INTEGRATION.md`):

1. The supported **endpoint or report** for section seat availability, and its
   authentication mechanism (OAuth client / ISU / RaaS / gateway).
2. The **section identifier** it uses (Workday Section ID vs course code + section
   number + term).
3. **Status semantics**: is there an explicit "Closed" distinct from full? Waitlist counts?
4. **Refresh cadence and rate limits** (drives the TTL settings).
5. Whether it may be called from the **SCU-hosted CampusVal service** (`docs/SCU_DEPLOYMENT.md`).
6. FERPA/data-handling expectations for anything student-specific (this feed is
   section-level, not student-level).
