import { AppShell, PageHeader } from "@/components/AppShell";
import { DegreePlanWorkspace } from "@/components/degree-plan/DegreePlanWorkspace";

export default function DegreePlanPage() {
  return (
    <AppShell>
      {/* Compact by design: the board and the Workday report need the height. */}
      <PageHeader
        compact
        title="Degree Plan"
        subtitle="Select courses and requirements and add them to a term, then drag to move them as your plan changes. Pick exact sections later in Quarter Plan."
      />
      <div className="w-full max-w-none flex-1 px-3 py-2 md:px-4 lg:px-6">
        <DegreePlanWorkspace />
      </div>
    </AppShell>
  );
}
