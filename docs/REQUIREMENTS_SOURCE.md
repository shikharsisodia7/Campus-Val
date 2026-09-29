# The source of the requirements sidebar

_2026-09-28._

## The decision is the professor's, and is not made

The Degree Plan has a list of requirements on its left ("Planning
Requirements"). What that list should be benchmarked against has not been
decided:

| Candidate | Code name |
| --- | --- |
| The current Undergraduate Bulletin | `current_bulletin` |
| The Bulletin of the student's matriculation (cohort) year | `cohort_bulletin` |
| The department checksheet for the student's curriculum year | `degree_checksheet` |
| The Workday Academic Progress Report | `apr` |
| A controlled combination of these | `composite` |

CampusVal has not chosen, and nothing in this document chooses. **What a
student sees is exactly what they saw before.**

## What was done

The engineering a decision will need, so that carrying it out is a small,
contained change instead of a rewrite:

1. **One interface.** `RequirementsBenchmarkProvider` in
   `artifacts/api-server/src/lib/requirements-source/model.ts`. Every source
   will implement it: given a student's profile and plan, return the response
   and where each group came from.
2. **One place that names the source in use.**
   `lib/requirements-source/index.ts`: `ACTIVE_REQUIREMENTS_SOURCE =
   "current_bulletin"`, `POLICY_DECIDED = false`. `GET /requirements` asks this
   module, and nothing else in CampusVal knows where requirements come from.
3. **One provider, which is the behaviour that already existed.**
   `current-bulletin.ts` passes the existing builder's output through
   untouched. No other provider was written: building one would be deciding.
4. **Provenance, kept on the server.** For each group: source type, the
   address its data names, its label, the edition, the academic year and whose
   year that is, and when it was last verified. Every value is one the data
   already carries. Nothing is filled in that CampusVal does not know.
5. **A way to see the state.** `GET /api/admin/requirements-source`
   (administrators only) returns the source in use, that the policy is
   undecided, which sources exist and which do not, and the decision needed.
   It says nothing about any student.

There is no setting, flag or request parameter that changes the source. It
cannot be switched by configuration or by a student.

## Proof that nothing changed

- `routes/requirements.golden.test.ts` holds the sidebar's **complete output**
  for six fixed students (an engineering major; a business major with
  completed and planned courses; an arts and sciences major with a minor; a
  proposed second major and minor; a plan-scoped primary major in another
  school; a professional preparation goal). The snapshots were recorded
  **before** the provider existed. They pass unchanged after it.
- `lib/requirements-source/requirements-source.test.ts` asserts that what the
  provider sends is identical, to the character, to what the builder produced
  directly; that no provenance field reaches a student; that no other source
  exists; that the source cannot be switched; and that the module reads
  nothing from the APR or from Degree Checksheets.

## What provenance showed

Major groups show the University Core's academic year and verification date,
not their own: the major data does not state an edition per group. This is how
the sidebar has always behaved and it was **not** changed. The provenance record
says so (`academicYearBasis: "inherited_from_university_core"`), so whoever
acts on the decision knows that a per-major edition has to be recorded before
a cohort-year source can mean anything.

## One correction to the contract

The API description allowed a group's `kind` to be `university_core`, `college`
or `major`, and its `sourceUrl` to be text. The server has always also sent
`minor` and `professional_prep`, and `null` for a group with no SCU source. The
description now says what the server sends. No response changed.

## To act on the decision

1. Write a provider for the chosen source: implement
   `RequirementsBenchmarkProvider` beside `current-bulletin.ts`.
2. Add it to `PROVIDERS` in `index.ts`.
3. Set `ACTIVE_REQUIREMENTS_SOURCE` and `POLICY_DECIDED`.
4. The golden snapshots will fail. Update them in the same commit and say what
   changed for students.

## The decision that remains

> Which source is the requirements sidebar benchmarked against: the current
> Bulletin, the Bulletin of the student's matriculation year, the department
> checksheet for the student's curriculum year, the Academic Progress Report, or
> a controlled combination? If a combination, which source wins where they
> disagree?
