import { AppShell, PageHeader } from "@/components/AppShell";
import { DegreePlanWorkspace } from "@/components/degree-plan/DegreePlanWorkspace";
import { FlaskConical } from "lucide-react";

/**
 * Tentative Degree Plans — the same planning workspace as Degree Plan, but
 * defaulting to draft plans. Every tentative plan is a deep, independent
 * server-side copy: editing it never touches the official Degree Plan until
 * the student explicitly promotes it.
 */
export default function TentativePlansPage() {
  return (
    <AppShell>
      <PageHeader
        title="Tentative Plans"
        subtitle="Safe scenarios, independent from your current plan. Explore adding a second major, different sequencing, or a study-abroad term. Promoting one replaces your official plan after confirmation."
      />
      <div className="flex-1 w-full max-w-none px-4 py-4 md:px-6 lg:px-8">
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <FlaskConical className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Use the Context panel to create, rename, duplicate, delete, or switch between drafts,
            and to promote one to your official Degree Plan (your current plan is kept as a backup).
          </span>
        </div>
        <DegreePlanWorkspace mode="tentative" />
      </div>
    </AppShell>
  );
}
