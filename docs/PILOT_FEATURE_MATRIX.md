# CampusVal — Pilot Feature Matrix

This is the human-readable companion to
[`artifacts/scu-advising/src/lib/pilot-features.ts`](../artifacts/scu-advising/src/lib/pilot-features.ts),
the single source of truth desktop nav, mobile nav, the Dashboard, and route
gating (`PilotGate` in `App.tsx`) all read from. If the two ever disagree,
the registry is authoritative — this document should be updated to match it,
not the other way around.

Written for the professor/faculty/peer-advisor/Tony pilot review driven by
two review videos. Nothing below was deleted from the codebase — a
`PILOT_HIDDEN` status means "hidden from ordinary pilot testers, still fully
present for admins and future re-enablement," never "removed."

## Legend

| Status | Who sees it | Where |
|---|---|---|
| `CORE` | Everyone signed in | Primary nav (always visible) |
| `PILOT_VISIBLE` | Everyone signed in | "Additional Features" dropdown/menu |
| `PILOT_HIDDEN` | Admins only (`ADMIN_EMAILS` allowlist) | "Additional Features" (admin-only group) + direct URL; a non-admin hitting the URL is redirected to Dashboard with a toast |

## CORE — the professor's three key workflows + Dashboard

| Feature | Path | Rationale |
|---|---|---|
| Dashboard | `/` | Entry point; always visible. |
| Degree Plan | `/degree-plan` | The central planning workflow the professor wants reviewed first. |
| Quarter Plan | `/planner` | Turns the degree plan into an actual quarter schedule. |
| Tentative Degree Plan | `/tentative-plans` | Scenario-planning workspace, isolated from the main plan until promoted. |

## PILOT_VISIBLE — conservative, lower-risk utilities

| Feature | Path | Rationale | Re-enable / re-audit criteria |
|---|---|---|---|
| Course Catalog | `/courses` | Professor identified this as useful; avoids redundant department/course-list pages. | Already visible. |
| Core Curriculum | `/core-reqs` | Requirement data carries a visible source, academic year, and last-verified date (see `docs/DATA_PROVENANCE.md`) — current enough for pilot review. | Re-audit if the source data goes stale. |
| GPA Calculator | `/gpa` | Professor said this can remain for now as a secondary utility. | Already visible. |
| Transfer Credit | `/transfer` | Kept with official-source/verification wording and no guarantee language. | Already visible. |
| Workday APR (Progress Report) | `/progress-report` | The Workday Academic Progress Report upload/read workflow the professor specifically wants reviewed. Same underlying data as Degree Plan's read-only APR panel. | Already visible. |
| SCU Resources | `/resources` | Emphasizes trusted official SCU resources and who to contact. | Already visible. |
| Shared with Me (Advisors) | `/shared-with-me` | Student-controlled, read-only, already security-tested. | Already visible. |

## PILOT_HIDDEN — hidden from ordinary reviewers this pilot

| Feature | Path | Rationale | Re-enable criteria |
|---|---|---|---|
| Professors | `/professors` | Transcript was ambiguous, but the professor repeatedly said to hide as much as possible so reviewers stay focused on the three key workflows. | Explicit product decision to bring secondary course-info tools back into pilot scope. |
| Compare Courses | `/compare` | Same reasoning as Professors. | Same as above. |
| Graduation Paths | `/graduation-paths` | Generic prescribed/recommended/example sequences risk being mistaken for department-approved plans. Only **CSE** is fully `prescribed`; everything else is `recommended` or `example`. The professor explicitly suggested hiding this or restricting it to sanctioned departmental plans. Degree Plan's four-year preload picker already independently restricts one-click loading to `prescribed` sequences only and never shows `example` sequences — that picker is unaffected by this hide. | Reframe as a truthful "Department-Recommended Academic Plans" surface showing only `sequenceTrust === "prescribed"` entries with provenance, or add verified official sources for more majors. |
| Advice Board | `/advice` | Professor wants the concept blank/department/faculty-solicited rather than CampusVal-curated advice during pilot review. | Replace curated tips with verified faculty/advisor/department-contributed content. |
| Planning Support | `/advisor` | AI-generated advising should not be marketed as safe or authoritative during the pilot. | Reliability/accuracy review of AI-generated output. |
| Voice Planning Support | `/voice` | Same concern as Planning Support, voice-driven. | Same as above. |
| SCU Policies | `/policies` | Stale scraped policy content is an explicit professor trust concern. | A reliable maintenance pipeline keeping content current, with source metadata surfaced to reviewers. |
| AI Evaluation | `/evaluation` | Internal AI-evaluation framework — not part of the professor's pilot review scope. | Product decision to expose evaluation tooling to reviewers. |
| Sync Workday Sections | `/sync-workday` | A separate live-seat-availability paste tool — **not** the same feature as the Workday APR / Progress Report. Hidden to reduce menu clutter; its backend data still powers the "Live sections" panel inside course drawers, so Quarter Plan/Fall-Winter-Spring scheduling is unaffected. | Product decision to surface live-seat sync as a pilot-facing tool. |
| Feedback (legacy) | `/feedback` | Superseded by the header "Report Error / Suggest Changes" control (PR #44) as the one obvious feedback mechanism for pilot testers. Route and data preserved internally. | None planned — Report Error / Suggest Changes is the permanent replacement. |

## Admin-only pages outside the pilot registry (unchanged, out of scope)

`/admin/usage` and `/admin/feedback` were already admin-only, direct-URL-only
pages before this pilot pass — they were never in the nav and aren't part of
`pilot-features.ts`. Left untouched.

## What this pass did NOT change

- Server-side authorization (`requireAuth.ts`, `lib/admin.ts`, per-route
  checks) — pilot gating is a **UI contract only**. Every API route keeps
  enforcing its own authorization regardless of pilot status.
- Backend calculations for anything de-emphasized on the Dashboard
  (registration windows, overload eligibility, unit caps, GPA) — those
  endpoints and their logic are untouched; the Dashboard simply no longer
  renders them.
- The already-correct Set/Change Primary Major work (PR #45) or the
  Report Error / Suggest Changes persistence/admin workflow (PR #44).
- Degree Plan's four-year preload picker (`FourYearPreload.tsx`), which
  already independently restricts one-click preload to `sequenceTrust:
  "prescribed"` and never surfaces `example` sequences.
