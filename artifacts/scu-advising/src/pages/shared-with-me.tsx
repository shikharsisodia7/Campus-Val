import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/api";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, ChevronLeft, AlertCircle } from "lucide-react";
import {
  requirementCategoryKindFor,
  REQUIREMENT_CATEGORY_STYLE,
} from "@/lib/requirement-category";

interface SharedStudent {
  shareId: number;
  studentUserId: string;
  scopes: string[];
  sharedSince: string;
  profile: { name: string | null; currentYear: number | null } | null;
}

interface SharedPlanItem {
  id: number;
  itemType: "course" | "requirement_placeholder";
  courseCode: string | null;
  courseTitle: string | null;
  units: number | null;
  requirementCategory: string | null;
  requirementLabel: string | null;
  academicYear: number;
  term: string;
}

interface SharedPlan {
  id: number;
  name: string;
  planType: "degree" | "tentative";
  items: SharedPlanItem[];
  readOnly: boolean;
  sharedScopes: string[];
}

async function fetchSharedStudents(): Promise<SharedStudent[]> {
  const res = await fetch(getApiUrl("/advisor/shared-students"));
  if (!res.ok) throw new Error("Failed to load shared students");
  const data = await res.json();
  return data.students as SharedStudent[];
}

async function fetchSharedPlan(studentUserId: string): Promise<SharedPlan> {
  const res = await fetch(
    getApiUrl(`/advisor/shared-students/${encodeURIComponent(studentUserId)}/plan`),
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to load this student's plan");
  }
  return res.json();
}

/**
 * "Shared with me" — an advisor's read-only view of students who have
 * DELIBERATELY shared their plan. Never a campus-wide directory; every row
 * here corresponds to an active plan_shares grant, re-checked server-side
 * on every request (routes/plan-shares.ts). See docs/ADVISOR_SHARING.md.
 */
export default function SharedWithMePage() {
  const [selected, setSelected] = useState<SharedStudent | null>(null);

  const { data: students, isLoading, error } = useQuery({
    queryKey: ["/api/advisor/shared-students"],
    queryFn: fetchSharedStudents,
  });

  const {
    data: plan,
    isLoading: planLoading,
    error: planError,
  } = useQuery({
    queryKey: ["/api/advisor/shared-students", selected?.studentUserId, "plan"],
    queryFn: () => fetchSharedPlan(selected!.studentUserId),
    enabled: !!selected,
  });

  if (selected) {
    return (
      <AppShell>
        <PageHeader
          compact
          title={selected.profile?.name || "Shared plan"}
          subtitle="Read-only — you cannot edit this student's plan."
        />
        <div className="p-4 xl:p-6 space-y-4" data-testid="shared-plan-view">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelected(null)}
            data-testid="button-back-to-shared-list"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back to shared students
          </Button>
          {planLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {planError && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {(planError as Error).message}
            </div>
          )}
          {plan && <ReadOnlyPlanView plan={plan} />}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        compact
        title="Shared with me"
        subtitle="Students who have explicitly shared their plan with you. This is not a campus directory — nothing here appears unless a student granted you access."
      />
      <div className="p-4 xl:p-6 space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {(error as Error).message}
          </div>
        )}
        {students && students.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground" data-testid="no-shared-students">
            <Users className="mx-auto mb-2 h-6 w-6 opacity-50" />
            No students have shared a plan with you yet.
          </Card>
        )}
        {students && students.length > 0 && (
          <div className="grid gap-2" data-testid="shared-students-list">
            {students.map((s) => (
              <Card
                key={s.shareId}
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30"
                onClick={() => setSelected(s)}
                data-testid={`shared-student-${s.shareId}`}
              >
                <div>
                  <div className="font-medium text-sm">
                    {s.profile?.name || "Student"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Shared since {new Date(s.sharedSince).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex gap-1">
                  {s.scopes.map((scope) => (
                    <Badge key={scope} variant="outline" className="text-[9px]">
                      {scope.replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ReadOnlyPlanView({ plan }: { plan: SharedPlan }) {
  const byYear = new Map<number, SharedPlanItem[]>();
  for (const item of plan.items) {
    if (item.term === "completed") continue;
    if (!byYear.has(item.academicYear)) byYear.set(item.academicYear, []);
    byYear.get(item.academicYear)!.push(item);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => a - b);

  return (
    <div className="space-y-4" data-testid="read-only-plan-view">
      {years.map((year) => (
        <Card key={year} className="p-3">
          <h3 className="font-serif text-lg font-bold mb-2">
            {year}–{year + 1}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {["fall", "winter", "spring", "summer"].map((term) => {
              const items = byYear.get(year)!.filter((i) => i.term === term);
              if (items.length === 0 && term === "summer") return null;
              return (
                <div key={term} className="rounded-md border border-border/50 p-2">
                  <h4 className="text-xs font-semibold capitalize mb-1">{term}</h4>
                  {items.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground italic">
                      Nothing planned
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {items.map((item) => {
                        const kind = requirementCategoryKindFor(item.requirementCategory);
                        const style = REQUIREMENT_CATEGORY_STYLE[kind];
                        return (
                          <li key={item.id} className="text-xs">
                            {item.requirementCategory && (
                              <Badge
                                variant="outline"
                                className={`text-[8px] mr-1 ${style.badgeClass}`}
                              >
                                {style.label}
                              </Badge>
                            )}
                            {item.itemType === "course"
                              ? `${item.courseCode} — ${item.courseTitle ?? ""}`
                              : item.requirementLabel}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
      {plan.items.length === 0 && (
        <p className="text-sm text-muted-foreground">This plan is empty.</p>
      )}
    </div>
  );
}
