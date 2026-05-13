import { useState } from "react";
import {
  useCalculateGpa,
  useGetProfile,
  getGetProfileQueryKey,
  useSimulateGpa,
} from "@workspace/api-client-react";
import { AppShell, PageContent, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { GRADE_OPTIONS, gradeLabel } from "@/lib/api";

interface CourseRow {
  code: string;
  units: number;
  grade: string;
}

export default function GpaPage() {
  return (
    <AppShell>
      <PageHeader
        title="GPA Calculator & Simulator"
        subtitle="Check your true GPA on SCU's 4.0 scale, or project what next quarter would do to it."
      />
      <PageContent>
        <Tabs defaultValue="calculate">
          <TabsList>
            <TabsTrigger value="calculate" data-testid="tab-calculate">
              Calculate GPA
            </TabsTrigger>
            <TabsTrigger value="simulate" data-testid="tab-simulate">
              Simulate next quarter
            </TabsTrigger>
          </TabsList>
          <TabsContent value="calculate" className="mt-6">
            <CalculateTab />
          </TabsContent>
          <TabsContent value="simulate" className="mt-6">
            <SimulateTab />
          </TabsContent>
        </Tabs>
      </PageContent>
    </AppShell>
  );
}

function CalculateTab() {
  const [rows, setRows] = useState<CourseRow[]>([
    { code: "", units: 4, grade: "A" },
  ]);
  const calc = useCalculateGpa();

  const update = (i: number, key: keyof CourseRow, val: string | number) => {
    const next = rows.slice();
    next[i] = { ...next[i]!, [key]: val };
    setRows(next);
  };

  const onRun = () => {
    calc.mutate({
      data: {
        courses: rows
          .filter((r) => r.units > 0)
          .map((r) => ({
            code: r.code || "",
            units: r.units,
            grade: r.grade as (typeof GRADE_OPTIONS)[number],
          })),
      },
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="p-6 lg:col-span-2">
        <div className="text-sm font-semibold text-foreground mb-4">
          Add your graded courses
        </div>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-12 gap-2 items-center"
              data-testid={`gpa-row-${i}`}
            >
              <Input
                value={r.code}
                onChange={(e) => update(i, "code", e.target.value)}
                placeholder="MATH 11"
                className="col-span-5 font-mono"
              />
              <Input
                type="number"
                step="0.5"
                value={r.units}
                onChange={(e) => update(i, "units", Number(e.target.value))}
                className="col-span-2"
              />
              <Select
                value={r.grade}
                onValueChange={(v) => update(i, "grade", v)}
              >
                <SelectTrigger className="col-span-4">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRADE_OPTIONS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {gradeLabel(g)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                className="col-span-1"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            variant="outline"
            onClick={() =>
              setRows([...rows, { code: "", units: 4, grade: "A" }])
            }
            data-testid="button-add-row"
          >
            <Plus className="h-4 w-4 mr-1" /> Add course
          </Button>
          <Button onClick={onRun} data-testid="button-calculate">
            Calculate
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
          Result
        </div>
        {!calc.data ? (
          <p className="text-sm text-muted-foreground mt-3">
            Add courses and click Calculate.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="font-serif text-5xl font-bold text-primary">
              {calc.data.gpa.toFixed(3)}
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>
                Total units:{" "}
                <span className="font-semibold text-foreground">
                  {calc.data.totalUnits}
                </span>
              </div>
              <div>
                Graded units:{" "}
                <span className="font-semibold text-foreground">
                  {calc.data.gradedUnits}
                </span>
              </div>
              <div>
                Grade points:{" "}
                <span className="font-semibold text-foreground">
                  {calc.data.totalGradePoints.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="text-xs text-muted-foreground border-t border-border pt-3 leading-relaxed">
              P/NP/IP/W grades don't affect GPA. SCU uses A/A+ = 4.0.
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function SimulateTab() {
  const { data: profile } = useGetProfile({
    query: { retry: false, queryKey: getGetProfileQueryKey() },
  });
  const [currentGpa, setCurrentGpa] = useState<number>(
    profile?.cumulativeGpa ?? 3.5,
  );
  const [currentGradedUnits, setCurrentGradedUnits] = useState<number>(
    profile?.unitsCompletedAtSCU ?? 60,
  );
  const [projected, setProjected] = useState<CourseRow[]>([
    { code: "", units: 4, grade: "A" },
  ]);
  const sim = useSimulateGpa();

  const update = (i: number, key: keyof CourseRow, val: string | number) => {
    const next = projected.slice();
    next[i] = { ...next[i]!, [key]: val };
    setProjected(next);
  };

  const onRun = () => {
    sim.mutate({
      data: {
        currentGpa,
        currentGradedUnits,
        projected: projected.map((p) => ({
          code: p.code || "",
          units: p.units,
          grade: p.grade as (typeof GRADE_OPTIONS)[number],
        })),
      },
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="p-6 lg:col-span-2">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
              Current cumulative GPA
            </label>
            <Input
              type="number"
              step="0.001"
              value={currentGpa}
              onChange={(e) => setCurrentGpa(Number(e.target.value))}
              className="mt-1.5"
              data-testid="input-current-gpa"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
              Total graded units so far
            </label>
            <Input
              type="number"
              step="0.5"
              value={currentGradedUnits}
              onChange={(e) =>
                setCurrentGradedUnits(Number(e.target.value))
              }
              className="mt-1.5"
              data-testid="input-current-graded-units"
            />
          </div>
        </div>
        <div className="mt-6">
          <div className="text-sm font-semibold text-foreground mb-3">
            Projected next-quarter courses
          </div>
          <div className="space-y-2">
            {projected.map((r, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <Input
                  value={r.code}
                  onChange={(e) => update(i, "code", e.target.value)}
                  placeholder="CSEN 12"
                  className="col-span-5 font-mono"
                />
                <Input
                  type="number"
                  step="0.5"
                  value={r.units}
                  onChange={(e) => update(i, "units", Number(e.target.value))}
                  className="col-span-2"
                />
                <Select
                  value={r.grade}
                  onValueChange={(v) => update(i, "grade", v)}
                >
                  <SelectTrigger className="col-span-4">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADE_OPTIONS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {gradeLabel(g)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setProjected(projected.filter((_, j) => j !== i))
                  }
                  className="col-span-1"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <Button
              variant="outline"
              onClick={() =>
                setProjected([
                  ...projected,
                  { code: "", units: 4, grade: "A" },
                ])
              }
            >
              <Plus className="h-4 w-4 mr-1" /> Add course
            </Button>
            <Button onClick={onRun} data-testid="button-simulate">
              Simulate
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
          Projection
        </div>
        {!sim.data ? (
          <p className="text-sm text-muted-foreground mt-3">
            Enter your current GPA and projected grades to simulate.
          </p>
        ) : (
          <div className="mt-3 space-y-4">
            <div>
              <div className="flex items-baseline gap-3">
                <span className="font-serif text-5xl font-bold text-primary">
                  {sim.data.simulatedGpa.toFixed(3)}
                </span>
                <ChangeBadge change={sim.data.gpaChange} />
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                from {sim.data.currentGpa.toFixed(3)} cumulative
              </div>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-relaxed">
              {sim.data.overloadEligibilityNote}
            </div>
            <Badge
              variant={
                sim.data.canOverloadNextTerm ? "default" : "secondary"
              }
              className="text-xs"
            >
              {sim.data.canOverloadNextTerm
                ? "Overload eligible"
                : "Not overload eligible"}
            </Badge>
          </div>
        )}
      </Card>
    </div>
  );
}

function ChangeBadge({ change }: { change: number }) {
  const Icon =
    change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  const color =
    change > 0
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : change < 0
        ? "text-red-700 bg-red-50 border-red-200"
        : "text-muted-foreground bg-muted border-border";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-semibold ${color}`}
    >
      <Icon className="h-3 w-3" />
      {change > 0 ? "+" : ""}
      {change.toFixed(3)}
    </span>
  );
}
