export interface EvaluationScenarioEntry {
  id: string;
  category: string;
  prompt: string;
  expectedKeywords: string[];
  forbiddenKeywords: string[];
  risk: "low" | "medium" | "high" | "critical";
  rubric: string;
}

export const EVALUATION_SCENARIOS: EvaluationScenarioEntry[] = [
  {
    id: "unit-cap-freshman-standard",
    category: "unit_cap",
    prompt:
      "I'm a first-year SCU student. What's the maximum number of units I can register for in fall quarter without any special approval?",
    expectedKeywords: ["20", "first-year", "approval"],
    forbiddenKeywords: ["19 units is the cap", "25 units"],
    risk: "high",
    rubric:
      "Should answer 20 units as the standard freshman/sophomore cap. Should mention dean approval is needed to go higher (up to 22 with GPA ≥ 3.0).",
  },
  {
    id: "unit-cap-junior-standard",
    category: "unit_cap",
    prompt:
      "I'm a junior. Can I register for 22 units this quarter without any special approval?",
    expectedKeywords: ["22", "junior", "standard"],
    forbiddenKeywords: ["19 units", "exceed", "blocked"],
    risk: "high",
    rubric:
      "Should confirm 22 units is the standard junior/senior cap (no approval needed). Above that requires dean approval and GPA ≥ 3.0 (up to 24).",
  },
  {
    id: "overload-gpa-rule",
    category: "unit_cap",
    prompt:
      "My GPA is 2.95. Can I overload to 22 units this quarter?",
    expectedKeywords: ["3.0", "no", "below"],
    forbiddenKeywords: ["yes you can overload", "approve"],
    risk: "critical",
    rubric:
      "Must say NO. Overload above standard cap requires GPA ≥ 3.0. 2.95 is below threshold. Suggest waiting until GPA improves.",
  },
  {
    id: "transfer-cap-87.5",
    category: "transfer_cap",
    prompt:
      "I have 80 quarter units of transfer credit and want to bring in another 12 from a community college over the summer before I start at SCU. Will it all count?",
    expectedKeywords: ["87.5", "cap", "no"],
    forbiddenKeywords: ["all 12 will count", "no problem"],
    risk: "critical",
    rubric:
      "Must explain that the 87.5 quarter-unit cap is hard. Only 7.5 of the 12 would count. Should warn about AP/IB also counting toward this cap.",
  },
  {
    id: "post-enrollment-cc",
    category: "policy",
    prompt:
      "I'm a continuing SCU student. Can I take a class at De Anza this summer and have it transfer back to SCU?",
    expectedKeywords: ["written", "approval", "dean", "before"],
    forbiddenKeywords: ["yes, just take it", "no problem"],
    risk: "critical",
    rubric:
      "Must explain that post-enrollment outside coursework requires WRITTEN advance approval from the dean's office BEFORE enrolling. Without it, no credit transfers.",
  },
  {
    id: "coen-11-prereq",
    category: "prereq",
    prompt:
      "I got a D+ in COEN 11. Can I take COEN 12 next quarter?",
    expectedKeywords: ["C-", "no", "repeat"],
    forbiddenKeywords: ["yes you can take COEN 12", "D+ is fine"],
    risk: "critical",
    rubric:
      "Must say NO — COEN 12 requires C- or better in COEN 11. Student must repeat COEN 11. Note GPA replacement only happens if repeated AT SCU.",
  },
  {
    id: "engr-1-fall-only",
    category: "trap",
    prompt:
      "I'm a freshman engineering student and I forgot to take ENGR 1 in fall. Can I just take it in winter?",
    expectedKeywords: ["fall only", "next year", "delay"],
    forbiddenKeywords: ["winter is fine", "spring is fine"],
    risk: "high",
    rubric:
      "Must explain ENGR 1 is fall-only. Missing it means waiting a full year (next fall), which delays the engineering sequence.",
  },
  {
    id: "semester-conversion",
    category: "transfer_cap",
    prompt:
      "I took a 3-semester-unit course at another university. How many SCU units is that?",
    expectedKeywords: ["4.5", "1.5", "quarter"],
    forbiddenKeywords: ["3 units", "same"],
    risk: "high",
    rubric:
      "Must apply the 1.5x conversion. 3 semester units = 4.5 SCU quarter units.",
  },
  {
    id: "withdrawal-deadline",
    category: "policy",
    prompt:
      "It's week 8 and I'm failing a course. Can I withdraw and get a W?",
    expectedKeywords: ["week 7", "deadline", "passed"],
    forbiddenKeywords: ["yes you can still withdraw"],
    risk: "high",
    rubric:
      "Must explain the W deadline is end of week 7. After that, only documented serious medical/personal reasons qualify for late withdrawal.",
  },
  {
    id: "deans-list-12-units",
    category: "policy",
    prompt:
      "I got a 3.7 quarterly GPA across 11 graded units. Did I make Dean's List?",
    expectedKeywords: ["12", "minimum", "no"],
    forbiddenKeywords: ["yes you qualify", "congratulations"],
    risk: "medium",
    rubric:
      "Must say NO — Dean's List requires AT LEAST 12 graded units. 11 doesn't qualify even with the GPA threshold met.",
  },
  {
    id: "senior-residency-rule",
    category: "policy",
    prompt:
      "I'm a senior with 165 units, and I want to finish my last 10 units at a community college near home. Will SCU accept them?",
    expectedKeywords: ["35 of the final 45", "residence", "no"],
    forbiddenKeywords: ["yes that's fine", "no problem"],
    risk: "critical",
    rubric:
      "Must cite the 35-of-final-45 residency rule. With only 10 units left, all must be at SCU.",
  },
  {
    id: "major-restriction",
    category: "trap",
    prompt:
      "I'm a Business major. Can I take COEN 12 to learn data structures?",
    expectedKeywords: ["engineering", "restrict", "permission"],
    forbiddenKeywords: ["yes register normally", "open to all"],
    risk: "medium",
    rubric:
      "Should flag that COEN courses past the intro level are restricted to School of Engineering students. Suggest CSCI 61 (Data Structures, in Arts & Sciences) as the alternative.",
  },
];
