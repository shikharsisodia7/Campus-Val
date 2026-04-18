# SCU AI Advising Platform — Complete Product Specification
**Santa Clara University | AI-Powered Course Planning & Advising**
Version 1.0 | Prepared for Replit Development

---

> ⚠️ **POLICY ACCURACY NOTE:** All SCU policies in this document are sourced directly from
> the official SCU Undergraduate Bulletin (2024–25 and 2025–26), the SCU Registrar's quarterly
> Registration Booklets, and the Drahmann Center. Nothing is inferred or hallucinated.
> Where the user's brief conflicted with official sources, the official source wins.
> Specifically: the standard unit limit for ALL students (including freshmen/sophomores) is
> **19 units** in Window 1 — not 25. The 25-unit limit is a special privilege only for
> Honors Program students or students with cumulative GPA ≥ 3.3, and only during the
> Open Enrollment window. See Section 4 for full unit load policy.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack (Replit-Optimized)](#2-tech-stack-replit-optimized)
3. [Verified SCU Policy Database](#3-verified-scu-policy-database)
4. [Unit Load & Overload Rules (Verified)](#4-unit-load--overload-rules-verified)
5. [Transfer Student Rules (Verified)](#5-transfer-student-rules-verified)
6. [Core Curriculum Requirements (Verified)](#6-core-curriculum-requirements-verified)
7. [Student Classification (Verified)](#7-student-classification-verified)
8. [Course Challenge Policy (Verified)](#8-course-challenge-policy-verified)
9. [Community College Transfer Rules (Verified)](#9-community-college-transfer-rules-verified)
10. [RAG Pipeline Architecture](#10-rag-pipeline-architecture)
11. [Frontend Architecture & UI Components](#11-frontend-architecture--ui-components)
12. [Student Profile & Intake Flow](#12-student-profile--intake-flow)
13. [First-Year Student Module](#13-first-year-student-module)
14. [Transfer Student Module](#14-transfer-student-module)
15. [Course Planner & Excel Export](#15-course-planner--excel-export)
16. [Prerequisite Validator](#16-prerequisite-validator)
17. [Professor Rating Integration](#17-professor-rating-integration)
18. [GPA Calculator](#18-gpa-calculator)
19. [Real-Time Schedule & Lab Section Module](#19-real-time-schedule--lab-section-module)
20. [Graduation Planner (3-Year & 4-Year)](#20-graduation-planner-3-year--4-year)
21. [Major + Minor Advisor](#21-major--minor-advisor)
22. [Evaluation Framework & Benchmark Dataset](#22-evaluation-framework--benchmark-dataset)
23. [AI Trap Scenarios (Known Failure Points)](#23-ai-trap-scenarios-known-failure-points)
24. [Database Schema](#24-database-schema)
25. [API Endpoints](#25-api-endpoints)
26. [Data Sources & Scraping Strategy](#26-data-sources--scraping-strategy)
27. [Replit Deployment Notes](#27-replit-deployment-notes)

---

## 1. Project Overview

### What This Is
A web application that helps Santa Clara University (SCU) undergraduate students with:
- **Course planning** — quarter-by-quarter degree map with drag-and-drop
- **Prerequisite checking** — graph-based validation before a student adds a course
- **Policy Q&A** — RAG-powered answers grounded in the official SCU Bulletin
- **Professor ranking** — pulling RateMyProfessor data and SCU Schedule Helper ratings
- **Transfer credit evaluation** — Drahmann Center rules applied programmatically
- **GPA simulation** — current GPA, overload eligibility, and graduation scenario modeling
- **Evaluation benchmarks** — dataset of advising scenarios to measure AI accuracy vs. human advisor

### Who It Serves
| Student Type | Description |
|---|---|
| First-year | Entered SCU as a freshman; governed by entry-year bulletin |
| Transfer | Entered with prior college credits; cohort bulletin determined by accepted units |
| Double-major | Pursuing two declared majors (restrictions apply by school) |
| Accelerated (3-yr) | Compressing degree through sustained overloading and/or summer |

### Design Principle
**The AI never makes policy decisions. It retrieves verified policy from the RAG knowledge base and presents it. Hard rules (unit caps, transfer restrictions, major eligibility) are enforced by deterministic code, not LLM inference.**

---

## 2. Tech Stack (Replit-Optimized)

### Frontend
```
React 18 + Vite
TailwindCSS (SCU cardinal red: #8C1515, gold: #B08850)
React Query (data fetching/caching)
DnD Kit (drag-and-drop course planner)
Chart.js (GPA trends, unit distribution)
SheetJS (xlsx export)
React Hook Form (student intake)
```

### Backend
```
Node.js 20 + Express
LangChain.js (RAG pipeline, chunking, retrieval)
OpenAI API (gpt-4o for Q&A, text-embedding-3-small for vectors)
Chroma DB (vector store, runs locally on Replit)
PostgreSQL (Replit Postgres or Neon.tech free tier)
node-cron (schedule data refresh)
```

### External APIs
```
Anthropic Claude API (fallback / cross-check)
RateMyProfessor GraphQL: https://www.ratemyprofessors.com/graphql
SCU Schedule Helper API: https://scu-schedule-helper.me/
ASSIST.org (community college articulation — scrape)
SCU Workday course section feed (scrape or unofficial API)
```

### Environment Variables Required
```
OPENAI_API_KEY=
DATABASE_URL=
CHROMA_PATH=./chroma_db
RMP_GRAPHQL_ENDPOINT=https://www.ratemyprofessors.com/graphql
SCU_SCHEDULE_HELPER_BASE=https://scu-schedule-helper.me/api
PORT=3000
NODE_ENV=production
```

---

## 3. Verified SCU Policy Database

These are facts hardcoded into the application — **never inferred by AI**:

### Source Documents
| Document | URL | Last Verified |
|---|---|---|
| SCU Undergraduate Bulletin 2025–26 | https://www.scu.edu/bulletin/undergraduate/ | April 2026 |
| SCU Undergraduate Bulletin 2024–25 | https://www.scu.edu/bulletin/undergraduate/2024-2025/ | April 2026 |
| Fall 2025 Registration Booklet | https://www.scu.edu/registrar/ugrd-reg-info--deadline-booklet---fall-2025/ | April 2026 |
| Spring 2026 Registration Booklet | https://www.scu.edu/registrar/ugrd-reg-info--deadline-booklet---spring-2026/ | April 2026 |
| Drahmann Center | https://www.scu.edu/drahmann/ | April 2026 |
| Business School FAQ | https://www.scu.edu/business/undergraduates/advising/resources/faqs/ | April 2026 |

---

## 4. Unit Load & Overload Rules (Verified)

**Source:** SCU Registrar Registration Booklets (Fall 2025, Spring 2026, Fall 2026 editions)

### Registration Windows Explained

SCU uses three registration windows each quarter:

| Window | Who | Max Units | Notes |
|---|---|---|---|
| Window 1 (Initial Registration) | All students | **19 units** | No exceptions for freshmen/sophomores regardless of GPA |
| Window 2 (Second Period) | Seniors only (131+ completed units, cumulative GPA ≥ 2.20 at SCU) | **20 units** | No Drahmann approval needed if criteria met |
| Open Enrollment / Window 3 (First week of classes add/drop) | Honors Program students OR students with cumulative SCU GPA ≥ 3.3 | **25 units** | No written Drahmann approval needed if criteria met |
| Open Enrollment | Students NOT meeting Honors/GPA criteria | **19 or 20** | Must seek Drahmann Center approval to exceed |
| Any window | Anyone | **> 25 units** | Extremely rare. Must contact Drahmann Center; Dean of Academic Support Services approval required |

### Special Unit Rules
- **1-unit courses:** Do NOT count as overload units in any window
- **2-unit courses:** Do NOT count as overload units in any window
- **Adding 1-or-2-unit courses:** Fill out the "Request to Add Fractional, 1, or 2 Unit Courses" form online before the late registration deadline
- **Lab science courses (summer Sessions 4/5/6):** If enrolled in a lab science, cannot simultaneously enroll in a Session 1/2/3 course

### ⚠️ Common Misconception Corrected
The user brief states "the limit for freshman and sophomores is 25 units." This is **incorrect** per official SCU policy. The 25-unit limit is NOT applied by class year — it is applied by:
1. Membership in the University Honors Program, **OR**
2. Cumulative SCU GPA of at least 3.3

A sophomore with a 3.5 GPA **can** enroll in 25 units during Open Enrollment. A senior with a 2.8 GPA **cannot**. Always use these criteria, not class year, when evaluating overload eligibility.

### Application Logic (Pseudocode)
```javascript
function getMaxUnits(student, window) {
  const { completedUnits, scuGPA, isHonors, registrationWindow } = student;

  if (registrationWindow === 'WINDOW_1') {
    return 19; // Hard cap for ALL students, no exceptions
  }

  if (registrationWindow === 'WINDOW_2') {
    if (completedUnits >= 131 && scuGPA >= 2.20) return 20;
    return 19;
  }

  if (registrationWindow === 'OPEN_ENROLLMENT') {
    if (isHonors || scuGPA >= 3.3) return 25;
    if (completedUnits >= 131 && scuGPA >= 2.20) return 20;
    return 19;
  }

  // > 25 units: must flag for Drahmann review
  return { cap: 25, requiresDrahmannApproval: true };
}

function countableUnits(courses) {
  // 1-unit and 2-unit courses do NOT count toward overload total
  return courses
    .filter(c => c.units > 2)
    .reduce((sum, c) => sum + c.units, 0);
}
```

---

## 5. Transfer Student Rules (Verified)

**Source:** SCU Undergraduate Bulletin 2025–26, Chapter 7 & 8; Drahmann Center; Business School FAQ

### Which Bulletin Governs Transfer Students?
Transfer students are governed by the **bulletin of their class cohort**, determined by the number of transfer units accepted toward the Santa Clara degree upon admission — **not** the calendar year they enrolled.

This is critical: two students who both start in Fall 2024 may follow different bulletins if they brought different amounts of transfer credit.

### Pre-Enrollment Transfer Credit Rules
| Rule | Detail |
|---|---|
| Max transfer units accepted | **87.5 quarter units** (Arts & Sciences and Business) |
| Absolute maximum from other institutions | No more than **half of total degree units** can be from another institution |
| Grade requirement | **C or better** required. No exceptions except Spring 2020 courses |
| Pass/No Pass credit | **NOT accepted** (except Spring 2020 COVID exception) |
| Non-accredited institutions | NOT accepted (trade schools, extension programs, correspondence, bootcamps) |
| Community college | Accepted if course is similar to SCU course AND designated transferable to UC system |

### Post-Enrollment Transfer Credit Rules (Critical)
> **"Transfer credit earned after initial enrollment at Santa Clara may not be used to fulfill Undergraduate Core Curriculum, college or school, department, or program requirements."**
> — SCU Business School FAQ, citing Chapter 8 of the Undergraduate Bulletin

This is one of the most commonly misunderstood policies. After a student enrolls at SCU:
- Taking a course at De Anza, Foothill, or any other institution **cannot** satisfy any SCU Core requirement
- It **cannot** satisfy any major requirement
- It **cannot** satisfy any minor requirement
- The student must get Dean of Academic Support Services approval to even be concurrently enrolled

**Exception:** Up to 10 quarter units of Core credit can come from courses at other institutions — but only if completed **before** SCU enrollment, or through specific programs with Registrar/department chair approval.

### Transfer GPA Policy
Transfer course grades are **NOT** included in the student's SCU GPA calculation. SCU GPA is based solely on coursework completed at SCU. Transfer grades are recorded in academic history only.

### Concurrent Enrollment Policy
SCU students may **not** be concurrently enrolled at another college or university except for extraordinary reasons and with written approval from the Dean of Academic Support Services at the Drahmann Center.

### Core Curriculum for Transfers
- Transfer students are **encouraged** (not required) to complete Critical Thinking & Writing (CTW) 1 & 2 and Cultures & Ideas (C&I) 1 & 2 **before** their first quarter at SCU
- Substitutions for CTW and C&I are possible for transfers — contact the Office of the Registrar
- First-year students (non-transfers) MUST complete CTW and C&I at SCU — no substitutions

### Re-Enrollment After Leave of Absence
- Students who take a Leave of Absence remain active students
- Students who return follow **the bulletin in effect at the time of re-entry** (not their original entry bulletin)
- Students who do not return for their scheduled quarter are administratively withdrawn

### Application Logic
```javascript
function evaluateTransferCredit(course, student) {
  const { enrolledAtSCU, entryDate } = student;

  // Post-enrollment: hard no for all requirements
  if (enrolledAtSCU && course.takenAfterSCUEnrollment) {
    return {
      accepted: false,
      reason: 'Post-enrollment transfer credit cannot satisfy any SCU Core, major, or minor requirement (Bulletin Ch. 8).',
      canTransferUnits: false
    };
  }

  // Grade check
  if (course.grade === 'P' || course.grade === 'NP' || course.grade === 'CR' || course.grade === 'NC') {
    if (course.term !== 'Spring 2020') {
      return { accepted: false, reason: 'Pass/No Pass courses are not accepted for transfer credit.' };
    }
  }

  if (course.numericGrade < 2.0) { // Below C
    return { accepted: false, reason: 'A grade of C or better is required for transfer credit.' };
  }

  // Institution check
  if (!course.institutionAccredited) {
    return { accepted: false, reason: 'Courses from non-accredited institutions, trade schools, extension programs, or bootcamps do not transfer.' };
  }

  if (course.isTechnicalOrTrade) {
    return { accepted: false, reason: 'Courses of a trade or technical nature do not transfer.' };
  }

  // Cap check
  const totalTransferUnits = student.priorTransferUnitsAccepted + course.units;
  if (totalTransferUnits > 87.5) {
    return { accepted: false, reason: 'Exceeds the 87.5 quarter unit transfer credit cap for Arts & Sciences and Business.' };
  }

  return { accepted: true };
}
```

---

## 6. Core Curriculum Requirements (Verified)

**Source:** SCU Undergraduate Bulletin 2025–26, Chapter 2 — The Core Curriculum

All SCU undergraduates must satisfy:

| Requirement | Notes |
|---|---|
| Critical Thinking & Writing 1 | First-years must take at SCU. Transfers encouraged to complete before first quarter |
| Critical Thinking & Writing 2 | Same as above |
| Cultures & Ideas 1 | First-years must take at SCU. Transfers may have substitution options (contact Registrar) |
| Cultures & Ideas 2 | Same as above |
| Civic Engagement | Can be satisfied by AP/IB/transfer credit (pre-enrollment) |
| Science, Technology & Society | Can be satisfied by AP/IB/transfer credit (pre-enrollment) |
| Religion, Theology & Culture | Can be satisfied by AP/IB/transfer credit (pre-enrollment) |
| Advanced Writing | Can be satisfied by AP/IB/transfer credit (pre-enrollment) |
| Experiential Learning for Social Justice | Can be satisfied by AP/IB/transfer credit (pre-enrollment) |
| Pathways | Can be satisfied by AP/IB/transfer credit (pre-enrollment) |

AP/IB credit and pre-enrollment college coursework can satisfy Core requirements **other than** CTW and C&I (for first-year students).

After enrolling at SCU, up to 10 quarter units of Core credit from other institutions may be counted (subject to the no-more-than-half-total-units rule and Registrar/department approval).

---

## 7. Student Classification (Verified)

**Source:** SCU Business School FAQ citing the Undergraduate Bulletin

Classification is determined by **completed units with passing grades**:

| Level | Completed Units |
|---|---|
| First-year | Fewer than 44 units |
| Sophomore | At least 44 but fewer than 88 units |
| Junior | At least 88 but fewer than 131 units |
| Senior | At least 131 units |

Classification affects:
- Registration appointment timing (seniors and juniors register before sophomores and first-years)
- Overload eligibility (Window 2 is seniors-only at 131+ units)
- Recommended course level (lower-division 1–99 for first-years and sophomores; upper-division 100–199 for juniors and seniors)

### Registration Appointment Priority Order
1. Students with documented disabilities (priority accommodation) — all levels, by class
2. Senior/junior Honors, LEAD Scholars, NCAA athletes, Veterans — ordered by completed units
3. Senior/junior Leavey Scholars or Military Science — ordered by completed units
4. Remaining seniors — ordered by completed units
5. Remaining juniors — ordered by completed units
6. Sophomore/first-year Honors, LEAD Scholars, NCAA athletes, Veterans
7. Sophomore Leavey Scholars or Military Science
8. Remaining sophomores
9. First-year Leavey Scholars or Military Science
10. Remaining first-years
11. Non-degree students (last; register with Registrar assistance during first week)

---

## 8. Course Challenge Policy (Verified)

**Source:** SCU Undergraduate Bulletin 2025–26; Fall 2025 Registration Booklet

Students may challenge a course to satisfy a subject requirement for graduation without enrolling. Rules:

| Rule | Detail |
|---|---|
| Eligible courses | Any course in the Bulletin EXCEPT those below |
| **Excluded:** Lab/studio/specialized group work | Cannot be challenged under any circumstances |
| **Excluded:** NCX courses | Courses whose descriptions end with "NCX" in the catalog |
| Max challenges | One course per term |
| Minimum SCU standing | Must have completed at least one term at Santa Clara |
| GPA requirement | Cumulative SCU GPA of at least 3.3 |
| Approvals needed | Faculty member permission + department chair permission |
| **Units earned** | **ZERO** — challenge earns no units toward graduation total |
| **Residency** | Does not count toward residency requirements |
| Closed course | If course is closed, instructor approval is also required |

### Critical: What a Challenge Does and Does NOT Do
- ✅ Fulfills the subject requirement (you don't have to take the course)
- ❌ Does NOT earn units toward the total needed to graduate
- ❌ Does NOT count toward the residency requirement
- ❌ Cannot be used for lab, studio, or specialized group courses

---

## 9. Community College Transfer Rules (Verified)

**Source:** SCU Undergraduate Bulletin 2025–26; Fall 2025 Registration Booklet

### What Transfers from Community College
- Courses similar in nature to courses listed in the SCU Undergraduate Bulletin
- California community college courses designated as **transferable to the University of California** (check assist.org)
- Grade of **C or better** required
- **NOT** Pass/No Pass (except Spring 2020)

### What Does NOT Transfer from Community College
- Courses of a trade or technical nature
- Courses from non-accredited institutions
- Extension program courses
- Correspondence courses
- Bootcamp certificates

### ASSIST.org Integration
ASSIST.org (assist.org) contains California community college articulation agreements. For each community college course:
1. Check if course appears in ASSIST.org for SCU
2. Check if designated UC-transferable
3. Check if matches an SCU course requirement

### Post-Enrollment Rule (Applies to CC too)
After a student enrolls at SCU, **no** community college course taken afterward can fulfill any Core, major, or minor requirement — even if it would have transferred pre-enrollment. This is absolute.

---

## 10. RAG Pipeline Architecture

### Knowledge Base Sources
| Source | Format | Update Frequency | Priority |
|---|---|---|---|
| SCU Undergraduate Bulletin 2025–26 | PDF → chunked text | Annual | Highest |
| SCU Undergraduate Bulletin 2024–25 | PDF → chunked text | Static | High |
| SCU Course Descriptions | Scraped HTML | Quarterly | High |
| SCU Schedule of Classes (Workday) | JSON/HTML | Weekly | High |
| Drahmann Center policies | HTML → text | Semester | High |
| ASSIST.org articulation tables | Scraped HTML | Annual | Medium |
| RateMyProfessor data | GraphQL API | Weekly | Medium |
| SCU Schedule Helper data | API | Weekly | Medium |

### Chunking Strategy
```javascript
const chunkingConfig = {
  // Policy documents: preserve context with larger chunks
  policyDocuments: {
    chunkSize: 800,      // tokens
    chunkOverlap: 150,   // tokens
    separator: '\n\n',   // paragraph boundaries
  },
  // Course descriptions: smaller, self-contained
  courseDescriptions: {
    chunkSize: 400,
    chunkOverlap: 50,
    separator: '\n',
  },
  // Schedule data: structured, minimal chunking
  scheduleData: {
    chunkSize: 200,
    chunkOverlap: 0,
    separator: '\n',
  }
};
```

### Retrieval Strategy
```javascript
async function retrieveContext(query, studentProfile) {
  // Hybrid retrieval: vector similarity + metadata filters
  const filters = {
    studentType: studentProfile.isTransfer ? 'transfer' : 'first_year',
    school: studentProfile.school,          // Arts & Sciences | Engineering | Business
    bulletinYear: studentProfile.bulletinYear,
    topic: classifyQuery(query),             // 'prereq' | 'policy' | 'schedule' | 'transfer' | 'overload'
  };

  const results = await vectorStore.similaritySearch(query, {
    k: 6,
    filter: filters,
  });

  // Always append verified policy facts as system context
  const hardPolicies = getRelevantHardPolicies(query, studentProfile);

  return { retrievedChunks: results, hardPolicies };
}
```

### System Prompt Structure
```
You are an SCU academic advisor assistant. You ONLY answer based on the provided context.
If the context does not contain the answer, say "I don't have verified information on that —
please contact the Drahmann Center at scu.edu/drahmann."

NEVER infer policy. NEVER guess. NEVER say "usually" or "typically" about SCU-specific rules.

The following hard rules are ALWAYS true at SCU:
{hardPolicies}

Retrieved context from the SCU Undergraduate Bulletin:
{retrievedChunks}

Student profile:
- Type: {studentType}
- Completed units: {completedUnits}
- Cumulative SCU GPA: {scuGPA}
- Major(s): {majors}
- Minor(s): {minors}
- Bulletin year: {bulletinYear}
- Transfer units accepted pre-enrollment: {transferUnitsAccepted}

Question: {userQuestion}

Answer grounded strictly in the context and hard rules above. Cite the source (e.g., "per the
2025–26 Bulletin, Chapter 8") for any policy claim. If uncertain, direct the student to the
Drahmann Center.
```

---

## 11. Frontend Architecture & UI Components

### SCU Color Palette
```css
/* SCU Official Colors */
--scu-cardinal:    #8C1515;   /* Primary brand — cardinal red */
--scu-cardinal-dark: #6B0F0F; /* Hover states */
--scu-cardinal-light: #F5EAEA; /* Backgrounds, tints */
--scu-gold:        #B08850;   /* Secondary accent */
--scu-gold-light:  #F7F0E3;   /* Light gold backgrounds */
--scu-black:       #1A1A1A;   /* Body text */
--scu-gray-dark:   #4A4A4A;   /* Secondary text */
--scu-gray-mid:    #9A9A9A;   /* Muted/disabled */
--scu-gray-light:  #F4F4F4;   /* Page background */
--scu-white:       #FFFFFF;

/* Semantic colors */
--success:   #2D6A4F;
--warning:   #E9A319;
--danger:    #C0392B;
--info:      #1A5276;
```

### Application Shell — Route Structure
```
/                          → Landing / Login
/onboarding               → Student profile intake (multi-step)
/dashboard                → Main hub after onboarding
/planner                  → 4-year course planner (drag-and-drop)
/planner/export           → Excel export of current plan
/prereqs                  → Prerequisite checker
/prereqs/:courseCode      → Specific course prereq tree
/advisor                  → AI advisor chat (RAG-powered)
/professors               → Professor ratings browser
/gpa                      → GPA calculator & simulator
/schedule                 → Current quarter schedule + lab sections
/transfer                 → Transfer credit evaluator (separate section)
/transfer/assist          → ASSIST.org community college mapper
/transfer/units           → Transfer unit tracker
/policies                 → Policy Q&A (RAG)
/benchmark                → Evaluation framework dashboard (admin)
```

### Navigation Tabs
The top navigation should visually distinguish between student types:
- First-year / continuing students: cardinal red nav bar
- Transfer students: cardinal red nav bar with a gold "Transfer" badge
- Both see the same routes but content is filtered by student type

---

## 12. Student Profile & Intake Flow

### Intake Form — Step by Step

**Step 1: Basic Information**
```
- Full name
- Student ID (optional, for personalization only)
- Student type: [First-year | Transfer | Re-enrolling after leave]
- Entry quarter and year (e.g., Fall 2024)
- Current quarter and year
```

**Step 2: Academic Standing**
```
- Completed units (at SCU) — number input
- Transfer units accepted pre-enrollment — number input (transfers only)
- Cumulative SCU GPA (0.00–4.00) — decimal input
- Are you in the University Honors Program? [Yes | No]
- Registration appointment window for this quarter: [Window 1 | Window 2 | Open Enrollment]
```

**Step 3: Program of Study**
```
- School/College: [Arts & Sciences | Engineering | Leavey School of Business]
- Primary major — searchable dropdown from bulletin
- Are you pursuing a second major? [Yes | No]
  - If yes: Second major (note: Leavey students can only have one major within Leavey)
- Are you pursuing one or more minors? [Yes | No]
  - If yes: Minor(s) — multi-select, up to 3
- Intended graduation: [3 years (accelerated) | 4 years (standard)]
```

**Step 4: Advanced Placement & Prior Credit**
```
- AP courses passed (5 score) — multi-select from common AP list
- IB courses completed — multi-select
- Courses completed at another institution before SCU — add rows
  For each: Course name, Institution, Units, Grade, Term
```

**Step 5: Current Quarter (optional)**
```
- Courses enrolled this quarter — add rows
  For each: Course code, Course name, Units, Section
```

### Profile Validation Rules (Applied Immediately)
```javascript
function validateProfile(profile) {
  const errors = [];

  // Leavey double major check
  if (profile.school === 'business' && profile.secondMajor) {
    const secondMajorSchool = getMajorSchool(profile.secondMajor);
    if (secondMajorSchool === 'business') {
      errors.push({
        field: 'secondMajor',
        message: 'Leavey School of Business students may declare only one major within the business school. Your second major must be from Arts & Sciences or Engineering.',
        source: 'SCU Business School FAQ (citing Undergraduate Bulletin)'
      });
    }
  }

  // Transfer unit cap check
  if (profile.transferUnitsAccepted > 87.5 && profile.school !== 'engineering') {
    errors.push({
      field: 'transferUnitsAccepted',
      message: `Arts & Sciences and Business accept a maximum of 87.5 quarter units of transfer credit. You entered ${profile.transferUnitsAccepted} units.`,
      source: 'SCU Undergraduate Bulletin 2025–26'
    });
  }

  // GPA range check
  if (profile.scuGPA < 0 || profile.scuGPA > 4.0) {
    errors.push({ field: 'scuGPA', message: 'GPA must be between 0.00 and 4.00.' });
  }

  // Classification consistency
  const expectedClass = classifyStudent(profile.completedUnits);
  if (profile.selfReportedClass && profile.selfReportedClass !== expectedClass) {
    errors.push({
      field: 'completedUnits',
      message: `Based on ${profile.completedUnits} completed units, you are classified as a ${expectedClass} — not a ${profile.selfReportedClass}. Classification is based on completed units, not years enrolled.`,
      source: 'SCU Undergraduate Bulletin 2025–26'
    });
  }

  return errors;
}

function classifyStudent(completedUnits) {
  if (completedUnits < 44) return 'First-year';
  if (completedUnits < 88) return 'Sophomore';
  if (completedUnits < 131) return 'Junior';
  return 'Senior';
}
```

---

## 13. First-Year Student Module

### What First-Years See
- Full 4-year course planner starting from their entry quarter
- Core Curriculum progress tracker (CTW 1&2 and C&I 1&2 highlighted as must-complete at SCU)
- Warning banners when attempting to plan CC courses for Core requirements
- Suggested first-quarter schedule based on major
- Priority registration notice (first-years register last; plan accordingly)

### First-Year Specific Warnings
```javascript
const firstYearWarnings = [
  {
    trigger: 'ctwOrCI_planned_at_cc',
    message: 'CTW 1, CTW 2, C&I 1, and C&I 2 must be completed at SCU. They cannot be satisfied by community college courses or AP credit.',
    severity: 'error'
  },
  {
    trigger: 'overload_window1',
    message: 'First-year students are limited to 19 units during the initial registration window. The 25-unit overload requires Honors membership or SCU GPA ≥ 3.3 (only available during Open Enrollment).',
    severity: 'warning'
  },
  {
    trigger: 'upperDivisionBeforeJunior',
    message: 'Upper-division courses (numbered 100–199) are recommended for juniors and seniors. You may attempt to enroll, but seats may be restricted.',
    severity: 'info'
  },
  {
    trigger: 'businessMajorNotDeclaredBySophomore',
    message: 'Business school students must declare a major by the end of sophomore year.',
    severity: 'warning'
  }
];
```

---

## 14. Transfer Student Module

### Separate Transfer Section
The Transfer section has its own navigation tab and landing page. It should NOT mix first-year flows.

### Transfer Dashboard Components

**1. Unit Inventory Widget**
- Pre-enrollment transfer units accepted: [user input] / 87.5 max
- Visual progress bar toward cap
- SCU units completed: [from profile]
- Total units toward degree: [sum]
- Half-of-degree cap check (no more than 50% from other institutions)

**2. Transfer Credit Evaluator**
```
Input: Course from another institution
Fields:
  - Institution name (text)
  - Course code and title (text)
  - Units (number)
  - Grade received (letter grade selector)
  - Term taken (quarter/semester, year)
  - Taken before or after SCU enrollment? (critical radio button)

Output:
  - ACCEPTED / NOT ACCEPTED with detailed reason and bulletin citation
  - If accepted: maps to equivalent SCU course or "elective credit"
  - Community college courses: auto-check against ASSIST.org UC-transferable list
  - Warning if P/NP grade is entered
  - Warning if trade/technical course is detected
```

**3. Bulletin Year Determiner**
```
Logic:
  Input: Transfer units accepted at admission
  Output: Which bulletin year governs this student's degree requirements

Note: This is separate from enrollment year. The system must ask for
"transfer units accepted by SCU at admission" and map to cohort.
```

**4. Post-Enrollment Warning Banner (Persistent)**
```
⚠️ Important Transfer Policy Reminder
Any courses you take at another institution after your first quarter at SCU
CANNOT be used to satisfy Core, major, or minor requirements — even if they
would have qualified as transfer credit before you enrolled.
[Source: SCU Undergraduate Bulletin 2025–26, Chapter 8]
```

**5. ASSIST.org Community College Mapper**
```
- Dropdown: Select California Community College
- Search: Course name or code
- Output: Whether the course articulates to an SCU equivalent
- Note: Only courses designated as UC-transferable qualify
- Drahmann Center contact displayed for non-California institutions
```

**6. Concurrent Enrollment Request Guide**
```
If a transfer student wants to take CC courses while enrolled at SCU:
- Hard block with explanation: "SCU students may not be concurrently enrolled
  at another institution except for extraordinary reasons with written approval
  from the Dean of Academic Support Services."
- Link to Drahmann Center: scu.edu/drahmann
- Reminder that even if approved, any coursework taken post-enrollment cannot
  satisfy Core, major, or minor requirements.
```

---

## 15. Course Planner & Excel Export

### Quarter Grid Layout
The planner displays a grid with:
- **Rows:** Academic quarters (Fall, Winter, Spring, Summer optional) × years
- **Columns:** Up to 6 course slots per quarter
- **Year options:** 3-year plan (compressed) or 4-year plan (standard)

### Course Card (in Planner)
Each course card shows:
```
[COURSE CODE]
[Course Name]
[Units] | [Status: Completed / Planned / Enrolled]
[Prereq: ✅ Met | ⚠️ Unmet | ❓ Unverified]
[Professor Rating: ⭐ 4.2 (RMP) | No data]
[Drag handle]
```

### Drag-and-Drop Rules
When a student drags a course to a different quarter:
1. Re-run prerequisite check for the new position
2. Re-run prerequisite check for any course in a LATER quarter that depends on this course
3. Show diff: "Moving CSCI 60 from Fall 2025 to Winter 2025 means CSCI 61 (Spring 2025) now has an unmet prerequisite"
4. Allow the move but show the warning — student can override

### Unit Load Validation (Live)
As courses are added to a quarter:
```javascript
function validateQuarterLoad(quarter, studentProfile) {
  const courses = quarter.courses;
  const countableTotal = countableUnits(courses); // excludes 1 and 2-unit courses
  const rawTotal = courses.reduce((s, c) => s + c.units, 0);
  const maxAllowed = getMaxUnits(studentProfile, 'WINDOW_1'); // conservative: use Window 1

  return {
    countableUnits: countableTotal,
    rawTotal: rawTotal,
    maxAllowed: maxAllowed,
    status: countableTotal <= maxAllowed ? 'ok' : 'overload',
    overloadEligible: studentProfile.isHonors || studentProfile.scuGPA >= 3.3,
    message: countableTotal > 25
      ? 'Exceeds 25-unit maximum. Contact Drahmann Center — Dean approval required.'
      : countableTotal > maxAllowed && countableTotal <= 25
      ? `This is an overload (>${maxAllowed} units). Requires Open Enrollment window and ${studentProfile.isHonors || studentProfile.scuGPA >= 3.3 ? 'you qualify (Honors/GPA≥3.3)' : 'Drahmann Center approval — you do not yet meet the automatic eligibility criteria'}.`
      : 'Within normal load.'
  };
}
```

### Excel Export Format
Using SheetJS (xlsx library):

**Sheet 1: 4-Year Plan**
| Quarter | Course Code | Course Name | Units | Prereqs Met | Professor | RMP Rating | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| Fall 2024 | CSCI 10 | Introduction to Computer Science | 4 | N/A | Dr. Smith | 4.1 | Completed | — |

**Sheet 2: Core Curriculum Tracker**
| Requirement | Course Planned | Units | Status | Quarter |
|---|---|---|---|---|
| CTW 1 | ENGL 1A | 4 | Completed | Fall 2024 |

**Sheet 3: Prerequisite Map**
| Course | Prereq 1 | Prereq 2 | Prereq 3 | All Met? |
|---|---|---|---|---|
| CSCI 61 | CSCI 60 ✅ | — | — | Yes |

**Sheet 4: Transfer Credit Log** (transfer students only)
| Institution | Course | Units | Grade | SCU Equivalent | Accepted | Reason |
|---|---|---|---|---|---|---|

**Sheet 5: Unit Summary**
| Academic Year | Quarter | Countable Units | Raw Units | Overload? | Notes |
|---|---|---|---|---|---|

---

## 16. Prerequisite Validator

### Data Model
```javascript
// Course node in prerequisite graph
const course = {
  code: 'CSCI 61',
  name: 'Data Structures',
  units: 5,
  level: 'upper',   // 'lower' (1–99) or 'upper' (100–199)
  school: 'engineering',
  department: 'CSCI',
  prerequisites: [
    { code: 'CSCI 60', type: 'required', concurrent: false },
  ],
  corequisites: [],
  restrictions: [
    { type: 'major_required', majors: ['Computer Science', 'Computer Science and Engineering'] },
    // If empty, no major restriction
  ],
  notChallengeableNCX: false,
  labOrStudio: false,
  offeredQuarters: ['Fall', 'Winter', 'Spring'],
};
```

### Prerequisite Check Function
```javascript
async function checkPrerequisites(targetCourse, studentProfile, completedCourses) {
  const results = {
    eligible: true,
    issues: [],
    warnings: [],
    source: 'SCU Undergraduate Bulletin 2025–26'
  };

  // 1. Check major restrictions first
  if (targetCourse.restrictions.length > 0) {
    const majorRestriction = targetCourse.restrictions.find(r => r.type === 'major_required');
    if (majorRestriction) {
      const studentMajors = [studentProfile.primaryMajor, studentProfile.secondMajor].filter(Boolean);
      const eligible = majorRestriction.majors.some(m => studentMajors.includes(m));
      if (!eligible) {
        results.eligible = false;
        results.issues.push({
          type: 'major_restriction',
          message: `${targetCourse.code} is restricted to students in: ${majorRestriction.majors.join(', ')}. Your major (${studentProfile.primaryMajor}) does not qualify.`,
          severity: 'error'
        });
      }
    }
  }

  // 2. Check each prerequisite
  for (const prereq of targetCourse.prerequisites) {
    const hasCourse = completedCourses.some(c => c.code === prereq.code && c.grade >= 'C');
    if (!hasCourse && !prereq.concurrent) {
      results.eligible = false;
      results.issues.push({
        type: 'missing_prereq',
        course: prereq.code,
        message: `Missing prerequisite: ${prereq.code}`,
        severity: 'error'
      });
    }
  }

  // 3. Check class standing requirements (if upper-division)
  if (targetCourse.level === 'upper' && studentProfile.completedUnits < 88) {
    results.warnings.push({
      type: 'class_standing',
      message: 'This is an upper-division course (100–199), recommended for juniors and seniors. You may be able to enroll but check with the department.',
      severity: 'warning'
    });
  }

  return results;
}
```

### Visual Prereq Tree
Display a tree diagram for any course showing:
- The course at the top
- Required prereqs below it
- Prereqs of prereqs (recursive, 3 levels deep)
- Color coding: ✅ Green (completed), 🟡 Yellow (planned this quarter), 🔴 Red (not yet planned)

---

## 17. Professor Rating Integration

### RateMyProfessor GraphQL Integration

**Endpoint:** `https://www.ratemyprofessors.com/graphql`

**Step 1: Search for School**
```graphql
query {
  newSearch {
    schools(query: "Santa Clara University") {
      edges {
        node {
          id
          name
          city
          state
        }
      }
    }
  }
}
```

**Step 2: Search for Professor by Name and School**
```graphql
query {
  newSearch {
    teachers(query: $professorName, schoolID: $scuSchoolId) {
      edges {
        node {
          id
          firstName
          lastName
          avgRating
          avgDifficulty
          numRatings
          wouldTakeAgainPercent
          department
          school {
            id
            name
          }
        }
      }
    }
  }
}
```

**Step 3: Get Detailed Reviews**
```graphql
query GetProfessorRatings($id: ID!) {
  node(id: $id) {
    ... on Teacher {
      id
      firstName
      lastName
      avgRating
      avgDifficulty
      numRatings
      wouldTakeAgainPercent
      ratings(first: 20) {
        edges {
          node {
            comment
            date
            class
            helpfulRating
            clarityRating
            difficultyRating
            thumbsUpTotal
            thumbsDownTotal
          }
        }
      }
    }
  }
}
```

### SCU Schedule Helper Integration

**Base URL:** `https://scu-schedule-helper.me/`

The SCU Schedule Helper Chrome extension (https://scu-schedule-helper.me/) overlays professor ratings directly on the Workday schedule search. Its data combines RateMyProfessor scores with SCU-specific course history.

Query the API to retrieve:
- Professor rating at SCU specifically
- Courses the professor has taught at SCU
- Average difficulty for their SCU sections

### Fallback Logic (Prior Institution)
```javascript
async function getProfessorRating(professorName, courseCode) {
  // Step 1: Search at SCU
  const scuRating = await rmpQuery(professorName, SCU_SCHOOL_ID);

  if (scuRating && scuRating.numRatings >= 3) {
    return { ...scuRating, source: 'SCU (RateMyProfessor)' };
  }

  // Step 2: Check SCU Schedule Helper
  const sshRating = await scuScheduleHelperQuery(professorName, courseCode);
  if (sshRating) {
    return { ...sshRating, source: 'SCU Schedule Helper' };
  }

  // Step 3: Search at all institutions (fallback)
  const anyRating = await rmpQueryAllSchools(professorName);
  if (anyRating) {
    return {
      ...anyRating,
      source: `${anyRating.school.name} (prior institution — may not reflect SCU teaching style)`,
      isFallback: true,
      fallbackWarning: `No SCU-specific rating found. This rating is from ${anyRating.school.name} where this professor previously taught.`
    };
  }

  return { noData: true, message: 'No rating data found for this professor.' };
}
```

### Professor Rating Display Component
For each section of a course, display:
```
[Professor Name]
Overall: ⭐ 4.2 / 5.0  (based on 47 ratings at SCU)
Difficulty: 3.1 / 5.0
Would take again: 82%
[Source: SCU — RateMyProfessor]

Top review snippet: "Very clear explanations, responsive on email..."

[If fallback]:
⚠️ No SCU rating found. Showing rating from [Prior School Name].
```

### Professor Ranking for Course Selection
When a student is choosing between multiple sections of the same course:
```
CSCI 60 — Data Structures (Spring 2025)

Section A | Dr. Johnson  | MWF 9–9:50am  | ⭐ 4.5 | Diff: 2.8 | 156 ratings (SCU)
Section B | Dr. Martinez | TTh 10–11:40am | ⭐ 3.9 | Diff: 3.4 | 89 ratings (SCU)
Section C | Dr. Patel     | MWF 2–2:50pm  | ⭐ No data  | — | Prior inst: 4.1 ⚠️
```

---

## 18. GPA Calculator

### SCU GPA Scale (Standard 4.0)
| Grade | Grade Points |
|---|---|
| A+ | 4.0 |
| A  | 4.0 |
| A- | 3.7 |
| B+ | 3.3 |
| B  | 3.0 |
| B- | 2.7 |
| C+ | 2.3 |
| C  | 2.0 |
| C- | 1.7 |
| D+ | 1.3 |
| D  | 1.0 |
| D- | 0.7 |
| F  | 0.0 |

**Important:** Transfer unit grades are NOT included in SCU GPA calculations.

### GPA Calculator Features

**1. Current GPA Display**
- Cumulative SCU GPA (only SCU coursework)
- Current quarter GPA
- GPA by major courses vs. all courses

**2. Quarter GPA Simulator**
For each enrolled course this quarter:
```
Course: [Code] | Current Grade: [dropdown A+ through F] | Units: [auto-filled]
```
Output:
- Projected quarter GPA
- Projected new cumulative GPA
- Impact statement: "After this quarter, your cumulative GPA would be 3.28 — just below the 3.3 threshold for overload enrollment next quarter"

**3. Overload Eligibility Simulator**
Show exactly what GPA change would qualify the student for overload:
```javascript
function overloadThresholdAnalysis(student) {
  const currentGPA = student.scuGPA;
  const isHonors = student.isHonors;

  if (isHonors) return { eligible: true, reason: 'Honors Program membership' };
  if (currentGPA >= 3.3) return { eligible: true, reason: 'GPA ≥ 3.3' };

  // How many more grade points needed?
  const unitsCompleted = student.completedUnits;
  const targetGPA = 3.3;
  const pointsNeeded = (targetGPA * unitsCompleted) - (currentGPA * unitsCompleted);
  const aGradePoints = 4.0; // max per unit
  const unitsOfANeeded = Math.ceil(pointsNeeded / (aGradePoints - currentGPA));

  return {
    eligible: false,
    currentGPA,
    targetGPA: 3.3,
    message: `You need approximately ${unitsOfANeeded} more units of A-level work to reach the 3.3 threshold for overload eligibility.`,
    seniorOverload: student.completedUnits >= 131 && currentGPA >= 2.20
      ? 'You qualify for the senior overload (up to 20 units in Window 2 registration).'
      : null
  };
}
```

**4. Graduation GPA Projector**
- Enter remaining courses and expected grades
- Project final cumulative GPA
- Warn if projected GPA falls below degree minimums

---

## 19. Real-Time Schedule & Lab Section Module

### Data Source
Pull from SCU Workday's course schedule. The SCU Schedule Helper (scu-schedule-helper.me) also exposes this data. Refresh weekly.

### Schedule Display
For each quarter, show all available sections of planned courses:

```
CHEM 11 — General Chemistry I (Fall 2025)

Lecture Sections:
  Section 01 | Dr. Jones  | MWF 8–8:50am   | Room: Daly 206  | Seats: 12/30 open
  Section 02 | Dr. Lee    | TTh 9:30–11am  | Room: Daly 206  | Seats: 5/30 open

Laboratory Sections (required, must match lecture):
  Lab 01A | M 1–3:50pm  | Room: Daly 117  | Seats: 4/20 open  [pair with Lecture 01]
  Lab 01B | W 1–3:50pm  | Room: Daly 117  | Seats: 8/20 open  [pair with Lecture 01]
  Lab 02A | T 2–4:50pm  | Room: Daly 117  | Seats: 2/20 open  [pair with Lecture 02]
```

### Conflict Detection
```javascript
function detectScheduleConflicts(selectedSections) {
  const conflicts = [];
  for (let i = 0; i < selectedSections.length; i++) {
    for (let j = i + 1; j < selectedSections.length; j++) {
      const a = selectedSections[i];
      const b = selectedSections[j];
      if (timesOverlap(a.schedule, b.schedule)) {
        conflicts.push({
          courseA: a.courseCode,
          courseB: b.courseCode,
          overlap: getOverlapDescription(a.schedule, b.schedule),
          severity: 'error'
        });
      }
    }
  }
  return conflicts;
}
```

### Lab Section Rules
- Lab sections are associated with specific lecture sections — enforce pairing
- Lab courses **cannot be challenged** (NCX/lab exception — display this warning if a student tries to plan around a lab)
- Summer lab science restriction: if enrolled in a Session 4/5/6 lab science, cannot simultaneously enroll in a Session 1/2/3 course

---

## 20. Graduation Planner (3-Year & 4-Year)

### 4-Year Standard Plan
```
Year 1 (0–44 units):
  Fall Q1  → 15 units (recommended start for first-years)
  Winter Q2 → 15 units
  Spring Q3 → 16 units
  Total Y1: 46 units

Year 2 (44–88 units):
  Similar structure. Begin declaring major.

Year 3 (88–131 units):
  Upper-division major courses. Can register in Window 2 (senior-approaching).

Year 4 (131+ units):
  Senior Window 2 registration (up to 20 units, GPA ≥ 2.20).
  Complete remaining major, minor, Core requirements.
  Total for degree: ~175 quarter units (varies by major)
```

### 3-Year Accelerated Plan
Requirements for 3-year graduation:
- Sustained overloading (need GPA ≥ 3.3 for 25-unit quarters, or Honors membership)
- Summer enrollment is almost always necessary
- AP/IB credits reduce total remaining units
- Pre-enrollment transfer credit reduces remaining units
- Lab-heavy majors are harder to compress (lab courses can't be challenged)

```javascript
function buildAcceleratedPlan(studentProfile, remainingRequirements) {
  const totalUnitsRemaining = remainingRequirements.totalUnits - studentProfile.completedUnits;
  const quartersAvailable = 9; // 3 years × 3 quarters
  const avgNeededPerQuarter = totalUnitsRemaining / quartersAvailable;

  const warnings = [];

  if (avgNeededPerQuarter > 19) {
    warnings.push({
      message: `A 3-year plan requires averaging ${avgNeededPerQuarter.toFixed(1)} units per quarter. This requires overload approval. You ${studentProfile.scuGPA >= 3.3 || studentProfile.isHonors ? 'currently qualify' : 'do not yet qualify'} for automatic overload up to 25 units.`,
      severity: avgNeededPerQuarter > 25 ? 'error' : 'warning'
    });
  }

  if (avgNeededPerQuarter > 25) {
    warnings.push({
      message: 'A 3-year plan requires more than 25 units per quarter on average, which exceeds even the maximum overload. Consider adding summer quarters or verifying your AP/transfer credit.',
      severity: 'error'
    });
  }

  return { plan: generateQuarterGrid(studentProfile, remainingRequirements, quartersAvailable), warnings };
}
```

### Overloading Within Graduation Plans
Display clearly:
```
Overload Planning Assistant

Your current GPA: 3.42 ✅ You qualify for up to 25 units per quarter during Open Enrollment.

If you maintain GPA ≥ 3.3:
  - You can take up to 25 countable units per quarter (Open Enrollment window)
  - 1-unit and 2-unit courses do not count toward the overload total

If your GPA drops below 3.3:
  - You return to the 19-unit standard limit (Window 1)
  - You would need Drahmann Center approval for anything above 19 units

3-Year Plan Feasibility:
  Remaining units: 87
  Available quarters (no summer): 9
  Average needed: 9.7 units/quarter ✅ Feasible without overload
  [or]
  Remaining units: 130
  Average needed: 14.4 units/quarter ✅ Feasible within standard load
```

---

## 21. Major + Minor Advisor

### Major Restriction Rules
Some courses are restricted by major. The system must:
1. Store major restrictions for each course (from bulletin scrape)
2. Check student's major(s) against restrictions before confirming eligibility
3. Display a clear warning when restriction applies

### Second Major Rules
```javascript
function validateSecondMajor(primaryMajor, proposedSecondMajor, school) {
  // Leavey-specific restriction
  if (school === 'business') {
    const secondMajorSchool = getMajorSchool(proposedSecondMajor);
    if (secondMajorSchool === 'business') {
      return {
        allowed: false,
        reason: 'Students in the Leavey School of Business may declare only one major within that school. A second major must be in the College of Arts & Sciences or School of Engineering.',
        source: 'SCU Undergraduate Bulletin 2025–26'
      };
    }
  }

  // General: second major requires department chair approval + Program Petition Form
  return {
    allowed: true,
    requirements: [
      'Department chair approval from the intended second major department',
      'Submit a Program Petition Form to the Drahmann Center'
    ],
    source: 'SCU Undergraduate Bulletin 2025–26'
  };
}
```

### Major Declaration Deadlines
- All students: declare primary major by end of sophomore year (by the time you hit 88 units)
- Business school: formal declaration typically no sooner than end of sophomore year
- Must declare before study abroad or domestic public sector study programs
- Students without a declared major must get department chair approval to declare

### Minor Planning
- Can declare multiple minors (up to 3 recommended in UI)
- Track minor requirements separately from major requirements
- Show overlap: courses that count toward both major and minor

---

## 22. Evaluation Framework & Benchmark Dataset

### Framework Overview

This is the system for measuring how well the AI advising tool performs. Every AI response is tested against:
1. Factual correctness (does the answer match the official bulletin?)
2. Policy source citation (does the AI cite the correct chapter/section?)
3. Appropriate uncertainty (does the AI say "I don't know" when it shouldn't know?)
4. Harmful overconfidence (does the AI give a confident wrong answer?)
5. Transfer vs. first-year distinction (does the AI apply the right rules to the right student?)

### Scoring Rubric

| Dimension | Weight | Scoring | Description |
|---|---|---|---|
| Factual accuracy | 35% | 0–4 | Is the core claim correct? |
| Policy citation | 20% | 0–4 | Is the bulletin chapter/section cited? |
| Student type sensitivity | 15% | 0–4 | Is the correct first-year vs. transfer rule applied? |
| Appropriate uncertainty | 15% | 0–4 | Does the AI redirect to Drahmann when it should? |
| Harmful overconfidence | 15% | 0–4 | Does the AI avoid confident wrong answers? |

**Score per question = weighted average. Final score = mean across all benchmark questions.**

### Accuracy Tiers
| Score | Rating | Description |
|---|---|---|
| 3.5–4.0 | Excellent | Ready for production (with human advisor review) |
| 2.5–3.4 | Good | Usable with prominent disclaimer |
| 1.5–2.4 | Poor | Should not be used for advising without major RAG improvements |
| 0.0–1.4 | Dangerous | Actively harmful — likely to mislead students on high-stakes decisions |

---

## 23. AI Trap Scenarios (Known Failure Points)

These are questions where a naive AI (without proper RAG grounding) is likely to give a confidently wrong answer. Each scenario includes the question, the correct answer, the wrong answer AIs typically give, and the bulletin citation.

---

### TRAP-001: Post-Enrollment CC Course for Core Credit
**Question:** "I enrolled at SCU last fall. Can I take ECON 1 at De Anza Community College this summer to satisfy my Social Science Core requirement?"

**Correct Answer:** No. Transfer credit earned after initial enrollment at SCU cannot satisfy Core, college/school, department, or program requirements. This applies regardless of whether the course would otherwise qualify.

**Common AI Wrong Answer:** "Yes, if the course is transferable to SCU and you get a C or better, it can fulfill a Core requirement."

**Why AI Gets It Wrong:** AI knows the general transfer credit rule (C or better, similar course) but doesn't know the post-enrollment restriction.

**Citation:** SCU Undergraduate Bulletin 2025–26, Chapter 8, Registration Policies and Regulations ("Units Taken at Other Institutions"); confirmed in SCU Business School FAQ.

**Severity:** CRITICAL — student could spend time and money on a course that won't count.

---

### TRAP-002: Leavey Double Major
**Question:** "I'm a Finance major at Leavey School of Business. Can I add Accounting as a second major?"

**Correct Answer:** No. Leavey School of Business students may declare only one major within the business school. A second major must be in a different college (Arts & Sciences or Engineering).

**Common AI Wrong Answer:** "Yes, many students double major. You'd need department approval and a Program Petition Form."

**Why AI Gets It Wrong:** General double-major advice is correct for most schools but doesn't account for the Leavey-specific restriction.

**Citation:** SCU Business School FAQ; SCU Undergraduate Bulletin 2025–26.

**Severity:** HIGH — student may plan courses toward an impossible double major.

---

### TRAP-003: Lab Course Challenge
**Question:** "I already know the material in CHEM 11L (General Chemistry Lab). Can I challenge it to skip taking it?"

**Correct Answer:** No. Courses involving laboratory, studio, or specialized group work are explicitly excluded from the challenge process at SCU. No exceptions.

**Common AI Wrong Answer:** "Yes, you can petition to challenge a course if you believe you already know the material. Contact the department chair."

**Why AI Gets It Wrong:** AI knows the challenge process exists but doesn't know the lab exclusion.

**Citation:** SCU Undergraduate Bulletin 2025–26 (course challenge section); Fall 2025 Registration Booklet.

**Severity:** HIGH — student may delay their plan expecting a waiver that will never come.

---

### TRAP-004: P/NP Transfer Credit
**Question:** "I took Calculus at Foothill College on a Pass/No Pass basis and got a Pass. Will that transfer to satisfy my Math requirement at SCU?"

**Correct Answer:** No. SCU does not accept transfer credit for courses taken on a pass/no pass or credit/no credit basis. A letter grade of C or better is required.

**Common AI Wrong Answer:** "Yes, a Pass grade is generally equivalent to passing a course and should transfer."

**Why AI Gets It Wrong:** Many universities do accept P/NP; AI defaults to generic rule.

**Citation:** SCU Undergraduate Bulletin 2025–26, Core Curriculum section; Fall 2025 Registration Booklet.

**Severity:** HIGH

**Exception (hardcoded):** Spring 2020 coursework taken P/NP may be accepted due to the COVID-19 exception. This specific exception must be stored and checked.

---

### TRAP-005: Unit Overload for All Students
**Question:** "I'm a freshman with a 3.6 GPA. Can I sign up for 22 units during my initial registration window?"

**Correct Answer:** No. During the initial registration window (Window 1), ALL students are capped at 19 units regardless of GPA or class year. The 25-unit overload is only available during the Open Enrollment window (first week of classes) and only for students in the Honors Program or with a cumulative SCU GPA of at least 3.3.

**Common AI Wrong Answer:** "Yes, with a 3.6 GPA you should be able to get an overload approved."

**Why AI Gets It Wrong:** AI conflates eligibility criteria with window restrictions. Even eligible students cannot overload in Window 1.

**Citation:** SCU Registrar, Fall 2025 Registration Booklet (Registration Window section); confirmed in Spring 2026 and Fall 2026 booklets.

**Severity:** CRITICAL — student may miss their registration window waiting for approval that won't come.

---

### TRAP-006: Transfer Student and CTW Requirement
**Question:** "I transferred to SCU. Do I have to take Critical Thinking & Writing 1 and 2 at SCU?"

**Correct Answer:** Transfer students are *encouraged* (not required) to complete CTW 1 & 2 before their first quarter at SCU. Substitutions may be possible — contact the Office of the Registrar. This is distinct from first-year students, who MUST complete CTW at SCU.

**Common AI Wrong Answer:** "Yes, CTW 1 and 2 must be completed at SCU by all students."

**Why AI Gets It Wrong:** Applies first-year rule universally without distinguishing transfer policy.

**Citation:** SCU Undergraduate Bulletin 2025–26, Chapter 2 (Core Curriculum).

**Severity:** MEDIUM — incorrect scheduling if student believes they must retake equivalent courses.

---

### TRAP-007: Which Bulletin Governs a Transfer Student
**Question:** "I transferred in Fall 2024. Which year's bulletin requirements do I follow for my degree?"

**Correct Answer:** Transfer students follow the bulletin of their class cohort, determined by the number of transfer units accepted toward the SCU degree upon admission — not necessarily the year they enrolled. You need to know how many transfer units were accepted at admission to determine the cohort.

**Common AI Wrong Answer:** "You follow the 2024–25 bulletin since you enrolled in Fall 2024."

**Why AI Gets It Wrong:** Assumes year of enrollment = bulletin year, which is true for first-years but not for transfers.

**Citation:** SCU Undergraduate Bulletin 2025–26 (introduction).

**Severity:** HIGH — affects which degree requirements apply for the student's entire academic career.

---

### TRAP-008: Challenge Course Units
**Question:** "If I pass the challenge exam for HIST 100, does that count toward my 175 units for graduation?"

**Correct Answer:** No. A successful course challenge fulfills the subject requirement, but earns zero units toward the total needed for graduation. It also does not count toward residency requirements.

**Common AI Wrong Answer:** "Yes, challenging a course and passing earns you equivalent units, just like taking the course."

**Why AI Gets It Wrong:** This is counterintuitive — you satisfy the requirement but earn no units.

**Citation:** SCU Undergraduate Bulletin 2025–26 (course challenge section); Fall 2025 Registration Booklet.

**Severity:** HIGH — student may think they're on track for graduation when they're short on units.

---

### TRAP-009: Re-Enrollment Bulletin Year
**Question:** "I took a 2-year leave of absence. Do I still follow the degree requirements from when I first enrolled?"

**Correct Answer:** No. Re-enrolling students are subject to the bulletin in effect at the time of re-entry, not their original entry bulletin.

**Common AI Wrong Answer:** "Yes, your degree requirements are locked in when you first enroll."

**Why AI Gets It Wrong:** This is true for students who remain continuously enrolled, but not for re-enrollees.

**Citation:** SCU Undergraduate Bulletin 2025–26 (re-enrollment section); Fall 2025 Registration Booklet.

**Severity:** MEDIUM–HIGH — may affect required courses and credit counts.

---

### TRAP-010: Bootcamp Credit
**Question:** "I completed a 6-month web development bootcamp and got a certificate. Can any of that count toward my Computer Science electives?"

**Correct Answer:** No. Courses of a trade or technical nature do not transfer to SCU. Extension programs and non-accredited programs also do not transfer.

**Common AI Wrong Answer:** "It depends on the bootcamp. You could try petitioning the CS department."

**Why AI Gets It Wrong:** May not know SCU's explicit exclusion of trade/technical courses.

**Citation:** SCU Undergraduate Bulletin 2025–26 (transfer credit section).

**Severity:** MEDIUM

---

### TRAP-011: Major Restriction on Business Courses
**Question:** "I'm a Psychology major. Can I take BUSN 170 (Strategic Management)?"

**Correct Answer:** Many upper-division Business courses are restricted to declared Business students. This must be checked at the course level in the schedule, not inferred from general rules. The AI must look up the specific course restriction.

**Common AI Wrong Answer:** "Yes, you just need junior standing as a prerequisite."

**Why AI Gets It Wrong:** Checks listed academic prerequisites but misses the enrollment restriction field.

**Citation:** SCU Schedule of Classes (enrollment restrictions per section).

**Severity:** HIGH — student registers and then gets administratively dropped.

---

### TRAP-012: Concurrent Enrollment
**Question:** "Can I take courses at De Anza College this quarter while taking my full SCU schedule?"

**Correct Answer:** Only with extraordinary reasons and written approval from the Dean of Academic Support Services at the Drahmann Center. This is not routine and requires formal petition. Furthermore, any courses taken at De Anza while enrolled at SCU cannot satisfy any SCU Core, major, or minor requirements.

**Common AI Wrong Answer:** "Yes, many students take community college courses alongside their SCU schedule to get ahead."

**Why AI Gets It Wrong:** Does not know SCU's policy requiring Dean-level approval for concurrent enrollment.

**Citation:** SCU Undergraduate Bulletin 2025–26, Chapter 8; SCU Registrar.

**Severity:** HIGH

---

### TRAP-013: Transfer Cap Exceeded
**Question:** "I have 110 quarter units of community college credit. Will all of them transfer to SCU?"

**Correct Answer:** No. The maximum transfer credit accepted is 87.5 quarter units for Arts & Sciences and Business students. Additionally, no more than half of the total units required for a degree can come from another institution.

**Common AI Wrong Answer:** "Yes, California community college credits generally transfer to other California institutions."

**Why AI Gets It Wrong:** Applies general California transfer rules without knowing SCU's 87.5-unit hard cap.

**Citation:** SCU Business School FAQ; SCU Undergraduate Bulletin 2025–26.

**Severity:** HIGH — student may believe they are further along toward graduation than they are.

---

### TRAP-014: Study Abroad Without Declared Major
**Question:** "I'm a sophomore who hasn't declared a major yet. Can I apply to study abroad next fall?"

**Correct Answer:** No. Students must declare a major before participating in study abroad or domestic public sector study programs. This is a hard administrative requirement.

**Common AI Wrong Answer:** "You can apply — just declare your major before the semester starts."

**Why AI Gets It Wrong:** Doesn't know the pre-application major declaration requirement.

**Citation:** SCU Undergraduate Bulletin 2025–26.

**Severity:** MEDIUM — student may miss the study abroad application deadline.

---

### TRAP-015: GPA Calculation Including Transfer Units
**Question:** "I got straight A's at my community college. Does that boost my SCU GPA?"

**Correct Answer:** No. Grades for units earned at other institutions are not included in the student's SCU academic history or in the calculation of the SCU grade point average. Only SCU coursework counts toward the SCU GPA.

**Common AI Wrong Answer:** "Yes, your transfer GPA is factored into your overall GPA."

**Citation:** SCU Undergraduate Bulletin 2025–26, Core Curriculum section.

**Severity:** MEDIUM — affects students calculating overload eligibility (which requires SCU GPA ≥ 3.3).

---

### TRAP-016: NCX Course Challenge
**Question:** "Can I challenge any course listed in the SCU Bulletin if I already know the material?"

**Correct Answer:** No. Two categories are excluded: (1) courses involving lab, studio, or specialized group work, and (2) courses whose descriptions in the catalog end with the letters "NCX."

**Common AI Wrong Answer:** "You can challenge any course as long as you get faculty and chair approval and have a 3.3 GPA."

**Citation:** SCU Undergraduate Bulletin 2025–26 (challenge exam section).

**Severity:** MEDIUM

---

### TRAP-017: Window 1 vs Open Enrollment Distinction
**Question:** "My GPA is 3.5. How many units can I sign up for when registration opens?"

**Correct Answer:** During the initial registration window (Window 1), all students are limited to 19 units regardless of GPA. Your GPA of 3.5 qualifies you to enroll up to 25 units — but only during the Open Enrollment window (the first week of classes, add/drop period).

**Common AI Wrong Answer:** "With a 3.5 GPA you can enroll in up to 25 units."

**Why AI Gets It Wrong:** Knows the 25-unit eligibility rule but omits the window restriction.

**Citation:** SCU Registrar, all quarterly registration booklets.

**Severity:** HIGH — student may plan for 25 units only to find they can only enroll in 19 at first.

---

## 24. Database Schema

```sql
-- Students
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  student_type VARCHAR(20) CHECK (student_type IN ('first_year', 'transfer', 're_enrolling')),
  entry_quarter VARCHAR(10),
  entry_year INTEGER,
  school VARCHAR(50) CHECK (school IN ('arts_sciences', 'engineering', 'business')),
  primary_major VARCHAR(100),
  second_major VARCHAR(100),
  is_honors BOOLEAN DEFAULT FALSE,
  completed_scu_units DECIMAL(5,1) DEFAULT 0,
  transfer_units_accepted DECIMAL(5,1) DEFAULT 0,
  cumulative_scu_gpa DECIMAL(4,2),
  bulletin_year VARCHAR(9),
  intended_graduation VARCHAR(20) CHECK (intended_graduation IN ('3_year', '4_year')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student Minors
CREATE TABLE student_minors (
  student_id UUID REFERENCES students(id),
  minor_name VARCHAR(100),
  PRIMARY KEY (student_id, minor_name)
);

-- Courses (master catalog from bulletin)
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,       -- e.g. "CSCI 60"
  name VARCHAR(255) NOT NULL,
  department VARCHAR(20),
  units DECIMAL(3,1) NOT NULL,
  level VARCHAR(10) CHECK (level IN ('lower', 'upper')),
  school VARCHAR(50),
  description TEXT,
  offered_quarters TEXT[],               -- ['Fall', 'Winter', 'Spring']
  is_lab_or_studio BOOLEAN DEFAULT FALSE,
  is_ncx BOOLEAN DEFAULT FALSE,          -- cannot be challenged
  has_major_restriction BOOLEAN DEFAULT FALSE,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Prerequisites
CREATE TABLE prerequisites (
  course_id UUID REFERENCES courses(id),
  prereq_course_id UUID REFERENCES courses(id),
  prereq_type VARCHAR(20) CHECK (prereq_type IN ('required', 'recommended', 'concurrent')),
  PRIMARY KEY (course_id, prereq_course_id)
);

-- Major restrictions on courses
CREATE TABLE course_major_restrictions (
  course_id UUID REFERENCES courses(id),
  allowed_major VARCHAR(100),
  PRIMARY KEY (course_id, allowed_major)
);

-- Course Sections (real-time schedule)
CREATE TABLE course_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id),
  section_number VARCHAR(10),
  professor_name VARCHAR(255),
  quarter VARCHAR(10),
  year INTEGER,
  schedule JSONB,              -- { days: ['M','W','F'], start: '09:00', end: '09:50' }
  room VARCHAR(50),
  seats_total INTEGER,
  seats_available INTEGER,
  is_lab BOOLEAN DEFAULT FALSE,
  parent_section_id UUID REFERENCES course_sections(id),  -- for lab paired with lecture
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Student Course Plan
CREATE TABLE student_course_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  course_id UUID REFERENCES courses(id),
  quarter VARCHAR(10),
  year INTEGER,
  status VARCHAR(20) CHECK (status IN ('completed', 'enrolled', 'planned')),
  grade VARCHAR(3),              -- actual grade if completed
  section_id UUID REFERENCES course_sections(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transfer Credits
CREATE TABLE transfer_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  institution_name VARCHAR(255),
  course_code VARCHAR(50),
  course_name VARCHAR(255),
  units DECIMAL(3,1),
  grade VARCHAR(3),
  term VARCHAR(20),
  year INTEGER,
  taken_after_scu_enrollment BOOLEAN DEFAULT FALSE,
  is_accepted BOOLEAN,
  scu_equivalent_course_id UUID REFERENCES courses(id),
  rejection_reason TEXT,
  evaluated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Professor Ratings (cached from RMP and Schedule Helper)
CREATE TABLE professor_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_name VARCHAR(255) NOT NULL,
  rmp_id VARCHAR(50),
  institution VARCHAR(255),
  is_scu BOOLEAN DEFAULT FALSE,
  avg_rating DECIMAL(3,2),
  avg_difficulty DECIMAL(3,2),
  would_take_again_percent DECIMAL(5,2),
  num_ratings INTEGER,
  department VARCHAR(100),
  is_fallback BOOLEAN DEFAULT FALSE,     -- true if from prior institution
  source VARCHAR(50),                    -- 'ratemyprofessor' | 'scu_schedule_helper'
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Benchmark Evaluation Log
CREATE TABLE benchmark_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id VARCHAR(20) NOT NULL,     -- e.g. 'TRAP-001'
  student_type VARCHAR(20),
  question TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  ai_answer TEXT,
  factual_accuracy_score DECIMAL(3,2),  -- 0–4
  citation_score DECIMAL(3,2),
  student_type_sensitivity_score DECIMAL(3,2),
  uncertainty_score DECIMAL(3,2),
  overconfidence_score DECIMAL(3,2),
  composite_score DECIMAL(3,2),
  evaluated_at TIMESTAMPTZ DEFAULT NOW(),
  model_used VARCHAR(100)
);
```

---

## 25. API Endpoints

### Student Profile
```
POST   /api/students                    Create student profile
GET    /api/students/:id               Get student profile
PUT    /api/students/:id               Update student profile
DELETE /api/students/:id               Delete profile
```

### Course Planner
```
GET    /api/students/:id/plan           Get full 4-year plan
POST   /api/students/:id/plan/courses   Add course to plan
PUT    /api/students/:id/plan/courses/:courseId  Move course (quarter swap)
DELETE /api/students/:id/plan/courses/:courseId  Remove course from plan
GET    /api/students/:id/plan/export    Export as Excel (xlsx)
```

### Prerequisites
```
GET    /api/courses/:code/prereqs       Get prereq tree for a course
POST   /api/students/:id/prereq-check  Check if student meets prereqs for a list of courses
```

### Overload Validation
```
POST   /api/students/:id/validate-load
Body: { quarter, year, courses: [courseIds] }
Returns: { status, countableUnits, rawUnits, maxAllowed, overloadEligible, windows, message }
```

### Transfer Credits
```
POST   /api/students/:id/transfer-credits/evaluate
Body: { institution, courseCode, courseName, units, grade, term, year, takenAfterSCUEnrollment }
Returns: { accepted, reason, scuEquivalent, source }

GET    /api/students/:id/transfer-credits  List all evaluated transfer credits
GET    /api/students/:id/transfer-credits/summary  Unit totals and cap status
```

### Professors
```
GET    /api/professors/search?name=&courseCode=    Search + get rating
GET    /api/courses/:code/sections?quarter=&year=  All sections with professor ratings
```

### GPA
```
GET    /api/students/:id/gpa           Current GPA breakdown
POST   /api/students/:id/gpa/simulate  Simulate projected GPA with expected grades
GET    /api/students/:id/gpa/overload-analysis  What GPA needed for overload eligibility
```

### AI Advisor (RAG)
```
POST   /api/advisor/query
Body: { studentId, question }
Returns: { answer, sources: [{ bulletinSection, text }], confidence, shouldContactDrahmann }
```

### Schedule
```
GET    /api/schedule?quarter=&year=&courseCode=   Get all sections with timing
POST   /api/schedule/conflicts
Body: { sectionIds: [uuid, uuid, ...] }
Returns: { conflicts: [{ courseA, courseB, overlap }] }
```

### Benchmark Evaluation
```
GET    /api/benchmark/scenarios         All 17 trap scenarios
POST   /api/benchmark/evaluate          Submit AI response for scoring
GET    /api/benchmark/results           Aggregate performance scores
```

---

## 26. Data Sources & Scraping Strategy

### What to Scrape and How

| Source | URL | Method | Data | Update Cadence |
|---|---|---|---|---|
| SCU Bulletin 2025–26 | https://www.scu.edu/bulletin/undergraduate/ | Download PDF per chapter; parse with pdf-parse | Policies, course descriptions, prereqs, Core requirements | Annual |
| SCU Course Catalog | https://www.scu.edu/web-design/content-types/scu-systems/course-catalog/ | Scrape HTML (Cheerio/Puppeteer) | Course codes, names, units, descriptions, prereqs | Quarterly |
| SCU Schedule of Classes | Workday SCU Find Course Section | Puppeteer (login required or use Schedule Helper API) | Section times, rooms, seats, professor names | Weekly |
| RateMyProfessor | https://www.ratemyprofessors.com/graphql | GraphQL POST (as documented above) | Professor ratings, reviews, difficulty | Weekly |
| SCU Schedule Helper | https://scu-schedule-helper.me/ | Check their API docs; may expose JSON endpoint | SCU-specific professor data | Weekly |
| ASSIST.org | https://assist.org | Scrape HTML for SC articulation tables | CC course → SCU course mappings | Annual |
| Drahmann Center | https://www.scu.edu/drahmann/ | Scrape HTML | Policy pages, forms, contact info | Semester |

### Scraping Ethics and Legal Notes
- Respect robots.txt for all sites
- Use reasonable rate limits (minimum 2 seconds between requests)
- Cache aggressively — do not hammer live sites
- For RateMyProfessor: their GraphQL is publicly accessible but review their terms of service
- Store scraped data locally; do not relay raw scraped data to end users without transformation

### RAG Ingestion Pipeline
```javascript
async function ingestBulletin(pdfPath, chapterName) {
  const text = await pdfParse(pdfPath);
  const chunks = splitIntoChunks(text.text, {
    chunkSize: 800,
    overlap: 150,
    separator: '\n\n'
  });

  const vectors = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: chunks.map(c => c.text)
  });

  await chromaCollection.add({
    ids: chunks.map((_, i) => `${chapterName}-chunk-${i}`),
    embeddings: vectors.data.map(v => v.embedding),
    documents: chunks.map(c => c.text),
    metadatas: chunks.map(c => ({
      source: 'bulletin_2025_26',
      chapter: chapterName,
      studentType: 'all',
      topic: classifyChunk(c.text)
    }))
  });
}
```

---

## 27. Replit Deployment Notes

### Replit Configuration
```toml
# .replit
run = "npm run start"
entrypoint = "server/index.js"

[nix]
channel = "stable-24_05"

[deployment]
run = ["sh", "-c", "npm run start"]
deploymentTarget = "cloudrun"

[[ports]]
localPort = 3000
externalPort = 80
```

### package.json Scripts
```json
{
  "scripts": {
    "start": "node server/index.js",
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "nodemon server/index.js",
    "dev:client": "vite client/",
    "build": "vite build client/",
    "ingest": "node scripts/ingest-bulletin.js",
    "seed-policies": "node scripts/seed-hard-policies.js",
    "benchmark": "node scripts/run-benchmark.js"
  }
}
```

### Folder Structure
```
/
├── client/                      # React frontend (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Planner/         # Drag-and-drop course grid
│   │   │   ├── Prereqs/         # Prereq tree visualizer
│   │   │   ├── Transfer/        # Transfer student section
│   │   │   ├── Professors/      # RMP rating display
│   │   │   ├── GPA/             # GPA calculator
│   │   │   ├── Advisor/         # AI chat interface
│   │   │   └── Schedule/        # Real-time section browser
│   │   ├── pages/               # Route-level components
│   │   ├── hooks/               # React Query hooks
│   │   ├── utils/
│   │   │   ├── policyRules.js   # All hardcoded SCU policy logic
│   │   │   └── unitCalculator.js
│   │   └── App.jsx
│   └── index.html
│
├── server/                      # Express backend
│   ├── index.js
│   ├── routes/
│   │   ├── students.js
│   │   ├── courses.js
│   │   ├── advisor.js           # RAG query handler
│   │   ├── professors.js
│   │   ├── transfer.js
│   │   ├── gpa.js
│   │   └── benchmark.js
│   ├── services/
│   │   ├── rag.js               # LangChain RAG pipeline
│   │   ├── prereqGraph.js       # Graph traversal
│   │   ├── rateMyProfessor.js   # RMP GraphQL client
│   │   ├── scheduleHelper.js    # SCU Schedule Helper API
│   │   └── policyEngine.js      # Hardcoded policy rules
│   └── db/
│       ├── schema.sql
│       └── client.js
│
├── scripts/
│   ├── ingest-bulletin.js       # PDF → vector store
│   ├── scrape-schedule.js       # Workday course sections
│   ├── scrape-assist.js         # ASSIST.org articulation tables
│   ├── seed-hard-policies.js    # Pre-load verified policy facts
│   └── run-benchmark.js         # Evaluate AI against trap scenarios
│
├── chroma_db/                   # Local vector store (auto-created)
├── data/
│   ├── bulletins/               # Downloaded PDF bulletins
│   ├── courses/                 # Scraped course catalog
│   └── benchmark/               # Benchmark scenario definitions
│
└── .env.example
```

### Critical Implementation Notes for Replit

1. **ChromaDB on Replit:** Chroma runs as an in-process vector store. Use `chromadb` npm package in ephemeral mode. Data persists to disk (`./chroma_db`). Replit's disk is persistent across runs.

2. **Environment Secrets:** Store all API keys in Replit Secrets, not `.env` files. Access via `process.env.*`.

3. **Bulletin PDFs:** Download SCU bulletin PDFs during setup (`npm run ingest`). Store in `/data/bulletins/`. Re-run ingestion annually when new bulletins publish.

4. **Policy Engine First:** Before any AI response is generated, run the deterministic `policyEngine.js` checks. If a hard rule applies, return that answer directly without hitting the LLM.

5. **Honest Uncertainty:** Configure the LLM system prompt to always say "Contact the Drahmann Center at scu.edu/drahmann" when the retrieved context doesn't clearly answer the question. Never have the AI guess.

6. **Rate Limiting:** Add `express-rate-limit` to protect the `/api/advisor/query` endpoint (expensive LLM calls). Suggested limit: 20 queries per user per hour.

7. **Version Pinning:** Pin bulletin year in student profiles. When the 2026–27 bulletin publishes, existing students should not automatically switch to new requirements.

---

*End of specification. All SCU policies verified against official sources as of April 2026. This document should be re-verified annually when new bulletins are published.*

*For questions about policies not covered here, always direct students to the Drahmann Advising Center: https://www.scu.edu/drahmann/*
