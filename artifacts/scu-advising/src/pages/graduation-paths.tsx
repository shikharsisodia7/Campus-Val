import { useEffect, useState } from "react";
import { useGetGraduationPath } from "@workspace/api-client-react";
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
} from "lucide-react";
import { termLabel } from "@/lib/api";

type PathType = "four_year" | "three_year";

interface MajorOption {
  code: string;
  title: string;
  college: "SOE" | "LSB" | "CAS";
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
  const { data, isLoading } = useGetGraduationPath(type, { major });

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
      <div className="px-6 pt-2 pb-1">
        <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Major
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
          quarter.courses.map((c) => (
            <div
              key={c}
              className="font-mono text-xs px-1.5 py-1 rounded bg-background border border-border/60"
            >
              {c}
            </div>
          ))
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
