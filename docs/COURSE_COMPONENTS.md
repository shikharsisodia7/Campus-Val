# Course components — lecture, lab, discussion, recitation

_2026-09-26 pass._

A course such as CHEM 11, BIOL 1B or PHYS 11 is scheduled in more than one part.
Quarter Plan lets the student choose a section for **each** part, shows every part
on the calendar, and checks every part for time conflicts.

## What was wrong

CHEM 11 worked. Biology and Physics did not, for two separate reasons:

| Course | What the student saw | Cause |
| --- | --- | --- |
| BIOL 1B | every section labelled a lecture | A section counted as a lab only if it was a single weekly block of **150 minutes or more**. BIOL 1B's labs are 90 minutes. |
| PHYS 11 | labs not offered as labs | The bulletin text was extracted from a PDF and reads "Inclu des weekly laboratory". The pattern looking for "includes weekly laboratory" did not match, so the course was not known to have a lab. |
| BIOL 1C, BIOL 5, BIOL 104 … | same | Their bulletin descriptions do not mention a lab at all; the only signal is the "L&L" in the title, which was not read. |

Because BIOL 1B's labs were classified as lectures, choosing a lab **replaced**
the chosen lecture — the "switching one removes the other" behaviour.

## The rule (one rule, every course)

`artifacts/api-server/src/lib/course-components.ts`. No department or course code
appears in it, and a test fails if one is added.

1. **What the source says wins.** If a section arrives with an instructional
   format ("Lecture", "Laboratory", "Discussion"), it is used as-is and shown as
   published. Workday's Find Course Sections has this column; the paste importer
   and the live-availability contract both carry it (`component`).
2. **Does the course have a lab?** From published SCU text:
   - the Registrar's schedule title ends in **"L&L"**
     (`data/registrar-component-markers.json`, produced by
     `pnpm --filter @workspace/api-server run extract-component-markers`), or the
     catalog title does;
   - or the bulletin description says so. It is compared with whitespace removed,
     so extraction artifacts inside words do not matter.
3. **Which section is the lab?** The Registrar's schedules have no component
   column, so this is read from how the course's **own** sections meet in that
   term: if a course that has a lab offers both sections meeting several days a
   week and sections meeting once a week, the once-a-week sections are the labs.
   This is relative to the course — there is no minimum duration.

Step 3 is an inference. It is labelled as such in the UI ("grouping inferred from
meeting times, verify in Workday"), and CampusVal never claims to know which lab
pairs with which lecture.

When a course mixes meeting patterns but no published text explains why (MATH 9S
support sessions, MILS leadership labs), the once-a-week sections are shown as
**Other** — not called labs, and not called lectures.

## Winter and Spring (tentative schedules)

The Registrar's tentative schedules for Winter and Spring 2027 **list lecture
sections only**. There are no lab rows in the source workbooks — this was checked
against the files, not assumed.

So for a tentative term CampusVal:

- still knows the course **requires** a lab (from the L&L title or the bulletin);
- shows "Lab times are not published yet" and lets the student plan the lecture;
- does **not** invent a lab section or a meeting time;
- reports the course as `notYetPublished: ["lab"]` in the quarter summary.

As soon as a source lists the labs for that term — the data steward's Workday
paste, or a live feed — they appear as lab sections and can be chosen, swapped and
conflict-checked exactly like Fall's. No code change is needed.

## Term-specific sections

A section's identity includes its term and year. A schedule's sections are always
resolved and classified against the sections the course offers **in that
schedule's term** (`lib/term-sections.ts`); Fall sections are never reused for
Winter.

## Scheduling behaviour

| Action | Result |
| --- | --- |
| Add a lab when a lecture is chosen | The lab is **added**. The lecture stays. |
| Choose a different lecture | Only the lecture changes. The lab stays. |
| Choose a different lab | Only the lab changes. The lecture stays. |
| Swap a lecture into a lab section | Refused (409 `component_mismatch`) — it would silently drop the lecture. |
| Remove one event | Removes that component only. |
| Remove entire course | Removes every component (`DELETE /schedules/:id/courses/:courseCode`). |

The Registrar data contains no linked-section rules, so none are enforced and
none are invented.

A course with only its lecture chosen is **not** shown as scheduled: the quarter
summary reads "Lecture selected · Lab required".

## Conflicts

Every component is its own event with its own meeting times, so a lab conflict is
detected exactly like a lecture conflict, and is named: "BIOL 1B-3 (Lab) and
PHYS 11-4 (Lab)".

## Degree Plan vs Quarter Plan

The Degree Plan holds **courses** ("BIOL 1B in Fall"). It never stores a section.
Quarter Plan turns a course into term-specific section components.

## Live availability

Each component section is its own availability record, so a course can be
"lecture open, lab 03 full, lab 04 open". See `SECTION_AVAILABILITY.md`.

## Data-quality audit

```bash
pnpm --filter @workspace/api-server run audit-components          # summary + findings
pnpm --filter @workspace/api-server run audit-components -- --all
```

Warnings for data maintainers; never shown to students as fact, never used to
classify. Current results for the bundled Registrar data:

| Finding | Count | Meaning |
| --- | --- | --- |
| `all_sections_one_component` | 0 | the bug this pass fixed |
| `conflicting_published_label` | 0 | |
| `lab_required_none_listed` | 64 | lab courses in tentative terms |
| `mixed_pattern_no_evidence` | 31 | once-a-week sections shown as "Other" |
| `truncated_description` | 1 | |

### Known data limitation

572 of 2,333 catalog descriptions are cut off ("…") in `courses-data.json`. A
lab sentence at the end of such a description is lost. PHYS 12 was affected; its
description was restored from the published SCU Undergraduate Bulletin 2026-27.
Courses titled "L&L" are unaffected. A lab course that has neither an L&L title
nor an intact description would be under-reported as lecture-only until the
catalog is re-imported.
