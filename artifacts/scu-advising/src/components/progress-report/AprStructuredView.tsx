import { useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { ParsedProgressReport } from "@workspace/api-client-react";
import { RequirementGroupList, RequirementStatusBadge } from "./RequirementGroupList";
import {
  courseLists,
  regroupForDisplay,
  reviewSummary,
  tallyGroups,
  universityRows,
  type StatusFilter,
} from "./apr-model";

/**
 * The structured, verifiable text representation of the student's Workday
 * APR — one component for BOTH the planning sidebar and the APR page, so the
 * two can never drift.
 *
 * Reads left-to-right as an answer to two questions:
 *   "What have I completed?"  /  "What do I still need?"
 * in Workday's own wording. It re-presents the parser's status per row and
 * routes anything unclear to a visible "verify in Workday" item; it never
 * turns ambiguous output into a completed requirement.
 *
 * Grades are never rendered here unless `showGrades` is set (APR page only,
 * behind an explicit toggle).
 */
export function AprStructuredView({
  parsed,
  variant,
  showGrades = false,
}: {
  parsed: ParsedProgressReport;
  /** "sidebar": compact, opens only what is still needed. "page": everything open, review lines shown. */
  variant: "sidebar" | "page";
  showGrades?: boolean;
}) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  // Core rows sit inside program blocks (repeated by blocks in the same school); show each once.
  const groups = regroupForDisplay(parsed.groups ?? []);
  const tally = tallyGroups(groups);
  const review = reviewSummary(parsed);
  const uni = universityRows(groups);
  const summary = parsed.summary;
  const lists = courseLists(parsed);
  const isPage = variant === "page";

  return (
    <div className="space-y-3" data-testid="apr-structured-view" data-variant={variant}>
      {/* Tally: text + icon for every count; color is only ever additive. */}
      {groups.length > 0 && (
        <div className="space-y-2" data-testid="apr-tally">
          <dl className="grid grid-cols-4 gap-1 text-[10px]">
            {[
              ["Completed", tally.completed, "completed"],
              ["In progress", tally.in_progress, "in_progress"],
              ["Remaining", tally.remaining, "remaining"],
              ["Verify in Workday", tally.needs_review, "needs_review"],
            ].map(([label, n, key]) => (
              <div
                key={key as string}
                className="flex flex-col-reverse items-center justify-end gap-0.5 rounded-md border border-border/70 bg-muted/20 px-1 py-1 text-center leading-tight"
                data-testid={`apr-tally-${key}`}
              >
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-mono text-sm font-semibold text-foreground">{n as number}</dd>
              </div>
            ))}
          </dl>

          <div role="group" aria-label="Which requirements to show" className="inline-flex rounded-md border border-border p-0.5 text-[11px]">
            {(
              [
                ["all", "All"],
                ["needed", "Still needed"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                data-testid={`apr-filter-${value}`}
                className={`rounded px-2.5 py-1 font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${
                  filter === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Requirements as Workday groups them: Core → Major → Minor → Other. */}
      {groups.length > 0 ? (
        <div data-testid="apr-requirement-groups">
          <RequirementGroupList
            groups={groups}
            defaultOpen={isPage ? "all" : "needed"}
            showGrades={showGrades}
            groupBySection
            hideUniversityRows
            statusFilter={filter}
            showSourceText={isPage}
          />
          {filter === "needed" && tally.total > 0 && tally.completed === tally.total && (
            <p className="text-xs text-muted-foreground" data-testid="apr-nothing-needed">
              Every requirement listed here shows as completed in your report. Confirm in Workday.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground" data-testid="apr-no-groups">
          Your report was read, but its requirement sections could not be recognized. The completed
          courses below are still listed; use the original file as the source of truth.
        </p>
      )}

      {/* University-wide rows, once. */}
      {uni.length > 0 && (
        <section aria-labelledby="apr-university-heading" data-testid="apr-university-requirements">
          <h3
            id="apr-university-heading"
            className="mb-1 border-b border-border/70 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Other university requirements
          </h3>
          <ul className="space-y-2">
            {uni
              .filter((r) => filter === "all" || r.status !== "completed")
              .map((r, i) => (
                <li key={i} className="flex items-start justify-between gap-2">
                  <span className="text-xs text-foreground/90">
                    {r.name.replace(/^University\s+Requirement:\s*/i, "")}
                  </span>
                  <RequirementStatusBadge status={r.status} />
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* Units — only what the report itself states. */}
      <section aria-labelledby="apr-units-heading" data-testid="apr-units">
        <h3
          id="apr-units-heading"
          className="mb-1 border-b border-border/70 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Units
        </h3>
        {summary?.totalUnits || summary?.upperDivisionUnits || summary?.creditsEarned != null ? (
          <ul className="space-y-2">
            {summary.totalUnits && (
              <UnitLine label="Total units" unit={summary.totalUnits} testId="apr-units-total" />
            )}
            {summary.upperDivisionUnits && (
              <UnitLine
                label="Upper-division units"
                unit={summary.upperDivisionUnits}
                testId="apr-units-upper"
              />
            )}
            {summary.creditsEarned != null && (
              <li className="text-xs text-foreground/90" data-testid="apr-units-earned">
                Cumulative credits earned (as printed):{" "}
                <span className="font-mono font-semibold">{summary.creditsEarned}</span>
              </li>
            )}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="apr-units-none">
            This report doesn't list a total-units or upper-division-units requirement. Check
            Workday for unit progress.
          </p>
        )}
      </section>

      {/* Course lists — codes and titles only. */}
      {(lists.completed.length > 0 || lists.inProgress.length > 0) && (
        <details
          className="group rounded-md border border-border/70"
          open={isPage}
          data-testid="apr-course-lists"
        >
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" aria-hidden="true" />
            Courses listed on your report ({lists.completed.length + lists.inProgress.length})
          </summary>
          <div className="space-y-2 border-t border-border/70 px-2.5 py-2 text-[11px]">
            <CourseList title="Completed" courses={lists.completed} testId="apr-completed-courses" />
            <CourseList title="In progress" courses={lists.inProgress} testId="apr-inprogress-courses" />
          </div>
        </details>
      )}

      {/* Anything unclear is surfaced, never guessed. */}
      {review.count > 0 && (
        <section
          className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900"
          aria-labelledby="apr-review-heading"
          data-testid="apr-review"
        >
          <h3 id="apr-review-heading" className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {review.count} item{review.count === 1 ? "" : "s"} to verify in Workday
          </h3>
          <p className="mt-1 text-amber-900/90">
            CampusVal couldn't confidently classify these, so it is not treating them as completed
            or remaining.
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            {review.items.map((it, i) => (
              <li key={i}>
                {it.name}
                {isPage && it.sourceText && (
                  <span className="block font-mono text-[10px] text-amber-800">As printed: {it.sourceText}</span>
                )}
              </li>
            ))}
            {review.unrecognized.map((raw, i) => (
              <li key={`u-${i}`} className="font-mono">
                {raw} <span className="font-sans italic">(not in the CampusVal catalog)</span>
              </li>
            ))}
          </ul>
          {!isPage && (
            <Link href="/progress-report" className="mt-1.5 inline-block font-medium underline">
              Review on the APR page
            </Link>
          )}
        </section>
      )}
    </div>
  );
}

function UnitLine({
  label,
  unit,
  testId,
}: {
  label: string;
  unit: NonNullable<NonNullable<ParsedProgressReport["summary"]>["totalUnits"]>;
  testId: string;
}) {
  return (
    <li className="space-y-0.5" data-testid={testId}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-foreground/90">
          {label}
          {unit.requiredUnits != null && (
            <span className="text-muted-foreground"> — Workday requires {unit.requiredUnits}</span>
          )}
        </span>
        <RequirementStatusBadge status={unit.status} />
      </div>
      {unit.detail && (
        <p className="text-[11px] text-muted-foreground">
          Remaining, as Workday prints it: <span className="font-medium text-foreground">{unit.detail}</span>
        </p>
      )}
    </li>
  );
}

function CourseList({
  title,
  courses,
  testId,
}: {
  title: string;
  courses: { code: string; title: string }[];
  testId: string;
}) {
  if (courses.length === 0) return null;
  return (
    <div data-testid={testId}>
      <div className="mb-0.5 font-semibold text-foreground">
        {title} ({courses.length})
      </div>
      <ul className="space-y-0.5 text-muted-foreground">
        {courses.map((c) => (
          <li key={c.code}>
            <span className="font-mono font-semibold text-foreground">{c.code}</span> {c.title}
          </li>
        ))}
      </ul>
    </div>
  );
}
