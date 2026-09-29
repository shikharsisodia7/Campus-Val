# Accessibility testing

_2026-09-28._

## What has been checked, and how

| Check | How | Where |
| --- | --- | --- |
| WCAG 2.0 / 2.1 A and AA rules a machine can test | axe-core, in a real browser, on each page and state below, at 1440x900 and at 390x844 | `artifacts/e2e/tests/accessibility.spec.ts` |
| Keyboard | The same spec: opening a document, setting a status, leaving a dialog with Escape, placing an entry, reaching Degree Checksheets through the menu, all without a pointer | same |
| Names, roles and states of the tracking controls | Component tests | `scu-advising/src/components/degree-checksheets/checksheet-views.test.tsx` |
| Native app | Every control has an accessibility role and label; touch targets are 44 points or more | `campusval-mobile/components/checksheets/*` |

Pages and states checked by axe: Dashboard, Degree Plan, Quarter Plan,
Tentative Degree Plan, Academic Progress Report, Core requirements; Degree
Checksheets when empty, the upload dialog, a spreadsheet with tracking, the
replace form, after a replacement, while placing an entry; a PDF, a picture, a
Word document and a legacy workbook; the Additional Features menu and the
mobile drawer.

The spec fails on any **serious** or **critical** finding. Moderate and minor
findings do not fail it; they are written, per state, to
`artifacts/e2e/test-results/accessibility/*.json`, so they are recorded rather
than hidden.

Run it:

```
E2E_BASE_URL=http://localhost:18080 pnpm --filter @workspace/e2e run test:a11y
```

## Result on 2026-09-28

34 page states, at 1440x900 and at 390x844: **no finding of any severity**
after the fixes below. Before them the first run found these, all of which
predate Degree Checksheets except the last two:

| Finding | Severity | Where | Fix |
| --- | --- | --- | --- |
| Select with no name | critical | Quarter Plan: academic year, schedule | Named "Academic year", "Schedule" |
| Close button with no name | critical | Every notification | Named "Dismiss this message" |
| Progress bar with no name, and no value announced | serious | Dashboard, Core requirements | Named; the value is now given to the bar |
| White text on gold, 3.2:1 | serious | Badges and buttons, 20 on Core requirements | Dark text on the same gold, 5.5:1 |
| Red text and buttons, 3.8:1 | serious | Delete, errors, conflicts | A darker red, 6.5:1 on white |
| Grey text at 60% strength, 2.5:1 | serious | Empty terms on the Degree Plan | Full strength, 5.7:1 |
| Pinch zoom disabled | moderate | Every page | Allowed |
| A button that held a file input | serious | Upload dialog | The area takes a click or a drop; a real button inside it is what the keyboard reaches |
| A document that was already open was assumed closed | test | The spec | The spec now closes it first |

One rule is turned off in one state, and the reason is in the spec: while the
Additional Features menu is open, the page behind it is hidden from assistive
technology, and axe reports the hidden page's controls as focusable. They
cannot be reached; focus is held in the menu, which the spec proves with the
keyboard.

## What has NOT been checked

**No one has used CampusVal with a screen reader.** The machine this work was
done on has no screen reader set up for testing, and an automated check finds
about a third of accessibility problems. It cannot tell whether a page makes
sense when it is heard.

The native app has not been run with VoiceOver or TalkBack either.

## Script for a person with a screen reader

About 30 minutes. Use NVDA or JAWS with Chrome or Firefox on Windows, VoiceOver
with Safari on a Mac or an iPhone, or TalkBack on Android. Sign in as a test
student. Write down anything that is silent, wrong, repeated, or confusing.

### Degree Checksheets

1. From the Dashboard, reach **Degree Checksheets** through Additional
   Features. _The menu is announced as a menu, and its items by name._
2. With nothing uploaded, listen to the page. _A heading, what the feature is,
   and two actions: Upload Checksheet, Find SCU Degree Checksheets._
3. Open **Upload Checksheet**. _A dialog is announced. Focus is inside it and
   stays inside it._ Choose a file. Leave the title empty and submit. _The
   error is announced, and it says what to do._
4. Give a title and upload. _"Uploading", then the document, are announced
   without moving focus somewhere unexpected._
5. Find the document. _Its title, what it is, and "Uploaded" with a date._
   Open it. _It is announced as expanded._
6. In a spreadsheet, move through the table by row and by column. _Row and
   column positions are announced. The department's cells are text._
7. Find a cell marked **My tracking**. _It is announced as yours, and as not
   changing the original document._ Set a status, then a quarter and a year.
   _Each control says what it is for ("My status for Introduction to ...")._
   _"Saving", then "Saved", are announced._
8. Choose **Show original only**. _The tracking controls are gone, the
   department's text is still there._
9. Choose **Track a cell**, then a cell. _It says what will be tracked._
10. In **My Tracking**, add an item, change it, remove it.
11. Replace the file with a different version. _The result is announced: how
    many entries stayed, how many need you._ Find the entries set aside.
    Choose **Place in a cell**, then **Place here** in a row. _It is announced
    where the entry now is._
12. On a PDF, choose **Add a marker**. _It can be placed without a pointer._
    Open the marker and set a status.
13. Delete a document. _A confirmation is announced, and says what will be
    deleted._

### The rest of CampusVal

14. **Academic Progress Report**: upload one, open it, move through the table.
15. **Degree Plan**: reach the requirements list, a term, a course. Add a
    course from the keyboard. Open Plan Controls and leave it with Escape.
16. **Quarter Plan**: find a course, view its sections, add a section. _Open,
    Full, Waitlist and Unknown are said in words, not by colour._
17. At a narrow width (or on a phone): open the navigation drawer and the APR
    drawer, and leave each.

### The mobile app

18. With VoiceOver or TalkBack on: the **Checksheets** tab, a document, a
    "My tracking" cell, the status sheet, Done. _Each option says whether it is
    selected._ Swipe sideways through a wide sheet.

Report what you find through **Report Error** in the app, or to the
maintainers. See `docs/FEEDBACK_AND_ERROR_REPORTING.md`.
