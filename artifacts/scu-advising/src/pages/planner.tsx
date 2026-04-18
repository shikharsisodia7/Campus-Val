import { useEffect, useState } from "react";
import {
  useCheckPlan,
  useGetProfile,
  useListCourses,
} from "@workspace/api-client-react";
import { AppShell, PageContent, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  X,
  AlertTriangle,
  Info,
  XCircle,
  CheckCircle2,
} from "lucide-react";
import { TERM_OPTIONS, termLabel } from "@/lib/api";

interface PlannedCourse {
  code: string;
  units: number;
}

const STORAGE_KEY = "campusval.planner.v1";

export default function Planner() {
  const { data: profile } = useGetProfile({ query: { retry: false } });
  const { data: catalog = [] } = useListCourses({});
  const checkPlan = useCheckPlan();

  const [term, setTerm] = useState<string>("fall");
  const [year, setYear] = useState<number>(2025);
  const [planned, setPlanned] = useState<PlannedCourse[]>([]);
  const [draftCode, setDraftCode] = useState("");
  const [draftUnits, setDraftUnits] = useState<number>(4);

  useEffect(() => {
    if (profile) {
      setTerm(profile.currentTerm);
      setYear(profile.currentYear);
    }
  }, [profile]);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.planned)) setPlanned(parsed.planned);
        if (parsed.term) setTerm(parsed.term);
        if (parsed.year) setYear(parsed.year);
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ planned, term, year }),
    );
  }, [planned, term, year]);

  const addCourse = () => {
    const code = draftCode.trim().toUpperCase().replace(/\s+/g, " ");
    if (!code) return;
    const known = catalog.find((c) => c.code.toUpperCase() === code);
    setPlanned([
      ...planned,
      { code: known?.code ?? code, units: known?.units ?? draftUnits },
    ]);
    setDraftCode("");
    setDraftUnits(4);
  };

  const removeCourse = (idx: number) => {
    setPlanned(planned.filter((_, i) => i !== idx));
  };

  const onCheck = () => {
    checkPlan.mutate({
      data: {
        term: term as "fall" | "winter" | "spring" | "summer",
        year,
        plannedCourses: planned.map((p) => ({
          code: p.code,
          units: p.units,
        })),
        completedCourseCodes: profile?.completedCourseCodes ?? [],
        cumulativeGpa: profile?.cumulativeGpa ?? null,
        priorityRegistration: profile?.priorityRegistration ?? false,
      },
    });
  };

  const result = checkPlan.data;
  const totalUnits = planned.reduce((s, p) => s + Number(p.units), 0);

  return (
    <AppShell>
      <PageHeader
        title="Quarter Planner"
        subtitle="Build a tentative schedule. CampusVal checks unit caps, prerequisites, course offerings, and overload eligibility against your profile."
      />
      <PageContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="p-6 lg:col-span-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                  Term
                </label>
                <Select value={term} onValueChange={setTerm}>
                  <SelectTrigger
                    data-testid="select-term"
                    className="mt-1.5"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TERM_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {termLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                  Year
                </label>
                <Input
                  data-testid="input-year"
                  type="number"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="mt-6">
              <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                Add a course
              </div>
              <div className="flex gap-2">
                <Input
                  data-testid="input-add-code"
                  list="course-codes"
                  value={draftCode}
                  onChange={(e) => setDraftCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCourse()}
                  placeholder="e.g. COEN 11"
                  className="flex-1 font-mono"
                />
                <datalist id="course-codes">
                  {catalog.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.title}
                    </option>
                  ))}
                </datalist>
                <Input
                  data-testid="input-add-units"
                  type="number"
                  step="0.5"
                  value={draftUnits}
                  onChange={(e) => setDraftUnits(Number(e.target.value))}
                  className="w-20"
                />
                <Button onClick={addCourse} data-testid="button-add-course">
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
            </div>

            <div className="mt-6 border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-foreground">
                  Planned courses
                </div>
                <Badge variant="outline" className="font-mono">
                  {totalUnits} units
                </Badge>
              </div>
              {planned.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-md">
                  Add courses above to start planning.
                </div>
              ) : (
                <div className="space-y-2">
                  {planned.map((p, i) => (
                    <div
                      key={i}
                      data-testid={`planned-${i}`}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border border-border bg-muted/20 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="font-mono text-sm font-bold text-primary">
                          {p.code}
                        </div>
                        <div className="text-sm text-foreground">
                          {catalog.find(
                            (c) => c.code.toUpperCase() === p.code.toUpperCase(),
                          )?.title ?? "Custom course"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono">
                          {p.units}u
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCourse(i)}
                          data-testid={`button-remove-${i}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Button
                onClick={onCheck}
                disabled={planned.length === 0 || checkPlan.isPending}
                className="w-full mt-4"
                data-testid="button-check-plan"
              >
                {checkPlan.isPending ? "Checking…" : "Check this plan"}
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <div className="text-sm font-semibold text-foreground">
              Validation
            </div>
            {!result ? (
              <p className="text-sm text-muted-foreground mt-3">
                Run "Check this plan" to validate units, prerequisites, course
                offerings, and overload eligibility.
              </p>
            ) : (
              <div className="space-y-4 mt-4">
                <div>
                  <div className="flex items-baseline justify-between">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      Units
                    </div>
                    <div className="text-sm font-semibold">
                      {result.totalUnits} / {result.unitCap}
                    </div>
                  </div>
                  <Progress
                    value={Math.min(
                      100,
                      (result.totalUnits / result.unitCap) * 100,
                    )}
                    className="mt-2"
                  />
                </div>
                <div className="text-xs text-muted-foreground italic">
                  {result.overloadReason}
                </div>
                <div className="space-y-2 pt-2 border-t border-border">
                  {result.issues.length === 0 ? (
                    <div className="flex items-start gap-2 text-sm text-emerald-700">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                      No issues found. This plan looks safe to register.
                    </div>
                  ) : (
                    result.issues.map((issue, i) => (
                      <IssueRow key={i} issue={issue} />
                    ))
                  )}
                </div>
                {result.coreAreasFulfilled.length > 0 && (
                  <div className="pt-3 border-t border-border">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                      Core areas fulfilled
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {result.coreAreasFulfilled.map((a) => (
                        <Badge key={a} variant="secondary" className="text-xs">
                          {a}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </PageContent>
    </AppShell>
  );
}

function IssueRow({
  issue,
}: {
  issue: {
    severity: string;
    code: string;
    message: string;
    relatedCourse?: string | null;
  };
}) {
  const config: Record<
    string,
    { icon: React.ReactNode; bg: string; border: string }
  > = {
    error: {
      icon: <XCircle className="h-4 w-4 text-destructive" />,
      bg: "bg-destructive/5",
      border: "border-destructive/20",
    },
    warning: {
      icon: <AlertTriangle className="h-4 w-4 text-amber-700" />,
      bg: "bg-amber-50",
      border: "border-amber-200",
    },
    info: {
      icon: <Info className="h-4 w-4 text-blue-700" />,
      bg: "bg-blue-50",
      border: "border-blue-200",
    },
  };
  const c = config[issue.severity] ?? config.info!;
  return (
    <div
      className={`flex gap-2.5 p-3 rounded-md border ${c.border} ${c.bg}`}
    >
      <span className="shrink-0 mt-0.5">{c.icon}</span>
      <div className="text-sm text-foreground/90 leading-snug">
        {issue.message}
      </div>
    </div>
  );
}
