import { Card } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import type { AvailabilityWarning } from "./useScheduleAvailabilityWarnings";

const STATUS_TEXT: Record<AvailabilityWarning["availabilityStatus"], string> = {
  waitlist: "now shows a waitlist",
  full: "is now full",
};

/**
 * Renders when a section already on the schedule is no longer open. Never
 * removes the section — students may want to keep it while they look for a
 * backup (Plan B), per the professor's explicit "don't delete, warn instead"
 * feedback.
 */
export function ScheduleAvailabilityBanner({
  warnings,
}: {
  warnings: AvailabilityWarning[];
}) {
  if (warnings.length === 0) return null;

  return (
    <Card
      className="p-4 border-amber-300 bg-amber-50"
      data-testid="schedule-availability-banner"
    >
      <div className="flex items-start gap-2 text-amber-900">
        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
        <div className="space-y-1 text-sm">
          <p className="font-semibold">
            {warnings.length} scheduled section{warnings.length === 1 ? "" : "s"} may no longer be available
          </p>
          <ul className="space-y-0.5">
            {warnings.map((w) => (
              <li key={`${w.courseCode}-${w.sectionNumber}`} data-testid={`availability-warning-${w.courseCode}-${w.sectionNumber}`}>
                <strong>{w.courseCode}</strong> (Section {w.sectionNumber}) {STATUS_TEXT[w.availabilityStatus]}
                {w.lastUpdatedAt && (
                  <span className="opacity-80"> — last checked {new Date(w.lastUpdatedAt).toLocaleDateString()}</span>
                )}
                .
              </li>
            ))}
          </ul>
          <p className="opacity-90">
            It's kept on your schedule — nothing was removed. Consider lining
            up a backup (Plan B) section in Find Courses, or check Workday for
            the latest status.
          </p>
        </div>
      </div>
    </Card>
  );
}
