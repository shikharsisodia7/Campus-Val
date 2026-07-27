import { useState } from "react";
import { ScheduleEvent } from "@workspace/api-client-react";
import { useScheduleWorkspace } from "./useScheduleWorkspace";
import { TermAndScheduleHeader } from "./TermAndScheduleHeader";
import { CalendarGrid } from "./CalendarGrid";
import { ConflictsPanel } from "./ConflictsPanel";
import { SidebarPanels } from "./SidebarPanels";
import { CourseDetailsDialog } from "./CourseDetailsDialog";

export function SchedulePlanner() {
  const workspace = useScheduleWorkspace();
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 lg:p-8 space-y-6">
      <TermAndScheduleHeader workspace={workspace} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 h-[calc(100vh-200px)] min-h-[700px]">
        {/* Left Side: Calendar & Conflicts */}
        <div className="xl:col-span-8 xl:col-start-1 flex flex-col gap-6 overflow-hidden">
          {workspace.activeScheduleId ? (
            <>
              <div className="flex-1 overflow-y-auto">
                <CalendarGrid 
                  events={workspace.activeSchedule?.events || []} 
                  onEventClick={setSelectedEvent}
                />
              </div>
              <div className="shrink-0">
                <ConflictsPanel events={workspace.activeSchedule?.events || []} />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-xl bg-muted/10 p-8 text-center text-muted-foreground">
              <h2 className="text-xl font-semibold mb-2">No Schedule Selected</h2>
              <p className="max-w-sm">Create a new schedule or select an existing one to start planning your quarter.</p>
            </div>
          )}
        </div>

        {/* Right Side: Tools Sidebar */}
        <div className="xl:col-span-4 xl:col-start-9 flex flex-col overflow-hidden">
          {workspace.activeScheduleId ? (
            <SidebarPanels workspace={workspace} />
          ) : (
            <div className="flex-1 rounded-xl bg-card border shadow-sm opacity-50 pointer-events-none p-6 text-center text-sm flex items-center justify-center">
              Please create a schedule to access tools.
            </div>
          )}
        </div>
      </div>

      <CourseDetailsDialog 
        event={selectedEvent} 
        open={!!selectedEvent} 
        onOpenChange={(o) => !o && setSelectedEvent(null)} 
      />
    </div>
  );
}
