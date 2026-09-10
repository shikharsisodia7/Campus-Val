# Planning Major, Tentative Scenarios, and the APR

CampusVal separates *what the university currently records* from *what the
student is planning around*. This doc explains the four distinct "major"
values so future developers and testers don't conflate them.

## The four majors

1. **Onboarding / profile major** — `student_profiles.major`. Captured once
   during onboarding as an initial default. It is **not** an immutable fact and
   is never rewritten by planning actions. It stays aligned with the student's
   formal SCU declaration / Workday APR at the time they signed up.

2. **Main Degree Plan planning major** — `academic_plans.programs.primaryMajor`
   on the plan whose `planType = "degree"`. This is the canonical **planning
   intent**: the major the student is actually building their plan around. When
   unset, it falls back to the profile major. Changing it in Plan Controls
   ("Set or Change Primary Major") recalculates the Degree Plan's requirement
   groups and updates the Dashboard — but never touches the profile or the APR.

3. **Tentative scenario major** — `programs.primaryMajor` on a
   `planType = "tentative"` plan. Each Tentative Degree Plan carries its own
   value, fully isolated: changing it recalculates only that scenario's
   requirements. It does **not** affect the Degree Plan, the Dashboard, other
   tentative scenarios, or the profile until the student explicitly **promotes**
   the scenario.

4. **APR-recorded major** — parsed from an uploaded Workday Academic Progress
   Report (`progress_reports`). This is the university record reference. It is
   read-only in CampusVal and is never mutated by any planning action.

These four can legitimately coexist and differ, e.g. APR = Biology, Degree
Plan = Chemistry (planning a change), Tentative Scenario = Biochemistry
(still experimenting).

## Where the effective primary major is resolved

`buildRequirementsResponse(profile, …, primaryMajorOverride)` in
`artifacts/api-server/src/routes/requirements.ts` computes the effective
primary major as `primaryMajorOverride ?? profile.major`. The override:

- replaces the old primary major's requirement group (it is not appended as an
  extra), leaving second majors, minors, and professional preparation intact;
- follows the **major's own college** for University Core / college
  requirements when it belongs to a different school (via `getMajorCollege`),
  so a CAS → LSB/SOE change loads the right college rules;
- adds a truthful "Planning major — … official SCU declaration and Workday APR
  are unchanged" note; it is never labelled "(proposed)" (that is reserved for
  additional/scenario majors).

The frontend passes the active plan's `programs.primaryMajor` as the
`primaryMajor` query param and includes it in the React Query key, so rapid
A→B→C switching always renders the latest selection (no stale overwrite).

## Dashboard

`GET /api/dashboard/summary` reports:

- `planningMajor` — the Degree Plan's effective primary major (planning intent);
- `declaredMajor` — the profile/APR major of record.

The returned `profile.major`/`profile.college` reflect the planning major so
existing Dashboard cards show intent; the UI shows a "Planning intent —
SCU/Workday record: …" note when the two differ. The dashboard reads **only**
the `degree` plan, so experimenting inside an unpromoted tentative scenario
never changes it.

## Promotion

Promotion (`POST /api/plans/:id/promote`) swaps `planType` in one transaction.
Because `primaryMajor` lives inside the plan row's `programs` column alongside
`additionalMajors`, `minors`, and `professionalGoals`, the promoted plan
becomes the Degree Plan carrying its primary major and all program state
atomically — there is no intermediate state where courses belong to one major
while Plan Controls/Dashboard show another. The demoted previous Degree Plan is
kept as a dated tentative backup.

## Tester guidance

- To change the major you are planning around: **Degree Plan → Plan Controls →
  Set or Change Primary Major**. This changes CampusVal planning only. It does
  **not** change your formal SCU declaration — do that through SCU/Workday and
  your advisor.
- To explore "what if I switched majors" without committing: open/create a
  **Tentative Degree Plan**, change its primary major there, and compare. Your
  Degree Plan and Dashboard stay put until you **Promote** the scenario.
- The right-hand **Workday APR** column always reflects the uploaded university
  record, independent of your planning major.
