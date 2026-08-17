import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AcademicPlanDetail,
  PlanItem,
  Term,
  ScheduleAvailability,
  listSchedules,
  getSchedule,
  deleteScheduleEvent,
} from "@workspace/api-client-react";
import { useOptimisticUpdatePlanItem } from "@/components/degree-plan/usePlanItemMutations";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import { CalendarDays, MoveRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { capitalize } from "./utils";

const QUARTER_TERMS: Term[] = ["fall" as Term, "winter" as Term, "spring" as Term];

/** { fall: anchor, winter: anchor+1, spring: anchor+1 } — the repo's real
 * academic-year convention (confirmed against OFFERED_TERMS: Fall 2026,
 * Winter 2027, Spring 2027 all belong to the "2026-27" academic year). */
function quarterYearFor(term: Term, anchor: number): number {
  return term === "fall" ? anchor : anchor + 1;
}

function academicYearAnchors(availability: ScheduleAvailability | undefined): number[] {
  const anchors = new Set<number>();
  for (const t of availability?.terms ?? []) {
    anchors.add(t.term === "fall" ? t.year : t.year - 1);
  }
  return Array.from(anchors).sort((a, b) => a - b);
}

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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updatePlanItem = useOptimisticUpdatePlanItem();

  const anchors = useMemo(() => academicYearAnchors(availability), [availability]);
  const [anchorOverride, setAnchorOverride] = useState<number | null>(null);

  // Default the academic-year selector to whichever year contains the
  // currently-focused quarter, falling back to the earliest known year.
  const focusedAnchor =
    focusedTerm && focusedYear !== null
      ? focusedTerm === "fall"
        ? focusedYear
        : focusedYear - 1
      : null;
  const anchor = anchorOverride ?? focusedAnchor ?? anchors[0] ?? new Date().getFullYear();

  if (anchors.length === 0) return null;

  const quarters = QUARTER_TERMS.map((term) => ({
    term,
    year: quarterYearFor(term, anchor),
  }));

  const itemsFor = (term: Term, year: number) =>
    (activePlan?.items ?? []).filter(
      (i) => i.term === term && i.academicYear === year,
    );

  const handleMove = async (item: PlanItem, fromTerm: Term, fromYear: number, toTerm: Term, toYear: number) => {
    if (!activePlan) return;
    updatePlanItem.mutate({
      id: activePlan.id,
      itemId: item.id,
      data: { academicYear: toYear, term: toTerm as any },
    });

    // Best-effort: an exact section chosen for the OLD quarter is meaningless
    // in the new one — never carry it forward, and never invent a new one.
    if (item.itemType === "course" && item.courseCode) {
      try {
        const { schedules } = await listSchedules({ term: fromTerm, year: fromYear });
        for (const s of schedules) {
          const detail = await getSchedule(s.id);
          const matches = detail.events.filter(
            (e) =>
              e.kind === "section" &&
              e.courseCode?.toUpperCase() === item.courseCode!.toUpperCase(),
          );
          for (const m of matches) {
            await deleteScheduleEvent(s.id, m.id);
          }
        }
      } catch {
        // Best effort — the plan-item move above already succeeded, which is
        // what matters for degree planning; a stale section is cosmetic.
      } finally {
        queryClient.invalidateQueries({
          predicate: (q) => String(q.queryKey[0]).startsWith("/api/schedules"),
        });
      }
    }

    toast({
      title: `${item.courseCode ?? item.requirementLabel} moved to ${capitalize(toTerm)} ${toYear}`,
      description: "Choose a section for it there when you're ready.",
    });
  };

  return (
    <Card className="p-4" data-testid="academic-year-overview">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Academic Year</span>
        </div>
        <Select
          value={String(anchor)}
          onValueChange={(v) => setAnchorOverride(Number(v))}
        >
          <SelectTrigger className="w-[140px] h-8 bg-card text-sm" data-testid="select-academic-year">
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {quarters.map(({ term, year }) => {
          const items = itemsFor(term, year);
          const isFocused = focusedTerm === term && focusedYear === year;
          const courses = items.filter((i) => i.itemType === "course");
          const placeholders = items.filter((i) => i.itemType === "requirement_placeholder");
          const otherQuarters = quarters.filter((q) => !(q.term === term && q.year === year));

          return (
            <div
              key={`${term}-${year}`}
              className={`rounded-md border p-2.5 ${isFocused ? "border-primary/50 bg-primary/[0.03]" : "border-border bg-muted/10"}`}
              data-testid={`year-overview-${term}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  {capitalize(term)} {year}
                </span>
                {isFocused && (
                  <Badge variant="outline" className="text-[9px] border-primary/40 text-primary">
                    Focused
                  </Badge>
                )}
              </div>
              {items.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic py-1">
                  No courses planned yet.
                </p>
              ) : (
                <div className="space-y-1">
                  {courses.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-1 rounded border border-border/60 bg-card px-1.5 py-1"
                      data-testid={`overview-item-${item.id}`}
                    >
                      <span className="font-mono text-[11px] font-semibold text-primary truncate">
                        {item.courseCode}
                      </span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {otherQuarters.map((q) => (
                          <Button
                            key={`${q.term}-${q.year}`}
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1 text-[9px] text-muted-foreground hover:text-primary"
                            title={`Move to ${capitalize(q.term)} ${q.year}`}
                            aria-label={`Move ${item.courseCode} to ${capitalize(q.term)} ${q.year}`}
                            data-testid={`overview-move-${item.id}-to-${q.term}`}
                            onClick={() => handleMove(item, term, year, q.term, q.year)}
                          >
                            <MoveRight className="h-2.5 w-2.5 mr-0.5" />
                            {capitalize(q.term).slice(0, 3)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {placeholders.length > 0 && (
                    <div className="text-[10px] text-muted-foreground italic pt-0.5">
                      +{placeholders.length} requirement placeholder
                      {placeholders.length === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
              )}
              <Button
                variant={isFocused ? "default" : "outline"}
                size="sm"
                className="w-full h-6 text-[10px] mt-2"
                onClick={() => onFocusQuarter(term, year)}
                data-testid={`focus-quarter-${term}`}
              >
                {isFocused ? "Focused below" : "Focus this quarter"}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="mt-2 text-[10px] text-muted-foreground">
        From your{" "}
        <Link href="/degree-plan" className="underline text-primary/80">
          Degree Plan
        </Link>
        . Moving a course here updates which quarter you intend to take it —
        it does not select an exact section for you.
      </div>
    </Card>
  );
}
