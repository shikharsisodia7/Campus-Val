import type { CourseSection } from "@workspace/api-client-react";

const STORAGE_KEY = "campusval.schedule.v2";
const EVENT = "campusval-schedule-changed";

export interface ScheduledSection {
  id: string;
  courseCode: string;
  sectionNumber: string;
  term: string;
  year: number;
  instructor: string;
  meetingDays: string[];
  startTime: string;
  endTime: string;
  location: string;
  isLab?: boolean;
  addedAt: string;
}

function read(): ScheduledSection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(rows: ScheduledSection[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getSchedule(): ScheduledSection[] {
  return read();
}

export function addToSchedule(section: CourseSection): {
  added: boolean;
  reason?: string;
} {
  const all = read();
  if (all.some((s) => s.id === section.id))
    return { added: false, reason: "Already in your schedule" };
  const isLab =
    /L\d*$/.test(section.courseCode.replace(/\s/g, "")) ||
    /^L|L$/.test(section.sectionNumber);
  const next: ScheduledSection = {
    id: section.id,
    courseCode: section.courseCode,
    sectionNumber: section.sectionNumber,
    term: section.term,
    year: section.year,
    instructor: section.instructor,
    meetingDays: section.meetingDays as string[],
    startTime: section.startTime,
    endTime: section.endTime,
    location: section.location,
    isLab,
    addedAt: new Date().toISOString(),
  };
  write([...all, next]);
  return { added: true };
}

export function removeFromSchedule(id: string): void {
  write(read().filter((s) => s.id !== id));
}

export function clearTerm(term: string, year: number): void {
  write(read().filter((s) => !(s.term === term && s.year === year)));
}

export function subscribe(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

function toMin(t: string): number {
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10);
}

export interface Conflict {
  a: ScheduledSection;
  b: ScheduledSection;
  day: string;
  overlapStart: number;
  overlapEnd: number;
}

export function findConflicts(rows: ScheduledSection[]): Conflict[] {
  const conflicts: Conflict[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!;
      const b = rows[j]!;
      if (a.term !== b.term || a.year !== b.year) continue;
      const aDays = new Set(a.meetingDays);
      for (const d of b.meetingDays) {
        if (!aDays.has(d)) continue;
        const aS = toMin(a.startTime);
        const aE = toMin(a.endTime);
        const bS = toMin(b.startTime);
        const bE = toMin(b.endTime);
        if (aS === 0 && aE === 0) continue;
        if (bS === 0 && bE === 0) continue;
        const overlapStart = Math.max(aS, bS);
        const overlapEnd = Math.min(aE, bE);
        if (overlapStart < overlapEnd) {
          conflicts.push({ a, b, day: d, overlapStart, overlapEnd });
        }
      }
    }
  }
  return conflicts;
}

export function timeToMinutes(t: string): number {
  return toMin(t);
}
