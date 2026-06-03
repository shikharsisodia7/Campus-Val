import { useEffect } from "react";
import { useLocation } from "wouter";
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
  TrendingUp,
  CalendarClock,
  AlertTriangle,
  Award,
  GaugeCircle,
  BookMarked,
  ArrowUpRight,
  Info,
} from "lucide-react";
import { Link } from "wouter";
import { termLabel } from "@/lib/api";

export default function Dashboard() {
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
        subtitle="Personalized academic advising for Santa Clara University students — grounded in real SCU policy, your transcript, and your degree progress."
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
        {summary.currentRegistrationWindow && (
          <Card
            className={
              summary.currentRegistrationWindow.status === "open"
                ? "border-primary/40 bg-primary/5 p-5"
                : "border-amber-300 bg-amber-50/60 p-5"
            }
            data-testid="registration-banner"
          >
            <div className="flex items-start gap-3">
              <CalendarClock
                className={
                  summary.currentRegistrationWindow.status === "open"
                    ? "h-5 w-5 text-primary shrink-0 mt-0.5"
                    : "h-5 w-5 text-amber-700 shrink-0 mt-0.5"
                }
              />
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground">
                    {summary.currentRegistrationWindow.headline}
                  </span>
                  <Badge
                    variant="outline"
                    className="uppercase text-[10px] tracking-wider"
                  >
                    {summary.currentRegistrationWindow.status}
                  </Badge>
                </div>
                <p className="text-sm text-foreground/85 leading-relaxed">
                  {summary.currentRegistrationWindow.detail}
                </p>
                {summary.currentRegistrationWindow.nextMilestone && (
                  <p className="text-xs text-muted-foreground">
                    Next milestone: {summary.currentRegistrationWindow.nextMilestone}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground/80">
                  Source: {summary.currentRegistrationWindow.publishedSource}
                </p>
              </div>
            </div>
          </Card>
        )}

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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <StatCard
            icon={<GaugeCircle className="h-5 w-5" />}
            label="Units toward graduation"
            primary={`${summary.totalUnitsAllSources} / 175`}
            secondary={`${summary.unitsToGraduation} units to go`}
          >
            <Progress value={summary.progressPercent} className="mt-3" />
          </StatCard>
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="Cumulative GPA"
            primary={
              sp?.cumulativeGpa != null
                ? sp.cumulativeGpa.toFixed(3)
                : "—"
            }
            secondary={
              sp?.majorGpa != null
                ? `Major GPA ${sp.majorGpa.toFixed(3)}`
                : "Add your GPA in Profile"
            }
          />
          <StatCard
            icon={<Award className="h-5 w-5" />}
            label="Next-term unit cap"
            primary={`${summary.unitCapNextTerm} units`}
            secondary={summary.canOverloadNextTerm ? "Overload-eligible" : "Standard load"}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="p-6 lg:col-span-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground flex-wrap">
              <CalendarClock className="h-4 w-4 text-primary" />
              <span>
                Today: <span className="capitalize">{summary.todayTerm ?? ""}</span> {summary.todayYear ?? ""}
              </span>
              <span className="text-muted-foreground font-normal">→</span>
              <span>
                Next term: {termLabel(summary.nextTerm)} {summary.nextTermYear}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              {summary.registrationWindowNote}
            </p>
            <div className="mt-4 rounded-md border border-border bg-muted/30 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                Overload eligibility
              </div>
              <p className="text-sm text-foreground/90">
                {summary.overloadReason}
              </p>
            </div>

            <div className="mt-5 space-y-3">
              {summary.upcomingDeadlines.map((d, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-4 py-3 border-t border-border first:border-t-0 first:pt-0"
                >
                  <div>
                    <div className="font-medium text-sm text-foreground">
                      {d.title}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {d.description}
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs">
                    {d.date}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <BookMarked className="h-4 w-4 text-primary" />
              Quick actions
            </div>
            <div className="mt-4 space-y-2">
              {QUICK_ACTIONS.map((a) => (
                <Link
                  key={a.path}
                  href={a.path}
                  data-testid={`quick-${a.path.slice(1)}`}
                  className="flex items-center justify-between gap-3 px-3 py-3 rounded-md border border-border hover:border-primary/40 hover:bg-accent/50 transition-all group"
                >
                  <div>
                    <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                      {a.label}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {a.subtitle}
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </Link>
              ))}
            </div>
          </Card>
        </div>

        {sp && (
          <Card className="p-6">
            <div className="text-sm font-semibold text-foreground mb-4">
              Profile snapshot
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 text-sm">
              <Detail label="College" value={sp.college} />
              <Detail label="Major" value={sp.major} />
              {sp.secondMajor && (
                <Detail label="Second major" value={sp.secondMajor} />
              )}
              {sp.minor && <Detail label="Minor" value={sp.minor} />}
              <Detail
                label="Start"
                value={`${termLabel(sp.startTerm)} ${sp.startYear}`}
              />
              <Detail
                label="Expected grad"
                value={`${termLabel(sp.expectedGradTerm)} ${sp.expectedGradYear}`}
              />
              <Detail
                label="SCU units"
                value={`${sp.unitsCompletedAtSCU}`}
              />
              <Detail
                label="Transferred"
                value={`${sp.unitsTransferredIn} qu`}
              />
              <Detail
                label="Priority reg."
                value={sp.priorityRegistration ? "Yes" : "No"}
              />
              <Detail
                label="Currently in"
                value={`${termLabel(summary.todayTerm ?? sp.currentTerm)} ${summary.todayYear ?? sp.currentYear}`}
              />
            </div>
          </Card>
        )}
      </PageContent>
    </AppShell>
  );
}

const QUICK_ACTIONS = [
  {
    path: "/planner",
    label: "Plan next quarter",
    subtitle: "Add courses, check prereqs and unit cap",
  },
  {
    path: "/advisor",
    label: "Ask the AI advisor",
    subtitle: "Get answers grounded in SCU policy",
  },
  {
    path: "/transfer",
    label: "Evaluate transfer credit",
    subtitle: "87.5-unit cap, post-enrollment rules",
  },
  {
    path: "/gpa",
    label: "Simulate GPA",
    subtitle: "See what next quarter does to your GPA",
  },
];

function StatCard({
  icon,
  label,
  primary,
  secondary,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="mt-3 font-serif text-3xl font-bold text-foreground">
        {primary}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{secondary}</div>
      {children}
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider">
        {label}
      </div>
      <div className="text-sm font-medium text-foreground mt-1 truncate">
        {value}
      </div>
    </div>
  );
}
