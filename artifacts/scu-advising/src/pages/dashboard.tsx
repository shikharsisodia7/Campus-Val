import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  useGetDashboardSummary,
  useGetProfile,
  getGetProfileQueryKey,
} from "@workspace/api-client-react";
import { AppShell, PageContent, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Map,
  CalendarRange,
  FlaskConical,
  AlertTriangle,
  ArrowUpRight,
  Info,
  GraduationCap,
  Flag,
} from "lucide-react";
import { termLabel } from "@/lib/api";
import { useTrackUsage } from "@/hooks/use-track-usage";
import { ReportIssueDialog } from "@/components/ReportIssueDialog";

export default function Dashboard() {
  useTrackUsage("dashboard");
  const [, setLocation] = useLocation();
  const { data: profile, isLoading: profileLoading, isError: profileError } =
    useGetProfile({
      query: { retry: false, queryKey: getGetProfileQueryKey() },
    });

  useEffect(() => {
    if (!profileLoading && (profileError || !profile)) {
      setLocation("/onboarding");
    }
  }, [profile, profileLoading, profileError, setLocation]);

  const { data: summary, isLoading } = useGetDashboardSummary();

  if (isLoading || !summary) {
    return (
      <AppShell>
        <div className="p-12 text-muted-foreground">Loading dashboard…</div>
      </AppShell>
    );
  }

  const sp = summary.profile;

  return (
    <AppShell>
      <PageHeader
        title={sp ? `Welcome back, ${sp.name.split(" ")[0]}` : "CampusVal"}
        subtitle="CampusVal is an undergraduate planning workspace currently under pilot evaluation. Workday, the Registrar, and the SCU Bulletin remain the official record for your academic progress — verify important decisions with your advisor."
        right={
          <Badge
            variant="secondary"
            className="text-sm px-3 py-1.5 font-medium"
            data-testid="badge-classification"
          >
            {summary.classification}
          </Badge>
        }
      />
      <PageContent>
        <Card className="border-blue-200 bg-blue-50/60 p-4">
          <div className="flex items-start gap-2.5">
            <Info className="h-4 w-4 text-blue-700 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900/90 leading-relaxed">
              <span className="font-semibold">Heads up:</span> Live section
              schedules, instructors, and seats live in Workday / Camino and
              need an SCU login — they're not shown here.
            </div>
          </div>
        </Card>

        {summary.warnings.length > 0 && (
          <Card className="border-destructive/30 bg-destructive/5 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-2">
                <div className="font-semibold text-foreground">
                  Heads up
                </div>
                {summary.warnings.map((w, i) => (
                  <p key={i} className="text-sm text-foreground/90">
                    {w}
                  </p>
                ))}
              </div>
            </div>
          </Card>
        )}

        {sp && (
          <Card className="p-6" data-testid="dashboard-plan-summary">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
              <GraduationCap className="h-4 w-4 text-primary" />
              What you're planning
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 text-sm">
              <Detail label="College" value={sp.college} />
              <Detail
                label="Major"
                value={sp.major}
                hint={
                  summary.declaredMajor &&
                  summary.planningMajor &&
                  summary.declaredMajor !== summary.planningMajor
                    ? `Planning intent — SCU/Workday record: ${summary.declaredMajor}. Verify formal changes with your advisor.`
                    : undefined
                }
                hintTestId="dashboard-planning-major-note"
              />
              {sp.secondMajor && (
                <Detail label="Second major" value={sp.secondMajor} />
              )}
              {sp.minor && <Detail label="Minor" value={sp.minor} />}
              <Detail
                label="Expected grad"
                value={`${termLabel(sp.expectedGradTerm)} ${sp.expectedGradYear}`}
              />
            </div>
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span>Degree progress</span>
                <span>
                  {summary.totalUnitsAllSources} / 175 units
                </span>
              </div>
              <Progress value={summary.progressPercent} />
            </div>
          </Card>
        )}

        <div>
          <div className="text-sm font-semibold text-foreground mb-3">
            Key workflows
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {KEY_WORKFLOWS.map((w) => {
              const Icon = w.icon;
              return (
                <Link
                  key={w.path}
                  href={w.path}
                  data-testid={`quick-${w.path.slice(1)}`}
                  className="flex flex-col gap-3 p-5 rounded-md border border-border hover:border-primary/40 hover:bg-accent/50 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                      {w.label}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {w.subtitle}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          <ReportIssueDialog
            trigger={
              <button
                type="button"
                data-testid="dashboard-report-error"
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Flag className="h-3 w-3" />
                Something not right? Report Error / Suggest Changes
              </button>
            }
          />
        </div>
      </PageContent>
    </AppShell>
  );
}

const KEY_WORKFLOWS = [
  {
    path: "/degree-plan",
    label: "Degree Plan",
    subtitle: "Build or update your academic plan",
    icon: Map,
  },
  {
    path: "/planner",
    label: "Quarter Plan",
    subtitle: "Turn your intended courses into an actual quarter schedule",
    icon: CalendarRange,
  },
  {
    path: "/tentative-plans",
    label: "Tentative Degree Plan",
    subtitle:
      "Workshop another major or planning scenario without changing your main plan",
    icon: FlaskConical,
  },
];

function Detail({
  label,
  value,
  hint,
  hintTestId,
}: {
  label: string;
  value: string;
  hint?: string;
  hintTestId?: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider">
        {label}
      </div>
      <div className="text-sm font-medium text-foreground mt-1 truncate">
        {value}
      </div>
      {hint && (
        <div
          className="mt-0.5 text-[10px] leading-snug text-muted-foreground"
          data-testid={hintTestId}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
