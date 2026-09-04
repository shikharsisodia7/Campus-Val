/**
 * Advising-layer resources — kept SEPARATE from degree-progress tracking.
 *
 * Degree Requirements answers "what does my degree require?" from the SCU
 * Bulletin. This layer answers "who can help me and where?" — official SCU
 * services plus pre-professional (pre-health, pre-law) advising.
 *
 * HONESTY CONTRACT: pre-professional guidance content (recommended course
 * sequencing for med school, professional-school planning advice, etc.)
 * only appears here once approved SCU content is provided. Until then, the
 * section renders an explicit "content pending" state that links to the
 * official SCU pre-health advising page — it never fabricates advice.
 */

/** Official SCU Undergraduate Bulletin / Course Catalog — the authoritative source for course descriptions, prerequisites, and program requirements. */
export const SCU_BULLETIN_URL = "https://www.scu.edu/bulletin/";

export interface OfficialResource {
  id: string;
  title: string;
  description: string;
  url: string;
  /** What this resource is the authority for. */
  authorityFor: string;
  lastVerified: string;
}

export const OFFICIAL_RESOURCES: OfficialResource[] = [
  {
    id: "workday",
    title: "Workday Student",
    description:
      "Registration, official degree audit, grades, and live section seats. The single source of truth for your academic record.",
    url: "https://www.myworkday.com/scu/",
    authorityFor: "Your official academic record and registration",
    lastVerified: "2026-07-23",
  },
  {
    id: "drahmann",
    title: "Drahmann Advising & Learning Resources Center",
    description:
      "Academic advising, tutoring, and study support. The people to see for probation questions, petitions, and advising holds.",
    url: "https://www.scu.edu/drahmann/",
    authorityFor: "Academic advising and tutoring",
    lastVerified: "2026-07-23",
  },
  {
    id: "hub",
    title: "The HUB Writing Center",
    description:
      "Free writing partners for any course — most useful before CTW and Advanced Writing deadlines.",
    url: "https://www.scu.edu/provost/writingcenter/",
    authorityFor: "Writing support",
    lastVerified: "2026-07-23",
  },
  {
    id: "registrar",
    title: "Office of the Registrar",
    description:
      "Registration dates, academic calendar, enrollment verification, and transcript requests.",
    url: "https://www.scu.edu/registrar/",
    authorityFor: "Registration dates and academic records policy",
    lastVerified: "2026-07-23",
  },
  {
    id: "evaluations",
    title: "SCU Course Evaluations",
    description:
      "Official student course evaluations (SCU login required) — SCU's own record of how students rated a course and instructor.",
    url: "https://evaluations.scu.edu/",
    authorityFor: "Official course/instructor feedback",
    lastVerified: "2026-07-23",
  },
  {
    id: "careercenter",
    title: "Career Center (incl. Focus 2)",
    description:
      "Career advising, Handshake job portal, resume reviews, and the Focus 2 self-assessment for choosing a major or career direction.",
    url: "https://www.scu.edu/careercenter/",
    authorityFor: "Career planning and major exploration",
    lastVerified: "2026-07-23",
  },
];

export interface PreProfessionalTrack {
  id: string;
  title: string;
  officialUrl: string;
  officialLabel: string;
  /** Approved guidance content. Empty = render the pending state. */
  approvedContent: string[];
  /** What CampusVal needs before showing guidance for this track. */
  pendingNote: string;
}

export const PRE_PROFESSIONAL_TRACKS: PreProfessionalTrack[] = [
  {
    id: "pre-health",
    title: "Pre-Health (medicine, dentistry, PA, pharmacy, vet)",
    officialUrl: "https://www.scu.edu/prehealth/",
    officialLabel: "SCU Pre-Health Advising",
    approvedContent: [],
    pendingNote:
      "Course-sequencing and application-timeline guidance will appear here once approved SCU pre-health advising content is added. Until then, use the official SCU Pre-Health Advising office — pre-health preparation is advising guidance layered on top of your major, not a degree requirement, so it is intentionally kept out of your Degree Requirements progress.",
  },
  {
    id: "pre-law",
    title: "Pre-Law",
    officialUrl: "https://www.scu.edu/careercenter/",
    officialLabel: "SCU Career Center (pre-law advising)",
    approvedContent: [],
    pendingNote:
      "Approved SCU pre-law guidance has not been added yet. The Career Center's pre-law advisors are the official resource.",
  },
];
