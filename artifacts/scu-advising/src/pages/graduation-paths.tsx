import { useEffect, useMemo, useState } from "react";
import { useGetProfile } from "@workspace/api-client-react";
import { AppShell, PageContent, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Route,
  Calendar,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  BookOpen,
} from "lucide-react";
import { termLabel, getCurrentSCUTerm } from "@/lib/api";
import { creditedCourses, loadStoredExams } from "@/lib/apib";

type PathType = "four_year" | "three_year";

interface MajorOption {
  code: string;
  title: string;
  college: "SOE" | "LSB" | "CAS";
}

interface PathQuarter {
  year: number;
  term: "fall" | "winter" | "spring" | "summer";
  label: string;
  courses: string[];
  plannedUnits: number;
  notes?: string | null;
}

interface PathData {
  type: PathType;
  major: string;
  title: string;
  summary: string;
  feasibilityNote: string;
  averageUnitsPerQuarter: number;
  requiresOverload: boolean;
  quarters: PathQuarter[];
  risks: string[];
}

interface RequirementCourse {
  code: string;
  title: string;
  units: number;
  description: string;
  completed: boolean;
  category: "lower-division" | "upper-division" | "capstone" | "business-core" | "university-core";
}

interface RequirementsData {
  major: string;
  title: string;
  college: "SOE" | "LSB" | "CAS";
  notes: string[];
  totalListed: number;
  completedCount: number;
  groups: { label: string; courses: RequirementCourse[] }[];
}

const COLLEGE_LABEL: Record<MajorOption["college"], string> = {
  SOE: "School of Engineering",
  LSB: "Leavey School of Business",
  CAS: "College of Arts & Sciences",
};

export default function GraduationPaths() {
  const [type, setType] = useState<PathType>("four_year");
  const [major, setMajor] = useState<string>("CSE");
  const [majors, setMajors] = useState<MajorOption[]>([]);
  const { data: profile } = useGetProfile();
  const today = useMemo(() => getCurrentSCUTerm(), []);

  // Double-major support: when a second major is on file, show a toggle so
  // students can flip the entire path view (4yr/3yr grid + requirements list)
  // between their primary and secondary major. We default to the primary.
  const primaryMajor = profile?.major ?? null;
  const secondaryMajor = profile?.secondMajor ?? null;
  const [activeMajorChoice, setActiveMajorChoice] = useState<"primary" | "secondary">("primary");

  // When the profile loads, lock the catalog to whichever side of the toggle
  // is active. This means the page automatically reflects the student's real
  // major(s) instead of staying on the hardcoded CSE default.
  useEffect(() => {
    if (activeMajorChoice === "secondary" && secondaryMajor) {
      setMajor(secondaryMajor);
    } else if (primaryMajor) {
      setMajor(primaryMajor);
    }
  }, [primaryMajor, secondaryMajor, activeMajorChoice]);
  // Merge profile-completed courses with AP/IB credits stored locally so
  // the plan reflects exam credit too.
  const apIbCsv = useMemo(() => creditedCourses(loadStoredExams()).join(","), []);
  const completedCsv = useMemo(
    () => (profile?.completedCourseCodes ?? []).join(","),
    [profile?.completedCourseCodes],
  );
  const completedSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of profile?.completedCourseCodes ?? [])
      set.add(c.toUpperCase().replace(/\s+/g, " "));
    for (const c of apIbCsv.split(",")) {
      const t = c.trim().toUpperCase().replace(/\s+/g, " ");
      if (t) set.add(t);
    }
    return set;
  }, [profile?.completedCourseCodes, apIbCsv]);
  const [data, setData] = useState<PathData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requirements, setRequirements] = useState<RequirementsData | null>(null);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams({ major });
    if (completedCsv) params.set("completed", completedCsv);
    if (apIbCsv) params.set("apIbCredits", apIbCsv);
    const url = `${import.meta.env.BASE_URL}api/graduation-paths/${type}?${params.toString()}`;
    fetch(url)
      .then((r) => r.json())
      .then((j) => setData(j))
      .catch(() => setData(null))
      .finally(() => setIsLoading(false));
  }, [type, major, completedCsv, apIbCsv]);

  useEffect(() => {
    const params = new URLSearchParams({ major });
    if (completedCsv) params.set("completed", completedCsv);
    if (apIbCsv) params.set("apIbCredits", apIbCsv);
    const url = `${import.meta.env.BASE_URL}api/graduation-paths/requirements?${params.toString()}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRequirements(j))
      .catch(() => setRequirements(null));
  }, [major, completedCsv, apIbCsv]);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/graduation-paths/majors`)
      .then((r) => r.json())
      .then((j) => {
        const list: MajorOption[] = (j.majors || []).slice().sort(
          (a: MajorOption, b: MajorOption) =>
            a.college.localeCompare(b.college) || a.title.localeCompare(b.title),
        );
        setMajors(list);
      })
      .catch(() => setMajors([]));
  }, []);

  const grouped = majors.reduce<Record<string, MajorOption[]>>((acc, m) => {
    (acc[m.college] = acc[m.college] || []).push(m);
    return acc;
  }, {});

  return (
    <AppShell>
      <PageHeader
        title="Graduation Paths"
        subtitle="Compare standard 4-year and aggressive 3-year degree plans for any SCU undergraduate major. See unit load per quarter and feasibility risks."
        right={
          <div className="flex gap-2">
            <Button
              variant={type === "four_year" ? "default" : "outline"}
              onClick={() => setType("four_year")}
              data-testid="button-path-4yr"
            >
              4-year (standard)
            </Button>
            <Button
              variant={type === "three_year" ? "default" : "outline"}
              onClick={() => setType("three_year")}
              data-testid="button-path-3yr"
            >
              3-year (aggressive)
            </Button>
          </div>
        }
      />
      <div className="px-6 pt-2 pb-1 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4 text-primary" />
            <span>
              You are currently in{" "}
              <span className="font-semibold text-foreground capitalize">
                {today.term} {today.year}
              </span>
              .
            </span>
          </div>
          {primaryMajor && secondaryMajor && (
            <div className="flex items-center gap-2" data-testid="dual-major-toggle">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Showing
              </span>
              <Button
                size="sm"
                variant={activeMajorChoice === "primary" ? "default" : "outline"}
                onClick={() => setActiveMajorChoice("primary")}
                data-testid="button-major-primary"
              >
                {primaryMajor}
              </Button>
              <Button
                size="sm"
                variant={activeMajorChoice === "secondary" ? "default" : "outline"}
                onClick={() => setActiveMajorChoice("secondary")}
                data-testid="button-major-secondary"
              >
                {secondaryMajor}
              </Button>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            {primaryMajor && secondaryMajor ? "Or browse any major" : "Major"}
          </label>
          <select
            data-testid="select-major"
            value={major}
            onChange={(e) => setMajor(e.target.value)}
            className="mt-1 block w-full md:w-[420px] rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {Object.entries(grouped).map(([college, list]) => (
              <optgroup key={college} label={COLLEGE_LABEL[college as MajorOption["college"]]}>
                {list.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {primaryMajor && secondaryMajor && (
            <p className="text-xs text-muted-foreground mt-1">
              Tip: as a double major, plan ~4-5 quarters past a normal 12-quarter timeline. Many shared core/UC courses count for both — verify with your advisor.
            </p>
          )}
        </div>
      </div>
      <PageContent>
        {isLoading || !data ? (
          <div className="text-muted-foreground">Loading path…</div>
        ) : (
          <>
            <Card className="p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-foreground flex items-center gap-2">
                    <Route className="h-5 w-5 text-primary" />
                    {data.title}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
                    {data.summary}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <Stat
                    icon={<TrendingUp className="h-4 w-4" />}
                    label="Avg units/quarter"
                    value={data.averageUnitsPerQuarter.toFixed(1)}
                  />
                  <Stat
                    icon={<Calendar className="h-4 w-4" />}
                    label="Quarters"
                    value={String(data.quarters.length)}
                  />
                  <Stat
                    icon={<ShieldCheck className="h-4 w-4" />}
                    label="Overload required?"
                    value={data.requiresOverload ? "Yes" : "No"}
                  />
                </div>
              </div>
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 flex gap-2 text-sm text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
                <div>{data.feasibilityNote}</div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="text-sm font-semibold text-foreground mb-4">
                Year × Quarter grid
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[800px] grid grid-cols-3 gap-3">
                  {[1, 2, 3, 4]
                    .filter((y) =>
                      data.quarters.some((q) => q.year === y),
                    )
                    .map((y) => (
                      <div key={y} className="contents">
                        {(["fall", "winter", "spring"] as const).map((t) => {
                          const q = data.quarters.find(
                            (q) => q.year === y && q.term === t,
                          );
                          return (
                            <QuarterCard
                              key={`${y}-${t}`}
                              year={y}
                              term={t}
                              quarter={q}
                              completedSet={completedSet}
                            />
                          );
                        })}
                      </div>
                    ))}
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
                Risks for this path
              </div>
              <ul className="space-y-2">
                {data.risks.map((r, i) => (
                  <li
                    key={i}
                    data-testid={`risk-${i}`}
                    className="text-sm text-foreground/90 flex gap-2"
                  >
                    <span className="text-amber-700">•</span>
                    {r}
                  </li>
                ))}
              </ul>
            </Card>

            {requirements && (
              <Card className="p-6">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                  <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    All courses for {requirements.title}
                  </div>
                  <Badge variant="outline" className="text-xs font-mono">
                    {requirements.completedCount}/{requirements.totalListed} done
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Every required course in this major (not just the suggested per-quarter plan). Courses you've marked completed in onboarding are checked off and skipped from the plan above.
                </p>
                {requirements.notes.length > 0 && (
                  <div className="rounded-md border border-secondary/30 bg-secondary/5 p-3 text-xs text-foreground mb-4">
                    {requirements.notes.map((n, i) => (
                      <div key={i}>{n}</div>
                    ))}
                  </div>
                )}
                <div className="space-y-5">
                  {requirements.groups.map((g) => (
                    <div key={g.label}>
                      <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                        {g.label}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {g.courses.map((c) => {
                          const isCore = c.category === "university-core";
                          const completed = c.completed;
                          return (
                            <div
                              key={c.code}
                              data-testid={`req-course-${c.code.replace(/\s+/g, "-")}`}
                              className={`rounded-md border p-3 ${
                                completed
                                  ? "border-emerald-300 bg-emerald-50/60"
                                  : isCore
                                    ? "border-secondary/30 bg-secondary/5"
                                    : c.category === "business-core"
                                      ? "border-primary/30 bg-primary/5"
                                      : "border-border bg-card"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {isCore ? (
                                      <span className="text-sm font-semibold text-foreground">
                                        {c.code}
                                      </span>
                                    ) : (
                                      <>
                                        <span className="font-mono text-xs font-semibold text-foreground">
                                          {c.code}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground font-mono">
                                          {c.units}u
                                        </span>
                                      </>
                                    )}
                                    {completed && (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                    )}
                                  </div>
                                  {!isCore && (
                                    <div className="text-sm font-medium text-foreground mt-0.5 truncate">
                                      {c.title}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1.5 line-clamp-3">
                                {c.description}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 text-[11px] text-muted-foreground italic">
                  Need help with any of these courses? Ask the AI advisor — it knows the SCU tutoring centers (Drahmann, HUB Writing, Math/CS Tutoring, Engineering Tutoring, Leavey Business Tutoring) and free video resources (Khan Academy, Professor Leonard, 3Blue1Brown).
                </div>
              </Card>
            )}
          </>
        )}
      </PageContent>
    </AppShell>
  );
}

function QuarterCard({
  year,
  term,
  quarter,
  completedSet,
}: {
  year: number;
  term: "fall" | "winter" | "spring";
  quarter:
    | {
        label: string;
        courses: string[];
        plannedUnits: number;
        notes?: string | null;
      }
    | undefined;
  completedSet: Set<string>;
}) {
  if (!quarter) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 bg-muted/10">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
          Y{year} {termLabel(term)}
        </div>
        <div className="text-xs text-muted-foreground mt-2 italic">
          (not in plan)
        </div>
      </div>
    );
  }
  const overload = quarter.plannedUnits > 20;
  return (
    <div
      data-testid={`quarter-y${year}-${term}`}
      className={`rounded-md border p-3 ${
        overload
          ? "border-amber-300 bg-amber-50"
          : "border-border bg-muted/10"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
          {quarter.label}
        </div>
        <Badge
          variant={overload ? "destructive" : "outline"}
          className="text-[10px] font-mono"
        >
          {quarter.plannedUnits}u
        </Badge>
      </div>
      <div className="mt-2 space-y-1">
        {quarter.courses.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">
            (electives / open)
          </div>
        ) : (
          quarter.courses.map((c) => {
            const isCompleted = completedSet.has(
              c.toUpperCase().replace(/\s+/g, " "),
            );
            return (
              <div
                key={c}
                data-testid={`gp-course-${c.replace(/\s+/g, "-")}`}
                className={`font-mono text-xs px-1.5 py-1 rounded border flex items-center gap-1.5 ${
                  isCompleted
                    ? "bg-emerald-50 border-emerald-300 text-emerald-800 line-through"
                    : "bg-background border-border/60"
                }`}
              >
                {isCompleted && (
                  <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0 no-underline" />
                )}
                <span>{c}</span>
              </div>
            );
          })
        )}
      </div>
      {quarter.notes && (
        <div className="mt-2 text-[11px] text-amber-900 leading-snug">
          {quarter.notes}
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="font-serif text-lg font-bold text-foreground mt-0.5">
        {value}
      </div>
    </div>
  );
}
