import { useEffect, useState } from "react";
import {
  useCheckPlan,
  useGetProfile,
  getGetProfileQueryKey,
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
import { TERM_OPTIONS, termLabel, getCurrentSCUTerm } from "@/lib/api";
import { creditedCourses, loadStoredExams } from "@/lib/apib";
import { AcademicProgress } from "@/components/AcademicProgress";

interface PlannedCourse {
  code: string;
  units: number;
}

const STORAGE_KEY = "campusval.planner.v1";

export default function Planner() {
  const { data: profile } = useGetProfile({
    query: { retry: false, queryKey: getGetProfileQueryKey() },
  });
  const { data: catalog = [] } = useListCourses({});
  const checkPlan = useCheckPlan();

  const today = getCurrentSCUTerm();
  const [term, setTerm] = useState<string>(today.term);
  const [year, setYear] = useState<number>(today.year);
  const [planned, setPlanned] = useState<PlannedCourse[]>([]);
  const [draftCode, setDraftCode] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<{
    inPlan: { code: string; matched: boolean; group?: string }[];
    missingFromPath: string[];
  } | null>(null);
  const [comparing, setComparing] = useState(false);

  // Note: planner default = today's actual term/year (set above). We
  // intentionally do NOT seed from profile.currentTerm because that's a
  // stored value from onboarding that goes stale when the calendar flips.

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
    const dup = planned.find((p) => p.code.toUpperCase() === code);
    if (dup) {
      setAddError(`${code} is already on this quarter's plan.`);
      return;
    }
    // Courses must come from the SCU catalog — units are read from the
    // official record, never typed in. Unknown codes are rejected honestly
    // rather than added with invented unit values.
    const known = catalog.find((c) => c.code.toUpperCase() === code);
    if (!known) {
      setAddError(
        `${code} isn't in CampusVal's SCU catalog. Double-check the course code against Workday or the Bulletin.`,
      );
      return;
    }
    setPlanned([...planned, { code: known.code, units: known.units }]);
    setDraftCode("");
    setAddError(null);
    setComparison(null);
  };

  const compareToGradPath = async () => {
    if (!profile) return;
    setComparing(true);
    try {
      const apIb = creditedCourses(loadStoredExams());
      const apIbCsv = apIb.join(",");
      const majorsToCheck = [profile.major, profile.secondMajor].filter(
        (m): m is string => !!m,
      );
      const required: { code: string; group: string; major: string }[] = [];
      for (const m of majorsToCheck) {
        const params = new URLSearchParams();
        params.set("major", m);
        if (apIbCsv) params.set("apIbCredits", apIbCsv);
        const url = `${import.meta.env.BASE_URL}api/graduation-paths/requirements?${params.toString()}`;
        const r = await fetch(url);
        if (!r.ok) continue;
        const reqs = await r.json();
        for (const g of reqs.groups ?? []) {
          if (g.label.startsWith("University Core")) continue;
          for (const c of g.courses ?? []) {
            required.push({
              code: c.code.toUpperCase(),
              group:
                majorsToCheck.length > 1 ? `${m} · ${g.label}` : g.label,
              major: m,
            });
          }
        }
      }
      // Dedupe: same course required by both majors → keep first occurrence.
      const seen = new Set<string>();
      const dedup = required.filter((r) => {
        if (seen.has(r.code)) return false;
        seen.add(r.code);
        return true;
      });
      const requiredSet = new Map(dedup.map((r) => [r.code, r.group]));
      const inPlan = planned.map((p) => {
        const upper = p.code.toUpperCase();
        const group = requiredSet.get(upper);
        return { code: p.code, matched: !!group, group };
      });
      const plannedSet = new Set(planned.map((p) => p.code.toUpperCase()));
      const completedSet = new Set([
        ...(profile.completedCourseCodes ?? []).map((c) => c.toUpperCase()),
        ...apIb.map((c) => c.toUpperCase()),
      ]);
      const missingFromPath = dedup
        .filter((r) => !plannedSet.has(r.code) && !completedSet.has(r.code))
        .slice(0, 16)
        .map((r) =>
          majorsToCheck.length > 1 ? `${r.code} (${r.major})` : r.code,
        );
      setComparison({ inPlan, missingFromPath });
    } catch {
      setComparison({ inPlan: [], missingFromPath: [] });
    } finally {
      setComparing(false);
    }
  };

  const removeCourse = (idx: number) => {
    setPlanned(planned.filter((_, i) => i !== idx));
  };

  const onCheck = () => {
    // Merge AP/IB-credited courses into the completed list so the server's
    // prereq checker treats them as satisfied (e.g. AP Calc BC → MATH 11/12).
    const apIb = creditedCourses(loadStoredExams());
    const mergedCompleted = Array.from(
      new Set(
        [...(profile?.completedCourseCodes ?? []), ...apIb].map((c) =>
          c.toUpperCase(),
        ),
      ),
    );
    checkPlan.mutate({
      data: {
        term: term as "fall" | "winter" | "spring" | "summer",
        year,
        college: profile?.college ?? "School of Engineering",
        plannedCourses: planned.map((p) => ({
          code: p.code,
          units: p.units,
        })),
        completedCourseCodes: mergedCompleted,
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
        subtitle="Build a tentative course load. CampusVal checks unit caps, prerequisites, course offerings, and overload eligibility against your profile. When you're ready to pick actual meeting times, choose sections in the Schedule Planner."
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
              <p className="text-[11px] text-muted-foreground mb-2">
                Units come from the official SCU catalog record automatically.
              </p>
              <div className="flex gap-2">
                <Input
                  data-testid="input-add-code"
                  list="course-codes"
                  value={draftCode}
                  onChange={(e) => setDraftCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCourse()}
                  placeholder="Search the SCU catalog — e.g. CSEN 11"
                  className="flex-1 font-mono"
                />
                <datalist id="course-codes">
                  {catalog.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.title}
                    </option>
                  ))}
                </datalist>
                <Button onClick={addCourse} data-testid="button-add-course">
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
              {addError && (
                <div className="mt-2 text-xs text-destructive" data-testid="planner-add-error">
                  {addError}
                </div>
              )}
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
                          )?.title ?? "Not in catalog — verify code"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono">
                          {p.units} {p.units === 1 ? "unit" : "units"}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                <Button
                  onClick={onCheck}
                  disabled={planned.length === 0 || checkPlan.isPending}
                  data-testid="button-check-plan"
                >
                  {checkPlan.isPending ? "Checking…" : "Check this plan"}
                </Button>
                <Button
                  variant="outline"
                  onClick={compareToGradPath}
                  disabled={planned.length === 0 || comparing || !profile}
                  data-testid="button-compare-grad-path"
                >
                  {comparing ? "Comparing…" : "Compare to grad path"}
                </Button>
              </div>
              {comparison && (
                <div className="mt-4 rounded-md border border-border bg-muted/20 p-3 space-y-2 text-sm">
                  <div className="font-semibold text-foreground">
                    Versus your {profile?.major} grad path
                  </div>
                  <div className="space-y-1">
                    {comparison.inPlan.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="font-mono w-20 shrink-0">{p.code}</span>
                        {p.matched ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />
                            Required: {p.group}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">
                            Not in major requirements (elective / Core)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  {comparison.missingFromPath.length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                        Still missing from your major
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {comparison.missingFromPath.map((c) => (
                          <Badge
                            key={c}
                            variant="outline"
                            className="font-mono text-[11px]"
                          >
                            {c}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          <div className="space-y-6">
          <AcademicProgress />
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
                      Units · {standingTitle(result.classStanding)}
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
                  <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground font-mono">
                    <span>
                      Standard cap: {result.standardCap}
                    </span>
                    <span>Approved cap: {result.approvedCap}</span>
                  </div>
                </div>
                {result.requiresAdvisorApproval && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 leading-snug">
                    <strong>Advisor approval required:</strong> this plan is over
                    your standard cap. Even if eligible to overload, you need
                    written dean approval before registration.
                  </div>
                )}
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
        </div>
      </PageContent>
    </AppShell>
  );
}

function standingTitle(s: string): string {
  switch (s) {
    case "freshman":
      return "First Year";
    case "sophomore":
      return "Sophomore";
    case "junior":
      return "Junior";
    case "senior":
      return "Senior";
    default:
      return s;
  }
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
