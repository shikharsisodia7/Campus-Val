export interface PolicyEntry {
  id: string;
  title: string;
  category: string;
  summary: string;
  body: string;
  source: string;
  sourceUrl?: string;
  tags: string[];
}

export const POLICIES: PolicyEntry[] = [
  {
    id: "transfer-cap-87.5",
    title: "87.5 Quarter-Unit Transfer Credit Cap",
    category: "Transfer Credit",
    summary:
      "SCU accepts a maximum of 87.5 quarter units of transfer credit toward an undergraduate degree.",
    body:
      "Santa Clara University accepts no more than 87.5 quarter units of transfer credit (equivalent to roughly 58 semester units) toward an undergraduate degree. This cap counts coursework completed at community colleges and other institutions BEFORE matriculation at SCU. Once admitted as an SCU student, the rules for accepting additional outside coursework become significantly stricter (see Post-Enrollment Transfer Policy).",
    source: "SCU Office of the Registrar — Undergraduate Bulletin",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/",
    tags: ["transfer", "cap", "units", "transfer-credit"],
  },
  {
    id: "post-enrollment-transfer",
    title: "Post-Enrollment Transfer Coursework Restrictions",
    category: "Transfer Credit",
    summary:
      "After enrolling at SCU, taking courses at another institution requires advance written approval and is heavily restricted.",
    body:
      "Once you have matriculated at SCU, you may NOT freely take courses at another institution (e.g. a community college over the summer) and expect them to transfer in. You must obtain WRITTEN advance approval from your dean's office BEFORE enrolling in the outside course. Without prior approval, the credit will not transfer regardless of the grade earned. Courses taken at two-year colleges after a student has earned 87.5 quarter units (combined SCU + transfer) are NOT accepted.",
    source: "SCU Undergraduate Bulletin — Transfer Credit Policy",
    tags: ["transfer", "post-enrollment", "community-college", "approval"],
  },
  {
    id: "unit-load-cap-standing",
    title: "Standard Quarterly Unit Load Cap (by class standing)",
    category: "Registration",
    summary:
      "First-year and sophomore students may register for up to 20 units per quarter without approval; juniors and seniors up to 22 units.",
    body:
      "The standard maximum unit load varies by class standing. First-year and sophomore students may register for up to 20 quarter units in a regular quarter (fall, winter, spring) without approval. Juniors and seniors may register for up to 22 quarter units. Class standing is determined by total units completed (including transfer credit): freshman <44, sophomore 44-86, junior 87-130, senior 131+. Above the standard cap requires advisor/dean approval and overload eligibility.",
    source: "SCU Registrar — Registration Policies / Undergraduate Bulletin",
    tags: ["units", "registration", "cap", "standing"],
  },
  {
    id: "overload-eligibility",
    title: "Unit Overload Eligibility (up to approved cap)",
    category: "Registration",
    summary:
      "To overload above the standard cap (up to 22 units freshman/sophomore, 24 units junior/senior), a student needs a cumulative GPA ≥ 3.0 AND priority registration plus dean approval.",
    body:
      "To register for more units than the standard cap allows, a student must: (1) have a cumulative SCU GPA of at least 3.0, (2) have priority registration eligibility for the term, and (3) obtain approval from their dean's office. The maximum approved cap is 22 units for freshmen/sophomores and 24 units for juniors/seniors. Approval is not automatic — the dean considers academic history and the specific course load. Petitions are typically opened during late registration windows.",
    source: "SCU Undergraduate Bulletin — Unit Load and Overload",
    tags: ["overload", "gpa", "priority", "units"],
  },
  {
    id: "major-restriction",
    title: "Major / College Course Restrictions",
    category: "Registration",
    summary:
      "Some courses are restricted to students in a specific SCU college (e.g., COEN courses are limited to School of Engineering students).",
    body:
      "Many engineering courses (COEN, ELEN, MECH, CENG, ENGR) are restricted to students enrolled in the School of Engineering and require an inter-college permission number to register if you're in another college. Business core courses similarly restrict to Leavey School of Business students. Always check the prerequisites/restrictions field in the schedule of classes; the registration system will silently block you otherwise. Permission numbers are typically issued by the offering department, not your home college's dean.",
    source: "SCU Bulletin — Inter-College Registration",
    tags: ["college", "restriction", "permission", "engineering"],
  },
  {
    id: "prereq-grade-requirement",
    title: "C- Minimum for Major / Prerequisite Courses",
    category: "Academic Standing",
    summary:
      "Most major prerequisites and required major courses must be passed with a C- or better.",
    body:
      "Many SCU majors and most STEM prerequisite chains require a grade of C- or better in prerequisite courses. A grade of D or F (or even D+/D-) in a prerequisite means you must REPEAT the course before continuing the sequence. This applies prominently to COEN 10 → COEN 11 → COEN 12, MATH 11 → 12 → 13, and most engineering and CS majors.",
    source: "SCU Department Bulletins — Prerequisite Policies",
    tags: ["prerequisites", "grades", "major", "repeat"],
  },
  {
    id: "grading-scale",
    title: "GPA Grading Scale",
    category: "Grades & GPA",
    summary:
      "SCU uses a standard 4.0 grading scale; A+ is recorded but capped at 4.0 in GPA calculations.",
    body:
      "Grade points: A/A+ = 4.0, A- = 3.7, B+ = 3.3, B = 3.0, B- = 2.7, C+ = 2.3, C = 2.0, C- = 1.7, D+ = 1.3, D = 1.0, D- = 0.7, F = 0.0. Grades of P (Pass), NP (No Pass), IP (In Progress), and W (Withdrawn) do not factor into GPA. Plus/minus grades DO count.",
    source: "SCU Registrar — Grading System",
    tags: ["gpa", "grades", "calculation"],
  },
  {
    id: "dean-list",
    title: "Dean's List Requirements",
    category: "Honors",
    summary:
      "Quarter GPA of at least 3.5 in 12+ graded units (no pass/fail) earns Dean's List.",
    body:
      "To earn Dean's List recognition for a given quarter, a student must complete at least 12 units of graded coursework (P/NP units do not count toward the 12-unit minimum) and earn a quarterly GPA of 3.5 or higher with no incomplete grades.",
    source: "SCU Registrar — Academic Honors",
    tags: ["honors", "deans-list", "gpa"],
  },
  {
    id: "core-curriculum",
    title: "SCU Core Curriculum Requirements",
    category: "Curriculum",
    summary:
      "All undergraduates must complete the SCU Core, including Critical Thinking & Writing, RTC 1/2/3, Cultures & Ideas, Math, Natural Science, Social Science, and others.",
    body:
      "The SCU Core is required of all undergraduates regardless of major. Core areas include: Critical Thinking & Writing 1 & 2 (ENGL 1A/1B), Advanced Writing, Cultures & Ideas 1 & 2, Religion Theology & Culture 1, 2, & 3 (RTC sequence), Mathematics, Natural Science, Social Science, Diversity, Civic Engagement, Arts, and Experiential Learning for Social Justice. Many core requirements can be fulfilled by major coursework that counts in multiple areas.",
    source: "SCU Bulletin — Core Curriculum",
    tags: ["core", "curriculum", "requirements"],
  },
  {
    id: "ap-credit",
    title: "AP / IB Credit Acceptance",
    category: "Transfer Credit",
    summary:
      "AP scores of 4 or 5 (subject-dependent) and IB Higher Level scores of 6 or 7 generally earn SCU quarter units.",
    body:
      "SCU awards quarter-unit credit for qualifying AP and IB scores. Generally, AP scores of 4 or 5 in most subjects earn 4-8 quarter units, sometimes substituting for a specific SCU course (e.g. AP Calculus BC = MATH 11 + MATH 12). IB Higher Level scores of 6 or 7 are similarly awarded. AP/IB credits count toward the 87.5 quarter-unit transfer cap. Subject-specific equivalencies are published by the Registrar.",
    source: "SCU Registrar — AP/IB Credit Tables",
    tags: ["ap", "ib", "transfer", "high-school"],
  },
  {
    id: "withdrawal-deadline",
    title: "Course Withdrawal Deadline",
    category: "Registration",
    summary:
      "Last day to withdraw from a course with a W is approximately the end of the 7th week of the quarter.",
    body:
      "Students may withdraw from a course up through (approximately) the 7th week of the quarter and receive a W on their transcript, which does not affect GPA. After this deadline, withdrawal is permitted only for documented serious medical or personal reasons. Each quarter the exact date is published on the academic calendar.",
    source: "SCU Academic Calendar",
    tags: ["withdrawal", "deadline", "registration"],
  },
  {
    id: "graduation-units",
    title: "Minimum Units for Graduation",
    category: "Graduation",
    summary:
      "175 quarter units total are required for an undergraduate degree from SCU, including residency requirements.",
    body:
      "Undergraduate students must complete at least 175 quarter units to graduate. Of those, at least 60 quarter units must be earned in residence at SCU (i.e. taken on campus or in approved SCU programs), and at least 35 of the final 45 quarter units must be taken at SCU.",
    source: "SCU Bulletin — Degree Requirements",
    tags: ["graduation", "units", "residency"],
  },
  {
    id: "academic-probation",
    title: "Academic Probation Threshold",
    category: "Academic Standing",
    summary:
      "Cumulative GPA below 2.0 results in academic probation; sustained probation can lead to disqualification.",
    body:
      "A student whose cumulative SCU GPA falls below 2.0 is placed on academic probation. Continued failure to bring the cumulative GPA to 2.0 or above within typically two terms can result in academic disqualification. Academic probation also restricts unit-load privileges and overload eligibility.",
    source: "SCU Registrar — Academic Standing",
    tags: ["probation", "gpa", "standing"],
  },
  {
    id: "priority-registration",
    title: "Priority Registration Eligibility",
    category: "Registration",
    summary:
      "Priority registration is granted to honors students, athletes, students with disabilities, and certain other categories.",
    body:
      "Priority registration moves a student into an earlier registration window (before their normal class-based slot). Eligible groups include University Honors Program students, varsity student-athletes, students registered with the Office of Accessible Education, ROTC cadets, and certain veterans. Priority registration is also a prerequisite for unit overload approval.",
    source: "SCU Registrar — Registration Priorities",
    tags: ["priority", "registration", "overload"],
  },
  {
    id: "quarter-to-semester",
    title: "Quarter Unit ↔ Semester Unit Conversion",
    category: "Transfer Credit",
    summary:
      "1 semester unit = 1.5 quarter units. SCU operates on quarters, so semester courses are scaled up by 1.5x.",
    body:
      "When evaluating transfer credit from a semester-system institution, SCU multiplies the semester units by 1.5 to convert to SCU quarter units. For example, a 3-semester-unit course from another university converts to 4.5 SCU quarter units. This is critical when checking the 87.5 quarter-unit cap.",
    source: "SCU Registrar — Transfer Credit Conversion",
    tags: ["transfer", "units", "semester", "quarter", "conversion"],
  },
  {
    id: "summer-units-at-scu",
    title: "Summer Session Units (SCU)",
    category: "Registration",
    summary:
      "SCU summer sessions are shorter and have lower unit caps; courses count as SCU residency units.",
    body:
      "Courses taken in SCU's summer sessions count as SCU residency units (not transfer units). Summer sessions are condensed (typically 5-7 weeks), and the per-session unit cap is lower than regular quarters. Summer is a useful path for catching up if a fall/winter/spring sequence was disrupted.",
    source: "SCU Summer Session Office",
    tags: ["summer", "units", "residency"],
  },
];
