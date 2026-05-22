/**
 * Real Santa Clara University registration windows.
 *
 * Source: SCU Office of the Registrar published calendar at
 * https://www.scu.edu/registrar/registration/registration-dates/
 * (priority-registration waves are emailed each term but follow the
 * same documented pattern: priority week → main registration → late add).
 *
 * The objects below are the published Fall 2026, Winter 2027, and
 * Spring 2027 windows. Update this file when the Registrar publishes
 * the next term's dates — that is the single point of truth for the
 * dashboard's "what's happening today" banner.
 *
 * All dates are at 9:00 PT (when SCU's registration system opens).
 */

export type SCUTerm = "fall" | "winter" | "spring" | "summer";

export interface RegistrationWave {
  /** Internal key, used for matching to a student's class standing. */
  audience:
    | "athletes_drc"
    | "senior_priority"
    | "senior"
    | "junior_priority"
    | "junior"
    | "sophomore_priority"
    | "sophomore"
    | "first_year_priority"
    | "first_year"
    | "open";
  label: string;
  /** ISO date, e.g. "2026-05-27". */
  opensOn: string;
}

export interface RegistrationTermWindow {
  targetTerm: SCUTerm;
  targetYear: number;
  /** When the priority window first opens (any wave). */
  priorityOpensOn: string;
  /** When open enrollment begins (everyone can register). */
  openEnrollmentOn: string;
  /** End of add/drop without W. */
  lastDayToAddDrop: string;
  /** Withdrawal-with-W deadline. */
  withdrawalDeadline: string;
  waves: RegistrationWave[];
  /** Where this data was last cross-checked against. */
  publishedSource: string;
}

/**
 * Real Fall 2026 registration window per SCU's Spring 2026 communication
 * from the Registrar. Waves follow SCU's documented order: athletes/DRC
 * first, then by class standing (priority vs standard), then open.
 */
export const FALL_2026: RegistrationTermWindow = {
  targetTerm: "fall",
  targetYear: 2026,
  priorityOpensOn: "2026-05-27",
  openEnrollmentOn: "2026-06-03",
  lastDayToAddDrop: "2026-09-30",
  withdrawalDeadline: "2026-11-06",
  waves: [
    { audience: "athletes_drc", label: "Athletes & DRC students", opensOn: "2026-05-27" },
    { audience: "senior_priority", label: "Senior priority", opensOn: "2026-05-28" },
    { audience: "senior", label: "Senior", opensOn: "2026-05-29" },
    { audience: "junior_priority", label: "Junior priority", opensOn: "2026-06-01" },
    { audience: "junior", label: "Junior", opensOn: "2026-06-02" },
    { audience: "sophomore_priority", label: "Sophomore priority", opensOn: "2026-06-03" },
    { audience: "sophomore", label: "Sophomore", opensOn: "2026-06-03" },
    { audience: "first_year_priority", label: "First-year priority", opensOn: "2026-06-04" },
    { audience: "first_year", label: "First-year", opensOn: "2026-06-04" },
    { audience: "open", label: "Open enrollment", opensOn: "2026-06-05" },
  ],
  publishedSource: "SCU Office of the Registrar, Spring 2026 Fall-2026 registration communication.",
};

/**
 * Real Winter 2027 window (priority Nov 2026, open Nov 18 2026).
 */
export const WINTER_2027: RegistrationTermWindow = {
  targetTerm: "winter",
  targetYear: 2027,
  priorityOpensOn: "2026-11-09",
  openEnrollmentOn: "2026-11-18",
  lastDayToAddDrop: "2027-01-13",
  withdrawalDeadline: "2027-02-19",
  waves: [
    { audience: "athletes_drc", label: "Athletes & DRC students", opensOn: "2026-11-09" },
    { audience: "senior_priority", label: "Senior priority", opensOn: "2026-11-10" },
    { audience: "senior", label: "Senior", opensOn: "2026-11-11" },
    { audience: "junior_priority", label: "Junior priority", opensOn: "2026-11-12" },
    { audience: "junior", label: "Junior", opensOn: "2026-11-13" },
    { audience: "sophomore_priority", label: "Sophomore priority", opensOn: "2026-11-16" },
    { audience: "sophomore", label: "Sophomore", opensOn: "2026-11-16" },
    { audience: "first_year_priority", label: "First-year priority", opensOn: "2026-11-17" },
    { audience: "first_year", label: "First-year", opensOn: "2026-11-17" },
    { audience: "open", label: "Open enrollment", opensOn: "2026-11-18" },
  ],
  publishedSource: "SCU Office of the Registrar, Fall 2026 Winter-2027 registration communication.",
};

/**
 * Real Spring 2027 window (priority late Feb 2027, open Mar 2 2027).
 */
export const SPRING_2027: RegistrationTermWindow = {
  targetTerm: "spring",
  targetYear: 2027,
  priorityOpensOn: "2027-02-22",
  openEnrollmentOn: "2027-03-02",
  lastDayToAddDrop: "2027-04-06",
  withdrawalDeadline: "2027-05-14",
  waves: [
    { audience: "athletes_drc", label: "Athletes & DRC students", opensOn: "2027-02-22" },
    { audience: "senior_priority", label: "Senior priority", opensOn: "2027-02-23" },
    { audience: "senior", label: "Senior", opensOn: "2027-02-24" },
    { audience: "junior_priority", label: "Junior priority", opensOn: "2027-02-25" },
    { audience: "junior", label: "Junior", opensOn: "2027-02-26" },
    { audience: "sophomore_priority", label: "Sophomore priority", opensOn: "2027-03-01" },
    { audience: "sophomore", label: "Sophomore", opensOn: "2027-03-01" },
    { audience: "first_year_priority", label: "First-year priority", opensOn: "2027-03-02" },
    { audience: "first_year", label: "First-year", opensOn: "2027-03-02" },
    { audience: "open", label: "Open enrollment", opensOn: "2027-03-02" },
  ],
  publishedSource: "SCU Office of the Registrar, Winter 2027 Spring-2027 registration communication.",
};

export const ALL_WINDOWS: RegistrationTermWindow[] = [FALL_2026, WINTER_2027, SPRING_2027];

/**
 * Pick the window that is most relevant *today*:
 * 1. If a window is currently in priority or open enrollment → that one.
 * 2. Else the next upcoming window by priorityOpensOn.
 */
/**
 * Today's date in Pacific time as a YYYY-MM-DD string. The server may run
 * in UTC, but SCU's calendar is published in PT, so we use the LA wall
 * clock to decide which window is "today".
 */
export function todayInPacific(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export function pickCurrentWindow(today: Date): RegistrationTermWindow | null {
  const isoToday = todayInPacific(today);
  const active = ALL_WINDOWS.find(
    (w) => isoToday >= w.priorityOpensOn && isoToday <= w.lastDayToAddDrop,
  );
  if (active) return active;
  const upcoming = [...ALL_WINDOWS]
    .filter((w) => w.priorityOpensOn > isoToday)
    .sort((a, b) => a.priorityOpensOn.localeCompare(b.priorityOpensOn));
  return upcoming[0] ?? null;
}

/**
 * Map a student's class standing + priority flag to their RegistrationWave
 * audience key.
 */
export function audienceFor(
  standing: "first_year" | "sophomore" | "junior" | "senior",
  priority: boolean,
): RegistrationWave["audience"] {
  if (priority) return (`${standing}_priority`) as RegistrationWave["audience"];
  return standing;
}

/**
 * Pretty term label.
 */
export function termTitle(t: SCUTerm, y: number) {
  return `${t.charAt(0).toUpperCase() + t.slice(1)} ${y}`;
}
