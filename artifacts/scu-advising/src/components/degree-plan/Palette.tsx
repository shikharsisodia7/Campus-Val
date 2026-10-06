import { useDegreePlanContext } from "./DegreePlanContext";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAddPlanItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMemo, useState, useEffect } from "react";
import {
  Search,
  Plus,
  CheckCircle2,
  CircleDashed,
} from "lucide-react";
import { PlanItemType, RequirementItem } from "@workspace/api-client-react";
import {
  requirementCategoryKindOfGroup,
  REQUIREMENT_CATEGORY_STYLE,
} from "@/lib/requirement-category";
import { DepartmentMarks, DepartmentNotes, GroupDepartmentNotes } from "./DepartmentNotes";
import { RequirementCourseDiscovery } from "./RequirementCourseDiscovery";
import {
  AddRequirementButton,
  CustomizationMarks,
  CustomizationNote,
  EditControls,
  OrphanedList,
  RequirementEditDialog,
  ResetAllDialog,
  SourceChangeDialog,
  SourceChangedNotice,
  SourceLine,
  customIdOf,
  useRequirementActions,
} from "./RequirementCustomization";
import { Checkbox } from "@/components/ui/checkbox";
import { useTrackUsage } from "@/hooks/use-track-usage";
import { useIsDepartmentAdmin } from "@/hooks/use-is-admin";
import { Link } from "wouter";
import { Pencil } from "lucide-react";
import type { RequirementGroup } from "@workspace/api-client-react";

const COMPLETED_DESTINATION = "0:completed";

export function Palette() {
  const {
    requirements,
    requirementsMeta,
    requirementsError,
    activePlan,
    catalog,
    profile,
    scheduleAvailability,
  } = useDegreePlanContext();
  const [search, setSearch] = useState("");
  // "Edit requirements": planning customizations of THIS plan's sidebar. Off
  // by default so the sidebar keeps its clean planning appearance.
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<
    | { kind: "edit" | "review"; item: RequirementItem; group: RequirementGroup }
    | { kind: "add"; item: null; group: RequirementGroup }
    | null
  >(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const canCustomize = !!activePlan && !!requirementsMeta;
  const isDepartmentAdmin = useIsDepartmentAdmin();
  // Privacy-preserving feature event (no requirement text), once per visit that opens edit mode.
  useTrackUsage("requirement_customization", editing);
  const actions = useRequirementActions(activePlan?.id ?? 0);
  const activePlanId = activePlan?.id ?? null;
  useEffect(() => {
    // A dialog belongs to the plan it was opened in.
    setDialog(null);
    setConfirmReset(false);
  }, [activePlanId]);
  const [destination, setDestination] = useState("");
  const queryClient = useQueryClient();
  const addPlanItem = useAddPlanItem();

  const destinationOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set<number>([
      profile?.currentYear ??
        scheduleAvailability?.terms?.[0]?.year ??
        currentYear,
    ]);
    activePlan?.items.forEach((item) => {
      if (item.term !== "completed") years.add(item.academicYear);
    });
    const lastYear = Math.max(...years);
    years.add(lastYear + 1);
    const termOptions = Array.from(years)
      .sort((a, b) => a - b)
      .flatMap((year) =>
        ["fall", "winter", "spring", "summer"].map((term) => ({
          value: `${year}:${term}`,
          label: `${term.charAt(0).toUpperCase()}${term.slice(1)} ${year}`,
        })),
      );
    return [
      { value: COMPLETED_DESTINATION, label: "Completed before plan" },
      ...termOptions,
    ];
  }, [activePlan?.items, profile?.currentYear, scheduleAvailability?.terms]);

  useEffect(() => {
    if (destinationOptions.length <= 1) return;
    const current = destinationOptions.find(
      (option) => option.value === destination,
    );
    if (!current) setDestination(destinationOptions[1]!.value);
  }, [destination, destinationOptions]);

  const isCompletedDestination = destination === COMPLETED_DESTINATION;

  const [academicYear, term] = destination.split(":");
  const placement = {
    academicYear: Number(academicYear),
    term: term as "fall" | "winter" | "spring" | "summer" | "completed",
  };

  const handleAddPlaceholder = (group: any, req: RequirementItem) => {
    if (!activePlan || isCompletedDestination) return;
    addPlanItem.mutate(
      {
        id: activePlan.id,
        data: {
          itemType: PlanItemType.requirement_placeholder,
          requirementId: req.id,
          requirementCategory: group.title,
          requirementLabel: req.label,
          academicYear: placement.academicYear,
          term: placement.term as any,
        },
      },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({
            predicate: (q) => String(q.queryKey[0]).startsWith("/api/plans"),
          }),
      },
    );
  };

  const handleAddCourse = (
    courseCode: string,
    group?: any,
    req?: RequirementItem,
  ) => {
    if (!activePlan) return;
    addPlanItem.mutate(
      {
        id: activePlan.id,
        data: {
          itemType: PlanItemType.course,
          courseCode,
          requirementId: req?.id,
          requirementCategory: group?.title,
          requirementLabel: req?.label,
          academicYear: placement.academicYear,
          term: placement.term as any,
        },
      },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({
            predicate: (q) => String(q.queryKey[0]).startsWith("/api/plans"),
          }),
        onError: (err: any) => {
          if (err.data?.duplicate) {
            if (
              confirm(`${courseCode} is already in this plan. Add it again?`)
            ) {
              addPlanItem.mutate(
                {
                  id: activePlan.id,
                  data: {
                    itemType: PlanItemType.course,
                    courseCode,
                    requirementId: req?.id,
                    requirementCategory: group?.title,
                    requirementLabel: req?.label,
                    academicYear: placement.academicYear,
                    term: placement.term as any,
                    allowDuplicate: true,
                  },
                },
                {
                  onSuccess: () =>
                    queryClient.invalidateQueries({
                      predicate: (q) =>
                        String(q.queryKey[0]).startsWith("/api/plans"),
                    }),
                },
              );
            }
          }
        },
      },
    );
  };

  const isPlanned = (reqId: string, courses: string[]) => {
    if (!activePlan) return false;
    return activePlan.items.some(
      (i) =>
        i.requirementId === reqId ||
        (i.courseCode && courses.includes(i.courseCode)),
    );
  };

  const filteredCatalog = catalog
    ?.filter(
      (c) =>
        c.code.toLowerCase().includes(search.toLowerCase()) ||
        c.title.toLowerCase().includes(search.toLowerCase()),
    )
    .slice(0, 20);

  return (
    <Card
      className="flex h-full flex-col overflow-hidden border-border/60 bg-card shadow-sm"
      data-testid="requirements-palette"
    >
      <div className="border-b border-border/60 px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-serif text-base font-bold">Planning Requirements</h2>
          {canCustomize && (
            <Button
              type="button"
              size="sm"
              variant={editing ? "default" : "outline"}
              className="h-8 shrink-0 gap-1 px-2 text-xs"
              onClick={() => setEditing((v) => !v)}
              aria-pressed={editing}
              data-testid="toggle-edit-requirements"
            >
              {editing ? (
                "Done"
              ) : (
                <>
                  <Pencil className="h-3 w-3" /> Edit requirements
                </>
              )}
            </Button>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Declared and proposed majors, minors &amp; Professional Preparation — editable planning space, distinct from your official APR on the right.
        </p>
        {isDepartmentAdmin && (
          <Link href="/admin/program-requirements" className="mt-1 inline-block text-[11px] font-medium text-amber-800 underline underline-offset-2" data-testid="link-program-requirements-admin">
            Program Requirements Admin
          </Link>
        )}
        {editing && requirementsMeta && (
          <div className="mt-2 space-y-1.5 rounded-md border border-sky-200 bg-sky-50/60 p-2 text-[10px] leading-relaxed text-sky-950" data-testid="edit-requirements-panel">
            <p>
              Editing <strong>this plan only</strong>. Edits save as you go and never change SCU&apos;s requirements,
              your Workday APR, your Degree Checksheets or what counts as complete.
            </p>
            <details className="text-sky-900/80">
              <summary className="cursor-pointer underline-offset-2 hover:underline">Where these requirements come from</summary>
              <p className="mt-1" data-testid="requirements-source-label">{requirementsMeta.sourceLabel}</p>
            </details>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span data-testid="customization-summary">
                {requirementsMeta.summary.edited} edited · {requirementsMeta.summary.hidden} hidden · {requirementsMeta.summary.custom} of my own
                {requirementsMeta.summary.sourceChanged > 0 ? ` · ${requirementsMeta.summary.sourceChanged} to review` : ""}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 px-2 text-xs"
                disabled={
                  actions.busy ||
                  requirementsMeta.summary.edited +
                    requirementsMeta.summary.hidden +
                    requirementsMeta.summary.custom +
                    requirementsMeta.summary.sourceChanged +
                    requirementsMeta.summary.orphaned ===
                    0
                }
                onClick={() => setConfirmReset(true)}
                data-testid="reset-all-requirements"
              >
                Reset all my edits
              </Button>
            </div>
            {actions.error && (
              <p role="alert" className="text-destructive" data-testid="requirements-action-error">
                {actions.error}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="border-b border-border/60 bg-muted/10 px-3 py-2.5">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            data-testid="input-course-search"
            placeholder="Search catalog..."
            className="h-8 bg-background pl-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="mt-2">
          <label
            htmlFor="plan-destination"
            className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Add new items to
          </label>
          <Select value={destination} onValueChange={setDestination}>
            <SelectTrigger
              id="plan-destination"
              data-testid="select-plan-destination"
              className="h-7 bg-background text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {destinationOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="text-xs"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isCompletedDestination && (
            <p className="mt-1.5 text-[10px] leading-relaxed text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Only courses can be added to the completed area (no placeholders).
            </p>
          )}
          {!isCompletedDestination && (
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              You can drag items later. A course in this plan is not a
              registration.
            </p>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        {search.length > 0 ? (
          <div className="space-y-2 p-2.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Search Results
            </div>
            {filteredCatalog?.map((c) => (
              <div
                key={c.code}
                className="rounded-md border border-border bg-card p-2 shadow-sm transition-colors hover:border-primary/30"
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-bold text-primary">
                      {c.code}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] text-foreground">
                      {c.title}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 px-0 text-muted-foreground hover:text-primary"
                    onClick={() => handleAddCourse(c.code)}
                    aria-label={`Add ${c.code}`}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {c.units} units
                </div>
              </div>
            ))}
            {filteredCatalog?.length === 0 && (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No matching courses found
              </div>
            )}
          </div>
        ) : (
          <>
          {editing && requirementsMeta && (
            <div className="pt-2">
              <OrphanedList orphaned={requirementsMeta.orphaned} actions={actions} />
            </div>
          )}
          <Accordion type="multiple" className="px-1.5 pb-3">
            {requirementsError && !requirements && (
              <p role="alert" className="mx-1.5 mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900" data-testid="requirements-load-error">
                The requirements couldn&apos;t be loaded right now. Your plan and any edits you made are safe. Reload to try again.
              </p>
            )}
            {/* Requirement groups — titles come from the API (major/second major/minor). */}
            {requirements?.map((group) => {
              // The category comes from the Bulletin group (server `category`); the title is only a fallback.
              const categoryKind = requirementCategoryKindOfGroup(group);
              // University rules are not courses: nothing to place or add, only to read.
              const isRuleGroup = group.kind === "university";
              const categoryStyle = REQUIREMENT_CATEGORY_STYLE[categoryKind];
              const Icon = categoryStyle.icon;
              return (
                <AccordionItem
                  key={group.id}
                  value={group.id}
                  className="border-b-0"
                  data-testid={`palette-group-${group.kind}`}
                  data-group-kind={group.kind}
                  data-category-kind={categoryKind}
                >
                  <AccordionTrigger className="group rounded-md px-1.5 py-2 text-left text-xs font-semibold hover:bg-muted/30 hover:no-underline data-[state=open]:bg-muted/30">
                    <div className="flex items-start gap-1.5 text-left">
                      <Icon
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 transition-colors ${categoryStyle.badgeClass.split(" ")[1]}`}
                      />
                      <span className="leading-snug">
                        {group.title}
                        {categoryStyle.isSupplemental && (
                          <span
                            className={`ml-1.5 rounded border px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide ${categoryStyle.badgeClass}`}
                          >
                            {categoryStyle.label}
                          </span>
                        )}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 px-1.5 pb-2 pt-0.5">
                    {group.notes.map((note) => (
                      <p
                        key={note}
                        className="rounded-md border border-muted bg-muted/30 px-1.5 py-1 text-[10px] leading-relaxed text-muted-foreground"
                      >
                        {note}
                      </p>
                    ))}
                    <GroupDepartmentNotes group={group} />
                    {group.items.length === 0 && (
                      <p className="py-1.5 text-[11px] text-muted-foreground">
                        No verified course requirements are available for this
                        group.
                      </p>
                    )}
                    {group.items.map((req) => {
                      const custom = req.customization;
                      const isCustom = custom?.kind === "custom";
                      const isHidden =
                        custom?.kind === "edit" && custom.hidden && !custom.sourceChanged;
                      // "Hide from my plan": gone from the student's own view,
                      // still there (dimmed, with Restore) while editing.
                      if (isHidden && !editing) return null;
                      // The server resolves cross-satisfaction: a planned major
                      // course carrying a Core designation marks that Core
                      // requirement "planned" (never "completed"). Fall back to
                      // the local plan for placeholders the server can't see.
                      const serverStatus = req.status;
                      const completed =
                        serverStatus === "completed" || req.complete;
                      const planned =
                        serverStatus === "planned" ||
                        isPlanned(req.id, req.courses);
                      const status = completed
                        ? "completed"
                        : planned
                          ? "planned"
                          : "unmet";
                      const crossSatisfiedBy = req.crossSatisfiedBy ?? [];

                      return (
                        <div
                          key={req.id}
                          data-stable-key={req.stableKey}
                          data-customized={custom ? custom.kind : undefined}
                          className={`rounded-md border p-2 text-xs ${isHidden ? "border-dashed opacity-60" : ""} ${isCustom ? "border-violet-200 bg-violet-50/30" : status === "completed" ? "border-emerald-200 bg-emerald-50/50" : status === "planned" ? "border-blue-200 bg-blue-50/50" : "border-border bg-card"}`}
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="font-medium leading-snug">
                              {req.label}
                              <DepartmentMarks item={req} />
                              <CustomizationMarks item={req} />
                            </div>
                            {status === "completed" && (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            )}
                            {status === "planned" && (
                              <CircleDashed className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                            )}
                          </div>

                          {isCustom && (
                            <label className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                              <Checkbox
                                checked={custom?.done ?? false}
                                disabled={actions.busy}
                                onCheckedChange={(v) =>
                                  actions.updateCustom(customIdOf(req), { done: v === true })
                                }
                                data-testid={`custom-done-${req.id}`}
                              />
                              Done <span>(my own tracking — not an SCU record)</span>
                            </label>
                          )}

                          {isCustom && req.courses.length > 0 && (
                            <div className="mt-1.5" data-testid={`custom-courses-${req.id}`}>
                              <div className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">Add course:</div>
                              <div className="flex flex-wrap gap-1">
                                {req.courses.map((c) => (
                                  <button
                                    key={c}
                                    type="button"
                                    className="min-h-6 rounded-md bg-secondary px-2 font-mono text-[10px] transition-colors hover:bg-primary hover:text-primary-foreground"
                                    onClick={() => handleAddCourse(c)}
                                    aria-label={`Add ${c} to the plan`}
                                  >
                                    {c}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {!isCustom && !isRuleGroup && !isHidden && status !== "completed" && status !== "planned" && (
                            <div className="mt-2 space-y-1.5">
                              {/* Hide placeholder button when destination is completed area */}
                              {!isCompletedDestination && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 w-full justify-start text-[11px]"
                                  onClick={() =>
                                    handleAddPlaceholder(group, req)
                                  }
                                  disabled={addPlanItem.isPending}
                                  data-testid={`add-placeholder-${req.id}`}
                                >
                                  <Plus className="mr-1 h-3 w-3" /> Add
                                  placeholder
                                </Button>
                              )}

                              {req.courses.length > 0 && (
                                <div className="pt-1">
                                  <div className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">
                                    Or add course:
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {req.courses.slice(0, 5).map((c) => (
                                      <Badge
                                        key={c}
                                        variant="secondary"
                                        className="cursor-pointer font-mono text-[10px] transition-colors hover:bg-primary hover:text-primary-foreground"
                                        onClick={() =>
                                          handleAddCourse(c, group, req)
                                        }
                                      >
                                        {c}
                                      </Badge>
                                    ))}
                                    {req.courses.length > 5 && (
                                      <Badge
                                        variant="outline"
                                        className="border-dashed text-[10px] text-muted-foreground"
                                      >
                                        +{req.courses.length - 5} more
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              )}

                              <RequirementCourseDiscovery
                                req={req}
                                group={group}
                                onAdd={(code) => handleAddCourse(code, group, req)}
                                disabled={addPlanItem.isPending}
                              />
                            </div>
                          )}

                          {status === "completed" && (
                            <div className="mt-1 text-[10px] text-emerald-700">
                              Satisfied
                            </div>
                          )}
                          {status === "planned" && (
                            <div
                              className="mt-1 text-[10px] text-blue-700"
                              data-testid={`req-planned-${req.id}`}
                            >
                              Planned in schedule
                            </div>
                          )}

                          {/* Say which planned course is covering this
                              requirement, and be honest that a match made from
                              the catalog's derived Core tagging needs checking
                              rather than presenting it as an SCU designation. */}
                          {crossSatisfiedBy.length > 0 &&
                            status !== "unmet" && (
                              <div
                                className="mt-1 text-[10px] text-muted-foreground"
                                data-testid={`req-cross-satisfied-${req.id}`}
                              >
                                Covered by {crossSatisfiedBy.join(", ")} —
                                confirm this Core designation in Workday or the
                                Bulletin.
                              </div>
                            )}

                          <DepartmentNotes item={req} />
                          <CustomizationNote item={req} />
                          <SourceChangedNotice
                            item={req}
                            actions={actions}
                            onReview={() => setDialog({ kind: "review", item: req, group })}
                          />
                          {editing && canCustomize && (
                            <EditControls
                              item={req}
                              actions={actions}
                              onEdit={() => setDialog({ kind: "edit", item: req, group })}
                            />
                          )}
                        </div>
                      );
                    })}
                    <div className="space-y-1.5 pt-1">
                      {editing && canCustomize && group.stableKey && (
                        <AddRequirementButton onClick={() => setDialog({ kind: "add", item: null, group })} />
                      )}
                      <SourceLine group={group} />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
          </>
        )}
      </ScrollArea>

      {dialog && dialog.kind !== "review" && (
        <RequirementEditDialog
          key={`${dialog.kind}:${dialog.item?.id ?? dialog.group.id}`}
          mode={dialog.kind}
          item={dialog.item}
          group={dialog.group}
          open
          onClose={() => {
            actions.clearError();
            setDialog(null);
          }}
          actions={actions}
        />
      )}
      {dialog?.kind === "review" && (
        <SourceChangeDialog
          item={dialog.item}
          open
          onClose={() => {
            actions.clearError();
            setDialog(null);
          }}
          actions={actions}
        />
      )}
      <ResetAllDialog open={confirmReset} onClose={() => setConfirmReset(false)} actions={actions} />
    </Card>
  );
}
