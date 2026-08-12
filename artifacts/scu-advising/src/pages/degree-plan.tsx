import { AppShell, PageContent, PageHeader } from "@/components/AppShell";
import { DegreePlanWorkspace } from "@/components/degree-plan/DegreePlanWorkspace";

export default function DegreePlanPage() {
  return (
    <AppShell>
      <PageHeader
        title="Degree Plan"
        subtitle="Build your academic plan quarter by quarter. This workspace lets you drag courses and requirement placeholders into terms."
      />
      <div className="w-full max-w-none flex-1 px-3 py-3 md:px-4 lg:px-6">
        <DegreePlanWorkspace />
      </div>
    </AppShell>
  );
}
