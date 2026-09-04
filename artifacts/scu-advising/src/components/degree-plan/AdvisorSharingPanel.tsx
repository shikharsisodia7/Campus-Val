import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getApiUrl } from "@/lib/api";
import { UserPlus, X, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PlanShare {
  id: number;
  advisorEmail: string;
  scopes: string[];
  createdAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
  status: "active" | "revoked";
}

const SCOPE_OPTIONS: { value: string; label: string }[] = [
  { value: "degree_plan", label: "Degree Plan" },
  { value: "tentative_degree_plan", label: "Tentative Degree Plan" },
];

async function fetchShares(): Promise<PlanShare[]> {
  const res = await fetch(getApiUrl("/plan-shares"));
  if (!res.ok) throw new Error("Failed to load shares");
  const data = await res.json();
  return data.shares as PlanShare[];
}

/**
 * Student-controlled advisor sharing. The student grants a specific
 * advisor's email read-only access to a scoped subset of their planning
 * data (Degree Plan and/or Tentative Degree Plan), sees exactly who
 * currently has access, and can revoke immediately with no admin
 * intervention. Workday APR is never shareable here — no advisor-facing
 * route reads it yet. See docs/ADVISOR_SHARING.md.
 */
export function AdvisorSharingPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [scopes, setScopes] = useState<string[]>(["degree_plan"]);
  const [submitting, setSubmitting] = useState(false);

  const { data: shares, isLoading } = useQuery({
    queryKey: ["/api/plan-shares"],
    queryFn: fetchShares,
  });

  const activeShares = (shares ?? []).filter((s) => s.status === "active");

  const toggleScope = (value: string) => {
    setScopes((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    );
  };

  const handleShare = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(getApiUrl("/plan-shares"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ advisorEmail: email.trim(), scopes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not share plan");
      }
      setEmail("");
      setScopes(["degree_plan"]);
      queryClient.invalidateQueries({ queryKey: ["/api/plan-shares"] });
      toast({ title: "Advisor access granted" });
    } catch (err: any) {
      toast({
        title: "Couldn't share",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (id: number) => {
    if (!confirm("Revoke this advisor's access immediately?")) return;
    const res = await fetch(getApiUrl(`/plan-shares/${id}`), { method: "DELETE" });
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ["/api/plan-shares"] });
      toast({ title: "Access revoked" });
    }
  };

  return (
    <div className="space-y-4 p-4" data-testid="advisor-sharing-panel">
      <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          Sharing is read-only and reversible any time. Your Workday APR is
          never shared with advisors.
        </span>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Share with an advisor
        </label>
        <Input
          type="email"
          placeholder="advisor@scu.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="input-advisor-email"
        />
        <div className="flex flex-col gap-1.5">
          {SCOPE_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={scopes.includes(opt.value)}
                onChange={() => toggleScope(opt.value)}
                data-testid={`checkbox-scope-${opt.value}`}
              />
              {opt.label}
            </label>
          ))}
        </div>
        <Button
          size="sm"
          className="w-full"
          disabled={!email.trim() || scopes.length === 0 || submitting}
          onClick={handleShare}
          data-testid="button-grant-share"
        >
          <UserPlus className="mr-1.5 h-3.5 w-3.5" />
          Grant access
        </Button>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Who currently has access
        </label>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : activeShares.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No advisors have access to your plan yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {activeShares.map((share) => (
              <li
                key={share.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5 text-xs"
                data-testid={`share-row-${share.id}`}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{share.advisorEmail}</div>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {share.scopes.map((s) => (
                      <Badge key={s} variant="outline" className="text-[9px] px-1 py-0">
                        {SCOPE_OPTIONS.find((o) => o.value === s)?.label ?? s}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 px-1.5 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRevoke(share.id)}
                  data-testid={`button-revoke-${share.id}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
