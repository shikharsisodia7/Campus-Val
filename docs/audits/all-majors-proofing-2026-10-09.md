# All majors proofed against the 2026-27 Bulletin (2026-10-09)

Follows [biology-proofing-2026-10-09.md](./biology-proofing-2026-10-09.md): the other 49 majors were proofed and transcribed the
same way. Design and rules: [../BULLETIN_BASELINE.md](../BULLETIN_BASELINE.md#structured-majors-every-major-as-the-bulletin-writes-it).

## Method

1. Read every Chapter 3–5 Bulletin page (2026-27 Undergraduate Bulletin, live on 2026-10-09) and kept each major's "Requirements for
   the Major" text **word for word** (`artifacts/api-server/src/data/majors/bulletin-text-2026-27.json`), plus the page's optional
   emphases/concentrations where the Bulletin gives course-level requirements.
2. Transcribed each into a `MajorStructure` (`data/majors/soe.ts`, `lsb.ts`, `cas-sciences.ts`, `cas-arts.ts`; Biology in
   `biology.ts`). Nothing is inferred: a requirement whose course list the Bulletin does not print is shown in its words for the
   student to track ("you track this one"), never counted from courses.
3. Checked every structure mechanically (`major-structures.all.test.ts`, 351+ checks): every course it names is named by its
   Bulletin text; every course exists in the catalog or is on the recorded not-attributable list; every list is used and non-empty;
   every key is unique across tracks; every track is complete.
4. Checked the catalog: 121 missing courses imported from the Bulletin's own course listings; 50 catalog entries filed under a
   stale subject re-coded (SCTR/TESP had been filed as RSOC, GNSX as WGST), with aliases kept for saved data.
5. Re-read every page live with `pnpm run diff:bulletin-source -- --out docs/audits`: **50 of 50 majors' stored text unchanged**
   ([bulletin-source-diff.md](./bulletin-source-diff.md)).

## What changed for every major

The previous data described each major (except Biology) as a flat lower-division list and upper-division list. Those lists
simplified the Bulletin's choice structures and, for most majors, named courses no requirement names. Examples: Psychology listed
PSYC 51L, 100, 110 and 145; History listed HIST 11B and 100W; Music listed MUSC 11–13 and 50; Women's & Gender Studies listed
WGST 110, 137, 145, 175; Physics listed MATH 22 (the Bulletin: AMTH 106 or MATH 23); every engineering major ended in ENGR 110,
which the Bulletin lists only as one professional-development option. All of those lists are gone; the four-year examples are now
derived from the structures (one selection that satisfies them, from catalog courses only).

## Tracks, emphases and concentrations now modeled

| Major | Kind | Required? |
| --- | --- | --- |
| Bioengineering | 3 tracks (biomolecular, medical-device, pre-med) | yes |
| Classics and Ancient Studies | 3 tracks | yes |
| Computer Science (B.S. Arts & Sciences) | 4 emphases | yes |
| Public Health Science | 2 emphases | yes |
| Theatre Arts | 2 emphases (Theatre, Dance) | yes |
| Mathematics | 5 emphases | optional |
| Communication | 6 emphases | optional |
| Political Science | 3 emphases | optional |
| Philosophy | 5 emphases | optional |
| Art History | Arts Management emphasis | optional |
| Studio Art | 2 emphases | optional |
| Economics (both schools) | 2 concentrations | optional |

Marketing's emphases only recommend courses ("an emphasis will not appear on a student's transcript"), so they are lists inside the
elective requirement. Anthropology's emphasis programs state no course requirements, so they are a note.

## Findings for departments (flagged, not guessed)

- **Accounting and Information Systems** is stated on two department pages that differ: Information Systems and Analytics lists
  "OMIS 105, 106, and 150 (or ACTG 155)"; Accounting lists "OMIS 105, 106, and ACTG 155" and says majors "are required to enroll
  in ACTG 155". CampusVal accepts either and shows both texts on the requirement.
- **Civil Engineering** lists "CENG … 41, 44, 43L …" without CENG 43. Transcribed as written; flagged in the structure note.
- **Finance**: "Math 12 or 31 or FNCE 186", and FNCE 186 "qualifies as one of the four upper-division finance electives". CampusVal
  counts a course once, so FNCE 186 used for the first is not counted again; the requirement says so.
- **Anthropology** writes "BIO 160/ENVS 110"; transcribed as BIOL 160 (recorded as a source correction).
- **Philosophy**: the PHIL 40–45 requirement is "waived for students who completed a Foundations Core sequence in Philosophy";
  CampusVal does not apply the waiver automatically and says so.
- **Gender and Sexuality Studies** uses the subject GNSX throughout; the catalog snapshot used WGST. Courses the GNSX page itself
  names were re-coded; WGST courses the Bulletin does not attribute stay WGST (aliases resolve old saved codes either way).
- **Religious Studies**: the three areas are the Bulletin's subjects SCTR, TESP and RSOC. The catalog had filed SCTR and TESP courses
  as RSOC; 41 were re-coded where the Bulletin's own section heading names the subject. The Bulletin does not mark which courses are
  seminars, so the three area seminars are a tracked requirement.
- **Biology** (from the Biology audit, still open): BIOL 189 vs 189A/189B.

## Requirements shown for the student to track (CampusVal cannot count them from course codes)

Engineering professional development / educational enrichment; Mechanical Engineering's 12 technical-elective units; Bioengineering
technical-elective units (recommended courses listed to browse); General Engineering's 36-unit concentration; Engineering Physics'
five-course cluster; Web Design's University Core natural science; Chemistry's four quarters of CHEM 115; Environmental Science and
Studies approved lists and internship; Public Health approved electives and internship; English's historical, concentration,
theory and seminar requirements; Religious Studies area seminars; Gender and Sexuality Studies' concentration; Classics language
and course-count requirements; Art History's advanced-writing course and arts-management items; Studio Art's global and modern
ARTH courses; Music's applied instruction and ensemble units; Theatre's THTR 39/139 units and Dance ballet/jazz levels; French and
Italian upper-division unit totals; Spanish's literature-and-culture course; History's senior project note; Political Science
internship and off-campus items.

## Leavey School of Business core

The school group was missing OMIS 34 (information systems), MGMT 196, the upper-division Common Core of Knowledge (FNCE 121, MGMT 160,
MKTG 181, OMIS 108) and the MGMT 162 capstone. All are now in the Leavey School of Business group, sourced to the Bulletin's
undergraduate-degrees page; Leavey core courses are not counted as major electives.

## Course codes the Bulletin names but its listings do not attribute (77)

Listed in `major-structures.all.test.ts` (`NOT_IN_CATALOG`). Each is still shown by code, with "not in CampusVal's course catalog —
verify in the Bulletin". They are numbers listed on several pages, combined headings, seminar sections such as "199R", or courses
no 2026-27 listing includes. A new missing code fails the test.

## Production data checked before the change (read-only, counts only)

- No plan item, schedule event, section, completed course or APR mapping used a re-coded subject (RSOC/WGST/SCTR/TESP/GNSX/RELS).
- 406 department notes; 18 sit on major item keys (16 published). Four published notes point at keys the restructure replaced
  (`chemistry-b-a#math-11`, `#math-12`, `mathematics#math-101`, `public-health-science#chem-11`); they now follow the course to
  `#mathematics`, `#geometry-discrete-applied` and `#health-science-chem-11` (tested in `stable-keys.test.ts`).
- One student customization (`major:biology#math-35`, orphaned since the Biology restructure) now follows MATH 35 to
  `#mathematics`, with the "source changed" notice.
