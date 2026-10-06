# The cross-reference workspace

_2026-10-06. Built at the professor's request: a student should be able to compare the three references they plan from, and move useful information from a Degree Checksheet into their own planning requirements._

## The model

Three references, three different kinds of truth. They stay separate; the pages only put them side by side.

| Surface | Region | What it answers | Whose |
| --- | --- | --- | --- |
| **Planning Requirements** | left sidebar | What am I planning, and what does CampusVal list for it? | Bulletin baseline + Department Notes + the student's own My Notes and edits ([BULLETIN_BASELINE.md](./BULLETIN_BASELINE.md)) |
| **Degree Checksheet** | center of `/degree-checksheets` | What does my department's checksheet say? | The department's document, shown as uploaded ([DEGREE_CHECKSHEETS.md](./DEGREE_CHECKSHEETS.md)) |
| **Workday APR** | right sidebar of `/degree-checksheets` (compact), center of `/progress-report` (full) | What does Workday say I have completed or declared? | Workday's export, shown as uploaded ([APR_SOURCE_FIDELITY.md](./APR_SOURCE_FIDELITY.md)) |

```
/degree-checksheets   Planning Requirements | Degree Checksheet | Workday APR (compact)
/progress-report      Planning Requirements | Full Academic Progress Report
```

The full APR page has **no** compact APR sidebar: its whole center already is the APR.
Workday is the definitive reference for degree completion. A checksheet does not override it, and the Planning Requirements are a planning aid, not the official list for any particular student's cohort.

## Manual comparison, on purpose

Nothing here compares the three for the student. CampusVal does **not** tick a checksheet item because an APR row looks similar, does not fuzzy-match courses, and uses no AI to map checksheet rows, decide completion or summarise requirements. The student looks across, decides, and acts. Where a link between a checksheet row and a requirement is shown, it is deterministic (below) and always changeable.

## One implementation of each sidebar

- `components/degree-plan/Palette.tsx` is the Planning Requirements sidebar. It is mounted only by the two workspaces (`DegreePlanWorkspace`, `PlanningComparisonWorkspace`).
- `components/progress-report/WorkdayAprPanel.tsx` is the compact APR sidebar, shared with Degree Plan and Quarter Planning.
- `components/degree-plan/usePlanningWorkspace.ts` is the one place that decides the active plan and loads its requirements. Every page that shows the sidebar reads and refreshes the **same query keys**, so a note saved on one page is on all of them at once, and nothing keeps a drifting copy.
- `lib/workspace-layout.ts` holds the column widths, so Degree Plan, Tentative Degree Plan, Degree Checksheets and the APR page cannot drift apart (left rail 260–320px, 320–400px from 1536px; compact APR 330–380px, 400–460px from 1536px).
- `components/degree-plan/single-sidebar.structure.test.ts` fails if a second copy of any of this appears.

`PlanningComparisonWorkspace` is the shared layout for the two comparison pages: each region scrolls on its own (keeping your place in a checksheet is independent of the APR), the side panels can be hidden for a wider checksheet (remembered in `localStorage`, a convenience only), and below `xl` the same two panels open as drawers instead of three crushed columns.

## Which plan

The Planning Requirements belong to a plan, so the comparison pages have a **Compare against** selector listing the student's existing plans: *Degree Plan* and each *Tentative Degree Plan*. It starts from the plan the student last used on any planning surface (`campusval.activePlanId`), then the Degree Plan, then the first plan there is. It **never creates a plan** and never copies one; with no plan it says so. Picking a plan here is remembered for the Tentative Degree Plan page too. The checksheet in the center and the APR on the right do not change when the plan does, and nothing blocks comparing a Finance checksheet with a Computer Science plan.

## Checksheet → Planning Requirements

An explicit, previewed action. Nothing is imported automatically.

**Where it starts**

- a spreadsheet checksheet row: the *Add to planning* control beside the row number;
- a My Tracking entry's note: the same control on the entry;
- the document toolbar: *Add to planning*, starting from whatever text the student has selected.

**The dialog** (`AddToPlanningDialog`) shows what is being taken, and where it goes: *Saved to <plan>*. The student chooses:

1. **Add as My Note to a requirement.** The target is preselected **only** when a course code written in the text (for example `BIOL 1A`) is a course of exactly one requirement of the selected plan, and no other requirement lists any of them. Otherwise the student searches the plan's requirements and picks one. The reason for a preselection is shown and it is one click to change.
2. **Create a Custom Requirement**, under a group the student picks. It is labelled *My requirement*, is not Bulletin content, and never counts toward the degree.

The note text is a draft the student edits before saving. If the requirement already has a My Note, the student chooses *Add to it* or *Replace it*; an exact duplicate of what is already there is refused.

**Where it is saved.** Through the same operation the sidebar's own *Edit requirements* uses (`PUT /plans/:id/requirement-customizations` for a note, `POST /plans/:id/custom-requirements` for a custom requirement). There is no second notes system. It is always a **My Note** or a **My requirement**: a student cannot create a Department Note, and a note from a student's checksheet is never promoted to one. The data model would let a department administrator later review such notes and write a Department Note themselves; that stays a separate, deliberate act.

**After saving.** A small toast ("Added to My Note", "Added to Planning Requirements"), the sidebar refreshes through the shared plan queries, opens the group and scrolls to the requirement with a brief highlight. If the sidebar is not mounted (a narrow screen), nothing happens and nothing breaks.

## Plan scope

Every transfer is attached to the plan selected in *Compare against*.

| Plan | Behaviour |
| --- | --- |
| Degree Plan | the note is on the Degree Plan only |
| Tentative Degree Plan A | the note is on A only; the Degree Plan and plan B do not have it unless added there |
| Duplicating a Tentative Degree Plan | the My Notes (provenance included) are **copied**; the copy is independent, and editing it never changes the original |
| Quarter Planning | uses the same plan data; the planning sidebar there is unchanged |

## Provenance and the source document

A transferred note keeps a lightweight pointer: `noteSource = { type: "DEGREE_CHECKSHEET", label, anchor, documentAvailable }`, stored in four nullable columns of `requirement_customizations` (migration `0007_note_source_provenance`). The sidebar shows it as "From: <checksheet title>".

- **No file content** is stored; the note holds only the words the student chose to save. The anchor is a safe pointer such as `Biology!row 40`.
- **The label comes from the document**, read on the server, never from the request. The document must be the signed-in student's own: another student's id is refused (400), not trusted.
- **No foreign key.** Replacing the checksheet changes nothing about existing notes. Deleting it leaves the note and shows that its source is no longer available (`documentAvailable: false`).
- Clearing the note clears where it came from. Deleting a My Note never touches the checksheet.

The uploaded file, its rendered source and its original content are never modified by any of this.

## Privacy

- Checksheets and APRs stay **owner-private** and server-enforced. The comparison pages list the signed-in student's own plans; mounting the shared sidebar adds no endpoint that returns checksheet or APR data to anyone else, and sharing a plan with an advisor does not share a checksheet or an APR.
- My Notes follow the plan's existing permissions: an owner edits; a read-only viewer cannot.
- The one new reader of checksheet tables, `lib/checksheets/note-source.ts`, selects only `id` and `title` of the signed-in student's own documents. `degree-checksheets.access-control.test.ts` pins that, and that the original route module remains the only reader of the content.
- Department Notes remain global, program-scoped and administrator-only.

## Responsive

- **xl and wider (≥1280px):** three regions on Degree Checksheets, two on the APR page; both side panels can be hidden.
- **Below xl:** the main content takes the width. *Planning Requirements* (and, on Degree Checksheets, *Academic Progress Reports*) open as drawers from the toolbar. The transfer dialog works at every width. Checked at 1440, 1280, 1024, 768 and 430px.

## Accessibility

Each region is a labelled landmark (`Planning Requirements`, the main content, `Workday APR`); the main region can take keyboard focus so it can be scrolled with the keyboard; side-panel toggles expose `aria-pressed`; the transfer dialog is a Radix dialog (focus is trapped and returned to the control that opened it), its target list is a labelled listbox of buttons, and every control has a label. The axe suite reports no serious or critical violations on either page.

## Tests

| What | Where |
| --- | --- |
| Layout, regions, scrolling, collapse, plan selector, drawers | `PlanningComparisonWorkspace.test.tsx` |
| One sidebar, one APR panel, one requirements query, shared widths | `single-sidebar.structure.test.ts` |
| Target selection, appending, duplicates, custom requirement | `AddToPlanningDialog.test.tsx` |
| API: scope, label from document, other student refused, replace/delete source, duplicate plan, clearing | `routes/note-source.test.ts` |
| Provenance reader is narrow and owner-scoped | `degree-checksheets.access-control.test.ts` |
| Live browser: three-panel scrolling, transfer, persistence across pages, no-match flow, duplicate, custom requirement, APR page, deleted source, another student, five widths | `artifacts/e2e/tests/cross-reference.spec.ts` (project `cross-reference`) |

## Not in the native app

The Expo app has Degree Checksheets and the Degree/Quarter plans, but no Planning Requirements sidebar and no My Notes, so there is nothing to add a checksheet note to there. The transfer exists on the web, including the mobile browser. See the end of [DEGREE_CHECKSHEETS.md](./DEGREE_CHECKSHEETS.md#mobile-app).
