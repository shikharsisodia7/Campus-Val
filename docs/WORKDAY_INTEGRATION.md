# Workday Student integration — readiness

**Status: READY FOR SCU AUTHORIZATION. No Workday integration is configured or
active.**

CampusVal does not talk to Workday. It has no Workday credentials, no tenant,
no API client, and no RaaS report. Everything academic-record-shaped in the
product today comes from a file the student uploads themselves.

This document describes what SCU would have to provide before a real
integration could exist, and how the codebase is already shaped to accept one.

---

## What CampusVal does today

| Need | How it is met today |
| --- | --- |
| Academic progress / requirements | The student downloads their own Academic Progress Report from Workday and uploads the file. It is stored in private object storage, bound to that user, and served only through an authenticated, owner-checked route. CampusVal never rewrites it. |
| Course sections, times, instructors | SCU Registrar published and tentative quarter schedules, imported as static data (`artifacts/api-server/src/data/offered-sections.json`) with source URL, publish date and last-verified date. |
| Live seat counts | Optional: a student may paste their own Workday "Find Course Sections" table, which overlays seat counts onto the Registrar schedule. |
| Registration | Not performed. Quarter Plan ends in a Workday Handoff: a section list the student copies and enters in Workday themselves. |

### Things CampusVal deliberately does not do

- It does not scrape authenticated Workday pages.
- It does not ask for, store, or transmit a student's Workday password.
- It does not use exported browser cookies or session tokens as an integration.
- It does not claim to know seat availability, holds, restrictions, overload
  approval, permission numbers, or registration eligibility.
- It does not display "Connected to Workday" or "Live Workday Sync" anywhere,
  because neither is true.

---

## Phase 1 request to SCU

> Provide CampusVal with an approved **read-only** Workday integration that
> allows an authenticated SCU student to retrieve their own academic-progress /
> academic-requirement information and approved course-section data.

Read-only is the preferred and sufficient first step. Registration write-back
is explicitly out of scope and must not be built unless SCU authorizes and
provisions it separately.

## What SCU would need to provide

1. **Administrator approval.** Named sponsor in SCU IT / the Registrar's
   office, and sign-off from the Workday Student tenant owner.
2. **A sanctioned access mechanism**, one of:
   - an approved OAuth 2.0 API client (client credentials for
     service-to-service, or authorization-code with PKCE if each student
     delegates access to their own record), or
   - a sanctioned RaaS (Report-as-a-Service) report with a defined output
     contract and a service account permitted to call it.
3. **Read-only security permissions.** A Workday security group scoped to the
   minimum domains needed — academic progress / academic requirements for the
   authenticated student, and course-section data. No write domains.
4. **Tenant configuration**: tenant name, environment hostnames, and separate
   implementation/sandbox and production tenants.
5. **Academic-record access scope**: confirmation of exactly which fields are
   released, and that a student may only ever retrieve their own record.
6. **Section data access scope**: which quarters are exposed, refresh cadence,
   and whether seat counts are included.
7. **FERPA review.** Written determination covering the data released, the
   legitimate educational interest, retention, and student consent. CampusVal
   stores only what the student already has access to about themselves.
8. **Audit expectations**: what CampusVal must log, how long, and where SCU
   expects to review it.
9. **Credential separation**: distinct credentials for preview and production
   deployments, never shared.
10. **Token storage and rotation**: agreed storage location (server-side
    secret manager only), rotation interval, and who holds the rotation duty.
11. **Revocation procedure**: how SCU revokes access immediately, and what
    CampusVal must do on revocation (fall back to APR upload, surface a clear
    disabled state — never a silent failure or a stale cached record).
12. **Redirect configuration**, if user-delegated OAuth is used: the exact
    redirect URIs for production and preview, and the consent-screen wording.

---

## How the code is shaped for this

Academic-record access and schedule access are already separated behind their
own boundaries, so adding a Workday source is an additional provider rather
than a rewrite. The existing seams:

**Academic record**
- `artifacts/api-server/src/routes/progress-report.ts` — upload, parse,
  owner-checked retrieval of the student-supplied APR.
- `artifacts/api-server/src/lib/storage/` — a storage provider interface with
  Vercel Blob and Replit implementations behind it. Private by default;
  the frontend never receives a durable private URL.
- `artifacts/api-server/src/lib/progress-report-parser.ts` — deterministic
  parsing. A Workday provider would produce the same parsed shape, so
  everything downstream is unchanged.

**Course schedule**
- `artifacts/api-server/src/data/offered-sections.ts` — published and
  tentative Registrar schedules, each carrying `status`, `sourceUrl`,
  `publishedDate` and `lastVerified`.
- `artifacts/scu-advising/src/lib/course-offering.ts` — grades every answer by
  the evidence behind it (`published` / `tentative` / `projected` / `unknown`).
  A Workday-sourced schedule would slot in as a higher-confidence source
  without changing how the UI reasons about certainty.
- `artifacts/api-server/src/routes/sections.ts` — the student's own Workday
  paste-in, restricted to an authorized data steward for shared data.

When an integration is authorized, the natural shape is:

```
AcademicRecordProvider
  ├── UploadedAprProvider        (today, always available as fallback)
  └── WorkdayProvider            (future, disabled)

CourseScheduleProvider
  ├── PublishedScheduleProvider          (today)
  ├── RegistrarTentativeScheduleProvider (today)
  └── WorkdayScheduleProvider            (future, disabled)
```

The upload path must remain available even after an integration exists —
students on leave, transfer students, and anyone whose Workday access is
interrupted still need to plan.

---

## Configuration

```bash
# Master switch. Stays false until SCU has authorized an integration AND
# credentials are provisioned. Nothing in the UI may claim a Workday
# connection while this is false.
WORKDAY_INTEGRATION_ENABLED=false
```

Every other Workday value (tenant, client id, client secret, token endpoint,
report URL) is intentionally **not** listed here. They must not be invented,
placeholdered, or committed — add them to the Vercel project's environment
variables only once SCU issues real ones, and only for the environments SCU
approves.

No Workday secret belongs in the repository, in `.env.example`, or in any
client-side bundle.

---

## Acceptance criteria for calling the integration "done"

Do not mark this integration complete on the basis of code alone. It requires
all of:

- [ ] SCU has authorized the integration in writing.
- [ ] Real credentials are provisioned for production, separately for preview.
- [ ] `WORKDAY_INTEGRATION_ENABLED=true` in an environment SCU approved.
- [ ] An authenticated SCU student can retrieve their own record end to end.
- [ ] Revocation has been tested: access is withdrawn and CampusVal falls back
      to APR upload with a clear message, not a silent failure.
- [ ] Audit logging matches what SCU asked for.

Until then the honest status is the one at the top of this file.
