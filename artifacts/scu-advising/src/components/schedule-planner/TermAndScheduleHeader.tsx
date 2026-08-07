import { useState } from "react";
import {
  Term,
  useCreateSchedule,
  useUpdateSchedule,
  useDeleteSchedule,
  useDuplicateSchedule,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Plus, Copy, Edit2, Trash2, CalendarRange, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { capitalize } from "./utils";
import { useScheduleWorkspace } from "./useScheduleWorkspace";

export function TermAndScheduleHeader({
  workspace,
  allowedTerms,
}: {
  workspace: ReturnType<typeof useScheduleWorkspace>;
  /** If provided, only show terms whose `term` field is in this set. */
  allowedTerms?: Set<string>;
}) {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const createMut = useCreateSchedule();
  const updateMut = useUpdateSchedule();
  const deleteMut = useDeleteSchedule();
  const duplicateMut = useDuplicateSchedule();

  const currentTermAvailability = workspace.availability?.terms.find(
    (t) => t.term === workspace.activeTerm && t.year === workspace.activeYear
  );

  const handleCreate = () => {
    if (!workspace.activeTerm || !workspace.activeYear || !newName) return;
    createMut.mutate(
      {
        data: {
          name: newName,
          term: workspace.activeTerm,
          year: workspace.activeYear,
        },
      },
      {
        onSuccess: (newSched) => {
          workspace.invalidateSchedules();
          workspace.setActiveScheduleId(newSched.id);
          setCreateOpen(false);
          setNewName("");
          toast({ title: "Schedule created" });
        },
        onError: () => toast({ title: "Failed to create schedule", variant: "destructive" }),
      }
    );
  };

  const handleRename = () => {
    if (!workspace.activeScheduleId || !newName) return;
    updateMut.mutate(
      {
        id: workspace.activeScheduleId,
        data: { name: newName },
      },
      {
        onSuccess: () => {
          workspace.invalidateSchedules();
          setRenameOpen(false);
          setNewName("");
        },
        onError: () => toast({ title: "Failed to rename", variant: "destructive" }),
      }
    );
  };

  const handleDuplicate = () => {
    if (!workspace.activeScheduleId) return;
    const currentName = workspace.activeSchedule?.name || "Schedule";
    duplicateMut.mutate(
      {
        id: workspace.activeScheduleId,
        data: { name: `${currentName} (Copy)` },
      },
      {
        onSuccess: (newSched) => {
          workspace.invalidateSchedules();
          workspace.setActiveScheduleId(newSched.id);
          toast({ title: "Schedule duplicated" });
        },
        onError: () => toast({ title: "Failed to duplicate", variant: "destructive" }),
      }
    );
  };

  const handleDelete = () => {
    if (!workspace.activeScheduleId) return;
    if (!confirm("Are you sure you want to delete this schedule?")) return;
    deleteMut.mutate(
      { id: workspace.activeScheduleId },
      {
        onSuccess: () => {
          workspace.invalidateSchedules();
          toast({ title: "Schedule deleted" });
        },
        onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
      }
    );
  };

  if (workspace.isLoadingAvailability) {
    return <div className="h-20 animate-pulse bg-muted rounded-md mb-6" />;
  }

  return (
    <div className="mb-6 space-y-4 min-w-0">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 min-w-0">
        <div className="min-w-0">
          <h1 className="font-serif text-3xl font-bold mb-2 flex items-center gap-3">
            <CalendarRange className="h-7 w-7 text-primary shrink-0" />
            Schedule Planner
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl">
            {workspace.availability?.note || "Select a quarter to plan your schedule."}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Quarter
            </label>
            <Select
              value={
                workspace.activeTerm
                  ? `${workspace.activeTerm}|${workspace.activeYear}`
                  : ""
              }
              onValueChange={(val) => {
                const [t, y] = val.split("|");
                workspace.setActiveTerm(t as Term);
                workspace.setActiveYear(Number(y));
              }}
            >
              <SelectTrigger className="w-[180px] bg-card">
                <SelectValue placeholder="Select term" />
              </SelectTrigger>
              <SelectContent>
                {workspace.availability?.terms
                  .filter((t) => !allowedTerms || allowedTerms.has(t.term))
                  .map((t) => (
                    <SelectItem key={`${t.term}|${t.year}`} value={`${t.term}|${t.year}`}>
                      {capitalize(t.term)} {t.year}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Schedule
            </label>
            <div className="flex items-center gap-2">
              <Select
                value={workspace.activeScheduleId?.toString() || ""}
                onValueChange={(val) => workspace.setActiveScheduleId(Number(val))}
                disabled={workspace.schedules.length === 0}
              >
                <SelectTrigger className="w-[200px] bg-card">
                  <SelectValue placeholder="No schedules" />
                </SelectTrigger>
                <SelectContent>
                  {workspace.schedules.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setNewName("");
                  setCreateOpen(true);
                }}
                title="New schedule"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border pb-4">
        <div className="flex items-center gap-3 text-sm min-w-0">
          {currentTermAvailability && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border">
              {currentTermAvailability.status === "published" ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Official schedule published</span>
                </>
              ) : (
                <>
                  <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                  <span className="text-amber-700 font-medium">Tentative schedule (Instructors TBA)</span>
                </>
              )}
            </div>
          )}
        </div>
        {workspace.activeScheduleId && (
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setNewName(workspace.activeSchedule?.name || "");
                setRenameOpen(true);
              }}
            >
              <Edit2 className="h-3 w-3 mr-1.5" /> Rename
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDuplicate}>
              <Copy className="h-3 w-3 mr-1.5" /> Duplicate
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDelete}>
              <Trash2 className="h-3 w-3 mr-1.5" /> Delete
            </Button>
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Create New Schedule</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="e.g. Plan A, Bio major path..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newName || createMut.isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Rename Schedule</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!newName || updateMut.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
