import { useGetCourse, ScheduleEvent, useDeleteScheduleEvent, getGetCourseQueryKey } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, MapPin, Users, BookOpen, Trash2, ExternalLink } from "lucide-react";
import { format12 } from "./utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { SCU_BULLETIN_URL } from "@/data/advising-resources";

export function CourseDetailsDialog({
  event,
  open,
  onOpenChange,
  isTentativeSchedule = false,
}: {
  event: ScheduleEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** See CalendarGrid's prop of the same name. */
  isTentativeSchedule?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const delMut = useDeleteScheduleEvent();

  const isSection = event?.kind === "section";
  const courseCode = isSection ? event.courseCode! : "";

  const { data: course, isLoading } = useGetCourse(courseCode, {
    query: { enabled: open && !!courseCode, queryKey: getGetCourseQueryKey(courseCode) },
  });

  if (!event) return null;

  const handleRemove = () => {
    if (!event.scheduleId || !event.id) return;
    delMut.mutate(
      { id: event.scheduleId, eventId: event.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            predicate: (q) => String(q.queryKey[0]).startsWith("/api/schedules"),
          });
          toast({ title: "Event removed" });
          onOpenChange(false);
        },
        onError: () => toast({ title: "Failed to remove event", variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-xl max-h-[85vh] overflow-y-auto">
        {isSection ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between gap-4">
                <span className="font-bold text-xl">
                  {isTentativeSchedule ? `${courseCode} — Tentative offering` : `${courseCode}-${event.sectionNumber}`}
                </span>
                <div className="flex items-center gap-2">
                  {isTentativeSchedule && (
                    <Badge
                      variant="outline"
                      className="border-amber-400 bg-amber-50 text-amber-900"
                      title="This term's schedule is tentative. SCU has not published a section number or instructor."
                    >
                      Tentative
                    </Badge>
                  )}
                  {course && <Badge variant="outline">{course.units} units</Badge>}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={handleRemove}
                    aria-label={`Remove ${courseCode} from schedule`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </DialogTitle>
              {course && <p className="text-muted-foreground text-sm font-medium">{course.title}</p>}
            </DialogHeader>

            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-2 gap-4 text-sm bg-muted/20 p-4 rounded-lg border">
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 mt-0.5 text-primary" />
                    <div>
                      <div className="font-semibold text-foreground">Meeting Times</div>
                      <div className="text-muted-foreground">
                        {event.meetingDays.length > 0 ? event.meetingDays.join(", ") : "Days TBA"}
                      </div>
                      <div className="text-muted-foreground">
                        {event.startTime && event.endTime 
                          ? `${format12(event.startTime)} - ${format12(event.endTime)}` 
                          : "Time TBA"}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <Users className="h-4 w-4 mt-0.5 text-primary" />
                    <div>
                      <div className="font-semibold text-foreground">Instructor</div>
                      <div className="text-muted-foreground">
                        {isTentativeSchedule ? "Instructor not published" : (event.instructor || "Instructor TBA")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 mt-0.5 text-primary" />
                    <div>
                      <div className="font-semibold text-foreground">Location</div>
                      <div className="text-muted-foreground">{event.location || "Location TBA"}</div>
                    </div>
                  </div>
                </div>
              </div>

              {isLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : course ? (
                <div className="space-y-5">
                  <div>
                    <h4 className="font-semibold text-sm mb-1">Description</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">{course.description}</p>
                  </div>
                  
                  {course.coreAreas && course.coreAreas.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">Core Requirements Satisfied</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {course.coreAreas.map(c => (
                          <Badge key={c} variant="secondary" className="font-normal">{c}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                    <h4 className="font-semibold text-amber-900 text-sm mb-1 flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5" />
                      Prerequisites
                    </h4>
                    <p className="text-xs text-amber-800/80">
                      {course.prereqLogic || "Prerequisite information unavailable"}
                    </p>
                  </div>

                  {course.corequisites.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">Corequisites</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {course.corequisites.map((c) => (
                          <Badge key={c} variant="outline" className="font-mono">
                            {c}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Course and prerequisite information is for planning. Always verify requirements in the official SCU Bulletin/Course Catalog and consult your advisor when needed.
                  </p>
                  <a
                    href={SCU_BULLETIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Verify in the official SCU Bulletin / Course Catalog
                  </a>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center">Course details unavailable.</p>
              )}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">{event.name}</DialogTitle>
              <p className="text-muted-foreground text-sm font-medium uppercase tracking-wider">
                {event.category?.replace("_", " ")}
              </p>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4 text-sm bg-muted/20 p-4 rounded-lg border mt-4">
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 mt-0.5 text-primary" />
                  <div>
                    <div className="font-semibold text-foreground">Meeting Times</div>
                    <div className="text-muted-foreground">
                      {event.meetingDays.length > 0 ? event.meetingDays.join(", ") : "Days TBA"}
                    </div>
                    <div className="text-muted-foreground">
                      {event.startTime && event.endTime 
                        ? `${format12(event.startTime)} - ${format12(event.endTime)}` 
                        : "Time TBA"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-primary" />
                  <div>
                    <div className="font-semibold text-foreground">Location</div>
                    <div className="text-muted-foreground">{event.location || "Location TBA"}</div>
                  </div>
                </div>
              </div>
            </div>

            {event.category === "external_course" && (
              <div className="mt-4 p-3 bg-muted/50 rounded-md border text-sm">
                <div className="font-semibold">Institution</div>
                <div className="text-muted-foreground mb-2">{event.institution || "Not provided"}</div>
                <div className="font-semibold">Course Label</div>
                <div className="text-muted-foreground">{event.externalCourseLabel || "Not provided"}</div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
