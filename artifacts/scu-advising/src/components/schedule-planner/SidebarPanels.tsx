import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Filter, Briefcase } from "lucide-react";
import { useScheduleWorkspace } from "./useScheduleWorkspace";
import { QuickAddSearch } from "./QuickAddSearch";
import { AdvancedSearchPanel } from "./AdvancedSearchPanel";
import { CommitmentsPanel } from "./CommitmentsPanel";

export function SidebarPanels({
  workspace,
  initialCourse,
  onInitialCourseConsumed,
}: {
  workspace: ReturnType<typeof useScheduleWorkspace>;
  /** Pre-select a course in Quick Add (from intentions panel) */
  initialCourse?: string | null;
  onInitialCourseConsumed?: () => void;
}) {
  const [activeTab, setActiveTab] = useState("quick-add");

  // When a course is pushed from the intentions panel, switch to the quick-add tab
  useEffect(() => {
    if (initialCourse) {
      setActiveTab("quick-add");
    }
  }, [initialCourse]);

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border shadow-sm overflow-hidden cv-card-hover">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <div className="px-4 pt-4 border-b bg-muted/20">
          <TabsList className="w-full grid grid-cols-3 bg-muted/50 h-10">
            <TabsTrigger value="quick-add" className="text-xs" title="Find Courses">
              <Search className="mr-1.5 h-3.5 w-3.5" />
              Find
            </TabsTrigger>
            <TabsTrigger value="advanced" className="text-xs" title="Advanced Search">
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              Filter
            </TabsTrigger>
            <TabsTrigger value="commitments" className="text-xs" title="My Commitments">
              <Briefcase className="mr-1.5 h-3.5 w-3.5" />
              Other
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <TabsContent value="quick-add" className="m-0 h-full focus-visible:outline-none">
            <QuickAddSearch
              workspace={workspace}
              initialCourse={initialCourse}
              onInitialCourseConsumed={onInitialCourseConsumed}
            />
          </TabsContent>
          <TabsContent value="advanced" className="m-0 h-full focus-visible:outline-none">
            <AdvancedSearchPanel workspace={workspace} />
          </TabsContent>
          <TabsContent value="commitments" className="m-0 h-full focus-visible:outline-none">
            <CommitmentsPanel workspace={workspace} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
