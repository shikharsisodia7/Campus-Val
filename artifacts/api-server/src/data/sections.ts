import type { Term } from "./courses";

/**
 * Live section data has been intentionally left empty. SCU does not publish
 * a public API for real-time course sections (instructors, meeting times,
 * seat counts) — this lives behind Workday Student / Camino and requires SCU
 * IT authentication to access.
 *
 * Rather than fabricate plausible-looking instructor names and meeting times
 * (which would mislead students), the sections endpoint returns an empty
 * list and the UI renders a clear "no live data connected" notice.
 *
 * To populate this with real data, use the Workday paste-in sync feature
 * (/sync-workday), which stores rows the student pastes from SCU Workday's
 * "Find Course Sections" view.
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

export const SECTIONS: SectionEntry[] = [];

export const SECTION_DATA_NOTICE =
  "Live section data (instructors, meeting times, seat counts) is not yet connected. SCU's Workday Student / Camino API requires institutional credentials. Paste sections from Workday on the Sync page to populate this view.";
