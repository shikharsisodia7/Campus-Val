/**
 * Advice Board content — structured as data, not UI.
 *
 * Every tip declares its provenance honestly:
 * - "peer":     curated peer-style advice written for CampusVal. It has NOT
 *               been collected from real SCU students yet; the UI must not
 *               claim otherwise.
 * - "official": points at an official SCU service/resource; the sourceUrl
 *               is the authority, and policy-sensitive items carry a
 *               lastVerified date.
 *
 * When real student/advisor-approved content is provided, set sourceType
 * accordingly and update the page subtitle copy.
 */

export type TipCategory =
  | "Registration"
  | "Studying"
  | "Professors"
  | "Wellness"
  | "Career"
  | "Campus Life";

export type TipSourceType = "peer" | "advisor" | "official";

export interface AdviceTip {
  id: string;
  category: TipCategory;
  title: string;
  body: string;
  sourceType: TipSourceType;
  /** Official SCU URL backing this tip, when one exists. */
  sourceUrl?: string;
  sourceLabel?: string;
  /** ISO date the underlying fact/policy was last checked (policy-sensitive tips). */
  lastVerified?: string;
}

export const TIP_SOURCE_META: Record<
  TipSourceType,
  { label: string; description: string }
> = {
  peer: {
    label: "Peer tip",
    description: "General student-experience advice — judgment, not policy.",
  },
  advisor: {
    label: "Advisor tip",
    description: "Guidance reviewed by an academic advisor.",
  },
  official: {
    label: "Official SCU resource",
    description: "Backed by an official SCU service or published page.",
  },
};

export const ADVICE_TIPS: AdviceTip[] = [
  {
    id: "r1",
    category: "Registration",
    title: "Have a Plan B (and C) for every quarter",
    body: "Workday class times shift the day enrollment opens. Pick 6–7 sections, rank them, and have backups ready — especially for popular Core courses like ETHC 4 or any CTW.",
    sourceType: "peer",
  },
  {
    id: "r2",
    category: "Registration",
    title: "Watch the waitlist closely the first week",
    body: "Drop-add runs through the first Friday of the quarter. Refresh Workday daily — seats free up as people finalize schedules.",
    sourceType: "peer",
    lastVerified: "2026-07-23",
  },
  {
    id: "r3",
    category: "Registration",
    title: "Priority registration ≠ open enrollment",
    body: "Athletes, honors, and accommodation students enroll first. Your standing's window opens later — check the Dashboard for your exact slot.",
    sourceType: "official",
    sourceUrl: "https://www.scu.edu/registrar/registration/",
    sourceLabel: "SCU Office of the Registrar",
    lastVerified: "2026-07-23",
  },
  {
    id: "s1",
    category: "Studying",
    title: "Use the Drahmann Center for free tutoring",
    body: "Walk-in math/science tutoring + writing partners. Located in Benson — most useful before midterms week.",
    sourceType: "official",
    sourceUrl: "https://www.scu.edu/drahmann/",
    sourceLabel: "Drahmann Center",
    lastVerified: "2026-07-23",
  },
  {
    id: "s2",
    category: "Studying",
    title: "Form study groups in week 2, not week 9",
    body: "By week 9 everyone's underwater. The best groups form early in office hours or in class — ask 2-3 people you respect to meet weekly.",
    sourceType: "peer",
  },
  {
    id: "s3",
    category: "Studying",
    title: "Library 3rd floor for silence, 1st for collab",
    body: "Learning Commons 1st floor is loud-friendly. 3rd floor is silent. Reserve a study room online up to a week ahead — they fill fast in week 9-10.",
    sourceType: "official",
    sourceUrl: "https://www.scu.edu/library/",
    sourceLabel: "SCU University Library",
  },
  {
    id: "p1",
    category: "Professors",
    title: "Office hours are the cheat code",
    body: "Most office hours are empty. Show up once a quarter with one specific question — it builds the relationship you'll need for rec letters.",
    sourceType: "peer",
  },
  {
    id: "p2",
    category: "Professors",
    title: "Check SCU's official course evaluations",
    body: "SCU's official course evaluations (evaluations.scu.edu, SCU login) plus upper-classmen are your best sources. Some \"hard\" professors are the best teachers — and vice versa.",
    sourceType: "official",
    sourceUrl: "https://evaluations.scu.edu/",
    sourceLabel: "SCU Course Evaluations (SCU login)",
  },
  {
    id: "p3",
    category: "Professors",
    title: "Email like a professional",
    body: "Subject line that's specific, greeting with title, sign with your name + course. Saves time + sets a tone.",
    sourceType: "peer",
  },
  {
    id: "w1",
    category: "Wellness",
    title: "CAPS is free and confidential",
    body: "Counseling & Psychological Services offers free short-term therapy + same-day urgent slots. Call (408) 554-4501.",
    sourceType: "official",
    sourceUrl: "https://www.scu.edu/caps/",
    sourceLabel: "SCU CAPS",
    lastVerified: "2026-07-23",
  },
  {
    id: "w2",
    category: "Wellness",
    title: "Cowell gym hours and classes",
    body: "Free for students. Group fitness classes (yoga, spin, HIIT) are included — check the Cowell site for the current schedule and hours.",
    sourceType: "official",
    sourceUrl: "https://www.scu.edu/recreation/",
    sourceLabel: "SCU Campus Recreation",
  },
  {
    id: "w3",
    category: "Wellness",
    title: "Don't skip sleep for one bad assignment",
    body: "Your GPA recovers from a B faster than your body recovers from a month of 4-hour nights. Build a hard stop time.",
    sourceType: "peer",
  },
  {
    id: "c1",
    category: "Career",
    title: "Handshake > LinkedIn for SCU jobs",
    body: "SCU's Handshake portal has internships specifically targeting Broncos. Set up alerts for your major your sophomore year.",
    sourceType: "official",
    sourceUrl: "https://scu.joinhandshake.com/",
    sourceLabel: "SCU Handshake",
  },
  {
    id: "c2",
    category: "Career",
    title: "The Career Center reviews resumes drop-in",
    body: "Drop-in hours on campus — bring a printed copy. Watch for free professional-headshot events during the year.",
    sourceType: "official",
    sourceUrl: "https://www.scu.edu/careercenter/",
    sourceLabel: "SCU Career Center",
  },
  {
    id: "c3",
    category: "Career",
    title: "Faculty research = best summer plan",
    body: "Ask 2-3 faculty in your major if they need a research assistant. Even unpaid lab time first year is gold for grad school + future internships.",
    sourceType: "peer",
  },
  {
    id: "l1",
    category: "Campus Life",
    title: "The Cellar Market closes earlier than you think",
    body: "Check posted hours before a late-night run. Stock your dorm on Sundays — Trader Joe's is a short drive away.",
    sourceType: "peer",
  },
  {
    id: "l2",
    category: "Campus Life",
    title: "Mission gardens are the best study spot in spring",
    body: "Quiet, free WiFi, no one will bother you. Bring a hoodie — it's colder than it looks once the sun moves.",
    sourceType: "peer",
  },
  {
    id: "l3",
    category: "Campus Life",
    title: "Use Bronco Bucks at the Cellar + Mission Bakery",
    body: "Often faster than swiping a meal — and morning pastries sell out early.",
    sourceType: "peer",
  },
];
