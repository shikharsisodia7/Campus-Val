import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Filter, Briefcase, FileText } from "lucide-react";
import { useScheduleWorkspace } from "./useScheduleWorkspace";
import { QuickAddSearch } from "./QuickAddSearch";
import { AdvancedSearchPanel } from "./AdvancedSearchPanel";
import { RegistrationSummary } from "./RegistrationSummary";
import { CommitmentsPanel } from "./CommitmentsPanel";

export function SidebarPanels({ workspace }: { workspace: ReturnType<typeof useScheduleWorkspace> }) {
  const [activeTab, setActiveTab] = useState("quick-add");

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border shadow-sm overflow-hidden cv-card-hover">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <div className="px-4 pt-4 border-b bg-muted/20">
          <TabsList className="w-full grid grid-cols-4 bg-muted/50 h-10">
            <TabsTrigger value="quick-add" className="text-xs" title="Quick Add">
              <Search className="h-3.5 w-3.5" />
            </TabsTrigger>
            <TabsTrigger value="advanced" className="text-xs" title="Advanced Search">
              <Filter className="h-3.5 w-3.5" />
            </TabsTrigger>
            <TabsTrigger value="commitments" className="text-xs" title="My Commitments">
              <Briefcase className="h-3.5 w-3.5" />
            </TabsTrigger>
            <TabsTrigger value="summary" className="text-xs" title="Registration Summary">
              <FileText className="h-3.5 w-3.5" />
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <TabsContent value="quick-add" className="m-0 h-full focus-visible:outline-none">
            <QuickAddSearch workspace={workspace} />
          </TabsContent>
          <TabsContent value="advanced" className="m-0 h-full focus-visible:outline-none">
            <AdvancedSearchPanel workspace={workspace} />
          </TabsContent>
          <TabsContent value="commitments" className="m-0 h-full focus-visible:outline-none">
            <CommitmentsPanel workspace={workspace} />
          </TabsContent>
          <TabsContent value="summary" className="m-0 h-full focus-visible:outline-none">
            <RegistrationSummary workspace={workspace} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
