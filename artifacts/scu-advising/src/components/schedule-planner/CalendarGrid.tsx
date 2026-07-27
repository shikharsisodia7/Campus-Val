import { useState, useMemo } from "react";
import { ScheduleEvent } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Info } from "lucide-react";
import { DAYS, toTimedEvent, format12, termColor, capitalize } from "./utils";
import { findEventConflicts, timeToMinutes } from "@/lib/conflicts";

const HOUR_START = 8; // 8 AM
const HOUR_END = 22; // 10 PM
const PX_PER_MIN = 1.1;
const TOTAL_MIN = (HOUR_END - HOUR_START) * 60;
const GRID_HEIGHT = TOTAL_MIN * PX_PER_MIN;

export function CalendarGrid({
  events,
  onEventClick,
}: {
  events: ScheduleEvent[];
  onEventClick?: (event: ScheduleEvent) => void;
}) {
  const [showWeekends, setShowWeekends] = useState(false);

  const timedEvents = useMemo(() => events.map(toTimedEvent), [events]);
  const conflicts = useMemo(() => findEventConflicts(timedEvents), [timedEvents]);
  const conflictIds = useMemo(() => {
    const set = new Set<number>();
    for (const c of conflicts) {
      set.add(c.a.id as number);
      set.add(c.b.id as number);
    }
    return set;
  }, [conflicts]);

  const weekendEventsCount = events.filter((e) =>
    e.meetingDays.includes("S") || e.meetingDays.includes("U")
  ).length;

  const displayedDays = showWeekends ? DAYS : DAYS.slice(0, 5);
  const hourLabels = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

  // Assign stable colors
  const colorMap = useMemo(() => {
    const m = new Map<string, ReturnType<typeof termColor>>();
    let i = 0;
    for (const e of events) {
      if (e.kind === "section" && e.courseCode) {
        const baseCode = e.courseCode.replace(/L$/, "");
        if (!m.has(baseCode)) {
          m.set(baseCode, termColor(i));
          i++;
        }
      } else {
        if (!m.has(`commitment-${e.id}`)) {
          m.set(`commitment-${e.id}`, { bg: "bg-slate-100", border: "border-slate-400", text: "text-slate-900" });
        }
      }
    }
    return m;
  }, [events]);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch id="weekend-mode" checked={showWeekends} onCheckedChange={setShowWeekends} />
            <Label htmlFor="weekend-mode" className="text-xs text-muted-foreground cursor-pointer">
              Show weekends
            </Label>
          </div>
          {!showWeekends && weekendEventsCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-md border border-amber-200">
              <AlertTriangle className="h-3 w-3" />
              <span>{weekendEventsCount} weekend event{weekendEventsCount === 1 ? '' : 's'} hidden</span>
            </div>
          )}
        </div>
      </div>

      <Card className="p-4 overflow-x-auto shadow-sm cv-card-hover">
        <div
          className="grid min-w-[600px]"
          style={{ gridTemplateColumns: `60px repeat(${displayedDays.length}, minmax(120px, 1fr))` }}
        >
          <div></div>
          {displayedDays.map((d) => (
            <div key={d.key} className="text-center font-semibold text-sm pb-2 border-b border-border">
              {d.label}
            </div>
          ))}

          <div className="relative" style={{ height: GRID_HEIGHT }}>
            {hourLabels.map((h) => (
              <div
                key={h}
                className="absolute right-2 text-[10px] text-muted-foreground select-none"
                style={{ top: (h - HOUR_START) * 60 * PX_PER_MIN - 6 }}
              >
                {h % 12 === 0 ? 12 : h % 12} {h < 12 ? "AM" : "PM"}
              </div>
            ))}
          </div>

          {displayedDays.map((d) => (
            <div key={d.key} className="relative border-l border-border/60" style={{ height: GRID_HEIGHT }}>
              {hourLabels.map((h) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 border-t border-border/30 pointer-events-none"
                  style={{ top: (h - HOUR_START) * 60 * PX_PER_MIN }}
                />
              ))}

              {events
                .filter((s) => s.meetingDays.includes(d.key))
                .map((s) => {
                  const startMin = timeToMinutes(s.startTime) - HOUR_START * 60;
                  const endMin = timeToMinutes(s.endTime) - HOUR_START * 60;
                  if (isNaN(startMin) || isNaN(endMin)) return null;

                  const top = startMin * PX_PER_MIN;
                  const height = Math.max((endMin - startMin) * PX_PER_MIN, 32);

                  const color =
                    s.kind === "section" && s.courseCode
                      ? colorMap.get(s.courseCode.replace(/L$/, "")) ?? termColor(0)
                      : colorMap.get(`commitment-${s.id}`);

                  const isConflict = conflictIds.has(s.id);
                  const isTentative = s.kind === "section" && !s.instructor; // Rough proxy for tentative section

                  return (
                    <div
                      key={`${s.id}-${d.key}`}
                      onClick={() => onEventClick?.(s)}
                      className={`absolute left-0.5 right-0.5 rounded p-1.5 text-[10px] sm:text-xs leading-tight overflow-hidden border shadow-sm transition-transform hover:scale-[1.02] hover:z-10 cursor-pointer ${
                        isConflict
                          ? "bg-red-100 border-red-500 text-red-900 ring-2 ring-red-400"
                          : `${color?.bg} ${color?.border} ${color?.text}`
                      } ${s.kind === "commitment" ? "border-dashed" : ""}`}
                      style={{ top, height }}
                    >
                      <div className="font-semibold truncate">
                        {s.kind === "section" ? `${s.courseCode}-${s.sectionNumber}` : s.name}
                      </div>
                      <div className="truncate opacity-90 text-[10px]">
                        {s.kind === "section" ? s.instructor || "Instructor TBA" : capitalize(s.category || "")}
                      </div>
                      <div className="truncate opacity-80 text-[10px] mt-0.5">
                        {format12(s.startTime)}–{format12(s.endTime)}
                      </div>
                      {s.location && (
                        <div className="truncate opacity-70 italic text-[10px] mt-0.5">
                          {s.location}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
