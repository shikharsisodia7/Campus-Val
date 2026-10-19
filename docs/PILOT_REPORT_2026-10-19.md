# CampusVal — pilot-alignment report, 2026-10-19

Pass driven by the professor's clarification that CampusVal is **not** broadly launched: it is a
development / engineering deployment, pre-pilot, awaiting SCU hosting and security approval and a
controlled rollout plan. Goal of the pass: smaller, clearer, more auditable, more trustworthy — and
make the software enforce the pilot instead of relying on nobody sharing the link.
Current status in one page: [PILOT_STATUS.md](./PILOT_STATUS.md).

## Starting state (main `b6d3cd9`)

Already in place: Bulletin baseline + Department Notes + department admin + Sample Plans (provenance-gated),
canonical department resources with review states, Degree Completion Assessment and generated plans behind
server R&D flags, APR source fidelity, Degree Checksheets with checksheet → My Note transfer, the availability
provider (nothing live connected), SCU hosting runbooks.

Missing: access was **any `@scu.edu` account** plus a guest list — far broader than the pilot; the landing
page, prerender and HTML metadata still advertised "AI-assisted planning" and "Sign up with SCU email", with a
sitemap, `Allow: /` robots and JSON-LD for search; docs said "Production" and "`@scu.edu` always works"; the
AI routes were hidden only in the UI; the UI mixed a warm decorative theme, serif display type, animated
gradients, colour-tinted cards and buttons with no hover state.

## Pilot access (server-enforced)

- `CAMPUSVAL_ACCESS_MODE`: `pilot` (default; an invalid value is a startup error and is treated as pilot) or
  `institution` (not to be used until SCU approves).
- Pilot admits `ADMIN_EMAILS`, `PILOT_TESTER_EMAILS`, `GUEST_REVIEWER_EMAILS`, and department administrators
  holding a program scope. Decided in `requireUser` from the verified session email before any handler runs;
  everyone else gets `403 {code: "pilot_access_required"}` on every data route and, in the web and mobile
  apps, one message: "CampusVal is currently available only to invited pilot participants while SCU reviews
  hosting, security, and rollout." (`GET /api/me/access` answers only the caller's own decision.)
- Institution mode never accepts a Clerk `+clerk_test` address by domain alone in production.
- Tests: `lib/auth/pilot-access.test.ts` (signed-out 401; random external, uninvited `@scu.edu` 403; invited
  tester, reviewer, admin, department admin admitted; reviewer/tester/department admin are not app admins;
  headers, query, body, cookies and extra session claims cannot claim pilot status; look-alike addresses;
  mode resolution and startup checks; the **real `/api` router** refuses 11 private routes) and the browser
  project `pilot-access` (an uninvited `@scu.edu` account sees only the pilot page on four routes and gets
  `pilot_access_required` from eight APIs and the upload signer; an invited tester sees the four primary
  areas and no R&D/admin entries, cannot reach the assessment or generated plans by URL or API, and sees
  only source-backed Sample Plans).
- AI planning support, voice and the evaluation bench now require an administrator on the server as well.

## Deployment semantics

- The Vercel deployment is described everywhere as the **development / engineering deployment**; SCU-managed
  hosting is a separate, undecided step. README, PILOT_STATUS, DEPLOYMENT, SCU_DEPLOYMENT, TESTING_ROLLOUT,
  SECURITY_AND_PRIVACY, ACCESS_CONTROL and the other access docs were corrected. The 2026-10-05 implementation
  report is marked historical.
- No promotion: the landing page states the pilot status and offers no sign-up call to action; `robots.txt`
  disallows everything, a `noindex` meta tag and `X-Robots-Tag` header are sent, and the sitemap, `llms.txt`,
  JSON-LD and the old SEO strategy document were removed.
- The repository is public; documentation now says so and says what is not in it.

## Academic data (technical audit at this commit)

`pnpm run audit:requirements`: 50 majors, 71 minors, 46 concentrations, 130 groups, 1,413 requirements;
**0 errors, 0 classification errors** (Core under Major, Major under Core, university/school rules under a
major), **0 groups missing provenance**, 581/581 choice lists populated, 0 representation mismatches against
the structured Bulletin sources. Warnings: 162 course codes not in the (2025-26) catalog scrape, 48 courses
listed twice in a group, 5 courses in both a school group and a major group (Leavey Common Curriculum
overlaps, e.g. Accounting Information Systems' OMIS 30), 1 impossible-as-written minimum (Creative Writing
minor: two workshops from a one-course list), 1 major without upper-division course evidence (English). These
are left for a person; none was "fixed" by guessing.

- **Biology**: built from the 2026-27 Bulletin text (themes CMB/EEB/MOD with laboratory, four electives with
  at least two with laboratory, JES recommended). BIOL 189 vs. 189A/189B is shown with the Bulletin's wording
  and "confirm with the Biology department"; CHEM 14 does not appear in Biology's Bulletin text, and the
  checklist notes about it stay drafts; Core-overlap notes from the Biology checklist show as "imported, not yet
  reviewed by the department". Nothing asserts an interpretation.
- **Finance / Leavey**: the Leavey Common Curriculum is its own *Leavey School of Business Requirements* group
  (19 requirements: BUSN 70, OMIS 15, BUSN 85, ECON 1–3, MGMT 71/72, ACTG 11/12, OMIS 40/41, information
  systems, MGMT 196, common core FNCE 121 / MGMT 160 / MKTG 181 / OMIS 108, capstone MGMT 162); the Finance
  major group holds only the major's courses (FNCE 124, 125, the math option, four electives).
- **Engineering**: University, Core, School of Engineering and the major stay separate groups; concentrations
  remain named only.

## Department Notes and private uploads

Department Notes come only from the department admin service and the canonical-resource import script (a
test pins these two writers). A new behavioral test proves that a student's private checksheet upload and its
transfer to planning write no Department Note, override or audit row, and change nothing another student
sees; the transfer creates only that student's My Note.

## UI/UX

Design tokens (neutral canvas, Cardinal accent only, status colours for meaning, layout and typography
tokens), one sans family, real hover/focus states on buttons, quieter badges/cards/tooltips, a `Notice`
primitive; flat app shell with underline active state, `aria-current`, a skip link and a quiet "Pilot"
indicator with its explanation; Dashboard as a "Continue planning" list plus plan summary and "Where
information comes from"; one-row Degree Plan toolbar; neutral requirement rows with status rules; Department
Note vs My Note treatments; Quarter Plan with a single page title; Program Requirements Admin with tables and
dense requirement rows and Draft / Needs review / Published / Archived labels; the landing page rewritten.

## Security

- `requireUser` pilot gate (above); AI routes admin-only.
- zod v4's `z.url()` accepts `javascript:`/`data:` addresses: the feedback "official source" now accepts http(s)
  only, and links whose address comes from stored data render only http(s) (shared helper).
- Unchanged and re-run: owner-only APR and checksheet access, shares never expose APRs or checksheets, admins
  cannot read student records, upload-path traversal guards, signed upload tokens.

## Not done here (needs people or infrastructure outside the repository)

See [PILOT_STATUS.md](./PILOT_STATUS.md#waiting-on-people-and-decisions-outside-this-repository).
