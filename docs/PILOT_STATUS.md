# CampusVal — pilot status

Last updated 2026-10-19. This page says what CampusVal is today, who can use it, and what is still
waiting on people and decisions outside this repository. Keep it current; it is the page to send to
anyone who asks "is CampusVal live?".

## Current status: pre-pilot engineering deployment

| | |
| --- | --- |
| What runs at `https://campus-val.vercel.app` | A **development / engineering deployment** on Vercel, used for engineering verification and, once the professor authorizes it, controlled pre-pilot testing. It is **not** an SCU-hosted, SCU-approved or institutionally launched service. |
| Who can use it | **Invited participants only** (see [Access](#access)). An `@scu.edu` address alone does not get in. |
| Promotion | None. No announcements, invitations, email campaigns or search listing. The site asks search engines not to index it (`robots.txt` `Disallow: /`, `noindex` meta tag and `X-Robots-Tag` header). |
| SCU hosting | Not decided. The repository is ready for SCU-managed hosting (Docker image, Cloud Run / Cloud SQL / Cloud Storage runbooks, health and readiness endpoints, OIDC adapter seam) — see [SCU_DEPLOYMENT.md](./SCU_DEPLOYMENT.md) and [migration/](./migration/). |
| Security | Engineering security controls are implemented and tested (below). **SCU IT/security review has not happened yet.** Passing our own tests is not university security approval. |
| Source code | The GitHub repository `shikharsisodia7/Campus-Val` is **public**. It contains no credentials, no student records and no uploaded documents; those live only in the deployment's environment variables, database and private storage. |

## Access

The server decides who may use CampusVal on every request (`requireUser` in
`artifacts/api-server/src/lib/auth/`), from the verified email of the signed-in account. Nothing the
browser sends can change the decision; hiding navigation is not the control.

`CAMPUSVAL_ACCESS_MODE` (environment variable):

- **`pilot`** — the default when unset, and the only mode any deployment should run today. Admits:
  - `ADMIN_EMAILS` — CampusVal administrators;
  - `PILOT_TESTER_EMAILS` — invited pilot testers (students, advisors);
  - `GUEST_REVIEWER_EMAILS` — invited external reviewers without an `@scu.edu` address;
  - department administrators who hold a program scope (`admin:scope grant`, a recorded admin action).

  Everyone else who signs in sees one message — *"CampusVal is currently available only to invited
  pilot participants while SCU reviews hosting, security, and rollout."* — and every data API answers
  `403 pilot_access_required` before any handler runs.
- **`institution`** — every `@scu.edu` account plus the same named people. **Do not set this** until SCU
  has approved a broader rollout. The server logs a warning at startup when it is set. A value other than
  `pilot` or `institution` refuses to start the server and, if it ever reached the code, is treated as `pilot`.

Being admitted is not a role: a pilot tester or reviewer is an ordinary user. Administrators can open the
admin tools, but an administrator still cannot read any student's plans, APRs or Degree Checksheets (see
[security/ACCESS_CONTROL.md](./security/ACCESS_CONTROL.md)).

To invite someone during the pilot, add their exact address to `PILOT_TESTER_EMAILS` (comma-separated) in the
deployment's environment and redeploy. Do not put real addresses in this repository.

The engineering deployment's `PILOT_TESTER_EMAILS` also lists the synthetic end-to-end test identities
(`e2e-student-a+clerk_test@scu.edu`, `e2e-student-b+clerk_test@scu.edu`, `e2e-advisor-y+clerk_test@scu.edu`),
which exist only on the Clerk
development instance and can only be signed into with the Clerk secret key (the instance has no password or
email-code sign-in). The synthetic `e2e-nonpilot+clerk_test@scu.edu` is deliberately on no list: the
`pilot-access` browser suite uses it to prove an uninvited `@scu.edu` account is refused.

## What pilot users see

Dashboard, Degree Plan, Quarter Plan and Tentative Degree Plan, plus under *Additional Features*: Course
Catalog, Core Curriculum, GPA Calculator, Transfer Credit, Workday APR, Degree Checksheets, SCU Resources and
Shared with Me. Department Notes appear beside requirements; My Notes are the student's own.

Not available to pilot users. "Server" means the API refuses the request too, so typing a URL or calling
the API directly does not help:

- **Degree Completion Assessment** (server) — research only: needs `ENABLE_DEGREE_COMPLETION_RND=true` *and*
  an `ADMIN_EMAILS` account ([DEGREE_COMPLETION_ASSESSMENT.md](./DEGREE_COMPLETION_ASSESSMENT.md)).
- **Generated (CampusVal-made) four-year plans** (server) — research only: `ENABLE_GENERATED_PLAN_RND=true`
  and an admin. Public Sample Plans are only published, source-backed department/university plans with a
  recorded source, version and import date; the server filters the list.
- **AI planning support, voice questions, AI evaluation** (server: administrators only; also off unless
  `AI_PROVIDER` is set, and the engineering deployment sets none).
- **Program Requirements Admin and the usage/feedback dashboards** (server: administrators and, for
  Program Requirements Admin, department administrators of the program).
- Advice Board, Graduation Paths, Professors, Compare Courses, SCU Policies, the legacy feedback page and the
  Workday section paste tool: hidden from navigation and redirected away from by URL
  ([PILOT_FEATURE_MATRIX.md](./PILOT_FEATURE_MATRIX.md)). Their read-only reference data (catalog-style
  lists, no student data) is still served to signed-in users.

## What CampusVal is and is not

CampusVal organizes and compares planning information from SCU sources. Workday and SCU remain
authoritative for official academic records and decisions. CampusVal does not register students,
declare programs, certify graduation, or replace Workday or an advisor.

Where information comes from, and how it is labelled in the app:

| Layer | Role |
| --- | --- |
| SCU Undergraduate Bulletin (2026–27) | Baseline structural planning requirements. |
| Department resources (canonical checksheets) and Department Admin entries | Department Notes: supplemental, program-scoped advising guidance, with provenance. Imported notes say "imported, not yet reviewed by the department" until reviewed. |
| My Notes / student requirement edits | The student's own planning representation, per plan. Never shared, never department guidance. |
| Workday Academic Progress Report (APR) | Uploaded by the student, shown exactly as exported, read-only; the definitive comparison point for degree completion. |

**Technical validation vs. academic validation.** The requirements audit (`pnpm run audit:requirements`)
proves the data is *internally consistent*: every program built, no duplicate stable keys, provenance on every
group, nothing from the Core or a school filed under a major. It does **not** prove that a department, the
professor or the Registrar has confirmed the academic policy. Where that confirmation is missing, CampusVal
shows the source wording without interpreting it, or keeps the item out of view as a draft.

## Waiting on people and decisions outside this repository

These are not coding defects; they need someone other than the engineering team.

- **SCU hosting decision** — where CampusVal runs for a real pilot (Vercel engineering deployment vs.
  SCU-managed infrastructure).
- **SCU IT/security review** — of the code, the hosting and the data handling.
- **Professor's rollout plan** — which students and advisors are invited, and when.
- **Department engagement and proofreading** (led by the professor), including the open items CampusVal
  intentionally leaves unresolved:
  - Biology: CHEM 14 in place of CHEM 11/12 (checklist notes kept as drafts); which elective courses count
    "with laboratory"; BIOL 189 vs. 189A/189B (shown with the Bulletin's wording and a "confirm with the
    department" note); Core-overlap notes from the Biology checklist (shown as imported, not yet reviewed);
  - Accounting Information Systems: OMIS 30 listed in both the Leavey Common Curriculum and the major;
  - CENG 43 / 43L; Finance double-counting; Creative Writing minor (two workshops from a one-course list).
- **Registrar clarification** — APR terminology ("Remaining" on In Progress rows) before the Degree Completion
  Assessment could ever be considered for students.
- **Official Workday section-availability source** — nothing live is connected; Quarter Plan says
  availability is unknown/static rather than inventing seat data ([SECTION_AVAILABILITY.md](./SECTION_AVAILABILITY.md)).
- **SCU SSO/OIDC values** — issuer, client registration and claim mapping from SCU's identity team
  ([migration/SSO_INFORMATION_NEEDED.md](./migration/SSO_INFORMATION_NEEDED.md)). Until then sign-in uses Clerk.
- **Real pilot testing** with the invited cohort.
