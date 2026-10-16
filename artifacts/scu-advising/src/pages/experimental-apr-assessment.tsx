import { AppShell, PageHeader } from "@/components/AppShell";
import { PlanningComparisonWorkspace } from "@/components/degree-plan/PlanningComparisonWorkspace";
import { Card } from "@/components/ui/card";
import { FlaskConical } from "lucide-react";
import { FullAprWorkspace } from "./progress-report";

/**
 * Intentionally separate from the normal APR route. App.tsx requires both the
 * admin capability and ENABLE_DEGREE_COMPLETION_RND before this page renders;
 * the API independently applies the same protection.
 */
export default function ExperimentalAprAssessmentPage() {
  return (
    <AppShell>
      <PageHeader
        compact
        title="APR + Degree Completion Assessment — Experimental"
        subtitle="Internal R&D only. Workday remains the definitive reference; ambiguous APR terminology stays unresolved until Registrar guidance is verified."
      />
      <div className="mx-auto max-w-[1600px] space-y-3 px-4 py-3 sm:px-6 lg:px-8">
        <Card className="border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-testid="experimental-assessment-notice">
          <div className="flex items-start gap-2">
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              <strong>Experimental:</strong> this derived planning view is available only for authorized testing. It is not an
              official degree audit or graduation certification, and it must not be used to make academic decisions without
              confirming the original Workday APR and an advisor.
            </p>
          </div>
        </Card>
        <PlanningComparisonWorkspace
          main={<FullAprWorkspace showExperimentalAssessment />}
          mainLabel="Experimental APR Assessment"
          showCompactApr={false}
        />
      </div>
    </AppShell>
  );
}
