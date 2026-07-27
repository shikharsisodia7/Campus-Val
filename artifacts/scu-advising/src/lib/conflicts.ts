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

export function minutesToLabel(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}
