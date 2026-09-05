import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  PlanItem,
  PlanItemType,
  useReplacePlanPlaceholder,
  useGetCourse,
} from "@workspace/api-client-react";
import {
  useOptimisticDeletePlanItem,
  useOptimisticUpdatePlanItem,
} from "./usePlanItemMutations";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDegreePlanContext } from "./DegreePlanContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { minutesToLabel } from "@/lib/conflicts";
import type { CourseConflictDetail } from "./useTermCourseConflicts";
import {
  isOfferingWarning,
  isProvisional,
  PROJECTED_TERM_EXPLANATION,
  type OfferingResult,
} from "@/lib/course-offering";
import { SCU_BULLETIN_URL } from "@/data/advising-resources";
import {
  requirementCategoryKindFor,
  REQUIREMENT_CATEGORY_STYLE,
} from "@/lib/requirement-category";
import {
  useQuarterFitSuggestions,
  type QuarterFitSuggestion,
} from "./useQuarterFitSuggestions";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Trash2,
  GripVertical,
  GraduationCap,
  MoveRight,
  BookOpen,
  AlertCircle,
  Loader2,
  CalendarClock,
  CheckCircle2,
} from "lucide-react";
import {
  COMPLETION_SOURCE_OPTIONS,
  COMPLETION_SOURCE_LABELS,
} from "./completionSources";

function CourseDetailDialog({
  code,
  open,
  onOpenChange,
}: {
  code: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: courseDetails, isLoading } = useGetCourse(code, {
    query: { enabled: open, queryKey: ["/api/courses", code] },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        onEscapeKeyDown={() => onOpenChange(false)}
        onPointerDownOutside={() => onOpenChange(false)}
      >
        <DialogHeader>
          <DialogTitle className="font-mono text-xl">{code}</DialogTitle>
          <DialogDescription>
            {courseDetails?.title || "Loading..."}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Badge variant="outline">{courseDetails?.units} Units</Badge>
              {courseDetails?.coreAreas?.map((a) => (
                <Badge key={a} variant="secondary">
                  {a}
                </Badge>
              ))}
            </div>
            <p
              className="text-sm text-muted-foreground"
              data-testid="course-detail-description"
            >
              {courseDetails?.description || "Description not available."}
            </p>

            <div
              className="p-3 bg-muted/20 rounded-md border border-border text-sm"
              data-testid="course-detail-prerequisites"
            >
              <div className="font-semibold mb-1">Prerequisites</div>
              <div>
                {courseDetails?.prereqLogic ||
                  "Prerequisite information unavailable."}
              </div>
            </div>

            {courseDetails?.corequisites && courseDetails.corequisites.length > 0 && (
              <div
                className="p-3 bg-muted/20 rounded-md border border-border text-sm"
                data-testid="course-detail-corequisites"
              >
                <div className="font-semibold mb-1">Corequisites</div>
                <div>{courseDetails.corequisites.join(", ")}</div>
              </div>
            )}

            <a
              href={SCU_BULLETIN_URL}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline underline-offset-2"
              data-testid="course-detail-official-source"
            >
              View in the official SCU Bulletin / Course Catalog
            </a>

            <div
              className="text-xs text-muted-foreground flex items-center gap-1.5 bg-blue-50 text-blue-800 p-2 rounded border border-blue-100"
              data-testid="course-detail-disclaimer"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>
                Course and prerequisite information is for planning support.
                Verify requirements in the official SCU Bulletin/Course
                Catalog and in Workday before registration.
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CourseCard({
  item,
  isOverlay,
  availableYears,
  offering,
  conflicts,
}: {
  item: PlanItem;
  isOverlay?: boolean;
  availableYears: number[];
  offering?: OfferingResult;
  conflicts?: CourseConflictDetail[];
}) {
  const { activePlanId, catalog, profile, requirements } =
    useDegreePlanContext();
  const deletePlanItem = useOptimisticDeletePlanItem();
  const queryClient = useQueryClient();
  const updatePlanItem = useOptimisticUpdatePlanItem();
  const replacePlaceholder = useReplacePlanPlaceholder({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({
          predicate: (q) => String(q.queryKey[0]).startsWith("/api/plans"),
        }),
    },
  });

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [replaceSearch, setReplaceSearch] = useState("");

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.4 : 1,
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activePlanId) return;
    deletePlanItem.mutate({ id: activePlanId, itemId: item.id });
  };

  const isCompletedItem =
    (item.bucket ?? "planned") === "completed" || item.term === "completed";

  const handleMarkCompleted = (e: Event | React.MouseEvent, source: string) => {
    if ("stopPropagation" in e) e.stopPropagation();
    if (!activePlanId) return;
    updatePlanItem.mutate({
      id: activePlanId,
      itemId: item.id,
      data: { bucket: "completed" as const, completionSource: source as any },
    });
  };

  const handleReplace = (courseCode: string) => {
    if (!activePlanId) return;
    replacePlaceholder.mutate(
      {
        id: activePlanId,
        itemId: item.id,
        data: { courseCode },
      },
      {
        onSuccess: () => setIsReplaceOpen(false),
      },
    );
  };

  const isPlaceholder = item.itemType === PlanItemType.requirement_placeholder;
  const courseDetails =
    !isPlaceholder && catalog
      ? catalog.find((c) => c.code === item.courseCode)
      : null;

  const terms = ["fall", "winter", "spring", "summer"];
  const isInCompletedArea = isCompletedItem;

  const content = (
    <Card
      className={`relative group ${isPlaceholder ? "border-dashed border-primary/40 bg-primary/[0.02]" : "bg-card border-border"} ${isOverlay ? "shadow-lg rotate-2 scale-105" : "shadow-sm hover:shadow-md transition-all"}`}
    >
      <div className="flex items-start gap-1.5 p-2">
        <div
          {...attributes}
          {...listeners}
          className="mt-1 text-muted-foreground/40 cursor-grab hover:text-foreground transition-colors outline-none"
          tabIndex={0}
          aria-label={`Drag ${item.courseCode || item.requirementLabel}`}
        >
          <GripVertical className="h-4 w-4" />
        </div>

        <div
          className="flex-1 min-w-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-sm"
          role="button"
          tabIndex={0}
          aria-label={
            isPlaceholder
              ? `Set up requirement: ${item.requirementLabel}`
              : `View details for ${item.courseCode}`
          }
          onClick={() => {
            if (isPlaceholder) setIsReplaceOpen(true);
            else setIsDetailOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (isPlaceholder) setIsReplaceOpen(true);
              else setIsDetailOpen(true);
            }
          }}
        >
          {(() => {
            const categoryKind = requirementCategoryKindFor(item.requirementCategory);
            const categoryStyle = REQUIREMENT_CATEGORY_STYLE[categoryKind];
            const CategoryIcon = categoryStyle.icon;
            const categoryBadge = item.requirementCategory ? (
              <Badge
                variant="outline"
                className={`text-[9px] mb-1 font-mono uppercase tracking-widest gap-1 ${categoryStyle.badgeClass}`}
                data-testid={`category-badge-${item.id}`}
                title={item.requirementCategory}
              >
                <CategoryIcon className="h-2.5 w-2.5" />
                {categoryStyle.label}
              </Badge>
            ) : null;

            return isPlaceholder ? (
              <>
                {categoryBadge ?? (
                  <Badge
                    variant="outline"
                    className="text-[9px] mb-1 font-mono uppercase tracking-widest text-primary border-primary/20"
                  >
                    Requirement
                  </Badge>
                )}
                <div className="font-medium text-sm leading-tight text-foreground/90">
                  {item.requirementLabel}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 truncate">
                  {item.requirementCategory}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  Units TBD
                </div>
              </>
            ) : (
              <>
                {categoryBadge}
                <div className="flex justify-between items-start gap-1">
                  <div className="font-mono text-sm font-bold text-primary truncate">
                    {item.courseCode}
                  </div>
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1 py-0 h-4"
                  >
                    {item.units}u
                  </Badge>
                </div>
                <div className="text-xs text-foreground/80 mt-1 line-clamp-2 leading-snug">
                  {item.courseTitle || courseDetails?.title}
                </div>
              </>
            );
          })()}
          {!isPlaceholder && (
            <>
              {isCompletedItem && (
                <div
                  className="flex items-center gap-1 mt-1.5 text-[10px] text-emerald-700"
                  data-testid={`completed-source-${item.id}`}
                >
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                  <span>
                    {COMPLETION_SOURCE_LABELS[item.completionSource ?? ""] ??
                      "Completed"}{" "}
                    ·{" "}
                    {item.provenance === "report_imported"
                      ? "from your progress report"
                      : "student-entered"}
                  </span>
                </div>
              )}
              {offering && isOfferingWarning(offering) && (
                <div
                  className={`flex items-center gap-1 mt-1.5 text-[10px] ${
                    offering.evidence === "published"
                      ? "text-red-700"
                      : "text-amber-700"
                  }`}
                  data-testid={`not-offered-note-${item.id}`}
                  title={isProvisional(offering) ? PROJECTED_TERM_EXPLANATION : undefined}
                >
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span>{offering.detail}</span>
                </div>
              )}
              {conflicts && conflicts.length > 0 && (
                <ConflictNote
                  item={item}
                  conflicts={conflicts}
                  onMove={(year, term) => {
                    if (!activePlanId) return;
                    updatePlanItem.mutate({
                      id: activePlanId,
                      itemId: item.id,
                      data: { academicYear: year, term: term as any },
                    });
                  }}
                />
              )}
            </>
          )}
        </div>

        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
          {/* Moving a course between terms is drag-and-drop only — the
              professor asked for the move menu to go, and dnd-kit's
              KeyboardSensor (wired in Board.tsx) keeps dragging reachable
              from the keyboard. What stays here is the one thing a drag
              cannot express: WHY a course counts as already completed, which
              is real provenance rather than a position on the board. */}
          {!isPlaceholder && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Mark ${item.courseCode ?? "course"} completed before this plan`}
                  data-testid={`completion-source-trigger-${item.id}`}
                >
                  <GraduationCap className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs">
                  Completed before current plan
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {COMPLETION_SOURCE_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    data-testid={`mark-completed-${item.id}-${opt.value}`}
                    disabled={
                      isCompletedItem && item.completionSource === opt.value
                    }
                    onClick={(e) => handleMarkCompleted(e as any, opt.value)}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            aria-label={`Remove ${item.courseCode || item.requirementLabel || "item"} from plan`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </Card>
  );

  if (isOverlay) return <div style={style}>{content}</div>;

  return (
    <div ref={setNodeRef} style={style}>
      {content}

      {/* Course Detail Dialog */}
      {!isPlaceholder && item.courseCode && (
        <CourseDetailDialog
          code={item.courseCode}
          open={isDetailOpen}
          onOpenChange={setIsDetailOpen}
        />
      )}

      {/* Replace Placeholder Dialog */}
      {isPlaceholder && (
        <Dialog open={isReplaceOpen} onOpenChange={setIsReplaceOpen}>
          <DialogContent
            aria-describedby={undefined}
            onEscapeKeyDown={() => setIsReplaceOpen(false)}
            onPointerDownOutside={() => setIsReplaceOpen(false)}
          >
            <DialogHeader>
              <DialogTitle>Replace Placeholder</DialogTitle>
              <DialogDescription>
                Find a course to satisfy: {item.requirementLabel}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {(() => {
                const reqItem = requirements
                  ?.flatMap((g) => g.items ?? [])
                  .find((r) => r.id === item.requirementId);
                const eligibleCodes = new Set(
                  (reqItem?.courses ?? []).map((c) => c.toUpperCase()),
                );
                const eligible =
                  catalog?.filter((c) =>
                    eligibleCodes.has(c.code.toUpperCase()),
                  ) ?? [];
                if (eligible.length === 0) {
                  return (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      CampusVal does not have a verified course list for this
                      requirement. Keep the placeholder and verify options in
                      the SCU Bulletin with your advisor.
                    </div>
                  );
                }
                return (
                  <div
                    className="space-y-2"
                    data-testid="replace-eligible-list"
                  >
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Courses that satisfy this requirement
                    </div>
                    <ScrollArea className="max-h-[180px] border rounded-md p-2">
                      {eligible.map((c) => (
                        <div
                          key={c.code}
                          className="flex justify-between items-center p-2 hover:bg-muted rounded-md border-b last:border-0"
                        >
                          <div>
                            <div className="font-mono text-sm font-bold">
                              {c.code}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {c.title}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            data-testid={`replace-select-${c.code.replace(/\s+/g, "-")}`}
                            onClick={() => handleReplace(c.code)}
                            disabled={replacePlaceholder.isPending}
                          >
                            Select
                          </Button>
                        </div>
                      ))}
                    </ScrollArea>
                    <div className="text-xs text-muted-foreground">
                      Only listed courses can replace this requirement
                      placeholder.
                    </div>
                  </div>
                );
              })()}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function ConflictNote({
  item,
  conflicts,
  onMove,
}: {
  item: PlanItem;
  conflicts: CourseConflictDetail[];
  onMove: (year: number, term: string) => void;
}) {
  const names = conflicts.map((c) => c.otherCode);
  const [open, setOpen] = useState(false);

  const handleSuggestionMove = (year: number, term: string) => {
    onMove(year, term);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 mt-1.5 text-[10px] text-amber-700 hover:text-amber-900 underline decoration-dotted underline-offset-2 text-left"
          data-testid={`time-conflict-note-${item.id}`}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Show clashing meeting times with ${names.join(" and ")}`}
        >
          <CalendarClock className="h-3 w-3 shrink-0" />
          <span>All sections clash with {names.join(" & ")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-3"
        align="start"
        onClick={(e) => e.stopPropagation()}
        data-testid={`time-conflict-details-${item.id}`}
      >
        <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5 text-amber-700" />
          Why {item.courseCode} can't fit
        </div>
        <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
          {conflicts.map((c) => (
            <div key={c.otherCode}>
              <div className="text-[11px] font-semibold text-foreground/90 mb-1">
                vs <span className="font-mono">{c.otherCode}</span> — every
                section pairing overlaps:
              </div>
              <div className="space-y-1">
                {c.overlaps.map((o, idx) => (
                  <div
                    key={idx}
                    className="text-[11px] rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900"
                  >
                    <div>
                      <span className="font-semibold">{o.aSection}</span>{" "}
                      {o.aDays.join("")} {format12(o.aStart)}–{format12(o.aEnd)}
                      {" ⟷ "}
                      <span className="font-semibold">{o.bSection}</span>{" "}
                      {o.bDays.join("")} {format12(o.bStart)}–{format12(o.bEnd)}
                    </div>
                    <div className="text-amber-800/90">
                      Overlap: {o.sharedDays.join("")}{" "}
                      {minutesToLabel(o.overlapStart)}–
                      {minutesToLabel(o.overlapEnd)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {item.courseCode && (
          <QuarterSuggestions
            item={item}
            courseCode={item.courseCode}
            enabled={open}
            onMove={handleSuggestionMove}
          />
        )}
        <div className="text-[10px] text-muted-foreground mt-2">
          Times from SCU's published/tentative schedule.
        </div>
      </PopoverContent>
    </Popover>
  );
}

function QuarterSuggestions({
  item,
  courseCode,
  enabled,
  onMove,
}: {
  item: PlanItem;
  courseCode: string;
  enabled: boolean;
  onMove?: (year: number, term: string) => void;
}) {
  const { activePlan, scheduleAvailability } = useDegreePlanContext();

  // Latch: once the popover has been opened, keep queries alive so the cache
  // is always warm and re-opening shows cached results instantly (no flicker).
  const everEnabled = useRef(false);
  if (enabled) everEnabled.current = true;

  const suggestions = useQuarterFitSuggestions(
    courseCode,
    item.academicYear,
    item.term,
    activePlan?.items,
    scheduleAvailability,
    everEnabled.current,
  );

  if (suggestions.length === 0) return null;

  const label = (s: QuarterFitSuggestion) => {
    switch (s.status) {
      case "fits":
        return s.plannedCount === 0
          ? "Offered — quarter is empty in your plan"
          : "Offered — a conflict-free section combination exists";
      case "no-fit":
        return "Offered, but every section clashes there too";
      case "unverified":
        return "Offered — times TBA, fit can't be verified";
      case "not-offered":
        return "Not in the official schedule";
      case "checking":
        return "Checking sections…";
    }
  };

  const tone = (s: QuarterFitSuggestion) =>
    s.status === "fits"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : s.status === "unverified"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-border bg-muted/20 text-muted-foreground";

  return (
    <div
      className="mt-3 pt-2 border-t border-border"
      data-testid={`quarter-suggestions-${item.id}`}
    >
      <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
        <MoveRight className="h-3.5 w-3.5 text-emerald-700" />
        Where {courseCode} could fit
      </div>
      <div className="space-y-1 max-h-[160px] overflow-y-auto pr-1">
        {suggestions.map((s) => (
          <div
            key={`${s.year}-${s.term}`}
            className={`text-[11px] rounded border px-2 py-1 flex items-center justify-between gap-2 ${tone(s)}`}
            data-testid={`quarter-suggestion-${item.id}-${s.year}-${s.term}`}
          >
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-semibold capitalize">
                {s.term} {s.displayYear}
                {s.scheduleStatus === "tentative" && (
                  <span className="font-normal"> (tentative)</span>
                )}
              </span>
              <span>{label(s)}</span>
            </div>
            {s.status === "fits" && onMove && (
              <button
                type="button"
                className="shrink-0 flex items-center gap-1 rounded bg-emerald-700 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-800 transition-colors"
                data-testid={`move-here-${item.id}-${s.year}-${s.term}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(s.year, s.term);
                }}
              >
                <MoveRight className="h-3 w-3" />
                Move here
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1.5">
        Quarters without a published or tentative SCU schedule aren't listed —
        their offerings are unknown.
      </div>
    </div>
  );
}

function format12(t: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return t;
  let h = Number(m[1]);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ampm}`;
}
