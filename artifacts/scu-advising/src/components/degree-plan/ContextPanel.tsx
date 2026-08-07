import { useState } from "react";
import { useDegreePlanContext } from "./DegreePlanContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  useCreatePlan, 
  useDuplicatePlan, 
  useDeletePlan, 
  usePromotePlan,
  useUpdatePlan,
  getExportPlanQueryKey,
  AcademicPlan
} from "@workspace/api-client-react";
import { Copy, Download, Trash2, Rocket, Plus, Settings2, ShieldCheck, AlertTriangle, Edit2, Files } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function ContextPanel({ plans }: { plans: AcademicPlan[] }) {
  const { activePlan, activePlanId, setActivePlanId, profile } = useDegreePlanContext();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const createPlan = useCreatePlan();
  const duplicatePlan = useDuplicatePlan();
  const deletePlan = useDeletePlan();
  const promotePlan = usePromotePlan();
  const updatePlan = useUpdatePlan();

  const [createOpen, setCreateOpen] = useState(false);
  const [newPlanName, setNewPlanName] = useState("My Tentative Plan");
  const [createMode, setCreateMode] = useState("copy"); // copy | blank
  
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const degreePlan = plans.find(p => p.planType === 'degree');
  const tentativePlans = plans.filter(p => p.planType === 'tentative');

  const handleCreate = () => {
    createPlan.mutate({
      data: {
        name: newPlanName,
        copyFromPlanId: createMode === 'copy' ? degreePlan?.id : null
      }
    }, {
      onSuccess: (newPlan) => {
        setCreateOpen(false);
        setActivePlanId(newPlan.id);
        queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/api/plans') });
      }
    });
  };

  const handleDelete = () => {
    if (!activePlanId || activePlan?.planType === 'degree') return;
    if (confirm("Are you sure you want to delete this tentative plan?")) {
      deletePlan.mutate({ id: activePlanId }, {
        onSuccess: () => {
          setActivePlanId(degreePlan?.id || null);
          queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/api/plans') });
        }
      });
    }
  };

  const handlePromote = () => {
    if (!activePlanId || activePlan?.planType === 'degree') return;
    if (confirm("Make this your official Degree Plan? Your current Degree Plan will be saved as a tentative backup.")) {
      promotePlan.mutate({ id: activePlanId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/api/plans') });
        }
      });
    }
  };

  const handleDuplicate = () => {
    if (!activePlanId || !activePlan) return;
    duplicatePlan.mutate({
      id: activePlanId,
      data: { name: `${activePlan.name} (Copy)` }
    }, {
      onSuccess: (newPlan) => {
        setActivePlanId(newPlan.id);
        queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/api/plans') });
      }
    });
  };

  const handleRename = () => {
    if (!activePlanId || activePlan?.planType === 'degree') return;
    updatePlan.mutate({
      id: activePlanId,
      data: { name: renameValue }
    }, {
      onSuccess: () => {
        setRenameOpen(false);
        queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/api/plans') });
      }
    });
  };

  const handleCopySummary = () => {
    if (!activePlan) return;
    let text = `${activePlan.name} Summary\n`;
    text += `Total items: ${activePlan.items.length}\n\n`;
    const byYearTerm = activePlan.items.reduce((acc, item) => {
      const key = `${item.academicYear} ${item.term}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {} as Record<string, typeof activePlan.items>);

    for (const [term, items] of Object.entries(byYearTerm)) {
      text += `--- ${term} ---\n`;
      items.forEach(i => {
        text += `- ${i.courseCode || i.requirementLabel}\n`;
      });
      text += "\n";
    }
    
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Summary copied to clipboard",
    });
  };

  if (!activePlan) return null;

  const exportUrl = `${import.meta.env.BASE_URL}api/plans/${activePlan.id}/export`;

  return (
    <Card className="h-full flex flex-col border-border/60 shadow-sm bg-card overflow-hidden">
      <div className="p-4 border-b border-border/60">
        <h2 className="font-serif text-lg font-bold">Context</h2>
        <p className="text-xs text-muted-foreground mt-1">Plan details & sharing</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Select Plan</Label>
            <div className="space-y-1">
              {degreePlan && (
                <Button 
                  variant={activePlanId === degreePlan.id ? "default" : "outline"} 
                  className={`w-full justify-start ${activePlanId === degreePlan.id ? 'bg-primary hover:bg-primary/90' : ''}`}
                  onClick={() => setActivePlanId(degreePlan.id)}
                >
                  <ShieldCheck className="h-4 w-4 mr-2" /> Official Degree Plan
                </Button>
              )}
              {tentativePlans.map(tp => (
                <Button 
                  key={tp.id}
                  variant={activePlanId === tp.id ? "default" : "outline"} 
                  className="w-full justify-start font-normal"
                  onClick={() => setActivePlanId(tp.id)}
                >
                  {tp.name}
                </Button>
              ))}
              <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> New tentative plan
              </Button>
            </div>
          </div>

          {activePlan.planType === 'tentative' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
              <div className="flex items-center gap-2 text-amber-800 font-medium text-sm mb-2">
                <AlertTriangle className="h-4 w-4" />
                TENTATIVE PLAN
              </div>
              <div className="text-xs text-amber-700/80 mb-3">
                This is a draft. Promote it when you are ready to make it your official plan.
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="h-8 text-xs border-amber-300 text-amber-800 hover:bg-amber-100" onClick={handlePromote}>
                  <Rocket className="h-3 w-3 mr-1" /> Use as Official
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs border-red-200 text-red-700 hover:bg-red-50" onClick={handleDelete}>
                  <Trash2 className="h-3 w-3 mr-1" /> Delete
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Button variant="outline" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => { setRenameValue(activePlan.name); setRenameOpen(true); }}>
                  <Edit2 className="h-3 w-3 mr-1" /> Rename
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs text-muted-foreground" onClick={handleDuplicate}>
                  <Files className="h-3 w-3 mr-1" /> Duplicate
                </Button>
              </div>
            </div>
          )}

          {activePlan.planType === 'degree' && (
            <div className="p-3 bg-muted/30 border border-border rounded-md mt-4">
              <Button variant="outline" size="sm" className="w-full h-8 text-xs text-muted-foreground" onClick={handleDuplicate}>
                <Files className="h-3 w-3 mr-1" /> Duplicate to Tentative Plan
              </Button>
            </div>
          )}

          <div className="space-y-3 pt-4 border-t border-border/60">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Share & Export</Label>
            <div className="grid gap-2">
              <Button variant="outline" className="w-full justify-start" asChild>
                <a href={exportUrl} download>
                  <Download className="h-4 w-4 mr-2" /> Download Excel (.xlsx)
                </a>
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={handleCopySummary}>
                <Copy className="h-4 w-4 mr-2" /> Copy text summary
              </Button>
            </div>
            <div className="text-xs text-muted-foreground pt-1">
              Share the Excel file with your advisor before your meeting.
            </div>
          </div>

        </div>
      </ScrollArea>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>New Tentative Plan</DialogTitle>
            <DialogDescription>Create a sandbox plan to explore options.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Plan Name</Label>
              <Input value={newPlanName} onChange={e => setNewPlanName(e.target.value)} />
            </div>
            <RadioGroup value={createMode} onValueChange={setCreateMode}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="copy" id="r1" />
                <Label htmlFor="r1">Copy current Degree Plan</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="blank" id="r2" />
                <Label htmlFor="r2">Start blank</Label>
              </div>
            </RadioGroup>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newPlanName || createPlan.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Rename Plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Plan Name</Label>
              <Input value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRename()} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={handleRename} disabled={!renameValue || updatePlan.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
