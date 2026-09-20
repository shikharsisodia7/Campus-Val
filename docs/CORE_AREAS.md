# University Core areas: one definition, traceable tags

Professor feedback (2026-09): clicking a Core category such as **Critical Thinking
& Writing (CTW)**, **Advanced Writing** or **Cultures & Ideas (C&I / "CNI")**
returned nothing, a partial list, or a one-row results window.

## Root causes (all fixed)

1. **Tags came only from department/number heuristics.** SCU's bulletin scrape did
   not capture per-course Core designations, so `data/courses.ts` guessed
   (e.g. "ENGL 1–2 ⇒ CTW"). The bulletin **text** does state designations outright
   ("Satisfies the Ethics Core requirement…", "Successful completion of CTW I
   (PHIL 1A)…", "This course fulfills the ELSJ University Core requirement") and was
   ignored. Result: 2 courses tagged CTW, 27 Advanced Writing, 0 ELSJ, 0 C&I 3.
2. **Three private definitions** of "what is CTW" (the tag table, the requirement-id
   map in `core-cross-satisfaction.ts`, and none at all in the UI).
3. **A Core requirement in a plan had an empty course list** (only Leavey lists
   courses), so clicking it offered only "Add placeholder".
4. **The Quarter Plan Filter tab's results were `flex-1` inside `h-full`** beneath
   tall controls, so results collapsed to about one card; results were also
   silently limited to 20, and to courses with sections that quarter.

## The canonical layer — `artifacts/api-server/src/data/core-areas.ts`

- `CORE_AREAS`: every area with its canonical tag, short code, aliases and the
  requirement ids it satisfies. Aliases are resolved everywhere a Core area is typed
  or passed: `CTW`, `ctw 1`, `CNI`, `C&I`, `c and i`, `AW`, `ELSJ`, `RTC`, `STS`…
  A unit test asserts no alias belongs to two areas.
- `deriveCoreAreas(course)`: the tags a course carries **and why**.

| Provenance | Meaning | Shown to the student as |
| --- | --- | --- |
| `catalog_text` | The course's own bulletin title/description states the designation; the sentence is stored (`coreAreaEvidence`). | "Stated in Bulletin" |
| `heuristic` | Inferred from department + course number (the original rule). | "Inferred — confirm" |

  An explicit bulletin negation ("Does not fulfill the … Core requirement in
  mathematics") **suppresses** the area even if a heuristic would add it. Sentences
  about a *different* course ("…can use CLAS 23 to satisfy…") and "elective"
  wording are never attributed to the course.
- **Nothing is invented.** An area with no bulletin text and no rule (Pathways) has
  no mapping; the UI says "CampusVal doesn't have course tagging for this requirement
  yet" and links to the SCU source. An area that exists but has zero tagged courses is
  shown disabled with the same honesty.

Result on the real catalog (2,333 courses): CTW 2 → 5, Advanced Writing 27 → 33,
Cultures & Ideas 66 → 75, C&I 3 0 → 2, ELSJ 0 → 6, Civic Engagement 9 → 11, STS 13 → 16;
`MATH 9S` (explicitly not Core) is no longer tagged Mathematics.

**Known data gap:** the bulletin scrape collapsed paired sequence courses into one
row (`ENGL 1A` "and 2A. Critical Thinking & Writing I and II"). The catalog has no
separate `ENGL 2A` entry, so CTW 2 shows the same course list as CTW 1. This is a
scrape limitation; it is stated, not papered over.

## Behaviour

- **API**: `GET /api/course-search?coreAreas=CTW` resolves aliases through the single
  table; `limit`/`offset`/`hasMore` page any category completely; `offeredOnly=false`
  returns the whole catalog set with per-course section counts (offered first) instead
  of hiding courses with no sections; `q=CTW` alone means the Core area. Unknown
  names return an honest empty result, never the whole catalog.
  `GET /api/core-areas` lists every area with `courseCount`, `catalogStatedCount`,
  `requirementIds`. Requirement items carry `coreArea` so the UI knows what to search.
- **Degree Plan / Tentative Degree Plan**: each unmet Core requirement has
  "Find courses (CTW) N" → a scrollable, paged list with Add buttons.
- **Quarter Plan → Filter**: keyboard-operable chips (with codes and counts), All/Any,
  keyword, "Only courses offered in <quarter>" (off by default), Clear filters, and a
  bounded, focusable results region with "Show more". "View sections" jumps to the
  Find tab.
- Both use the same paged search hook and result component, so they cannot disagree.

## Tests

`data/core-areas.test.ts` (rules on synthetic text + the real catalog),
`routes/course-search.core-areas.test.ts` (HTTP), `course-discovery.test.tsx` and
`RequirementCourseDiscovery.test.tsx` (UI: paging, states, aliases, chips, add).
