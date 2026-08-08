import { WORKDAY_STUDENT_URL } from "@/lib/workday";
import { useScheduleWorkspace } from "./useScheduleWorkspace";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, FileText, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDeleteScheduleEvent } from "@workspace/api-client-react";

export function RegistrationSummary({ workspace }: { workspace: ReturnType<typeof useScheduleWorkspace> }) {
  const { toast } = useToast();
  const delMut = useDeleteScheduleEvent();

  const sections = workspace.activeSchedule?.events.filter((e) => e.kind === "section") || [];

  const handleCopy = () => {
    const text = sections.map((s) => `${s.courseCode}-${s.sectionNumber}`).join("\n");
    navigator.clipboard.writeText(text);
    toast({ title: "Copied sections to clipboard" });
  };

  const handleRemove = (eventId: number) => {
    if (!workspace.activeScheduleId) return;
    delMut.mutate(
      { id: workspace.activeScheduleId, eventId },
      {
        onSuccess: () => {
          workspace.invalidateSchedules();
          toast({ title: "Section removed" });
        },
        onError: () => toast({ title: "Failed to remove section", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Registration Summary
        </h3>
        <p className="text-xs text-muted-foreground">
          Ready to enroll? Here are your planned sections.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sections.length === 0 ? (
          <div className="text-center p-4 text-sm text-muted-foreground bg-muted/30 rounded-md">
            Your schedule has no course sections yet.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-card border rounded-md p-2 font-mono text-sm space-y-1">
              {sections.map((s) => (
                <div key={s.id} className="flex justify-between items-center group px-1 py-0.5 rounded hover:bg-muted/50">
                  <span>{s.courseCode}-{s.sectionNumber}</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-opacity"
                    onClick={() => handleRemove(s.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>

            <Button variant="outline" className="w-full h-8 text-xs" onClick={handleCopy}>
              <Copy className="h-3.5 w-3.5 mr-2" /> Copy section codes
            </Button>
            
            <div className="p-3 bg-muted/30 rounded-md border border-border/50 text-xs text-muted-foreground">
              <strong className="text-foreground block mb-1">Registration happens in Workday.</strong>
              CampusVal is for planning only. We do not register you for classes.
            </div>

            <a 
              href={WORKDAY_STUDENT_URL}
              target="_blank" 
              rel="noopener noreferrer"
              className="block"
            >
              <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                Open Workday <ExternalLink className="h-3.5 w-3.5 ml-2" />
              </Button>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
