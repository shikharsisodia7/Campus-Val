import { ScheduleEvent, Term } from "@workspace/api-client-react";
import { TimedEvent } from "@/lib/conflicts";

/**
 * @param isTentativeSchedule When true, the schedule's term has no published
 * SCU schedule yet — `sectionNumber` is a synthetic placeholder, not a real
 * Registrar section number, so it must never be shown as if it were one.
 */
export function toTimedEvent(event: ScheduleEvent, isTentativeSchedule = false): TimedEvent {
  return {
    id: event.id,
    label:
      event.kind === "section"
        ? isTentativeSchedule
          ? `${event.courseCode} — Tentative offering`
          : `${event.courseCode}-${event.sectionNumber}`
        : event.name || "Event",
    meetingDays: event.meetingDays,
    startTime: event.startTime,
    endTime: event.endTime,
  };
}

export const DAYS = [
  { key: "M", label: "Mon" },
  { key: "T", label: "Tue" },
  { key: "W", label: "Wed" },
  { key: "R", label: "Thu" },
  { key: "F", label: "Fri" },
  { key: "S", label: "Sat" },
  { key: "U", label: "Sun" },
] as const;

export function format12(t: string): string {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t;
  let h = parseInt(m[1]!, 10);
  const mer = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  if (h > 12) h -= 12;
  return `${h}:${m[2]} ${mer}`;
}

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function termColor(idx: number): { bg: string; border: string; text: string } {
  const palette = [
    { bg: "bg-blue-100", border: "border-blue-400", text: "text-blue-900" },
    { bg: "bg-emerald-100", border: "border-emerald-400", text: "text-emerald-900" },
    { bg: "bg-amber-100", border: "border-amber-400", text: "text-amber-900" },
    { bg: "bg-purple-100", border: "border-purple-400", text: "text-purple-900" },
    { bg: "bg-pink-100", border: "border-pink-400", text: "text-pink-900" },
    { bg: "bg-cyan-100", border: "border-cyan-400", text: "text-cyan-900" },
  ];
  return palette[idx % palette.length]!;
}
