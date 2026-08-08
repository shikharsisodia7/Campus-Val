/**
 * Deterministic time-interval conflict detection for schedule events.
 * Works on ANY timed item (course sections, labs, work, athletics,
 * external courses, personal commitments). Pure functions — unit-tested.
 */

export interface TimedEvent {
  id: number | string;
  label: string;
  meetingDays: string[]; // M T W R F S U
  startTime: string; // "HH:mm" 24h
  endTime: string;
}

export interface EventConflict {
  a: TimedEvent;
  b: TimedEvent;
  day: string;
  overlapStart: number; // minutes from midnight
  overlapEnd: number;
}

export function timeToMinutes(t: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return NaN;
  return parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10);
}

export function findEventConflicts(events: TimedEvent[]): EventConflict[] {
  const out: EventConflict[] = [];
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i]!;
      const b = events[j]!;
      const aS = timeToMinutes(a.startTime);
      const aE = timeToMinutes(a.endTime);
      const bS = timeToMinutes(b.startTime);
      const bE = timeToMinutes(b.endTime);
      if ([aS, aE, bS, bE].some(Number.isNaN)) continue;
      if (aE <= aS || bE <= bS) continue;
      const aDays = new Set(a.meetingDays);
      for (const d of b.meetingDays) {
        if (!aDays.has(d)) continue;
        const s = Math.max(aS, bS);
        const e = Math.min(aE, bE);
        if (s < e) out.push({ a, b, day: d, overlapStart: s, overlapEnd: e });
      }
    }
  }
  return out;
}

/**
 * Minimal shape of an offered section's meeting time, as returned by the
 * course-sections API. Times may be empty/TBA for tentative terms.
 */
export interface SectionTimeLike {
  meetingDays: string[];
  startTime?: string | null;
  endTime?: string | null;
}

/** True only when both sections PROVABLY overlap: valid times + shared day. */
function provenOverlap(a: SectionTimeLike, b: SectionTimeLike): boolean {
  const aS = timeToMinutes(a.startTime ?? "");
  const aE = timeToMinutes(a.endTime ?? "");
  const bS = timeToMinutes(b.startTime ?? "");
  const bE = timeToMinutes(b.endTime ?? "");
  if ([aS, aE, bS, bE].some(Number.isNaN)) return false;
  if (aE <= aS || bE <= bS) return false;
  const aDays = new Set(a.meetingDays);
  for (const d of b.meetingDays) {
    if (aDays.has(d) && Math.max(aS, bS) < Math.min(aE, bE)) return true;
  }
  return false;
}

/**
 * True iff EVERY combination of one section from `a` and one from `b`
 * provably overlaps — i.e. there is no way to take both courses.
 * Any section with missing/TBA times makes the overlap unprovable → false.
 * Empty section lists → false (nothing to conflict with).
 */
export function sectionsAlwaysConflict(
  a: SectionTimeLike[],
  b: SectionTimeLike[],
): boolean {
  if (a.length === 0 || b.length === 0) return false;
  for (const sa of a) {
    for (const sb of b) {
      if (!provenOverlap(sa, sb)) return false;
    }
  }
  return true;
}

/** True only when a section has parseable, positive-duration meeting times. */
function hasValidTimes(s: SectionTimeLike): boolean {
  const start = timeToMinutes(s.startTime ?? "");
  const end = timeToMinutes(s.endTime ?? "");
  return !Number.isNaN(start) && !Number.isNaN(end) && end > start;
}

/**
 * True only when both sections have valid times AND provably never overlap
 * (no shared day, or shared days with disjoint time windows). Sections with
 * TBA/invalid times return false — no fit is ever claimed on guessed data.
 */
export function provenNoOverlap(
  a: SectionTimeLike,
  b: SectionTimeLike,
): boolean {
  if (!hasValidTimes(a) || !hasValidTimes(b)) return false;
  const aS = timeToMinutes(a.startTime!);
  const aE = timeToMinutes(a.endTime!);
  const bS = timeToMinutes(b.startTime!);
  const bE = timeToMinutes(b.endTime!);
  const aDays = new Set(a.meetingDays);
  for (const d of b.meetingDays) {
    if (aDays.has(d) && Math.max(aS, bS) < Math.min(aE, bE)) return false;
  }
  return true;
}

/**
 * True iff some section of the course PROVABLY fits alongside every planned
 * course: there exists a course section (with valid times) such that each
 * planned course has at least one section provably non-overlapping with it.
 * Empty planned list → fits as long as the course has one valid-timed
 * section. TBA/invalid times never count as a fit.
 */
export function hasProvenConflictFreeSection(
  courseSections: SectionTimeLike[],
  plannedCourseSections: SectionTimeLike[][],
): boolean {
  return courseSections.some(
    (sa) =>
      hasValidTimes(sa) &&
      plannedCourseSections.every((list) =>
        list.some((sb) => provenNoOverlap(sa, sb)),
      ),
  );
}

/**
 * True iff NO section of the course can provably coexist with all planned
 * courses: every course section is provably blocked by at least one planned
 * course (all of that course's sections overlap it). The dual of
 * `hasProvenConflictFreeSection` — covers the case where different course
 * sections are blocked by different planned courses. TBA/invalid times never
 * prove a block, so any unprovable section makes this false.
 */
export function provenNoSectionFits(
  courseSections: SectionTimeLike[],
  plannedCourseSections: SectionTimeLike[][],
): boolean {
  if (courseSections.length === 0 || plannedCourseSections.length === 0) {
    return false;
  }
  return courseSections.every((sa) =>
    plannedCourseSections.some(
      (list) => list.length > 0 && list.every((sb) => provenOverlap(sa, sb)),
    ),
  );
}

/** Section meeting time plus display metadata for conflict explanations. */
export interface SectionMeetingInfo extends SectionTimeLike {
  sectionNumber?: string | null;
  tentative?: boolean | null;
}

/** One provably-overlapping section pair, with the shared days and window. */
export interface SectionOverlapDetail {
  aSection: string; // e.g. "§1" or "Section TBA"
  bSection: string;
  aDays: string[];
  aStart: string; // "HH:mm"
  aEnd: string;
  bDays: string[];
  bStart: string;
  bEnd: string;
  sharedDays: string[];
  overlapStart: number; // minutes from midnight
  overlapEnd: number;
}

function sectionLabel(s: SectionMeetingInfo): string {
  return s.tentative || !s.sectionNumber ? "Section TBA" : `§${s.sectionNumber}`;
}

/**
 * For every combination of one section from `a` and one from `b` that
 * PROVABLY overlaps (valid times + shared day), return the shared days and
 * the overlap window. Pairs with TBA/invalid times are skipped — never
 * guessed. Order of days follows the canonical M T W R F S U week.
 */
const DAY_ORDER = ["M", "T", "W", "R", "F", "S", "U"];

export function sectionOverlapDetails(
  a: SectionMeetingInfo[],
  b: SectionMeetingInfo[],
): SectionOverlapDetail[] {
  const out: SectionOverlapDetail[] = [];
  for (const sa of a) {
    for (const sb of b) {
      const aS = timeToMinutes(sa.startTime ?? "");
      const aE = timeToMinutes(sa.endTime ?? "");
      const bS = timeToMinutes(sb.startTime ?? "");
      const bE = timeToMinutes(sb.endTime ?? "");
      if ([aS, aE, bS, bE].some(Number.isNaN)) continue;
      if (aE <= aS || bE <= bS) continue;
      const s = Math.max(aS, bS);
      const e = Math.min(aE, bE);
      if (s >= e) continue;
      const aDaySet = new Set(sa.meetingDays);
      const sharedDays = DAY_ORDER.filter(
        (d) => aDaySet.has(d) && sb.meetingDays.includes(d),
      );
      if (sharedDays.length === 0) continue;
      out.push({
        aSection: sectionLabel(sa),
        bSection: sectionLabel(sb),
        aDays: [...sa.meetingDays],
        aStart: sa.startTime!,
        aEnd: sa.endTime!,
        bDays: [...sb.meetingDays],
        bStart: sb.startTime!,
        bEnd: sb.endTime!,
        sharedDays,
        overlapStart: s,
        overlapEnd: e,
      });
    }
  }
  return out;
}

export function minutesToLabel(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}
