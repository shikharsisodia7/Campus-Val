import { useQuery } from "@tanstack/react-query";
import { customFetch, ApiError } from "@workspace/api-client-react";
import { AppShell, PageHeader, PageContent } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

interface UsageUserRow {
  userId: string;
  userEmail: string;
  userType: "scu" | "external_reviewer";
  firstSeen: string;
  lastSeen: string;
  eventCount: number;
}

interface UsageFeatureRow {
  feature: string;
  visitCount: number;
  uniqueUsers: number;
}

interface UsageSummary {
  users: UsageUserRow[];
  features: UsageFeatureRow[];
  activeUsersLast7Days: number;
}

const FEATURE_LABEL: Record<string, string> = {
  dashboard: "Dashboard",
  degree_plan: "Degree Plan",
  tentative_degree_plan: "Tentative Degree Plan",
  quarter_plan: "Quarter Plan",
  apr_upload: "APR Upload",
  four_year_plan: "Four-Year Plan",
  plan_controls: "Plan Controls",
  find_courses: "Find Courses",
  workday_handoff: "Workday Handoff",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Admin-only, privacy-preserving usage dashboard — see docs/USAGE_ANALYTICS.md
 * for exactly what is and is not recorded. The server (not this page) is the
 * real access boundary: a non-admin gets a 403 here and this page just shows
 * that plainly rather than pretending the data doesn't exist.
 */
export default function AdminUsagePage() {
  const { data, isLoading, error } = useQuery<UsageSummary>({
    queryKey: ["/api/admin/usage/summary"],
    queryFn: () => customFetch<UsageSummary>("/api/admin/usage/summary"),
    retry: false,
  });

  const forbidden = error instanceof ApiError && error.status === 403;

  return (
    <AppShell>
      <PageHeader
        title="Usage"
        subtitle="Who is using CampusVal, how often, and which high-level features they use. No course codes, grades, or report content are ever recorded."
      />
      <PageContent>
        {isLoading && (
          <Card className="p-4 text-sm text-muted-foreground">Loading…</Card>
        )}

        {forbidden && (
          <Card
            className="flex items-center gap-2 p-4 text-sm text-muted-foreground"
            data-testid="admin-usage-forbidden"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            You don't have access to usage analytics.
          </Card>
        )}

        {!isLoading && !forbidden && error && (
          <Card className="p-4 text-sm text-destructive">
            Couldn't load usage data. Try again later.
          </Card>
        )}

        {data && (
          <div className="space-y-4" data-testid="admin-usage-content">
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">
                Active users, last 7 days
              </div>
              <div className="text-2xl font-semibold">
                {data.activeUsersLast7Days}
              </div>
            </Card>

            <Card className="overflow-x-auto p-4">
              <h2 className="mb-3 text-sm font-semibold">Feature usage</h2>
              <table className="w-full min-w-[400px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-muted-foreground">
                    <th className="pb-2 font-medium">Feature</th>
                    <th className="pb-2 font-medium">Visits</th>
                    <th className="pb-2 font-medium">Unique users</th>
                  </tr>
                </thead>
                <tbody>
                  {data.features.map((f) => (
                    <tr key={f.feature} className="border-b border-border/40">
                      <td className="py-1.5">
                        {FEATURE_LABEL[f.feature] ?? f.feature}
                      </td>
                      <td className="py-1.5">{f.visitCount}</td>
                      <td className="py-1.5">{f.uniqueUsers}</td>
                    </tr>
                  ))}
                  {data.features.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-3 text-muted-foreground">
                        No usage recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>

            <Card className="overflow-x-auto p-4">
              <h2 className="mb-3 text-sm font-semibold">Users</h2>
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-muted-foreground">
                    <th className="pb-2 font-medium">User</th>
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium">First seen</th>
                    <th className="pb-2 font-medium">Last seen</th>
                    <th className="pb-2 font-medium">Events</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.userId} className="border-b border-border/40">
                      <td className="py-1.5">{u.userEmail}</td>
                      <td className="py-1.5">
                        <Badge variant={u.userType === "scu" ? "default" : "secondary"}>
                          {u.userType === "scu" ? "SCU" : "External reviewer"}
                        </Badge>
                      </td>
                      <td className="py-1.5">{fmtDate(u.firstSeen)}</td>
                      <td className="py-1.5">{fmtDate(u.lastSeen)}</td>
                      <td className="py-1.5">{u.eventCount}</td>
                    </tr>
                  ))}
                  {data.users.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-3 text-muted-foreground">
                        No users recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          </div>
        )}
      </PageContent>
    </AppShell>
  );
}
