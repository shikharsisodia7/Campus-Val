import { useState } from "react";
import { useAddScheduleEvent, useDeleteScheduleEvent } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Trash2, Plus, Clock, MapPin } from "lucide-react";
import { useScheduleWorkspace } from "./useScheduleWorkspace";
import { DAYS, capitalize, format12 } from "./utils";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = [
  "work",
  "athletics",
  "student_org",
  "special_program",
  "external_course",
  "personal",
  "other",
];

export function CommitmentsPanel({ workspace }: { workspace: ReturnType<typeof useScheduleWorkspace> }) {
  const { toast } = useToast();
  const addMut = useAddScheduleEvent();
  const delMut = useDeleteScheduleEvent();

  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("work");
  const [days, setDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [institution, setInstitution] = useState("");
  const [externalCourseLabel, setExternalCourseLabel] = useState("");

  const commitments = workspace.activeSchedule?.events.filter((e) => e.kind === "commitment") || [];

  const handleAdd = () => {
    if (!workspace.activeScheduleId || !name || days.length === 0 || !startTime || !endTime) {
      toast({ title: "Please fill out name, days, and times", variant: "destructive" });
      return;
    }

    addMut.mutate(
      {
        id: workspace.activeScheduleId,
        data: {
          kind: "commitment",
          name,
          category: category as any,
          meetingDays: days as any,
          startTime,
          endTime,
          location,
          institution: category === "external_course" ? institution : undefined,
          externalCourseLabel: category === "external_course" ? externalCourseLabel : undefined,
        },
      },
      {
        onSuccess: () => {
          workspace.invalidateSchedules();
          setIsAdding(false);
          setName("");
          setDays([]);
          setStartTime("");
          setEndTime("");
          setLocation("");
          setInstitution("");
          setExternalCourseLabel("");
          toast({ title: "Commitment added" });
        },
        onError: () => toast({ title: "Failed to add commitment", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (eventId: number) => {
    if (!workspace.activeScheduleId) return;
    delMut.mutate(
      { id: workspace.activeScheduleId, eventId },
      {
        onSuccess: () => {
          workspace.invalidateSchedules();
          toast({ title: "Commitment removed" });
        },
        onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
      }
    );
  };

  const toggleDay = (d: string) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" />
          My Commitments
        </h3>
        {!isAdding && (
          <Button variant="outline" size="sm" onClick={() => setIsAdding(true)} className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" /> Add New
          </Button>
        )}
      </div>

      {isAdding ? (
        <div className="flex-1 overflow-y-auto space-y-4 border rounded-md p-4 bg-muted/10">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Campus Job" className="h-8 text-xs" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-8 text-xs bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">
                    {c.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {category === "external_course" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Institution</Label>
                <Input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. Diablo Valley College" className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Course Label</Label>
                <Input value={externalCourseLabel} onChange={(e) => setExternalCourseLabel(e.target.value)} placeholder="e.g. PHYS 120" className="h-8 text-xs" />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Meeting Days</Label>
            <div className="flex flex-wrap gap-1">
              {DAYS.map((d) => (
                <Badge
                  key={d.key}
                  variant={days.includes(d.key) ? "default" : "outline"}
                  className="cursor-pointer px-2 py-0.5 text-[10px]"
                  onClick={() => toggleDay(d.key)}
                >
                  {d.label}
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Start Time</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End Time</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Location (Optional)</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Library" className="h-8 text-xs" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsAdding(false)} className="h-8 text-xs">
              Cancel
            </Button>
            <Button onClick={handleAdd} size="sm" className="h-8 text-xs" disabled={addMut.isPending}>
              Save Commitment
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2">
          {commitments.length === 0 ? (
            <div className="text-center p-4 text-sm text-muted-foreground bg-muted/30 rounded-md">
              No personal commitments added.
            </div>
          ) : (
            commitments.map((c) => (
              <div key={c.id} className="border rounded-md p-3 bg-card flex justify-between items-start">
                <div className="min-w-0 flex-1 pr-2">
                  <div className="font-bold text-sm text-foreground truncate">{c.name}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                    {c.category?.replace("_", " ")}
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span>{c.meetingDays.join("")} • {format12(c.startTime)} - {format12(c.endTime)}</span>
                    </div>
                    {c.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{c.location}</span>
                      </div>
                    )}
                    {c.category === "external_course" && (
                      <div className="mt-1 text-[10px] italic bg-muted/50 p-1 rounded inline-block">
                        {c.institution} {c.externalCourseLabel && `— ${c.externalCourseLabel}`}
                      </div>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0 text-destructive/70 hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(c.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
