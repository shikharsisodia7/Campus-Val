import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDegreeRequirements,
  getGetDegreeRequirementsQueryKey,
  useListRequirementCompletions,
  getListRequirementCompletionsQueryKey,
  useSetRequirementCompletion,
  useResetRequirementCompletions,
} from "@workspace/api-client-react";
import { AppShell, PageContent, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  GraduationCap,
  Landmark,
  BookOpenCheck,
  Loader2,
  ShieldCheck,
  Info,
} from "lucide-react";
import { Link } from "wouter";

/**
 * College-aware degree requirements, served by GET /api/requirements.
 * The server separates University Core vs college/school vs major
 * requirements based on the student's profile college, and every group
 * carries its official SCU source URL.
 *
 * Items SCU defines as "choose from an approved list" can't be auto-checked
 * against completed course codes, so those are tracked as student check-offs
 * persisted server-side (per user, per college, with provenance: marked
 * complete by the student, with a timestamp). Auto-tracked items are always
 * "verified from your completed courses" and never stored as check-offs.
 */

const GROUP_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  university_core: GraduationCap,
  college: Landmark,
  major: BookOpenCheck,
};

export default function CoreReqs() {
  const { data, isLoading, error } = useGetDegreeRequirements(undefined, {
    query: { queryKey: getGetDegreeRequirementsQueryKey() },
  });

  const queryClient = useQueryClient();
  const collegeCode = data?.collegeCode ?? "";
  const { data: completions = [] } = useListRequirementCompletions(
    { collegeCode },
    {
      query: {
        enabled: !!collegeCode,
        queryKey: getListRequirementCompletionsQueryKey({ collegeCode }),
      },
    },
  );

  const invalidateCompletions = () =>
    queryClient.invalidateQueries({
      predicate: (q) =>
        String(q.queryKey[0]).startsWith("/api/requirements/completions"),
    });

  const setCompletion = useSetRequirementCompletion();
  const resetCompletions = useResetRequirementCompletions({
    mutation: { onSuccess: invalidateCompletions },
  });

  // Optimistic per-key overrides so rapid clicks are deterministic: each
  // click flips the *effective* (server ∪ override) state, and while a
  // mutation for a key is in flight further clicks on that key are ignored.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const inFlight = useRef(new Set<string>());

  // key = `${groupId}:${requirementId}`
  const manual = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const c of completions) m[`${c.groupId}:${c.requirementId}`] = true;
    return { ...m, ...overrides };
  }, [completions, overrides]);

  const toggle = (groupId: string, requirementId: string) => {
    if (!collegeCode) return;
    const key = `${groupId}:${requirementId}`;
    if (inFlight.current.has(key)) return;
    const next = !manual[key];
    inFlight.current.add(key);
    setOverrides((o) => ({ ...o, [key]: next }));
    setCompletion.mutate(
      { data: { collegeCode, groupId, requirementId, completed: next } },
      {
        onSettled: async () => {
          inFlight.current.delete(key);
          // Refetch server truth, then drop the override (on error this
          // rolls the card back to the real server state).
          await invalidateCompletions();
          setOverrides((o) => {
            const { [key]: _drop, ...rest } = o;
            return rest;
          });
        },
      },
    );
  };

  const totals = useMemo(() => {
    if (!data) return { total: 0, done: 0 };
    let total = 0;
    let done = 0;
    for (const g of data.groups) {
      for (const item of g.items) {
        total += 1;
        if (
          item.complete ||
          (item.needsVerification && !!manual[`${g.id}:${item.id}`])
        ) {
          done += 1;
        }
      }
    }
    return { total, done };
  }, [data, manual]);

  const pct = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;

  return (
    <AppShell>
      <PageHeader
        title="Degree Requirements"
        subtitle={
          data
            ? `University Core, ${data.college} requirements, and your major — from official SCU sources.`
            : "University Core, college, and major requirements — from official SCU sources."
        }
        right={
          data ? (
            <div className="text-right">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Completed
              </div>
              <div className="font-serif text-3xl font-bold text-primary">
                {totals.done}
                <span className="text-base text-muted-foreground">/{totals.total}</span>
              </div>
            </div>
          ) : undefined
        }
      />
      <PageContent>
        {isLoading ? (
          <Card className="p-12 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading your requirements…
          </Card>
        ) : error || !data ? (
          <Card className="p-8 text-center space-y-3">
            <Info className="h-8 w-8 mx-auto text-muted-foreground" />
            <div className="text-sm text-muted-foreground max-w-md mx-auto">
              We couldn't load your degree requirements. If you haven't finished
              onboarding yet, set up your profile first — your college
              determines which requirements apply.
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/onboarding">Go to onboarding</Link>
            </Button>
          </Card>
        ) : (
          <>
            <Card className="p-5 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    Overall progress
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {data.collegeCode}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {pct}% complete · {totals.total - totals.done} requirements
                    remaining · college: {data.college}
                    {data.major ? ` · major: ${data.major}` : ""}
                  </div>
                </div>
              </div>
              <Progress value={pct} className="h-2" />
            </Card>

            <Card className="p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-primary" />
                University-wide degree rules
              </div>
              <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
                {data.universityRules.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <a
                href={data.universityRules.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                Source: {data.universityRules.sourceLabel}
                <ExternalLink className="h-3 w-3" />
              </a>
            </Card>

            {data.groups.map((group, gi) => {
              const Icon = GROUP_ICON[group.kind] ?? GraduationCap;
              const doneInGroup = group.items.filter(
                (item) =>
                  item.complete ||
                  (item.needsVerification && !!manual[`${group.id}:${item.id}`]),
              ).length;
              return (
                <motion.div
                  key={group.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.05 * gi }}
                  className="space-y-3"
                  data-testid={`req-group-${group.id}`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary" />
                      <h2 className="font-serif text-xl font-bold text-foreground">
                        {group.title}
                      </h2>
                      <Badge variant="outline" className="ml-1">
                        {doneInGroup}/{group.items.length}
                      </Badge>
                    </div>
                    <a
                      href={group.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                      data-testid={`link-source-${group.id}`}
                    >
                      {group.sourceLabel}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {group.academicYear} · verified {group.lastVerified}
                  </div>

                  {group.notes.length > 0 && (
                    <Card className="p-3 bg-muted/30">
                      <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                        {group.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    </Card>
                  )}

                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {group.items.map((item) => {
                      const manualKey = `${group.id}:${item.id}`;
                      const isDone =
                        item.complete ||
                        (item.needsVerification && !!manual[manualKey]);
                      const clickable = item.needsVerification && !item.complete;
                      return (
                        <Card
                          key={item.id}
                          className={`p-4 relative overflow-hidden ${
                            clickable ? "cv-card-hover cursor-pointer" : ""
                          } ${isDone ? "border-primary/40 bg-primary/[0.04]" : ""}`}
                          onClick={
                            clickable
                              ? () => toggle(group.id, item.id)
                              : undefined
                          }
                          data-testid={`req-${group.id}-${item.id}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium text-sm leading-snug">
                              {item.label}
                            </div>
                            {isDone ? (
                              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                            ) : (
                              <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                            )}
                          </div>
                          {item.phase && (
                            <Badge
                              variant="secondary"
                              className="mt-1 text-[10px] py-0 px-1.5"
                            >
                              {item.phase}
                            </Badge>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.description}
                          </p>
                          {item.courses.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {item.courses.map((c) => (
                                <Badge
                                  key={c}
                                  variant={
                                    item.satisfiedBy.includes(c)
                                      ? "default"
                                      : "outline"
                                  }
                                  className="text-[10px] py-0 px-1.5 font-mono"
                                >
                                  {c}
                                </Badge>
                              ))}
                            </div>
                          )}
                          <div className="mt-2 text-[10px] text-muted-foreground">
                            {item.complete
                              ? `Verified from your completed courses: ${item.satisfiedBy.join(", ")}`
                              : item.needsVerification && manual[manualKey]
                                ? "Marked complete by you — not verified against your academic record"
                                : item.needsVerification
                                  ? item.autoTracked
                                    ? "Auto-checks the listed courses — or check off manually if you used an approved-list alternative"
                                    : "Approved-list requirement — check off manually once completed"
                                  : "Auto-tracked from your completed courses"}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}

            <Card className="p-4 text-xs text-muted-foreground">
              Auto-tracked items are verified live against the completed
              courses in your profile. Manual check-offs are saved to your
              CampusVal account (per college — currently {data.collegeCode})
              and are marked as student-asserted, not verified. Requirements
              are drawn from the official SCU Bulletin and school pages linked
              above — always confirm your degree audit in Workday before
              registration.
            </Card>

            <Button
              variant="outline"
              size="sm"
              disabled={resetCompletions.isPending}
              onClick={() => {
                if (confirm("Clear all manually checked requirements for this college?"))
                  resetCompletions.mutate({ params: { collegeCode } });
              }}
              data-testid="button-reset-manual"
            >
              Reset manual check-offs
            </Button>
          </>
        )}
      </PageContent>
    </AppShell>
  );
}
