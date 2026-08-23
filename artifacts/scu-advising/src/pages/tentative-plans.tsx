import { AppShell, PageHeader } from "@/components/AppShell";
import { DegreePlanWorkspace } from "@/components/degree-plan/DegreePlanWorkspace";

/**
 * Tentative Degree Plan — the same planning workspace as Degree Plan, but
 * defaulting to draft scenarios. Every tentative plan is a deep, independent
 * server-side copy: editing it never touches the Degree Plan until the
 * student explicitly promotes it, and it never touches the uploaded Workday
 * Academic Progress Report at all.
 */
export default function TentativePlansPage() {
  return (
    <AppShell>
      <PageHeader
        compact
        title="Tentative Degree Plan"
        subtitle="An independent scenario. Use Plan Controls to create, rename, duplicate, or promote one into your Degree Plan."
      />
      <div className="w-full max-w-none flex-1 px-3 py-2 md:px-4 lg:px-6">
        <DegreePlanWorkspace mode="tentative" />
      </div>
    </AppShell>
  );
}
