import { useState } from "react";
import { PlanItem } from "@workspace/api-client-react";
import { ShieldCheck, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { courseOffering, isOfferingWarning } from "@/lib/course-offering";
import { calendarYearFor } from "@/lib/academic-year";
import { OFFICIAL_RESOURCES } from "@/data/advising-resources";
import { SCU_BULLETIN_URL } from "@/data/advising-resources";
import type { ScheduleAvailability } from "@workspace/api-client-react";

const GUIDANCE_STEPS = [
  "Build your academic plan.",
  "Check course prerequisites.",
  "Verify published/tentative course offerings.",
  "Compare against your Workday Academic Progress Report.",
  "Review important decisions with an advisor.",
];

/** Direct, official verification links — never third-party. */
function VerificationLinks() {
  const workday = OFFICIAL_RESOURCES.find((r) => r.id === "workday");
  const registrar = OFFICIAL_RESOURCES.find((r) => r.id === "registrar");
  const links: { label: string; url: string }[] = [
    { label: "Published/current schedule (Workday)", url: workday?.url ?? "https://www.myworkday.com/scu/" },
    { label: "Registrar tentative schedule & calendar", url: registrar?.url ?? "https://www.scu.edu/registrar/" },
    { label: "SCU Bulletin / Course Catalog", url: SCU_BULLETIN_URL },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2" data-testid="plan-verification-links">
      {links.map((l) => (
        <a
          key={l.url}
          href={l.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
        >
          {l.label}
          <ExternalLink className="h-3 w-3" />
        </a>
      ))}
    </div>
  );
}

/**
 * Manual verification backup for the automated offering resolver, requested
 * explicitly because automated checks alone can create false confidence:
 * "CampusVal did not warn me, therefore everything is definitely valid."
 * Also carries the required top-level disclaimer (planning workspace, not
 * official, CampusVal doesn't register students) and a below-the-fold
 * warning count with a jump-to-first-warning action.
 */
export function PlanGuidanceBanner({
  plannedItems,
  scheduleAvailability,
}: {
  plannedItems: PlanItem[];
  scheduleAvailability: ScheduleAvailability | undefined;
}) {
  const [expanded, setExpanded] = useState(false);

  const warningCount = plannedItems.filter((item) => {
    if (
      item.itemType !== "course" ||
      !item.courseCode ||
      !item.term ||
      item.term === "completed" ||
      item.academicYear == null
    ) {
      return false;
    }
    const calendarYear = calendarYearFor(item.term, item.academicYear);
    const offering = courseOffering(item.courseCode, item.term, calendarYear, scheduleAvailability);
    return isOfferingWarning(offering);
  }).length;

  const jumpToFirstWarning = () => {
    const el = document.querySelector('[data-testid^="not-offered-note-"]');
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div
      className="rounded-md border border-blue-200 bg-blue-50 text-blue-900"
      data-testid="plan-guidance-banner"
    >
      <div className="flex items-start gap-2 px-3 py-2">
        <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs leading-snug">
            <strong>Degree Plan is a planning workspace, not an official degree audit.</strong>{" "}
            Workday and the Registrar remain SCU's official sources — you're responsible for
            verifying degree requirements, and CampusVal does not register you for courses.
          </p>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
            data-testid="plan-guidance-toggle"
          >
            {expanded ? "Hide" : "How to verify your plan"}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {expanded && (
            <div className="mt-2 space-y-2" data-testid="plan-guidance-details">
              <ol className="list-decimal pl-4 space-y-0.5 text-xs">
                {GUIDANCE_STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <VerificationLinks />
            </div>
          )}

          {warningCount > 0 && (
            <button
              type="button"
              onClick={jumpToFirstWarning}
              className="mt-2 inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 border border-amber-300"
              data-testid="plan-warning-summary"
            >
              {warningCount} planning item{warningCount === 1 ? "" : "s"} need review — jump to first
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
