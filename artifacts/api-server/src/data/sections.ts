import type { Term } from "./courses";

/**
 * Live section data and professor information have been intentionally left
 * empty. SCU does not publish a public API for either:
 *   1. Real-time course sections (instructors, meeting times, seat counts) —
 *      this lives behind Workday Student / Camino and requires SCU IT
 *      authentication to access.
 *   2. Verified professor ratings or historical course GPAs — RateMyProfessors
 *      and SCU Schedule Helper do not expose public APIs and their data is
 *      not redistributable.
 *
 * Rather than fabricate plausible-looking instructor names, ratings, and
 * meeting times (which would mislead students), the sections endpoint returns
 * an empty list and the UI renders a clear "no live data connected" notice.
 *
 * To populate this with real data, you would need to:
 *   - Connect SCU's Workday/Camino API (requires institutional credentials), or
 *   - Periodically scrape the public course-avails page (legally grey,
 *     unreliable), or
 *   - Manually upload a CSV each quarter from the SCU registrar.
 */

export interface SectionEntry {
  id: string;
  courseCode: string;
  sectionNumber: string;
  term: Term;
  year: number;
  instructor: string;
  meetingDays: ("M" | "T" | "W" | "R" | "F" | "S" | "U")[];
  startTime: string;
  endTime: string;
  location: string;
  seatsTotal: number;
  seatsOpen: number;
  waitlist: number;
}

export interface ProfessorRatingEntry {
  instructor: string;
  overallRating: number | null;
  difficulty: number | null;
  wouldTakeAgainPercent: number | null;
  averageGpa: number | null;
  numRatings: number;
  sourceNote: string;
}

export const PROFESSOR_RATINGS: ProfessorRatingEntry[] = [];

export const SECTIONS: SectionEntry[] = [];

export const SECTION_DATA_NOTICE =
  "Live section data (instructors, meeting times, seat counts) and professor ratings are not yet connected. SCU's Workday Student / Camino API requires institutional credentials, and RateMyProfessors / SCU Schedule Helper do not expose public APIs. Connect a real source to populate this view.";

export function ratingFor(_instructor: string): ProfessorRatingEntry | null {
  return null;
}
