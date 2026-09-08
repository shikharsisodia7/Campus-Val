import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, ApiError } from "@workspace/api-client-react";
import { AppShell, PageHeader, PageContent } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { REPORT_TYPE_OPTIONS } from "@/lib/feedback-features";

interface FeedbackReport {
  id: number;
  email: string | null;
  category: string;
  message: string;
  rating: number | null;
  page: string | null;
  status: string;
  type: string | null;
  subject: string | null;
  feature: string | null;
  pathname: string | null;
  academicItem: string | null;
  officialSourceUrl: string | null;
  proposedCorrection: string | null;
  createdAt: string;
  updatedAt: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

const STATUS_FILTERS = ["All", "OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"] as const;
const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_REVIEW: "In review",
  RESOLVED: "Resolved",
  DISMISSED: "Dismissed",
  new: "Open", // legacy default before this table's status values were revised
};
const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  OPEN: "default",
  IN_REVIEW: "secondary",
  RESOLVED: "outline",
  DISMISSED: "outline",
  new: "default",
};

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  REPORT_TYPE_OPTIONS.map((t) => [t.value, t.label]),
);

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Admin-only review queue for "Report Error / Suggest Changes" submissions
 * (and the plain /feedback page, which shares the same table). Mirrors the
 * access-boundary pattern in admin-usage.tsx: the server is the real
 * boundary (403 for non-admins), this page just reflects that plainly.
 */
export default function AdminFeedbackPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("All");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const queryKey = ["/api/admin/feedback", statusFilter];
  const { data, isLoading, error } = useQuery<{ feedback: FeedbackReport[] }>({
    queryKey,
    queryFn: () =>
      customFetch<{ feedback: FeedbackReport[] }>(
        statusFilter === "All"
          ? "/api/admin/feedback"
          : `/api/admin/feedback?status=${statusFilter}`,
      ),
    retry: false,
  });

  const forbidden = error instanceof ApiError && error.status === 403;

  async function updateStatus(id: number, status: string) {
    await customFetch(`/api/admin/feedback/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
      headers: { "content-type": "application/json" },
    });
    void queryClient.invalidateQueries({ queryKey: ["/api/admin/feedback"] });
  }

  return (
    <AppShell>
      <PageHeader
        title="Feedback"
        subtitle="Error reports, corrections, and suggestions submitted through Report Error / Suggest Changes."
      />
      <PageContent>
        {isLoading && (
          <Card className="p-4 text-sm text-muted-foreground">Loading...</Card>
        )}

        {forbidden && (
          <Card
            className="flex items-center gap-2 p-4 text-sm text-muted-foreground"
            data-testid="admin-feedback-forbidden"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            You don't have access to the feedback queue.
          </Card>
        )}

        {!isLoading && !forbidden && error && (
          <Card className="p-4 text-sm text-destructive">
            Couldn't load feedback. Try again later.
          </Card>
        )}

        {data && (
          <div className="space-y-4" data-testid="admin-feedback-content">
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={statusFilter === s ? "default" : "outline"}
                  onClick={() => setStatusFilter(s)}
                  data-testid={`filter-status-${s.toLowerCase()}`}
                >
                  {s === "All" ? "All" : STATUS_LABEL[s]}
                </Button>
              ))}
            </div>

            <Card className="overflow-x-auto p-4">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-muted-foreground">
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium">Subject</th>
                    <th className="pb-2 font-medium">Feature</th>
                    <th className="pb-2 font-medium">Reporter</th>
                    <th className="pb-2 font-medium">Submitted</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {data.feedback.map((r) => {
                    const expanded = expandedId === r.id;
                    return (
                      <>
                        <tr
                          key={r.id}
                          className="cursor-pointer border-b border-border/40 hover:bg-muted/40"
                          onClick={() => setExpandedId(expanded ? null : r.id)}
                          data-testid={`row-feedback-${r.id}`}
                        >
                          <td className="py-1.5">
                            <Badge variant={STATUS_BADGE_VARIANT[r.status] ?? "outline"}>
                              {STATUS_LABEL[r.status] ?? r.status}
                            </Badge>
                          </td>
                          <td className="py-1.5">{r.type ? (TYPE_LABEL[r.type] ?? r.type) : "-"}</td>
                          <td className="py-1.5">{r.subject ?? "(no subject)"}</td>
                          <td className="py-1.5">{r.feature ?? r.page ?? "-"}</td>
                          <td className="py-1.5">{r.email ?? "-"}</td>
                          <td className="py-1.5">{fmtDate(r.createdAt)}</td>
                          <td className="py-1.5 text-right">
                            {expanded ? (
                              <ChevronUp className="ml-auto h-4 w-4" />
                            ) : (
                              <ChevronDown className="ml-auto h-4 w-4" />
                            )}
                          </td>
                        </tr>
                        {expanded && (
                          <tr key={`${r.id}-detail`} className="border-b border-border/40 bg-muted/20">
                            <td colSpan={7} className="space-y-3 p-4">
                              <div>
                                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Description
                                </div>
                                <p className="whitespace-pre-wrap text-sm">{r.message}</p>
                              </div>
                              {r.proposedCorrection && (
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Proposed correction
                                  </div>
                                  <p className="whitespace-pre-wrap text-sm">{r.proposedCorrection}</p>
                                </div>
                              )}
                              {r.academicItem && (
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Academic item
                                  </div>
                                  <p className="text-sm">{r.academicItem}</p>
                                </div>
                              )}
                              {r.officialSourceUrl && (
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Official source
                                  </div>
                                  <a
                                    href={r.officialSourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                                  >
                                    {r.officialSourceUrl} <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                              )}
                              {r.pathname && (
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Page URL
                                  </div>
                                  <p className="text-sm">{r.pathname}</p>
                                </div>
                              )}
                              <div className="flex flex-wrap items-center gap-3 pt-1">
                                <div className="text-xs text-muted-foreground">
                                  {r.resolvedAt
                                    ? `${STATUS_LABEL[r.status] ?? r.status} by ${r.resolvedBy ?? "unknown"} on ${fmtDate(r.resolvedAt)}`
                                    : "Not yet resolved"}
                                </div>
                                <Select
                                  value={r.status}
                                  onValueChange={(v) => void updateStatus(r.id, v)}
                                >
                                  <SelectTrigger
                                    className="ml-auto w-40"
                                    data-testid={`select-status-${r.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="OPEN">Open</SelectItem>
                                    <SelectItem value="IN_REVIEW">In review</SelectItem>
                                    <SelectItem value="RESOLVED">Resolved</SelectItem>
                                    <SelectItem value="DISMISSED">Dismissed</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                  {data.feedback.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-3 text-muted-foreground">
                        No feedback reports yet.
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