import { useState } from "react";
import {
  useGetProfile,
  getGetProfileQueryKey,
  useListGraduationMajors,
  useListGraduationMinors,
} from "@workspace/api-client-react";
import { AppShell, PageContent, PageHeader } from "@/components/AppShell";
import { AcademicProgress } from "@/components/AcademicProgress";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  FlaskConical,
  Plus,
  X,
  Plane,
  Info,
  GraduationCap,
  BookPlus,
} from "lucide-react";
import { creditedCourses, loadStoredExams } from "@/lib/apib";

interface ScenarioResult {
  addedMajorCourses: { code: string; title: string; units: number; major: string }[];
  approxAddedUnits: number;
  studyAbroad: boolean;
  studyAbroadTerm: string | null;
  consideredMinors: string[];
  failedMajors: string[];
}

export default function TentativePlansPage() {
  const { data: profile } = useGetProfile({
    query: { retry: false, queryKey: getGetProfileQueryKey() },
  });
  const { data: majorsList } = useListGraduationMajors();
  const { data: minorsList } = useListGraduationMinors();

  const declaredMajors = [
    profile?.major,
    profile?.secondMajor,
    ...(profile?.additionalMajors ?? []),
  ].filter((m): m is string => !!m);
  const declaredMinors = [
    profile?.minor,
    ...(profile?.additionalMinors ?? []),
  ].filter((m): m is string => !!m);

  const [extraMajors, setExtraMajors] = useState<string[]>([]);
  const [extraMinors, setExtraMinors] = useState<string[]>([]);
  const [studyAbroad, setStudyAbroad] = useState(false);
  const [studyAbroadTerm, setStudyAbroadTerm] = useState("Junior year — Fall");
  const [majorDraft, setMajorDraft] = useState("");
  const [minorDraft, setMinorDraft] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ScenarioResult | null>(null);

  const majorOptions = (majorsList?.majors ?? []).filter(
    (m) => !declaredMajors.includes(m.code) && !extraMajors.includes(m.code),
  );
  const minorOptions = (minorsList?.minors ?? []).filter(
    (m) => !declaredMinors.includes(m.code) && !extraMinors.includes(m.code),
  );

  const addMajor = () => {
    if (majorDraft && !extraMajors.includes(majorDraft)) {
      setExtraMajors([...extraMajors, majorDraft]);
      setMajorDraft("");
      setResult(null);
    }
  };
  const addMinor = () => {
    if (minorDraft && !extraMinors.includes(minorDraft)) {
      setExtraMinors([...extraMinors, minorDraft]);
      setMinorDraft("");
      setResult(null);
    }
  };

  const reset = () => {
    setExtraMajors([]);
    setExtraMinors([]);
    setStudyAbroad(false);
    setResult(null);
  };

  const analyze = async () => {
    if (!profile) return;
    setAnalyzing(true);
    try {
      const apIb = creditedCourses(loadStoredExams());
      const apIbCsv = apIb.join(",");
      const completedSet = new Set(
        [
          ...(profile.completedCourseCodes ?? []).map((c) => c.toUpperCase()),
          ...apIb.map((c) => c.toUpperCase()),
        ],
      );

      const failedMajors: string[] = [];

      // Courses already required by the student's *declared* majors — anything
      // the hypothetical majors add on top of this is the real marginal cost.
      const declaredRequired = new Set<string>();
      for (const m of declaredMajors) {
        const reqs = await fetchRequirements(m, apIbCsv);
        if (!reqs) {
          failedMajors.push(majorsList?.majors.find((x) => x.code === m)?.title ?? m);
          continue;
        }
        for (const g of reqs.groups ?? []) {
          if (g.label.startsWith("University Core")) continue;
          for (const c of g.courses ?? []) {
            declaredRequired.add(c.code.toUpperCase());
          }
        }
      }

      const addedMajorCourses: ScenarioResult["addedMajorCourses"] = [];
      const seen = new Set<string>();
      for (const m of extraMajors) {
        const title = majorsList?.majors.find((x) => x.code === m)?.title ?? m;
        const reqs = await fetchRequirements(m, apIbCsv);
        if (!reqs) {
          failedMajors.push(title);
          continue;
        }
        for (const g of reqs.groups ?? []) {
          if (g.label.startsWith("University Core")) continue;
          for (const c of g.courses ?? []) {
            const code = c.code.toUpperCase();
            if (
              declaredRequired.has(code) ||
              completedSet.has(code) ||
              seen.has(code)
            ) {
              continue;
            }
            seen.add(code);
            addedMajorCourses.push({
              code: c.code,
              title: c.title,
              units: c.units,
              major: title,
            });
          }
        }
      }

      const approxAddedUnits = addedMajorCourses.reduce(
        (s, c) => s + (c.units || 0),
        0,
      );

      setResult({
        addedMajorCourses,
        approxAddedUnits,
        studyAbroad,
        studyAbroadTerm: studyAbroad ? studyAbroadTerm : null,
        consideredMinors: extraMinors,
        failedMajors,
      });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="What-If Explorer"
        subtitle="A safe place to try out what-if scenarios — adding a second major, a minor, or a study-abroad term — without touching your profile. Nothing here is saved. To build and save real tentative degree plans, use the Degree Plan workspace."
      />
      <PageContent>
        <Card className="p-4 flex gap-3 bg-secondary/5 border-secondary/30">
          <FlaskConical className="h-5 w-5 text-secondary shrink-0 mt-0.5" />
          <div className="text-sm text-foreground/90">
            <span className="font-semibold">Scratch space.</span> Build a
            hypothetical version of your degree here. Your declared program and
            completed coursework on the right stay exactly as they are — this
            page only estimates what each addition would cost you.
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <GraduationCap className="h-4 w-4 text-primary" />
                  Your real program (read-only)
                </div>
                {(extraMajors.length > 0 ||
                  extraMinors.length > 0 ||
                  studyAbroad) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={reset}
                    data-testid="button-reset-scenario"
                  >
                    Clear scenario
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {declaredMajors.map((m) => (
                  <Badge key={m} className="bg-primary/10 text-primary border-primary/20" variant="outline">
                    {m}
                  </Badge>
                ))}
                {declaredMinors.map((m) => (
                  <Badge key={m} variant="outline" className="text-muted-foreground">
                    {m} minor
                  </Badge>
                ))}
                {declaredMajors.length === 0 && (
                  <span className="text-sm text-muted-foreground">
                    No major declared yet — set one in your profile first.
                  </span>
                )}
              </div>
            </Card>

            <Card className="p-6 space-y-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <BookPlus className="h-4 w-4 text-secondary" />
                Add to your what-if scenario
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                  Try adding a major
                </label>
                <div className="flex gap-2 mt-1.5">
                  <Select value={majorDraft} onValueChange={setMajorDraft}>
                    <SelectTrigger data-testid="select-extra-major" className="flex-1">
                      <SelectValue placeholder="Choose a major to explore…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[360px]">
                      {majorOptions.map((m) => (
                        <SelectItem key={m.code} value={m.code}>
                          {m.title} ({m.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={addMajor} disabled={!majorDraft} data-testid="button-add-major">
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
                {extraMajors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {extraMajors.map((m) => (
                      <Badge
                        key={m}
                        className="bg-secondary/15 text-secondary-foreground border-secondary/30 gap-1"
                        variant="outline"
                      >
                        {majorsList?.majors.find((x) => x.code === m)?.title ?? m}
                        <button
                          onClick={() => {
                            setExtraMajors(extraMajors.filter((x) => x !== m));
                            setResult(null);
                          }}
                          data-testid={`remove-major-${m}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                  Try adding a minor
                </label>
                <div className="flex gap-2 mt-1.5">
                  <Select value={minorDraft} onValueChange={setMinorDraft}>
                    <SelectTrigger data-testid="select-extra-minor" className="flex-1">
                      <SelectValue placeholder="Choose a minor to explore…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[360px]">
                      {minorOptions.map((m) => (
                        <SelectItem key={m.code} value={m.code}>
                          {m.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={addMinor} disabled={!minorDraft} data-testid="button-add-minor">
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
                {extraMinors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {extraMinors.map((m) => (
                      <Badge key={m} variant="outline" className="gap-1">
                        {minorsList?.minors.find((x) => x.code === m)?.title ?? m}
                        <button
                          onClick={() => {
                            setExtraMinors(extraMinors.filter((x) => x !== m));
                            setResult(null);
                          }}
                          data-testid={`remove-minor-${m}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-md border border-border p-3 bg-muted/10">
                <div className="flex items-start gap-2">
                  <Plane className="h-4 w-4 text-primary mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium text-foreground">
                      Study abroad for a term
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Model one quarter away from campus.
                    </div>
                  </div>
                </div>
                <Switch
                  checked={studyAbroad}
                  onCheckedChange={(v) => {
                    setStudyAbroad(v);
                    setResult(null);
                  }}
                  data-testid="switch-study-abroad"
                />
              </div>
              {studyAbroad && (
                <Select value={studyAbroadTerm} onValueChange={setStudyAbroadTerm}>
                  <SelectTrigger data-testid="select-abroad-term">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "Sophomore year — Fall",
                      "Sophomore year — Winter",
                      "Sophomore year — Spring",
                      "Junior year — Fall",
                      "Junior year — Winter",
                      "Junior year — Spring",
                    ].map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Button
                onClick={analyze}
                disabled={
                  !profile ||
                  analyzing ||
                  (extraMajors.length === 0 &&
                    extraMinors.length === 0 &&
                    !studyAbroad)
                }
                data-testid="button-analyze-scenario"
                className="w-full"
              >
                {analyzing ? "Analyzing…" : "Analyze this scenario"}
              </Button>
            </Card>

            {result && (
              <Card className="p-6 space-y-5" data-testid="scenario-result">
                <div className="text-sm font-semibold text-foreground">
                  What this scenario would add
                </div>

                {result.addedMajorCourses.length > 0 ? (
                  <div>
                    <div className="flex items-baseline justify-between mb-2">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                        New required courses ({result.addedMajorCourses.length})
                      </div>
                      <Badge variant="outline" className="font-mono">
                        ≈ {result.approxAddedUnits} extra units
                      </Badge>
                    </div>
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {result.addedMajorCourses.map((c) => (
                        <div
                          key={c.code}
                          className="flex items-baseline gap-2 text-sm border-b border-border/50 pb-1.5"
                          data-testid={`scenario-course-${c.code}`}
                        >
                          <span className="font-mono font-bold text-primary w-24 shrink-0">
                            {c.code}
                          </span>
                          <span className="text-foreground/90 flex-1 min-w-0 truncate">
                            {c.title}
                          </span>
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            {c.major}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      These are courses required by the added major(s) that you
                      haven't completed and that aren't already required by your
                      current program. University Core is excluded since you're
                      already completing it.
                    </p>
                  </div>
                ) : (
                  extraMajors.length > 0 &&
                  result.failedMajors.length === 0 && (
                    <p className="text-sm text-emerald-700">
                      Good news — the major(s) you added share all their
                      requirements with your current program or coursework
                      you've already completed. No new required courses.
                    </p>
                  )
                )}

                {result.failedMajors.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
                    <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
                    <div>
                      <div className="font-semibold mb-1">
                        Couldn't analyze {result.failedMajors.join(", ")}
                      </div>
                      We couldn't load the requirement list for the major(s)
                      above right now, so this estimate may be incomplete. Try
                      again in a moment — don't treat this scenario as final
                      until every major analyzes successfully.
                    </div>
                  </div>
                )}

                {result.consideredMinors.length > 0 && (
                  <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                    <div className="font-semibold text-foreground mb-1">
                      Minors in this scenario
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {result.consideredMinors.map((m) => (
                        <Badge key={m} variant="outline">
                          {minorsList?.minors.find((x) => x.code === m)?.title ?? m}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      SCU minors typically run 5–7 courses. Detailed minor
                      course lists aren't modeled here — confirm exact
                      requirements with the department or your advisor before
                      committing.
                    </p>
                  </div>
                )}

                {result.studyAbroad && (
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 flex gap-2">
                    <Plane className="h-4 w-4 mt-0.5 shrink-0 text-blue-700" />
                    <div>
                      <div className="font-semibold mb-1">
                        Study abroad: {result.studyAbroadTerm}
                      </div>
                      Plan to fulfill University Core or electives abroad — most
                      major upper-division and capstone courses must be taken at
                      SCU. Work with the Global Engagement office and your
                      advisor to pre-approve course equivalencies, and front-load
                      major requirements before you leave so the term away
                      doesn't push back graduation.
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-700" />
                  This is an estimate to help you explore options. Nothing here
                  changes your real plan. Confirm any major/minor declaration or
                  study-abroad term with your faculty advisor.
                </div>
              </Card>
            )}
          </div>

          <AcademicProgress />
        </div>
      </PageContent>
    </AppShell>
  );
}

async function fetchRequirements(
  major: string,
  apIbCsv: string,
): Promise<{ groups: { label: string; courses: { code: string; title: string; units: number }[] }[] } | null> {
  try {
    const params = new URLSearchParams();
    params.set("major", major);
    if (apIbCsv) params.set("apIbCredits", apIbCsv);
    const url = `${import.meta.env.BASE_URL}api/graduation-paths/requirements?${params.toString()}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
