import { useState } from "react";
import {
  useEvaluateTransfer,
  useGetProfile,
  getGetProfileQueryKey,
  useLookupArticulation,
  getLookupArticulationQueryKey,
} from "@workspace/api-client-react";
import { AppShell, PageContent, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  CheckCircle2,
  XCircle,
  ArrowRight,
  Search,
  ExternalLink,
} from "lucide-react";
import { GRADE_OPTIONS, gradeLabel } from "@/lib/api";
import { EXAM_CREDITS } from "@/lib/apib";

interface TransferRow {
  institution: string;
  courseCode: string;
  courseTitle: string;
  units: number;
  unitSystem: "semester" | "quarter";
  grade: string;
  takenAfterSCUEnrollment: boolean;
  institutionType: "community_college" | "four_year" | "ap_ib" | "online";
}

export default function TransferPage() {
  const { data: profile } = useGetProfile({
    query: { retry: false, queryKey: getGetProfileQueryKey() },
  });
  const evaluate = useEvaluateTransfer();
  const [rows, setRows] = useState<TransferRow[]>([
    {
      institution: "",
      courseCode: "",
      courseTitle: "",
      units: 3,
      unitSystem: "semester",
      grade: "A",
      takenAfterSCUEnrollment: false,
      institutionType: "community_college",
    },
  ]);

  const update = <K extends keyof TransferRow>(
    i: number,
    key: K,
    val: TransferRow[K],
  ) => {
    const next = rows.slice();
    next[i] = { ...next[i]!, [key]: val };
    setRows(next);
  };

  const onRun = () => {
    evaluate.mutate({
      data: {
        currentTransferUnits: profile?.unitsTransferredIn ?? 0,
        unitsCompletedAtSCU: profile?.unitsCompletedAtSCU ?? 0,
        courses: rows.map((r) => ({
          institution: r.institution,
          courseCode: r.courseCode,
          courseTitle: r.courseTitle,
          units: r.units,
          unitSystem: r.unitSystem,
          grade: r.grade,
          takenAfterSCUEnrollment: r.takenAfterSCUEnrollment,
          institutionType: r.institutionType,
        })),
      },
    });
  };

  const result = evaluate.data;

  return (
    <AppShell>
      <PageHeader
        title="Transfer Credit Evaluator"
        subtitle="Check whether outside coursework will count at SCU. Handles the 87.5-quarter-unit cap, semester→quarter conversion, and post-enrollment restrictions."
      />
      <PageContent>
        <ApIbReferenceCard />
        <ArticulationLookup />

        {profile && (
          <Card className="p-4 flex items-center gap-4 bg-muted/30">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Your context
            </div>
            <div className="text-sm">
              <span className="font-mono font-semibold">
                {profile.unitsTransferredIn} qu
              </span>{" "}
              already transferred ·{" "}
              <span className="font-mono font-semibold">
                {profile.unitsCompletedAtSCU}
              </span>{" "}
              units at SCU
              {profile.unitsCompletedAtSCU > 0 && (
                <Badge variant="outline" className="ml-3">
                  Post-enrollment rules apply
                </Badge>
              )}
            </div>
          </Card>
        )}

        <Card className="p-6">
          <div className="text-sm font-semibold text-foreground mb-4">
            Courses to evaluate
          </div>
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div
                key={i}
                data-testid={`xfer-row-${i}`}
                className="border border-border rounded-md p-4 space-y-3 bg-muted/10"
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono text-muted-foreground">
                    Course #{i + 1}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    value={r.institution}
                    onChange={(e) => update(i, "institution", e.target.value)}
                    placeholder="Institution (e.g. De Anza College)"
                  />
                  <Input
                    value={r.courseCode}
                    onChange={(e) => update(i, "courseCode", e.target.value)}
                    placeholder="Course code (e.g. MATH 1A)"
                    className="font-mono"
                  />
                </div>
                <Input
                  value={r.courseTitle}
                  onChange={(e) => update(i, "courseTitle", e.target.value)}
                  placeholder="Course title"
                />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Units
                    </label>
                    <Input
                      type="number"
                      step="0.5"
                      value={r.units}
                      onChange={(e) => update(i, "units", Number(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Unit system
                    </label>
                    <Select
                      value={r.unitSystem}
                      onValueChange={(v) =>
                        update(i, "unitSystem", v as "semester" | "quarter")
                      }
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="semester">Semester</SelectItem>
                        <SelectItem value="quarter">Quarter</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Grade
                    </label>
                    <Select
                      value={r.grade}
                      onValueChange={(v) => update(i, "grade", v)}
                    >
                      <SelectTrigger className="mt-1">
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
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Institution type
                    </label>
                    <Select
                      value={r.institutionType}
                      onValueChange={(v) =>
                        update(
                          i,
                          "institutionType",
                          v as TransferRow["institutionType"],
                        )
                      }
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="community_college">
                          Community college
                        </SelectItem>
                        <SelectItem value="four_year">
                          4-year college / university
                        </SelectItem>
                        <SelectItem value="ap_ib">AP / IB exam</SelectItem>
                        <SelectItem value="online">
                          Online / other
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border p-3 bg-background">
                  <div className="text-sm">
                    <div className="font-medium text-foreground">
                      Taken AFTER starting at SCU?
                    </div>
                    <div className="text-xs text-muted-foreground">
                      If yes, requires written advance dean approval.
                    </div>
                  </div>
                  <Switch
                    checked={r.takenAfterSCUEnrollment}
                    onCheckedChange={(v) =>
                      update(i, "takenAfterSCUEnrollment", v)
                    }
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() =>
                setRows([
                  ...rows,
                  {
                    institution: "",
                    courseCode: "",
                    courseTitle: "",
                    units: 3,
                    unitSystem: "semester",
                    grade: "A",
                    takenAfterSCUEnrollment: false,
                    institutionType: "community_college",
                  },
                ])
              }
              data-testid="button-add-xfer"
            >
              <Plus className="h-4 w-4 mr-1" /> Add another course
            </Button>
            <Button onClick={onRun} data-testid="button-evaluate">
              Evaluate transfer
            </Button>
          </div>
        </Card>

        {result && (
          <>
            <Card className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Stat
                  label="Accepted this batch"
                  value={`${result.totalAcceptedQuarterUnits} qu`}
                />
                <Stat
                  label="Running transfer total"
                  value={`${result.runningTransferTotal} / 87.5`}
                >
                  <Progress
                    value={(result.runningTransferTotal / 87.5) * 100}
                    className="mt-3"
                  />
                </Stat>
                <Stat
                  label="Cap remaining"
                  value={`${result.transferCapRemaining} qu`}
                />
              </div>
              {result.cappedAt875 && (
                <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                  <div>
                    You've hit (or exceeded) the 87.5 quarter-unit transfer cap.
                    Additional outside coursework will be lost.
                  </div>
                </div>
              )}
              {result.globalWarnings.map((w, i) => (
                <div
                  key={i}
                  className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"
                >
                  <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5" />
                  <div className="text-amber-900">{w}</div>
                </div>
              ))}
            </Card>

            <div className="space-y-3">
              {result.evaluations.map((ev, i) => (
                <Card
                  key={i}
                  className={`p-5 border-l-4 ${ev.accepted ? "border-l-emerald-500" : "border-l-destructive"}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-mono text-sm font-bold text-foreground">
                        {ev.input.courseCode}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {ev.input.courseTitle} · {ev.input.institution}
                      </div>
                    </div>
                    <Badge
                      variant={ev.accepted ? "default" : "destructive"}
                      className="shrink-0"
                    >
                      {ev.accepted ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Accepted
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3 mr-1" />
                          Rejected
                        </>
                      )}
                    </Badge>
                  </div>
                  <div className="text-sm mt-3 text-foreground/90">
                    <span className="font-semibold">→ {ev.scuQuarterUnits}</span>{" "}
                    SCU quarter units. {ev.reason}
                  </div>
                  {ev.warnings.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {ev.warnings.map((w, j) => (
                        <div
                          key={j}
                          className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2.5 flex gap-2"
                        >
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-700" />
                          {w}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </>
        )}
      </PageContent>
    </AppShell>
  );
}

function ApIbReferenceCard() {
  const ap = EXAM_CREDITS.filter((e) => e.category === "AP");
  const ib = EXAM_CREDITS.filter((e) => e.category === "IB");
  return (
    <Card className="p-6 border-l-4 border-l-secondary/40" data-testid="card-ap-ib-reference">
      <div className="text-sm font-semibold text-foreground flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-secondary" />
        AP / IB credit equivalents
      </div>
      <p className="text-xs text-muted-foreground mt-1.5 mb-4">
        Standard SCU equivalents for the most common AP and IB exams. Score thresholds shown are the minimum to receive course credit. Always verify with the SCU Office of the Registrar before relying on these for graduation planning.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Advanced Placement (AP)
          </div>
          <div className="space-y-1.5">
            {ap.map((e) => (
              <div
                key={e.id}
                className="flex items-start justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium text-foreground truncate">
                    {e.exam}
                  </div>
                  {e.notes && (
                    <div className="text-[10px] text-muted-foreground italic">
                      {e.notes}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-foreground">
                    {e.scuEquivalents.join(", ")}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    score ≥ {e.minScore}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            International Baccalaureate (IB HL)
          </div>
          <div className="space-y-1.5">
            {ib.map((e) => (
              <div
                key={e.id}
                className="flex items-start justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium text-foreground truncate">
                    {e.exam}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-foreground">
                    {e.scuEquivalents.join(", ")}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    score ≥ {e.minScore}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 text-[11px] text-muted-foreground italic">
        Tip: enter your AP/IB scores during onboarding (Step 2). They'll automatically be treated as completed coursework on your graduation path.
      </div>
    </Card>
  );
}

function ArticulationLookup() {
  const [institution, setInstitution] = useState("De Anza College");
  const [courseCode, setCourseCode] = useState("");
  const [submitted, setSubmitted] = useState<{
    institution: string;
    courseCode: string;
  } | null>({ institution: "De Anza College", courseCode: "" });

  const { data, isLoading } = useLookupArticulation(
    {
      institution: submitted?.institution ?? "",
      ...(submitted?.courseCode ? { courseCode: submitted.courseCode } : {}),
    },
    {
      query: {
        enabled: !!submitted,
        queryKey: getLookupArticulationQueryKey({
          institution: submitted?.institution ?? "",
          ...(submitted?.courseCode
            ? { courseCode: submitted.courseCode }
            : {}),
        }),
      },
    },
  );

  const institutions = data?.availableInstitutions ?? [
    "De Anza College",
    "Foothill College",
    "West Valley College",
    "Mission College",
    "Santa Monica College",
  ];

  // Use the per-CC ASSIST.org deep-link from the API (single source of truth).
  // Fall back to a generic ASSIST search URL if the CC isn't found in the response.
  const assistUrl =
    data?.colleges?.find((c) => c.name === institution)?.assistUrl ??
    `https://assist.org/transfer/results?institution=${encodeURIComponent(
      institution,
    )}&agreement=to&agreementType=to&viewBy=major&viewSendingAgreements=false`;

  return (
    <Card className="p-6 border-l-4 border-l-primary/40">
      <div className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Search className="h-4 w-4" />
        Articulation lookup
      </div>
      <p className="text-xs text-muted-foreground mt-1.5 mb-4">
        Browse the {institutions.length} California community colleges that send
        students to SCU. We have a small set of hand-verified course equivalencies
        for the highest-traffic feeder colleges; for everything else, use the
        official ASSIST.org link.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            Institution ({institutions.length} colleges)
          </label>
          <Select value={institution} onValueChange={setInstitution}>
            <SelectTrigger className="mt-1" data-testid="select-articulation-inst">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[400px]">
              {institutions.map((i) => (
                <SelectItem key={i} value={i}>
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            Course code (optional)
          </label>
          <Input
            value={courseCode}
            onChange={(e) => setCourseCode(e.target.value)}
            placeholder="e.g. MATH 1A"
            className="mt-1 font-mono"
            data-testid="input-articulation-code"
          />
        </div>
        <div className="flex items-end">
          <Button
            onClick={() => setSubmitted({ institution, courseCode })}
            data-testid="button-articulation-search"
            className="w-full"
          >
            Look up
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <a
          href={assistUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="link-assist-deeplink"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
        >
          <ExternalLink className="h-3 w-3" />
          Open {institution} → SCU on ASSIST.org (official live data)
        </a>
      </div>

      {submitted && (
        <div className="mt-4">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Searching…</div>
          ) : !data || data.matches.length === 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="font-semibold mb-1">
                No cached articulation records for {submitted.institution}
                {submitted.courseCode ? ` / ${submitted.courseCode}` : ""}.
              </div>
              <div className="text-xs">
                We only cache hand-verified records for a small set of high-traffic
                feeders (De Anza, Foothill, West Valley, Mission, Santa Monica).
                Use the ASSIST.org link above for the official, live mapping for
                this institution.
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground italic">
                {data.sourceNote}
              </div>
              {data.matches.map((m, i) => (
                <div
                  key={i}
                  data-testid={`articulation-match-${i}`}
                  className="rounded-md border border-border bg-muted/10 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono">
                      {m.sourceCourseCode}
                    </Badge>
                    <span className="text-muted-foreground">
                      {m.sourceCourseTitle} ({m.sourceUnits} {m.sourceUnitSystem}{" "}
                      units)
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <Badge className="font-mono">{m.scuEquivalent}</Badge>
                    <span className="text-muted-foreground">
                      ({m.scuQuarterUnits} quarter units)
                    </span>
                  </div>
                  {m.notes && (
                    <div className="mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-2">
                      {m.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Stat({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="font-serif text-3xl font-bold text-foreground mt-1">
        {value}
      </div>
      {children}
    </div>
  );
}
