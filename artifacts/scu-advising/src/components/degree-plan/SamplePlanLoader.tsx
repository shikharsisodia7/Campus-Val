import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, ApiError, getGetPlanQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ExternalLink, FileStack, Loader2 } from "lucide-react";
import { useDegreePlanContext } from "./DegreePlanContext";

/**
 * "Load Sample Plan": browse official planning templates by school and
 * program, preview one, and create a NEW Tentative Degree Plan from it.
 *
 * Loading never overwrites anything. The default (and primary) action creates a
 * new Tentative Degree Plan; adding to the plan the student is looking at is a
 * secondary action, and adding to the Degree Plan needs an explicit confirm. A
 * sample plan is a planning template, not a promise that it completes a degree.
 */

interface SamplePlanSummary {
  id: number;
  slug: string;
  version: string;
  school: string;
  schoolName: string;
  program: string;
  title: string;
  description: string | null;
  planLength: "first_year" | "two_year" | "four_year" | "other";
  academicYear: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  sourceReference: string | null;
}
interface Browse {
  schools: { code: string; name: string; programs: { program: string; plans: SamplePlanSummary[] }[] }[];
}
interface PreviewEntry {
  kind: "course" | "placeholder";
  courseCode: string | null;
  title: string | null;
  units: number | null;
  label: string | null;
  note: string | null;
}
interface Preview extends SamplePlanSummary {
  warnings: { code: string; message: string }[];
  terms: Record<string, PreviewEntry[]>;
}
interface LoadResult {
  plan: { id: number; name: string };
  added: number;
  skippedDuplicates: string[];
  warnings: { message: string }[];
  loadedAsPlaceholders: string[];
}

const LENGTH_LABEL: Record<SamplePlanSummary["planLength"], string> = {
  first_year: "First year",
  two_year: "Two years",
  four_year: "Four years",
  other: "Plan",
};
const TERM_LABEL: Record<string, string> = { fall: "Fall", winter: "Winter", spring: "Spring", summer: "Summer" };
const TERM_ORDER = ["fall", "winter", "spring", "summer"];

const errorText = (e: unknown): string => (e instanceof ApiError ? ((e.data as { error?: string } | null)?.error ?? e.message) : "Something went wrong. Try again.");

export function SamplePlanLoader() {
  const { activePlan, setActivePlanId, profile } = useDegreePlanContext();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [school, setSchool] = useState("");
  const [program, setProgram] = useState("");
  const [planId, setPlanId] = useState<number | null>(null);
  const [mode, setMode] = useState<"new_tentative" | "add_to_plan">("new_tentative");
  const [confirmDegree, setConfirmDegree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LoadResult | null>(null);

  const browse = useQuery({
    queryKey: ["/api/sample-plans"],
    queryFn: () => customFetch<Browse>("/api/sample-plans"),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const preview = useQuery({
    queryKey: ["/api/sample-plans", planId],
    queryFn: () => customFetch<Preview>(`/api/sample-plans/${planId}`),
    enabled: open && planId !== null,
  });

  const schools = browse.data?.schools ?? [];
  const programs = schools.find((s) => s.code === school)?.programs ?? [];
  const plans = programs.find((p) => p.program === program)?.plans ?? [];
  const startYear = profile?.currentYear;

  const byYear = useMemo(() => {
    const out = new Map<number, Map<string, PreviewEntry[]>>();
    for (const [key, entries] of Object.entries(preview.data?.terms ?? {})) {
      const [year, term] = key.split(":");
      const y = Number(year);
      if (!out.has(y)) out.set(y, new Map());
      out.get(y)!.set(term!, entries);
    }
    return [...out.entries()].sort(([a], [b]) => a - b);
  }, [preview.data]);

  function reset() {
    setSchool("");
    setProgram("");
    setPlanId(null);
    setMode("new_tentative");
    setConfirmDegree(false);
    setError(null);
    setResult(null);
  }

  async function load() {
    if (planId === null) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { mode, startYear };
      if (mode === "add_to_plan") {
        body.targetPlanId = activePlan?.id;
        body.confirmDegreePlan = confirmDegree;
      }
      const res = await customFetch<LoadResult>(`/api/sample-plans/${planId}/load`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      });
      // Show the outcome first. Switching to the new plan re-renders the workspace (and this
      // dialog with it), so it waits until the student has read the result and closes it.
      setResult(res);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  /** Close the dialog; if a plan was made or changed, refresh the plans and show it. */
  async function close() {
    const done = result;
    setOpen(false);
    if (!done) return;
    queryClient.removeQueries({ queryKey: getGetPlanQueryKey(done.plan.id) });
    await queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/plans") });
    setActivePlanId(done.plan.id);
  }

  const canAddToActive = !!activePlan;
  const addingToDegree = mode === "add_to_plan" && activePlan?.planType === "degree";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 shrink-0 gap-1 text-xs"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        data-testid="button-load-sample-plan"
      >
        <FileStack className="h-3.5 w-3.5" /> Load Sample Plan
      </Button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : void close())}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" data-testid="sample-plan-dialog">
          <DialogHeader>
            <DialogTitle>Load Sample Plan</DialogTitle>
            <DialogDescription>
              Official first-year and multi-year plans from SCU schools and departments. A sample plan is a planning template, not a guarantee that it completes your degree.
            </DialogDescription>
          </DialogHeader>

          {result ? (
            <div className="space-y-2 text-sm" data-testid="sample-plan-result" role="status">
              <p className="font-medium">
                {mode === "new_tentative" ? `Created “${result.plan.name}”.` : `Added to “${result.plan.name}”.`} {result.added} item{result.added === 1 ? "" : "s"} added.
              </p>
              {result.skippedDuplicates.length > 0 && <p className="text-muted-foreground">Already in the plan, skipped: {result.skippedDuplicates.join(", ")}.</p>}
              {result.loadedAsPlaceholders.length > 0 && (
                <p className="text-amber-800">Not in the CampusVal catalog, so loaded as placeholders with the source&apos;s wording: {result.loadedAsPlaceholders.join(", ")}.</p>
              )}
              <p className="text-xs text-muted-foreground">Your Degree Plan was not changed. Your copy is independent of the sample plan.</p>
              <DialogFooter>
                <Button onClick={() => void close()} data-testid="sample-plan-done">Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              {browse.isLoading && <p className="text-sm text-muted-foreground">Loading sample plans…</p>}
              {browse.isError && (
                <p role="alert" className="text-sm text-destructive">Sample plans couldn&apos;t be loaded right now.</p>
              )}
              {browse.data && schools.length === 0 && <p className="text-sm text-muted-foreground" data-testid="sample-plan-empty">No sample plans have been published yet.</p>}

              {schools.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="sample-school" className="text-xs">School or college</Label>
                    <Select
                      value={school}
                      onValueChange={(v) => {
                        setSchool(v);
                        setProgram("");
                        setPlanId(null);
                      }}
                    >
                      <SelectTrigger id="sample-school" className="mt-1" data-testid="sample-plan-school">
                        <SelectValue placeholder="Choose a school" />
                      </SelectTrigger>
                      <SelectContent>
                        {schools.map((s) => (
                          <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="sample-program" className="text-xs">Program</Label>
                    <Select
                      value={program}
                      disabled={!school}
                      onValueChange={(v) => {
                        setProgram(v);
                        setPlanId(null);
                      }}
                    >
                      <SelectTrigger id="sample-program" className="mt-1" data-testid="sample-plan-program">
                        <SelectValue placeholder={school ? "Choose a program" : "Choose a school first"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {programs.map((p) => (
                          <SelectItem key={p.program} value={p.program}>{p.program} ({p.plans.length})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {plans.length > 0 && (
                <fieldset className="space-y-1.5" data-testid="sample-plan-list">
                  <legend className="mb-1 text-xs font-medium">Plan</legend>
                  {plans.map((p) => (
                    <label
                      key={p.id}
                      className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-xs ${planId === p.id ? "border-primary bg-primary/5" : "border-border"}`}
                    >
                      <input type="radio" name="sample-plan" className="mt-0.5" checked={planId === p.id} onChange={() => setPlanId(p.id)} data-testid={`sample-plan-choice-${p.id}`} />
                      <span className="min-w-0">
                        <span className="font-medium">{p.title}</span>
                        <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
                          <Badge variant="secondary" className="text-[10px]">{LENGTH_LABEL[p.planLength]}</Badge>
                          <Badge variant="outline" className="text-[10px]">{p.academicYear ?? p.version}</Badge>
                        </span>
                        {p.sourceReference && <span className="block text-muted-foreground">{p.sourceReference}</span>}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}

              {planId !== null && preview.isLoading && <p className="text-sm text-muted-foreground">Loading preview…</p>}
              {preview.data && (
                <section className="space-y-2 rounded-md border bg-muted/20 p-2.5" aria-label="Preview" data-testid="sample-plan-preview">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{preview.data.program} — {preview.data.title}</h3>
                    {preview.data.sourceUrl && (
                      <a href={preview.data.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline underline-offset-2">
                        Source <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Source: {preview.data.sourceLabel ?? "not stated"} · version {preview.data.version}. A planning template, not an official guarantee of completion.
                  </p>
                  <div className="space-y-2">
                    {byYear.map(([year, terms]) => (
                      <div key={year}>
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Year {year}</h4>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {TERM_ORDER.filter((t) => terms.has(t)).map((t) => (
                            <div key={t} className="rounded border bg-card p-1.5">
                              <div className="text-[11px] font-medium">{TERM_LABEL[t]}</div>
                              <ul className="mt-0.5 space-y-0.5 text-[11px]">
                                {terms.get(t)!.map((e, i) => (
                                  <li key={i} className={e.kind === "placeholder" ? "italic text-muted-foreground" : ""}>
                                    {e.kind === "course" ? (
                                      <>
                                        <span className="font-mono">{e.courseCode}</span> {e.title}
                                      </>
                                    ) : (
                                      e.label
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {preview.data.warnings.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-amber-800" data-testid="sample-plan-warnings">
                      {preview.data.warnings.map((w, i) => (
                        <li key={i}>{w.message}</li>
                      ))}
                    </ul>
                  )}

                  <div className="space-y-1.5 border-t pt-2 text-xs">
                    <label className="flex items-start gap-2">
                      <input type="radio" name="sample-mode" checked={mode === "new_tentative"} onChange={() => setMode("new_tentative")} data-testid="sample-mode-new" />
                      <span>
                        <span className="font-medium">Create a new Tentative Degree Plan</span> <span className="text-muted-foreground">(recommended; nothing existing is changed)</span>
                      </span>
                    </label>
                    {canAddToActive && (
                      <label className="flex items-start gap-2">
                        <input type="radio" name="sample-mode" checked={mode === "add_to_plan"} onChange={() => setMode("add_to_plan")} data-testid="sample-mode-add" />
                        <span>
                          <span className="font-medium">Add to “{activePlan?.name}”</span> <span className="text-muted-foreground">(courses already in it are skipped; nothing is removed)</span>
                        </span>
                      </label>
                    )}
                    {addingToDegree && (
                      <label className="ml-6 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-1.5 text-amber-900">
                        <input type="checkbox" checked={confirmDegree} onChange={(e) => setConfirmDegree(e.target.checked)} data-testid="sample-confirm-degree" />
                        <span>I understand this adds the sample plan&apos;s courses to my Degree Plan.</span>
                      </label>
                    )}
                  </div>
                </section>
              )}

              {error && <p role="alert" className="text-sm text-destructive" data-testid="sample-plan-error">{error}</p>}
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  onClick={load}
                  disabled={busy || planId === null || !preview.data || (addingToDegree && !confirmDegree)}
                  data-testid="sample-plan-load"
                >
                  {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {mode === "new_tentative" ? "Create Tentative Degree Plan" : "Add to plan"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
