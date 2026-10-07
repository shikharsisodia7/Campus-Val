# Catalog gaps behind the 108 `course_not_in_catalog` audit warnings

> **Update, 2026-10-06 evening: 30 of these codes are now in the catalog, 59 remain (70 warnings, was 108).**
> `pnpm --filter @workspace/api-server run import:bulletin-courses -- --write` reads the 2026-27 Bulletin's own
> course listings (chapters 3 to 5) rather than searching page text for a code. A listing is a heading such as
> "142. Feedback Control Systems" followed by a description ending "(4 units)"; the heading has no subject code,
> so a course is attributed to a subject only when the nearest catalogued courses before and after it on the same
> page belong to that subject. A code is added only when exactly one listing qualifies and it states its units; its
> title, units and description are the Bulletin's, its prerequisite sentence is kept word for word, no prerequisite
> rules are inferred, and each entry's `notes` names the Bulletin page it came from.
>
> Added: ANTH 5, ARTH 106, BIOL 11, BIOL 189A, BIOL 189B, COMM 129, COMM 142, COMM 153, COMM 160, ENGL 179AW,
> ENGL 91, ETHN 20, FNCE 127, FNCE 128, FNCE 129, FREN 101, HIST 182B, ITAL 100, MECH 121R, MECH 142, MGMT 136,
> MGMT 176, MKTG 175, MKTG 188, MKTG 190, MUSC 128, SOCI 149, THTR 165, THTR 41, THTR 42.
>
> Eight of those (BIOL 11, BIOL 189B, COMM 129, COMM 153, ENGL 179AW, MGMT 176, MUSC 128, THTR 42) were in group
> **B** below: the text search missed them because listings omit the subject code. They are in the 2026-27 Bulletin. The remaining 59 are still listed below; the importer reports each one it
> could not place (ranges such as "CHIN 100-102", combined lecture/lab entries, multi-paragraph descriptions such as
> MUSC 133, or no listing at all) and leaves it for a person. One visible effect: the Mechanical Engineering major now
> shows MECH 142 as a requirement instead of a "not in our catalog" note.

_2026-10-06. Evidence from crawling the 68 department pages of the 2026-27 Undergraduate Bulletin (chapters 3 to 5) and searching them for each code._

The course catalog is the **2025-26** scrape; the requirement data names **2026-27** courses. 89 distinct codes are affected. They split into:

## A. 57 codes the 2026-27 Bulletin mentions (the catalog snapshot is missing them)

The Bulletin names them in requirement lists or course listings, but several pages list courses only as ranges ("CHIN 100-102"), as
combined lecture/lab entries ("MECH 142/142L") or by pointing at another department, so a title, unit count and description cannot be read
reliably from the page for every one. Adding them needs the catalog rebuilt from the 2026-27 course listings, not a guess.

| Code | Programs that require it |
| --- | --- |
| ACTG 11A | International Business (INTB-MIN), Retail Studies (RTLM-MIN) |
| ANTH 5 | Sustainable Food Systems (SFS-MIN) |
| ARAB 23 | International Business (INTB-MIN) |
| ARTH 106 | Classics and Ancient Studies (CLAS-MIN) |
| ASCI 150 | Catholic Studies (CTHL-MIN) |
| ASCI 198 | Professional Writing (PWRT-MIN) |
| BIOL 189A | Biotechnology (BTEC-MIN) |
| BUSN 197 | Entrepreneurship (ENTR-MIN) |
| CHIN 100 | Chinese and Sinophone Studies (CHIN-MIN) |
| CHIN 101 | Chinese and Sinophone Studies (CHIN-MIN) |
| CHIN 23 | Chinese and Sinophone Studies (CHIN-MIN), International Business (INTB-MIN) |
| COMM 142 | Journalism (JOUR-MIN) |
| COMM 160 | Journalism (JOUR-MIN) |
| COMM 20 | Retail Studies (RTLM-MIN) |
| CSEN 21 | Computer Engineering (CSEN-MIN), Computer Science and Engineering (CSCI-MIN-SOE) |
| ECEN 33 | General Engineering (GENG-MIN) |
| ELSJ 135 | Sustainable Food Systems (SFS-MIN) |
| ENGL 106 | Professional Writing (PWRT-MIN) |
| ENGL 91 | Creative Writing (CWRT-MIN) |
| ENVS 15 | Geospatial Analysis (GEOA-MIN) |
| ETHN 20 | Ethnic Studies (ETHN-MIN), Latina/o/x Studies (LATX-MIN) |
| ETHN 31 | African American Studies (AFAM-MIN) |
| ETHN 35 | African American Studies (AFAM-MIN) |
| ETHN 55 | African American Studies (AFAM-MIN), Asian American Studies (ASAM-MIN), Latina/o/x Studies (LATX-MIN) |
| FNCE 127 | Real Estate (RLES-MIN) |
| FNCE 128 | Real Estate (RLES-MIN) |
| FNCE 129 | Construction Management (CNST-MIN), Real Estate (RLES-MIN) |
| FREN 101 | French & Francophone Studies (FREN-MIN) |
| GERM 100 | International Business (INTB-MIN) |
| GERO 198 | Gerontology (GERO-MIN) |
| HIST 182B | Urban Education (URBN-MIN) |
| HRNS 120A | Entrepreneurship (ENTR-MIN) |
| ITAL 100 | International Business (INTB-MIN), Italian Studies (ITAL-MIN) |
| JAPN 100 | Japanese Studies (JAPN-MIN) |
| MECH 121R | Aerospace Engineering (AERO-MIN) |
| MECH 142 | Mechanical Engineering (MECH-MIN) |
| MGMT 136 | International Business (INTB-MIN), Leavey School of Business |
| MGMT 40 | Sustainable Food Systems (SFS-MIN) |
| MGMT 42 | Sustainable Food Systems (SFS-MIN) |
| MKTG 169 | Retail Studies (RTLM-MIN) |
| MKTG 175 | Entrepreneurship (ENTR-MIN), Marketing (MKTG-MIN) |
| MKTG 188 | Marketing (MKTG-MIN) |
| MKTG 190 | Arts Management (ARTM-MIN), Marketing (MKTG-MIN) |
| MKTG 194 | Marketing (MKTG-MIN) |
| OMIS 163 | Business Analytics (ANLY-MIN) |
| OMIS 164 | Business Analytics (ANLY-MIN) |
| PHIL 27 | Bioengineering (BIOE-MIN) |
| POLI 50 | Sustainable Food Systems (SFS-MIN) |
| PSYC 185EL | Urban Education (URBN-MIN) |
| PSYC 40 | Management Information Systems (MIS-MIN), Public Health (PUBH-MIN), Retail Studies (RTLM-MIN) |
| SOCI 149 | Retail Studies (RTLM-MIN) |
| SOCI 172 | Entrepreneurship (ENTR-MIN) |
| SPAN 100 | Spanish Studies (SPAN-MIN) |
| SPAN 101 | Spanish Studies (SPAN-MIN) |
| SPAN 23 | International Business (INTB-MIN) |
| THTR 165 | Musical Theatre (MUTH-MIN) |
| THTR 41 | Theatre (THTR-MIN) |

## B. 32 codes the 2026-27 Bulletin does not mention at all

Not found anywhere in chapters 3 to 5. Each is a candidate for a stale or mistyped entry in the recipe (`data/graduation-paths.ts`) and needs a person to confirm against the department.

| Code | Programs that require it |
| --- | --- |
| ARTH 110 | Classics and Ancient Studies (CLAS-MIN) |
| BIOL 11 | Public Health (PUBH-MIN) |
| BIOL 189B | Biotechnology (BTEC-MIN) |
| BUSN 151B | Sustainable Food Systems (SFS-MIN) |
| BUSN 183B | Sustainable Food Systems (SFS-MIN) |
| BUSN 183C | Sustainable Food Systems (SFS-MIN) |
| BUSN 198R | Retail Studies (RTLM-MIN) |
| CENG 189 | Construction Management (CNST-MIN) |
| CHIN 102 | Chinese and Sinophone Studies (CHIN-MIN) |
| CHIN 103 | Chinese and Sinophone Studies (CHIN-MIN) |
| COMM 107A | International Studies (INTL-MIN) |
| COMM 129 | Organizational, Business, and Professional Communication (OBPC-MIN) |
| COMM 130A | Digital Filmmaking (DFLM-MIN) |
| COMM 140B | Digital Filmmaking (DFLM-MIN) |
| COMM 140C | Digital Filmmaking (DFLM-MIN) |
| COMM 140Q | Digital Filmmaking (DFLM-MIN) |
| COMM 140W | Digital Filmmaking (DFLM-MIN) |
| COMM 153 | Organizational, Business, and Professional Communication (OBPC-MIN) |
| CSEN 44 | Bioengineering (BIOE-MIN) |
| ELSJ 134 | Sustainable Food Systems (SFS-MIN) |
| ENGL 107 | Professional Writing (PWRT-MIN) |
| ENGL 179AW | Creative Writing (CWRT-MIN) |
| ENVS 148 | Entrepreneurship (ENTR-MIN) |
| ETHN 52 | Asian American Studies (ASAM-MIN) |
| JAPN 101 | Japanese Studies (JAPN-MIN) |
| JAPN 102 | Japanese Studies (JAPN-MIN) |
| MGMT 176 | Sustainable Food Systems (SFS-MIN) |
| MUSC 128 | Music (MUSC-MIN) |
| MUSC 133 | Music (MUSC-MIN) |
| PHSC 157 | Entrepreneurship (ENTR-MIN) |
| TESP 157 | Bioengineering (BIOE-MIN) |
| THTR 42 | Theatre (THTR-MIN) |

## Related: renamed program

The Bulletin now calls Women's and Gender Studies **Gender and Sexuality Studies** and uses **GNSX** course codes (GNSX 1A, 25, 50, 101, 102, 105, 190...). CampusVal's recipe still uses the old name and WGST codes, so that major's course rows
cannot match the department's checklist. Updating it is a data change that needs the department's confirmation of the mapping.
