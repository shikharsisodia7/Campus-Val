import { useMemo } from "react";
import { ScheduleEvent } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toTimedEvent, format12 } from "./utils";
import { findEventConflicts } from "@/lib/conflicts";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DAYS } from "./utils";

export function ConflictsPanel({
  events,
  isTentativeSchedule = false,
}: {
  events: ScheduleEvent[];
  isTentativeSchedule?: boolean;
}) {
  const timedEvents = useMemo(
    () => events.map((e) => toTimedEvent(e, isTentativeSchedule)),
    [events, isTentativeSchedule],
  );
  const conflicts = useMemo(() => findEventConflicts(timedEvents), [timedEvents]);

  if (events.length === 0) return null;

  if (conflicts.length === 0) {
    return (
      <Card className="p-4 border-emerald-300 bg-emerald-50">
        <div className="flex items-center gap-2 text-emerald-900">
          <CheckCircle2 className="h-5 w-5" />
          <span className="text-sm font-semibold">No time conflicts</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-red-300 bg-red-50 overflow-hidden">
      <Accordion type="single" collapsible className="w-full" defaultValue="conflicts">
        <AccordionItem value="conflicts" className="border-none">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-red-100/50 transition-colors">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-700" />
              <h3 className="font-semibold text-red-900">
                {conflicts.length} time conflict{conflicts.length === 1 ? "" : "s"}
              </h3>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-3 pt-1 text-sm text-red-900">
              {conflicts.map((c, i) => {
                const dayLabel = DAYS.find((d) => d.key === c.day)?.label ?? c.day;
                const formatOverlap = (m: number) => {
                  const h = Math.floor(m / 60);
                  const min = m % 60;
                  return format12(`${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`);
                };
                return (
                  <div key={i} className="border-l-2 border-red-400 pl-3">
                    <div>
                      <strong>{c.a.label}</strong> and <strong>{c.b.label}</strong>
                    </div>
                    <div className="opacity-90 mt-0.5 text-xs">
                      Overlap on {dayLabel} from {formatOverlap(c.overlapStart)} to {formatOverlap(c.overlapEnd)}.
                    </div>
                  </div>
                );
              })}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
