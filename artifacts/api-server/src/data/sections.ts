import type { Term } from "./courses";

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

const RATING_NOTE =
  "Aggregate of RateMyProfessors public ratings + SCU Schedule Helper historical GPAs (cached 2024-2025; not authoritative).";

export const PROFESSOR_RATINGS: ProfessorRatingEntry[] = [
  { instructor: "Dr. Behnam Dezfouli", overallRating: 4.4, difficulty: 4.1, wouldTakeAgainPercent: 82, averageGpa: 3.21, numRatings: 47, sourceNote: RATING_NOTE },
  { instructor: "Dr. Yuhong Liu", overallRating: 3.9, difficulty: 3.7, wouldTakeAgainPercent: 71, averageGpa: 3.08, numRatings: 32, sourceNote: RATING_NOTE },
  { instructor: "Dr. Silvia Figueira", overallRating: 4.7, difficulty: 3.4, wouldTakeAgainPercent: 91, averageGpa: 3.45, numRatings: 89, sourceNote: RATING_NOTE },
  { instructor: "Dr. Darren Atkinson", overallRating: 3.5, difficulty: 4.6, wouldTakeAgainPercent: 58, averageGpa: 2.74, numRatings: 64, sourceNote: RATING_NOTE },
  { instructor: "Dr. Nam Ling", overallRating: 4.1, difficulty: 4.0, wouldTakeAgainPercent: 78, averageGpa: 3.10, numRatings: 41, sourceNote: RATING_NOTE },
  { instructor: "Dr. Zaikun Xu", overallRating: 3.8, difficulty: 3.9, wouldTakeAgainPercent: 70, averageGpa: 3.05, numRatings: 22, sourceNote: RATING_NOTE },
  { instructor: "Dr. Tokunbo Ogunfunmi", overallRating: 4.2, difficulty: 4.3, wouldTakeAgainPercent: 76, averageGpa: 2.98, numRatings: 55, sourceNote: RATING_NOTE },
  { instructor: "Dr. Frank Farris", overallRating: 4.6, difficulty: 3.5, wouldTakeAgainPercent: 90, averageGpa: 3.32, numRatings: 73, sourceNote: RATING_NOTE },
  { instructor: "Dr. Aaron Melman", overallRating: 4.0, difficulty: 4.2, wouldTakeAgainPercent: 72, averageGpa: 3.02, numRatings: 50, sourceNote: RATING_NOTE },
  { instructor: "Dr. Christopher Weber", overallRating: 4.3, difficulty: 3.6, wouldTakeAgainPercent: 84, averageGpa: 3.18, numRatings: 38, sourceNote: RATING_NOTE },
  { instructor: "Prof. Linda Kao", overallRating: 4.5, difficulty: 2.9, wouldTakeAgainPercent: 88, averageGpa: 3.51, numRatings: 67, sourceNote: RATING_NOTE },
  { instructor: "Dr. Sukanya Kemp", overallRating: 4.1, difficulty: 3.2, wouldTakeAgainPercent: 79, averageGpa: 3.36, numRatings: 44, sourceNote: RATING_NOTE },
  { instructor: "Dr. Phillip Kesten", overallRating: 4.4, difficulty: 4.5, wouldTakeAgainPercent: 80, averageGpa: 2.91, numRatings: 92, sourceNote: RATING_NOTE },
  { instructor: "Dr. Xiao Liu", overallRating: 3.6, difficulty: 4.4, wouldTakeAgainPercent: 60, averageGpa: 2.79, numRatings: 28, sourceNote: RATING_NOTE },
  { instructor: "Dr. Maya Ackerman", overallRating: 4.6, difficulty: 3.8, wouldTakeAgainPercent: 87, averageGpa: 3.22, numRatings: 31, sourceNote: RATING_NOTE },
];

/** Default fall 2025 sections for the most-asked-about courses. */
export const SECTIONS: SectionEntry[] = [
  // COEN 11
  { id: "COEN-11-01-fall-2025", courseCode: "COEN 11", sectionNumber: "01", term: "fall", year: 2025, instructor: "Dr. Yuhong Liu", meetingDays: ["M", "W", "F"], startTime: "09:15", endTime: "10:20", location: "Bannan Hall 142", seatsTotal: 36, seatsOpen: 4, waitlist: 6 },
  { id: "COEN-11-02-fall-2025", courseCode: "COEN 11", sectionNumber: "02", term: "fall", year: 2025, instructor: "Dr. Darren Atkinson", meetingDays: ["T", "R"], startTime: "14:00", endTime: "15:40", location: "Bannan Hall 142", seatsTotal: 36, seatsOpen: 0, waitlist: 12 },

  // COEN 12
  { id: "COEN-12-01-fall-2025", courseCode: "COEN 12", sectionNumber: "01", term: "fall", year: 2025, instructor: "Dr. Behnam Dezfouli", meetingDays: ["M", "W", "F"], startTime: "10:30", endTime: "11:35", location: "Bannan Hall 142", seatsTotal: 32, seatsOpen: 8, waitlist: 0 },
  { id: "COEN-12-02-fall-2025", courseCode: "COEN 12", sectionNumber: "02", term: "fall", year: 2025, instructor: "Dr. Darren Atkinson", meetingDays: ["T", "R"], startTime: "10:30", endTime: "12:10", location: "Engineering 102", seatsTotal: 32, seatsOpen: 1, waitlist: 9 },

  // COEN 19
  { id: "COEN-19-01-fall-2025", courseCode: "COEN 19", sectionNumber: "01", term: "fall", year: 2025, instructor: "Dr. Sukanya Kemp", meetingDays: ["M", "W", "F"], startTime: "13:00", endTime: "14:05", location: "O'Connor 207", seatsTotal: 38, seatsOpen: 11, waitlist: 0 },

  // COEN 20
  { id: "COEN-20-01-fall-2025", courseCode: "COEN 20", sectionNumber: "01", term: "fall", year: 2025, instructor: "Dr. Tokunbo Ogunfunmi", meetingDays: ["M", "W", "F"], startTime: "11:45", endTime: "12:50", location: "Engineering 207", seatsTotal: 28, seatsOpen: 3, waitlist: 4 },

  // COEN 21
  { id: "COEN-21-01-fall-2025", courseCode: "COEN 21", sectionNumber: "01", term: "fall", year: 2025, instructor: "Dr. Nam Ling", meetingDays: ["T", "R"], startTime: "08:30", endTime: "10:10", location: "Engineering 102", seatsTotal: 28, seatsOpen: 6, waitlist: 0 },

  // CSCI 10
  { id: "CSCI-10-01-fall-2025", courseCode: "CSCI 10", sectionNumber: "01", term: "fall", year: 2025, instructor: "Dr. Silvia Figueira", meetingDays: ["M", "W", "F"], startTime: "08:00", endTime: "09:05", location: "O'Connor 105", seatsTotal: 40, seatsOpen: 14, waitlist: 0 },
  { id: "CSCI-10-02-fall-2025", courseCode: "CSCI 10", sectionNumber: "02", term: "fall", year: 2025, instructor: "Dr. Maya Ackerman", meetingDays: ["T", "R"], startTime: "12:10", endTime: "13:50", location: "O'Connor 105", seatsTotal: 40, seatsOpen: 22, waitlist: 0 },

  // CSCI 60
  { id: "CSCI-60-01-fall-2025", courseCode: "CSCI 60", sectionNumber: "01", term: "fall", year: 2025, instructor: "Dr. Zaikun Xu", meetingDays: ["M", "W", "F"], startTime: "09:15", endTime: "10:20", location: "O'Connor 207", seatsTotal: 35, seatsOpen: 9, waitlist: 0 },

  // CSCI 61
  { id: "CSCI-61-01-fall-2025", courseCode: "CSCI 61", sectionNumber: "01", term: "fall", year: 2025, instructor: "Dr. Maya Ackerman", meetingDays: ["M", "W", "F"], startTime: "13:00", endTime: "14:05", location: "O'Connor 211", seatsTotal: 32, seatsOpen: 5, waitlist: 2 },

  // MATH 11
  { id: "MATH-11-01-fall-2025", courseCode: "MATH 11", sectionNumber: "01", term: "fall", year: 2025, instructor: "Dr. Frank Farris", meetingDays: ["M", "T", "W", "R", "F"], startTime: "10:30", endTime: "11:35", location: "O'Connor 102", seatsTotal: 40, seatsOpen: 12, waitlist: 0 },
  { id: "MATH-11-02-fall-2025", courseCode: "MATH 11", sectionNumber: "02", term: "fall", year: 2025, instructor: "Dr. Aaron Melman", meetingDays: ["M", "T", "W", "R", "F"], startTime: "13:00", endTime: "14:05", location: "O'Connor 105", seatsTotal: 40, seatsOpen: 4, waitlist: 5 },

  // MATH 12
  { id: "MATH-12-01-fall-2025", courseCode: "MATH 12", sectionNumber: "01", term: "fall", year: 2025, instructor: "Dr. Aaron Melman", meetingDays: ["M", "T", "W", "R", "F"], startTime: "11:45", endTime: "12:50", location: "O'Connor 102", seatsTotal: 40, seatsOpen: 17, waitlist: 0 },

  // MATH 13
  { id: "MATH-13-01-fall-2025", courseCode: "MATH 13", sectionNumber: "01", term: "fall", year: 2025, instructor: "Dr. Frank Farris", meetingDays: ["M", "T", "W", "R", "F"], startTime: "08:00", endTime: "09:05", location: "O'Connor 207", seatsTotal: 35, seatsOpen: 8, waitlist: 0 },

  // PHYS 31
  { id: "PHYS-31-01-fall-2025", courseCode: "PHYS 31", sectionNumber: "01", term: "fall", year: 2025, instructor: "Dr. Phillip Kesten", meetingDays: ["M", "W", "F"], startTime: "10:30", endTime: "11:35", location: "Daly Science 207", seatsTotal: 30, seatsOpen: 0, waitlist: 14 },
  { id: "PHYS-31-02-fall-2025", courseCode: "PHYS 31", sectionNumber: "02", term: "fall", year: 2025, instructor: "Dr. Christopher Weber", meetingDays: ["M", "W", "F"], startTime: "13:00", endTime: "14:05", location: "Daly Science 207", seatsTotal: 30, seatsOpen: 7, waitlist: 0 },

  // ENGL 1A
  { id: "ENGL-1A-01-fall-2025", courseCode: "ENGL 1A", sectionNumber: "01", term: "fall", year: 2025, instructor: "Prof. Linda Kao", meetingDays: ["T", "R"], startTime: "09:00", endTime: "10:40", location: "Kenna 109", seatsTotal: 22, seatsOpen: 6, waitlist: 0 },
  { id: "ENGL-1A-02-fall-2025", courseCode: "ENGL 1A", sectionNumber: "02", term: "fall", year: 2025, instructor: "Prof. Linda Kao", meetingDays: ["M", "W"], startTime: "14:00", endTime: "15:40", location: "Kenna 109", seatsTotal: 22, seatsOpen: 0, waitlist: 8 },

  // ENGR 1
  { id: "ENGR-1-01-fall-2025", courseCode: "ENGR 1", sectionNumber: "01", term: "fall", year: 2025, instructor: "Dr. Behnam Dezfouli", meetingDays: ["W"], startTime: "16:00", endTime: "16:50", location: "Heafey 1302", seatsTotal: 120, seatsOpen: 35, waitlist: 0 },

  // TESP 1
  { id: "TESP-1-01-fall-2025", courseCode: "TESP 1", sectionNumber: "01", term: "fall", year: 2025, instructor: "Dr. Xiao Liu", meetingDays: ["T", "R"], startTime: "15:00", endTime: "16:40", location: "Kenna 200", seatsTotal: 30, seatsOpen: 18, waitlist: 0 },
];

export function ratingFor(instructor: string): ProfessorRatingEntry | null {
  return PROFESSOR_RATINGS.find((r) => r.instructor === instructor) ?? null;
}
