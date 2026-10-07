# The cross-reference workspace

_2026-10-06. Built at the professor's request: a student should be able to compare the three references they plan from, and move useful information from a Degree Checksheet into their own planning requirements._

## The model

Three references, three different kinds of truth. They stay separate; the pages only put them side by side.

| Surface | Region | What it answers | Whose |
| --- | --- | --- | --- |
| **Planning Requirements** | left sidebar | What am I planning, and what does CampusVal list for it? | Bulletin baseline + Department Notes + the student's own My Notes and edits ([BULLETIN_BASELINE.md](./BULLETIN_BASELINE.md), [REQUIREMENTS_SOURCE.md](./REQUIREMENTS_SOURCE.md)) |
| **Degree Checksheet** | center of `/degree-checksheets` | What does my department's checksheet say? | The department's document, shown as uploaded ([DEGREE_CHECKSHEETS.md](./DEGREE_CHECKSHEETS.md)) |
| **Workday APR** | right sidebar of `/degree-checksheets` (compact), center of `/progress-report` (full) | What does Workday say I have completed or declared? | Workday's export, shown as uploaded ([APR_SOURCE_FIDELITY.md](./APR_SOURCE_FIDELITY.md)) |

```
/degree-checksheets   Planning Requirements | Degree Checksheet | Workday APR (compact)
/progress-report      Planning Requirements | Full Academic Progress Report
```

The full APR page has **no** compact APR sidebar: its whole center already is the APR.
Workday is the definitive reference for degree completion. A checksheet does not override it, and the Planning Requirements are a planning aid, not the official list for any particular student's cohort. The benchmark those requirements are built from is still the professor's open decision ([REQUIREMENTS_SOURCE.md](./REQUIREMENTS_SOURCE.md)); this work does not change it.

## Manual comparison, on purpose

Nothing here compares the three for the student. CampusVal does **not** tick a checksheet item because an APR row looks similar, does not fuzzy-match courses, and uses no AI to map checksheet rows, decide completion or summarise requirements. The student looks across, decides, and acts. Where a link between a checksheet row and a requirement is shown, it is deterministic (below) and always changeable.

## One implementation of each sidebar

- `components/degree-plan/Palette.tsx` is the Planning Requirements sidebar. It is mounted only by the two workspaces (`DegreePlanWorkspace`, `PlanningComparisonWorkspace`). The same Edit requirements mode (edit, hide/restore, reset, My requirement) works on every page it appears on; Department Notes are read-only for students everywhere.
- `components/progress-report/WorkdayAprPanel.tsx` is the compact APR sidebar, shared with Degree Plan and Quarter Planning. Its content is unchanged (no Academic Period, Units or Grade; grouping, collapse, upload dates, several APRs).
- `components/degree-plan/usePlanningWorkspace.ts` is the one place that decides the active plan and loads its requirements. Every page that shows the sidebar reads and refreshes the **same query keys**, so a note saved on one page is on all of them at once, and nothing keeps a drifting copy. After any save the plan queries are refreshed by one predicate (every key under `/api/plans`).
- `lib/workspace-layout.ts` holds the column widths, the comparison pages' starting panel sizes and the region height, so Degree Plan, Tentative Degree Plan, Degree Checksheets and the APR page cannot drift apart (Degree Plan: left rail 260–320px, 320–400px from 1536px; compact APR 330–380px, 400–460px from 1536px. Comparison pages: left 24% of the workspace, 26% on the APR page, compact APR 27%, which at 1440px are the same ~320px and ~370px).
- `components/degree-plan/single-sidebar.structure.test.ts` fails if a second copy of any of this appears.

`PlanningComparisonWorkspace` is the shared layout for the two comparison pages. On wide screens each region scrolls on its own and the regions fill the screen below the header (the page itself does not scroll), so keeping your place in a checksheet is independent of the APR or the requirements list. The side panels can be hidden for a wider checksheet (remembered in `localStorage`, a convenience only). The main content renders at once; only the side panels wait for plan data.

The regions are resizable, with the resizable panels CampusVal already had (`components/ui/resizable.tsx`, `react-resizable-panels`; no new dependency): drag a handle, or focus it ("Resize Planning Requirements", "Resize Workday APR") and use the arrow keys. Each page remembers its sizes in this browser (`localStorage`, a convenience only). The limits keep the Workday text and the checksheet readable however far a student drags (a side panel 17–40% for the requirements, 21–40% for the APR; the checksheet never below 30%). Degree Plan and Tentative Degree Plan keep their fixed columns.

## The checksheet column

The center was made more economical without touching the document:

- the help card, the page actions and the document buttons are smaller;
- spreadsheet columns use the workbook's own widths at ~0.48rem a character (the Excel unit at the 12px shown), not the 0.6rem used before, which pushed the department's last columns out of view beside two side panels; the source's proportions are kept and nothing is hidden;
- the Status and Quarter selects are 32px tall (12px text) where three regions share the screen (≥1280px), and keep 36px for touch below that. Each keeps its full accessible name ("My status for …").

Every column of the uploaded document is still shown. Individual documents still collapse, and a collapsed one still loads nothing but its metadata.

## Which plan

The Planning Requirements belong to a plan, so the comparison pages have a **Compare against** selector listing the student's existing plans: *Degree Plan* and each *Tentative Degree Plan — name*. It starts from the plan the student was last looking at on any planning surface (Degree Plan, Tentative Degree Plan or a comparison page: `campusval.activePlanId`, per browser tab), then the Degree Plan, then the first plan there is. It **never creates a plan** and never copies one; with no plan it says so and links to the Degree Plan. Picking a plan here is remembered for the Tentative Degree Plan page too. The checksheet in the center and the APR on the right do not change when the plan does, and nothing blocks comparing a Finance checksheet with a Computer Science plan. (No mismatch reminder is shown: the only program a checksheet records is free text the student typed, which is not reliable enough to warn on.)

## Checksheet → Planning Requirements

An explicit, previewed action. Nothing is imported automatically.

**Where it starts (web)**

- a spreadsheet checksheet row: the *Add row N to my Planning Requirements* control beside the row number;
- a My Tracking entry: the same control on the entry (its words and the student's note);
- the document toolbar: *Add to planning*, starting from whatever text the student has selected **in that document**, or from nothing (the student writes the note).

**Where it starts (mobile app):** the sheet that opens for any tracked cell, marker or My Tracking entry has *Add to planning*; the document's toolbar has it too.

**The dialog** (`AddToPlanningDialog` on the web, `AddToPlanningSheet` in the app) shows what is being taken and where it goes: *Saved to Tentative Degree Plan — Finance*. The student chooses:

1. **Add as My Note to a requirement.** The target is preselected **only** when a course code written in the text (for example `BIOL 1A`) is a course of exactly one requirement of the selected plan, and no other requirement lists any of them. Otherwise the student searches the plan's requirements and picks one. The reason for a preselection is shown and it is one click to change.
2. **Create a Custom Requirement**, under a group the student picks. It is labelled *My requirement*, is not Bulletin content, and never counts toward the degree.

The note text is a draft the student edits before saving. If the requirement already has a My Note, the student chooses *Add to it* (the default) or *Replace it*; adding words that are already in that note is refused, with *Replace*, edit or cancel offered instead.

These rules are written once, in `lib/api-client-react/src/checksheets/transfer.ts`, and used by both apps.

**Where it is saved.** Through the same operation the sidebar's own *Edit requirements* uses (`PUT /plans/:id/requirement-customizations` for a note, `POST /plans/:id/custom-requirements` for a custom requirement). There is no second notes system. It is always a **My Note** or a **My requirement**: a student cannot create a Department Note, and a note from a student's checksheet is never promoted to one. The data model would let a department administrator later review such notes and write a Department Note themselves; that stays a separate, deliberate act.

**After saving.** A small toast ("Added to My Note", "Added to Planning Requirements"; in the app, a line under the document's toolbar), the sidebar refreshes through the shared plan queries, opens the group and scrolls to the requirement with a brief highlight. A new My requirement is found once the refreshed requirements arrive. If the sidebar is not mounted (a narrow screen), nothing happens and nothing breaks. Focus returns to the control that opened the dialog.

## Plan scope

Every transfer is attached to the plan selected in *Compare against* (or chosen in the app's sheet).

| Plan | Behaviour |
| --- | --- |
| Degree Plan | the note is on the Degree Plan only |
| Tentative Degree Plan A | the note is on A only; the Degree Plan and plan B do not have it unless added there |
| Duplicating a Tentative Degree Plan | the My Notes (provenance included) are **copied**; the copy is independent, and editing it never changes the original |
| Deleting a plan | its notes go with it (`ON DELETE CASCADE`) |
| Quarter Planning | uses the same plan data; the planning sidebar there is unchanged, and a My requirement never counts as completion |

## Provenance and the source document

A transferred note keeps a lightweight pointer: `noteSource = { type: "DEGREE_CHECKSHEET", label, anchor, documentAvailable }`, stored in four nullable columns of `requirement_customizations` (migration `0007_note_source_provenance`). The sidebar shows it as "From: <checksheet title>".

- **No file content** is stored; the note holds only the words the student chose to save. The anchor is a safe pointer: `Biology!row 40` for a spreadsheet row, `annotation:<id>` for a My Tracking entry, nothing for free text.
- **The label comes from the document**, read on the server, never from the request. The document must be the signed-in student's own: another student's id is refused (400), not trusted.
- **No foreign key.** Replacing the checksheet changes nothing about existing notes. Deleting it leaves the note and shows that its source is no longer available (`documentAvailable: false`).
- Clearing the note clears where it came from. Deleting a My Note never touches the checksheet.

The uploaded file, its rendered source and its original content are never modified by any of this.

## Privacy

- Checksheets and APRs stay **owner-private** and server-enforced. The comparison pages list the signed-in student's own plans; mounting the shared sidebar adds no endpoint that returns checksheet or APR data to anyone else, and sharing a plan with an advisor shares neither a checksheet, an APR nor the student's My Notes (the advisor's read-only plan view carries plan items only).
- My Notes follow the plan's existing permissions: only the owner edits; an advisor with a share cannot read or write them (`ownedPlan` on every route).
- The one new reader of checksheet tables, `lib/checksheets/note-source.ts`, selects only `id` and `title` of the signed-in student's own documents. `degree-checksheets.access-control.test.ts` pins that, and that the original route module remains the only reader of the content.
- Department Notes remain global, program-scoped and administrator-only.

## Responsive

- **≥1280px (`xl`):** three regions on Degree Checksheets, two on the APR page; the regions can be resized (drag or arrow keys) and both side panels can be hidden; each region scrolls on its own.
- **Below 1280px:** the main content takes the width and the page scrolls normally (no scroll region inside a phone screen). *Planning Requirements* (and, on Degree Checksheets, *Academic Progress Reports*) open as drawers from the toolbar, which wraps rather than widening the page. The transfer dialog works at every width. Checked at 1600, 1440, 1280, 1024, 768, 430 and 390px.

## Accessibility

Each region is a labelled landmark (`Planning Requirements`, the main content, `Workday APR`); the main region can take keyboard focus; side-panel toggles expose `aria-pressed`. The transfer dialog is a Radix dialog: focus is trapped, and on closing it returns to the control that opened it (Radix only does that for its own trigger, so the dialog does it itself). Its requirement list is a labelled list of real buttons; choosing one moves focus to the note, and *Choose a different requirement* moves it back to the search. The whole transfer works from the keyboard (an e2e test drives the dialog with Tab, Enter and Escape only). The axe suite reports no serious or critical violations on either page or in the dialog.

## Tests

| What | Where |
| --- | --- |
| Layout, regions, scrolling, resize handles (named, keyboard-operable, shared starting sizes), collapse, plan selector, drawers, main renders while the plan loads | `PlanningComparisonWorkspace.test.tsx` |
| Which plan each page starts from; one requirements query for one plan | `usePlanningWorkspace.test.tsx` |
| One sidebar, one APR panel, one requirements query, shared widths | `single-sidebar.structure.test.ts` |
| Show where it went (incl. a new My requirement), "From:" and a deleted source | `Palette.focus.test.tsx` |
| Target selection, appending, replacing, duplicates, lengths, custom requirement | `AddToPlanningDialog.test.tsx` |
| The same rules in the mobile app; plan choice; what is sent | `campusval-mobile/lib/planning-transfer.test.ts` |
| API: scope, label from document, other student refused, replace/delete source, duplicate plan, clearing | `routes/note-source.test.ts` |
| Provenance reader is narrow and owner-scoped | `degree-checksheets.access-control.test.ts` |
| Live browser: three-panel layout and scrolling, resizing by drag and by keyboard (remembered across a reload), transfer from a row, from My Tracking to the Degree Plan, no-match flow, duplicate, custom requirement, keyboard only, CTW stays Core after checksheet notes about it are moved over (data and both sidebars; the Major lists no Core area), APR page (edit there, APR unchanged), advisor share leaks nothing, replace then delete the source, another student, five widths, a phone-width transfer | `artifacts/e2e/tests/cross-reference.spec.ts` (project `cross-reference`) |
