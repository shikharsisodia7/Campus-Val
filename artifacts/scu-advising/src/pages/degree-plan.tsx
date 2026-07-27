import { AppShell, PageContent, PageHeader } from "@/components/AppShell";
import { DegreePlanWorkspace } from "@/components/degree-plan/DegreePlanWorkspace";

export default function DegreePlanPage() {
  return (
    <AppShell>
      <PageHeader 
        title="Degree Plan" 
        subtitle="Build your academic plan quarter by quarter. This workspace lets you drag courses and requirement placeholders into terms." 
      />
      <div className="flex-1 w-full max-w-none px-4 py-4 md:px-6 lg:px-8">
        <DegreePlanWorkspace />
      </div>
    </AppShell>
  );
}
