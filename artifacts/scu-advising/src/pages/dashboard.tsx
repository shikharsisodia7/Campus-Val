import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  useGetDashboardSummary,
  useGetProfile,
  getGetProfileQueryKey,
} from "@workspace/api-client-react";
import { AppShell, PageContent, PageHeader } from "@/components/AppShell";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Map,
  CalendarRange,
  FlaskConical,
  AlertTriangle,
  ChevronRight,
  FileSpreadsheet,
  ClipboardCheck,
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
        <div className="mx-auto max-w-[var(--cv-page-max)] px-4 py-8 text-sm text-muted-foreground sm:px-6 lg:px-8" role="status">
          Loading dashboard…
        </div>
      </AppShell>
    );
  }

  const sp = summary.profile;

  return (
    <AppShell>
      <PageHeader
        title={sp ? `Welcome back, ${sp.name.split(" ")[0]}` : "CampusVal"}
        subtitle="A planning workspace under pilot evaluation. Workday, the Registrar, and the SCU Bulletin remain the official record for your academic progress — verify important decisions with your advisor."
        right={
          <Badge
            variant="outline"
            className="shrink-0 bg-card px-2.5 py-1 text-xs"
            data-testid="badge-classification"
          >
            {summary.classification}
          </Badge>
        }
      />
      <PageContent>
        {summary.warnings.length > 0 && (
          <div
            role="note"
            className="flex items-start gap-3 rounded-lg border border-warning-border bg-warning-surface px-4 py-3"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <div className="space-y-1">
              <div className="text-sm font-semibold text-foreground">Check before planning further</div>
              {summary.warnings.map((w, i) => (
                <p key={i} className="text-sm text-foreground/90">
                  {w}
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <section aria-labelledby="dashboard-continue">
            <h2 id="dashboard-continue" className="cv-section-title mb-2">
              Continue planning
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {[...KEY_WORKFLOWS, ...REFERENCE_LINKS].map((w) => {
                const Icon = w.icon;
                return (
                  <li key={w.path}>
                    <Link
                      href={w.path}
                      data-testid={`quick-${w.path.slice(1)}`}
                      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground">{w.label}</div>
                        <div className="cv-meta">{w.subtitle}</div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <ReportIssueDialog
              trigger={
                <button
                  type="button"
                  data-testid="dashboard-report-error"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Flag className="h-3 w-3" aria-hidden="true" />
                  Something not right? Report Error / Suggest Changes
                </button>
              }
            />
          </section>

          <div className="space-y-5">
            {sp && (
              <section
                aria-labelledby="dashboard-planning"
                className="rounded-lg border border-border bg-card p-4"
                data-testid="dashboard-plan-summary"
              >
                <h2 id="dashboard-planning" className="cv-panel-title mb-3">
                  What you&apos;re planning
                </h2>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
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
                  {sp.secondMajor && <Detail label="Second major" value={sp.secondMajor} />}
                  {sp.minor && <Detail label="Minor" value={sp.minor} />}
                  <Detail
                    label="Expected grad"
                    value={`${termLabel(sp.expectedGradTerm)} ${sp.expectedGradYear}`}
                  />
                </dl>
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Units entered in your profile</span>
                    <span className="tabular-nums">{summary.totalUnitsAllSources} / 175 units</span>
                  </div>
                  <Progress value={summary.progressPercent} aria-label="Units entered in your profile, out of 175" />
                </div>
              </section>
            )}

            <section aria-labelledby="dashboard-sources" className="rounded-lg border border-border bg-card p-4">
              <h2 id="dashboard-sources" className="cv-panel-title mb-3">
                Where information comes from
              </h2>
              <dl className="space-y-2.5 text-sm">
                <SourceRow term="Requirements" value="2026–27 Undergraduate Bulletin, with department notes where reviewed" />
                <SourceRow term="Official progress" value="Your Workday Academic Progress Report" />
                <SourceRow term="Section availability" value="Live section availability is not connected. Check seats in Workday." />
              </dl>
            </section>
          </div>
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

const REFERENCE_LINKS = [
  {
    path: "/progress-report",
    label: "View Workday APR",
    subtitle: "Your uploaded Academic Progress Reports, exactly as exported",
    icon: FileSpreadsheet,
  },
  {
    path: "/degree-checksheets",
    label: "Review uploaded documents",
    subtitle: "Department checksheets and advising resources you uploaded",
    icon: ClipboardCheck,
  },
];

function SourceRow({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="cv-eyebrow">{term}</dt>
      <dd className="mt-0.5 text-sm text-foreground/90">{value}</dd>
    </div>
  );
}

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
    <div className="min-w-0">
      <dt className="cv-eyebrow">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{value}</dd>
      {hint && (
        <dd className="mt-0.5 text-[11px] leading-snug text-muted-foreground" data-testid={hintTestId}>
          {hint}
        </dd>
      )}
    </div>
  );
}
