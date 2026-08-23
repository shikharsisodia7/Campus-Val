import { useMemo, useState } from "react";
import {
  AcademicPlanDetail,
  Term,
  ScheduleAvailability,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import { CalendarDays, Pencil } from "lucide-react";
import { capitalize } from "./utils";

const QUARTER_TERMS: Term[] = [
  "fall" as Term,
  "winter" as Term,
  "spring" as Term,
];

/** { fall: anchor, winter: anchor+1, spring: anchor+1 } — the repo's real
 * academic-year convention (confirmed against OFFERED_TERMS: Fall 2026,
 * Winter 2027, Spring 2027 all belong to the "2026-27" academic year). */
export function quarterYearFor(term: Term, anchor: number): number {
  return term === "fall" ? anchor : anchor + 1;
}

function academicYearAnchors(
  availability: ScheduleAvailability | undefined,
): number[] {
  const anchors = new Set<number>();
  for (const t of availability?.terms ?? []) {
    anchors.add(t.term === "fall" ? t.year : t.year - 1);
  }
  return Array.from(anchors).sort((a, b) => a - b);
}

/**
 * Compact Fall/Winter/Spring focus strip for Quarter Plan.
 *
 * Two professor corrections shape this component:
 *
 *  1. It must be SMALL. The valuable space belongs to Find Courses, the
 *     weekly calendar and the Academic Progress Report, so this is a single
 *     thin row of quarter buttons with a text-only course list, not a set of
 *     large interactive tiles.
 *
 *  2. The Degree Plan carryover shown here is READ-ONLY. A student who wants
 *     to take a course in a different quarter edits the Degree Plan, so that
 *     the long-term plan stays accurate — Quarter Plan no longer offers
 *     move-to-another-quarter controls. "Edit Degree Plan" takes them there.
 */
export function AcademicYearOverview({
  activePlan,
  focusedTerm,
  focusedYear,
  onFocusQuarter,
  availability,
}: {
  activePlan: AcademicPlanDetail | undefined;
  focusedTerm: Term | null;
  focusedYear: number | null;
  onFocusQuarter: (term: Term, year: number) => void;
  availability: ScheduleAvailability | undefined;
}) {
  const anchors = useMemo(
    () => academicYearAnchors(availability),
    [availability],
  );
  const [anchorOverride, setAnchorOverride] = useState<number | null>(null);

  const focusedAnchor =
    focusedTerm && focusedYear !== null
      ? focusedTerm === "fall"
        ? focusedYear
        : focusedYear - 1
      : null;
  const anchor =
    anchorOverride ?? focusedAnchor ?? anchors[0] ?? new Date().getFullYear();

  if (anchors.length === 0) return null;

  const quarters = QUARTER_TERMS.map((term) => ({
    term,
    year: quarterYearFor(term, anchor),
  }));

  // Plan items are stored under the academic-year ANCHOR, so every term of
  // this academic year is matched against `anchor` — not against the term's
  // calendar year. Looking these up by calendar year is what made Winter and
  // Spring show the NEXT year's courses.
  const itemsFor = (term: Term) =>
    (activePlan?.items ?? []).filter(
      (i) =>
        i.term === term &&
        i.academicYear === anchor &&
        (i.bucket ?? "planned") !== "completed",
    );

  return (
    <Card className="p-2.5" data-testid="academic-year-overview">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
        <Select
          value={String(anchor)}
          onValueChange={(v) => setAnchorOverride(Number(v))}
        >
          <SelectTrigger
            className="h-7 w-[116px] bg-card text-xs"
            data-testid="select-academic-year"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anchors.map((a) => (
              <SelectItem key={a} value={String(a)}>
                {a}–{String(a + 1).slice(-2)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex flex-wrap items-center gap-1.5">
          {quarters.map(({ term, year }) => {
            const isFocused = focusedTerm === term && focusedYear === year;
            const count = itemsFor(term).length;
            return (
              <Button
                key={`${term}-${year}`}
                variant={isFocused ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => onFocusQuarter(term, year)}
                data-testid={`focus-quarter-${term}`}
                aria-pressed={isFocused}
              >
                {capitalize(term)} {year}
                {count > 0 && (
                  <span className="ml-1.5 opacity-70">({count})</span>
                )}
              </Button>
            );
          })}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 text-xs text-muted-foreground"
          asChild
          data-testid="link-edit-degree-plan"
        >
          <Link href="/degree-plan">
            <Pencil className="mr-1 h-3 w-3" />
            Edit Degree Plan
          </Link>
        </Button>
      </div>

      {/* Read-only reminder of what the Degree Plan says for each quarter. */}
      <div
        className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 border-t border-border/60 pt-2 text-[11px] sm:grid-cols-3"
        data-testid="degree-plan-carryover"
      >
        {quarters.map(({ term, year }) => {
          const items = itemsFor(term);
          const courses = items.filter((i) => i.itemType === "course");
          const placeholders = items.filter(
            (i) => i.itemType === "requirement_placeholder",
          );
          return (
            <div key={`${term}-${year}`} data-testid={`carryover-${term}`}>
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                {capitalize(term)} {year}
              </span>{" "}
              {items.length === 0 ? (
                <span className="italic text-muted-foreground">
                  nothing planned
                </span>
              ) : (
                <span className="text-foreground/90">
                  {courses.map((c) => c.courseCode).join(", ")}
                  {placeholders.length > 0 && (
                    <span className="text-muted-foreground">
                      {courses.length > 0 ? ", " : ""}
                      {placeholders.length} requirement
                      {placeholders.length === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-1.5 text-[10px] text-muted-foreground">
        From your Degree Plan, for reference only. To take a course in a
        different quarter, edit the Degree Plan so it stays accurate.
      </p>
    </Card>
  );
}
