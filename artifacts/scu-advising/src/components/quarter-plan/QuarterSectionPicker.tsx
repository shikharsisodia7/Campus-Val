import {
  useAddScheduleEvent,
  useCreateSchedule,
  useDeleteScheduleEvent,
  useListCourseSections,
  useUpdateScheduleEvent,
  getListCourseSectionsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Loader2, MapPin, Users } from "lucide-react";

type SelectedEvent = {
  id: number;
  courseCode?: string | null;
  sectionNumber?: string | null;
};

type Props = {
  courseCode: string;
  term: "fall" | "winter" | "spring" | "summer";
  year: number;
  scheduleId: number | null | undefined;
  selectedEvent?: SelectedEvent;
  onScheduleReady: (id: number) => void;
  onChanged: () => void;
};

function time(value: string) {
  if (!value) return "Time TBA";
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/**
 * The Quarter Plan's section chooser. It writes to the existing persisted
 * schedule events used by Weekly Schedule, so the calendar is not a second
 * source of truth. Sections are only ever selected by the student.
 */
export function QuarterSectionPicker({
  courseCode,
  term,
  year,
  scheduleId,
  selectedEvent,
  onScheduleReady,
  onChanged,
}: Props) {
  const params = { term, year };
  const { data: sections, isLoading } = useListCourseSections(courseCode, params, {
    query: {
      queryKey: getListCourseSectionsQueryKey(courseCode, params),
    },
  });
  const createSchedule = useCreateSchedule();
  const add = useAddScheduleEvent();
  const swap = useUpdateScheduleEvent();
  const remove = useDeleteScheduleEvent();

  const select = async (sectionNumber: string) => {
    let targetScheduleId = scheduleId;
    if (!targetScheduleId) {
      const schedule = await createSchedule.mutateAsync({
        data: {
          name: `${term.charAt(0).toUpperCase()}${term.slice(1)} ${year} Quarter Plan`,
          term,
          year,
        },
      });
      targetScheduleId = schedule.id;
      onScheduleReady(schedule.id);
    }
    if (selectedEvent) {
      await swap.mutateAsync({
        id: targetScheduleId,
        eventId: selectedEvent.id,
        data: { sectionNumber },
      });
    } else {
      await add.mutateAsync({
        id: targetScheduleId,
        data: { kind: "section", courseCode, sectionNumber },
      });
    }
    onChanged();
  };

  const busy =
    createSchedule.isPending || add.isPending || swap.isPending || remove.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading real sections…
      </div>
    );
  }
  if (!sections?.length) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        No {term} {year} sections are available in CampusVal's current
        Registrar data. No section was selected.
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid={`section-picker-${courseCode.replace(/\s+/g, "-")}`}>
      {sections.map((section) => {
        const chosen = selectedEvent?.sectionNumber === section.sectionNumber;
        return (
          <div
            key={section.id}
            className={`rounded-md border p-2.5 text-xs ${
              chosen
                ? "border-emerald-300 bg-emerald-50/50"
                : "border-border bg-card"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-mono font-semibold text-primary">
                {courseCode}–{section.sectionNumber}
              </div>
              <div className="flex gap-1">
                {section.tentative && (
                  <Badge variant="outline" className="h-5 text-[9px] text-amber-800">
                    Tentative
                  </Badge>
                )}
                {chosen && (
                  <Badge className="h-5 text-[9px] bg-emerald-700">Chosen</Badge>
                )}
              </div>
            </div>
            <div className="mt-1.5 grid gap-1 text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                {section.meetingDays.length ? section.meetingDays.join("") : "Days TBA"} ·{" "}
                {section.startTime && section.endTime
                  ? `${time(section.startTime)}–${time(section.endTime)}`
                  : "Time TBA"}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="h-3 w-3" /> {section.instructor || "Instructor TBA"}
              </span>
              {section.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> {section.location}
                </span>
              )}
              {section.seatsKnown && (
                <span>
                  {section.seatsOpen} open of {section.seatsTotal}
                  {section.waitlist ? ` · waitlist ${section.waitlist}` : ""}
                </span>
              )}
            </div>
            <div className="mt-2 flex gap-2">
              {chosen ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  disabled={busy || !scheduleId}
                  onClick={() =>
                    scheduleId &&
                    remove
                      .mutateAsync({ id: scheduleId, eventId: selectedEvent!.id })
                      .then(onChanged)
                  }
                >
                  Unselect
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  disabled={busy}
                  onClick={() => void select(section.sectionNumber)}
                >
                  {selectedEvent ? "Choose instead" : "Choose section"}
                </Button>
              )}
            </div>
          </div>
        );
      })}
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Choose lecture, lab, and discussion components individually when they
        appear as separate sections. CampusVal never picks a component at random.
      </p>
    </div>
  );
}