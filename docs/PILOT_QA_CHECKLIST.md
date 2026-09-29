# Pilot checklist: Degree Checksheets with real students

_2026-09-28._

Everything below this line has been checked by a machine or by the person who
built it. **No real student has used Degree Checksheets.** This page is what is
needed to find out how it goes when one does.

## Two different things

| | What it is | State |
| --- | --- | --- |
| Engineering verification | Tests, real department documents, a real browser, production | Done. See `docs/DEGREE_CHECKSHEETS.md` |
| Pilot validation | Real students, their own documents, their own words | **Not started** |

## Before the pilot

- [ ] The professor names 3 to 5 students, from more than one school.
- [ ] Each has a CampusVal account (`docs/TESTING_ROLLOUT.md`).
- [ ] Each knows that what they upload is private to them, and that Workday is
      the definitive reference for degree completion.
- [ ] Someone is named to read what comes back.

## A test account and sample documents

For a walkthrough without a real student's data:

```
# The synthetic test students (never a real person):
pnpm --filter @workspace/e2e run pretest

# Sample documents, every program and course invented ("Applied Widgetry"):
pnpm --filter @workspace/api-server exec tsx src/__fixtures__/checksheets/write-fixtures.ts <folder>
```

The folder then holds a major checklist with Status and Quarter columns, a
requirements checklist with one student column, a minor with two worksheets, a
legacy `.xls`, a PDF, a scanned PDF, a flowchart picture and a Word guide, and
reworded versions of several for trying a replacement.

## What to ask each student to do

Give no instructions beyond these. Watch, or ask them to write down where they
stopped.

1. Find the checksheet you are following on the SCU site, and get it into
   CampusVal.
2. Mark what you have completed, and when.
3. Mark what you plan to take next quarter.
4. Find something on your checksheet that CampusVal did not give you a place
   to mark. What did you do?
5. Your department published a new version. Replace the file. Is your tracking
   where you expect?
6. Open CampusVal on your phone. Is your tracking there?

## What to write down

- [ ] Which document they used: school, program, format (PDF, Excel, Word,
      picture, Google file).
- [ ] Whether it uploaded. If not, the message they saw.
- [ ] Whether the preview was the document they know.
- [ ] Whether they found where to record a status, without help.
- [ ] Anything they expected CampusVal to do that it does not. In particular:
      did they expect it to update their Degree Plan, or to tell them what
      they still need?
- [ ] Anything they read as official that is not.
- [ ] Time to the first recorded status.

## Where feedback goes

**Report Error** in the app header, on any page
(`docs/FEEDBACK_AND_ERROR_REPORTING.md`). It records the page and the message,
not the document. Usage of the feature, by count and not by content, is on the
administrators' usage page (`docs/USAGE_ANALYTICS.md`, feature
`degree_checksheets`).

## After the pilot

- [ ] Every document that failed to upload or looked wrong: get the file, with
      the student's permission, and run it through the reader.
- [ ] Every request that amounts to "tell me what I still need" goes to the
      professor with the open question in `docs/REQUIREMENTS_SOURCE.md`.
