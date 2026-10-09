import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleDashed, CircleHelp, MoreHorizontal, PencilLine, ScrollText } from "lucide-react";
import {
  getGetDegreeCompletionAssessmentQueryKey,
  useCorrectDegreeCompletionItem,
  useGetDegreeCompletionAssessment,
  useResetDegreeCompletionItem,
  type DegreeCompletionAssessment as AssessmentResponse,
  type DegreeCompletionItem,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { aprCategoryLabel, formatUploadDate } from "./apr-format";

/**
 * Degree Completion Assessment: CampusVal's editable PLANNING interpretation of
 * the student's own uploaded APRs ("what appears to remain?"). One model, one
 * query, shown on the APR page, Degree Planning and Quarter Planning.
 *
 * It is never the APR and never official: Workday is the definitive reference
 * for degree completion. Statuses are always written in words (an icon is
 * additive, colour is additive). Laid out as a list, not a wide table, so it
 * reads the same on a phone.
 */

type Effective = DegreeCompletionItem["effective"];

export const EFFECTIVE_LABEL: Record<Effective, string> = {
  remaining: "Remaining",
  appears_complete: "Appears complete",
  needs_review: "Needs review",
  complete_for_planning: "Complete for planning",
};

const EFFECTIVE_STYLE: Record<Effective, { icon: typeof CheckCircle2; className: string }> = {
  remaining: { icon: CircleDashed, className: "border-rose-200 bg-rose-50 text-rose-900" },
  appears_complete: { icon: CheckCircle2, className: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  needs_review: { icon: CircleHelp, className: "border-amber-200 bg-amber-50 text-amber-900" },
  complete_for_planning: { icon: CheckCircle2, className: "border-emerald-200 bg-emerald-50 text-emerald-900" },
};

const QUIET = { retry: 1, refetchInterval: false, refetchOnWindowFocus: false } as const;

export function useDegreeCompletionAssessment() {
  return useGetDegreeCompletionAssessment({ query: { queryKey: getGetDegreeCompletionAssessmentQueryKey(), ...QUIET } });
}

export interface AssessmentPlanContext {
  /** "tentative": the plan may describe programs no APR covers. */
  planType: "degree" | "tentative";
  planName?: string | null;
}

export function DegreeCompletionAssessment({
  variant = "full",
  planContext,
}: {
  /** full: the APR page section. compact: a collapsible card on a planning page. */
  variant?: "full" | "compact";
  planContext?: AssessmentPlanContext;
}) {
  const query = useDegreeCompletionAssessment();
  const [open, setOpen] = useState(variant === "full");
  const data = query.data as AssessmentResponse | undefined;
  if (!data || !data.enabled) return null;

  const ready = data.documents.filter((d) => d.state === "ready");
  const totals = ready.reduce(
    (t, d) => ({ remaining: t.remaining + (d.summary?.remaining ?? 0), review: t.review + (d.summary?.needsReview ?? 0) }),
    { remaining: 0, review: 0 },
  );

  return (
    <Card className="border-border/70 p-3 sm:p-4" data-testid="degree-completion-assessment" aria-labelledby="dca-heading">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="dca-heading" className="flex flex-wrap items-center gap-2 font-serif text-base font-bold">
            <ScrollText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            Degree Completion Assessment
            <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 font-sans text-[10px] font-medium uppercase tracking-wide text-sky-900">
              Planning aid
            </span>
          </h2>
          <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-muted-foreground" data-testid="dca-disclaimer">
            {data.disclaimer}
          </p>
        </div>
        {variant === "compact" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1 text-xs"
            aria-expanded={open}
            aria-controls="dca-body"
            onClick={() => setOpen((o) => !o)}
            data-testid="dca-toggle"
          >
            {open ? "Hide" : ready.length > 0 ? `Show (${totals.remaining} remaining · ${totals.review} to review)` : "Show"}
            <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          </Button>
        )}
      </div>
      {planContext?.planType === "tentative" && (
        <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-950" data-testid="dca-tentative-note">
          This assessment comes from the APRs you uploaded, which cover the programs you have declared in Workday. It does not assess the
          programs of this Tentative Degree Plan{planContext.planName ? ` (${planContext.planName})` : ""}.
        </p>
      )}
      {open && (
        <div id="dca-body" className="mt-3">
          <AssessmentBody data={data} />
        </div>
      )}
    </Card>
  );
}

function AssessmentBody({ data }: { data: AssessmentResponse }) {
  const docs = data.documents;
  const [selected, setSelected] = useState<number | null>(null);
  const doc = docs.find((d) => d.report.id === selected) ?? docs[0];
  if (!data.available) {
    return <p className="text-xs text-muted-foreground">The assessment is not available right now. Your APRs are unchanged.</p>;
  }
  if (!doc) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="dca-empty">
        Upload your Academic Progress Report on the APR page to see what appears to remain.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {docs.length > 1 && (
        <div role="tablist" aria-label="Academic Progress Reports" className="flex flex-wrap gap-1">
          {docs.map((d) => (
            <Button
              key={d.report.id}
              type="button"
              role="tab"
              aria-selected={d.report.id === doc.report.id}
              size="sm"
              variant={d.report.id === doc.report.id ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setSelected(d.report.id)}
              data-testid={`dca-doc-${d.report.id}`}
            >
              {d.report.label} · {aprCategoryLabel(d.report.category)}
            </Button>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground" data-testid="dca-basis">
        Based on <span className="font-medium text-foreground">{doc.report.label}</span> ({aprCategoryLabel(doc.report.category)}), uploaded{" "}
        {formatUploadDate(doc.report.uploadedAt)}. Your APR itself is never changed.
      </p>
      {doc.state !== "ready" ? (
        <p className="text-xs text-muted-foreground" data-testid="dca-unavailable">
          CampusVal could not read this APR as a requirements table, so it makes no assessment of it. The full APR is still on the APR page.
        </p>
      ) : (
        <DocumentAssessment docId={doc.report.id} programs={doc.programs} orphaned={doc.orphaned} />
      )}
    </div>
  );
}

type Program = AssessmentResponse["documents"][number]["programs"][number];
type Orphan = AssessmentResponse["documents"][number]["orphaned"][number];

function DocumentAssessment({ docId, programs, orphaned }: { docId: number; programs: Program[]; orphaned: Orphan[] }) {
  const [view, setView] = useState<"todo" | "all">("todo");
  const [showHidden, setShowHidden] = useState(false);
  const isAdmin = useIsAdmin();
  const actions = useCorrections(docId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Which items" className="inline-flex rounded-md border border-border p-0.5">
          {(["todo", "all"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              className={`rounded px-2 py-1 text-[11px] font-medium ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              onClick={() => setView(v)}
              data-testid={`dca-view-${v}`}
            >
              {v === "todo" ? "Remaining & needs review" : "All requirements"}
            </button>
          ))}
        </div>
        {actions.error && (
          <p role="alert" className="text-[11px] text-destructive">
            {actions.error}
          </p>
        )}
      </div>
      {programs.map((program) => (
        <ProgramSection
          key={program.key}
          program={program}
          view={view}
          showHidden={showHidden}
          isAdmin={isAdmin}
          actions={actions}
        />
      ))}
      {programs.some((p) => p.summary.hidden > 0) && (
        <button type="button" className="text-[11px] text-muted-foreground underline underline-offset-2" onClick={() => setShowHidden((v) => !v)}>
          {showHidden ? "Don't show hidden items" : `Show hidden items (${programs.reduce((n, p) => n + p.summary.hidden, 0)})`}
        </button>
      )}
      {orphaned.length > 0 && (
        <div className="rounded border border-dashed border-border p-2 text-[11px]" data-testid="dca-orphaned">
          <p className="font-medium">Corrections whose requirement is no longer in this APR</p>
          <ul className="mt-1 space-y-1">
            {orphaned.map((o) => (
              <li key={o.itemKey} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  {o.sourceLabel}
                  {o.note ? ` — “${o.note}”` : ""}
                </span>
                <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={actions.busy} onClick={() => actions.reset(o.itemKey)}>
                  Remove correction
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type Actions = ReturnType<typeof useCorrections>;

function useCorrections(docId: number) {
  const qc = useQueryClient();
  const correct = useCorrectDegreeCompletionItem();
  const resetItem = useResetDegreeCompletionItem();
  const [error, setError] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: getGetDegreeCompletionAssessmentQueryKey() });
  const fail = () => setError("That change could not be saved. Try again.");
  return {
    busy: correct.isPending || resetItem.isPending,
    error,
    save: (itemKey: string, data: { status?: "remaining" | "complete" | null; hidden?: boolean; note?: string | null }) => {
      setError(null);
      correct.mutate({ id: docId, itemKey, data }, { onSuccess: refresh, onError: fail });
    },
    reset: (itemKey: string) => {
      setError(null);
      resetItem.mutate({ id: docId, itemKey }, { onSuccess: refresh, onError: fail });
    },
  };
}

const isHiddenNow = (i: DegreeCompletionItem) => !!i.correction?.hidden && !i.correction.sourceChanged;

function ProgramSection({
  program,
  view,
  showHidden,
  isAdmin,
  actions,
}: {
  program: Program;
  view: "todo" | "all";
  showHidden: boolean;
  isAdmin: boolean;
  actions: Actions;
}) {
  const visible = program.items.filter(
    (i) =>
      (showHidden || !isHiddenNow(i)) &&
      (view === "all" || i.effective === "remaining" || i.effective === "needs_review" || i.correction?.sourceChanged),
  );
  const groups = new Map<string, DegreeCompletionItem[]>();
  for (const item of visible) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  const byGroup = [...groups.entries()];
  const s = program.summary;
  return (
    <section className="rounded-md border border-border/70" aria-label={program.block ?? "Academic Progress Report"} data-testid={`dca-program-${program.key}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-1 border-b border-border/60 bg-muted/30 px-2 py-1.5">
        <h3 className="text-xs font-semibold">{program.block ?? "Academic Progress Report"}</h3>
        <p className="text-[10px] text-muted-foreground" data-testid={`dca-summary-${program.key}`}>
          {s.remaining} remaining · {s.needsReview} need review · {s.appearsComplete} appear complete
          {s.adjusted > 0 ? ` · ${s.adjusted} adjusted by you` : ""}
        </p>
      </div>
      {byGroup.length === 0 ? (
        <p className="px-2 py-2 text-[11px] text-muted-foreground">
          {view === "todo" ? "Nothing appears to remain or need review here. Switch to All requirements to see everything." : "No requirements."}
        </p>
      ) : (
        <div className="divide-y divide-border/60">
          {byGroup.map(([group, items]) => (
            <div key={group} className="px-2 py-1.5">
              <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</h4>
              <ul className="mt-1 space-y-1.5">
                {items.map((item) => (
                  <AssessmentRow key={item.key} item={item} isAdmin={isAdmin} actions={actions} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AssessmentRow({ item, isAdmin, actions }: { item: DegreeCompletionItem; isAdmin: boolean; actions: Actions }) {
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(item.correction?.note ?? "");
  const style = EFFECTIVE_STYLE[item.effective];
  const Icon = style.icon;
  const correction = item.correction;
  return (
    <li className={`rounded border p-1.5 text-xs ${isHiddenNow(item) ? "border-dashed opacity-60" : "border-border/60"}`} data-testid={`dca-item-${item.key}`} data-effective={item.effective}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium leading-snug break-words">{item.label}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${style.className}`} data-testid={`dca-status-${item.key}`}>
              <Icon className="h-3 w-3" aria-hidden="true" />
              {EFFECTIVE_LABEL[item.effective]}
            </span>
            {item.adjusted && (
              <span className="inline-flex items-center gap-0.5 rounded border border-violet-200 bg-violet-50 px-1 py-0.5 text-[10px] font-medium text-violet-900" data-testid={`dca-adjusted-${item.key}`}>
                <PencilLine className="h-3 w-3" aria-hidden="true" /> Adjusted
              </span>
            )}
            {isHiddenNow(item) && <span className="text-[10px] text-muted-foreground">Hidden from the assessment</span>}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="ghost" className="h-7 w-7 shrink-0 px-0" aria-label={`Change the assessment of ${item.label}`} disabled={actions.busy} data-testid={`dca-menu-${item.key}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem onSelect={() => actions.save(item.key, { status: "remaining" })} data-testid={`dca-mark-remaining-${item.key}`}>
              Mark as remaining
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.save(item.key, { status: "complete" })} data-testid={`dca-mark-complete-${item.key}`}>
              Mark complete for planning
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setEditingNote(true)}>{correction?.note ? "Edit my note" : "Add a note"}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.save(item.key, { hidden: !isHiddenNow(item) })}>
              {isHiddenNow(item) ? "Show in the assessment" : "Hide from the assessment"}
            </DropdownMenuItem>
            {correction && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => actions.reset(item.key)} data-testid={`dca-reset-${item.key}`}>
                  Reset to APR-based assessment
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <dl className="mt-1 grid gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground sm:grid-cols-[auto,1fr]">
        <dt className="font-medium">Workday status</dt>
        <dd>{item.aprStatus ?? "none shown"}</dd>
        {item.remaining && (
          <>
            <dt className="font-medium">Remaining (Workday)</dt>
            <dd>{item.remaining}</dd>
          </>
        )}
        {item.registrations.length > 0 && (
          <>
            <dt className="font-medium">Registrations</dt>
            <dd>
              {item.registrations.map((r) => r.text).join("; ")}
            </dd>
          </>
        )}
      </dl>
      <p className="mt-0.5 text-[11px] leading-snug text-foreground/80">
        {item.adjusted ? `You changed this. CampusVal's APR-based result: ${EFFECTIVE_LABEL[automaticEffective(item)]} — ${item.automatic.explanation}` : item.automatic.explanation}
      </p>
      {correction?.sourceChanged && (
        <div className="mt-1 flex flex-wrap items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-1 text-[11px] text-amber-950" data-testid={`dca-source-changed-${item.key}`}>
          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>This row of your APR changed since your correction, so the APR-based result is shown.</span>
          <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={actions.busy} onClick={() => actions.save(item.key, { status: correction.status, hidden: correction.hidden, note: correction.note })}>
            Keep my correction
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={actions.busy} onClick={() => actions.reset(item.key)}>
            Use the APR-based result
          </Button>
        </div>
      )}
      {correction?.note && !editingNote && (
        <p className="mt-1 rounded border border-violet-200 bg-violet-50/60 px-1.5 py-0.5 text-[11px] text-violet-950" data-testid={`dca-note-${item.key}`}>
          <span className="font-semibold">My note:</span> {correction.note}
        </p>
      )}
      {editingNote && (
        <div className="mt-1 space-y-1">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={600} aria-label={`My note on ${item.label}`} className="text-xs" />
          <div className="flex gap-1">
            <Button type="button" size="sm" className="h-7 text-xs" disabled={actions.busy} onClick={() => { actions.save(item.key, { note: note.trim() || null }); setEditingNote(false); }}>
              Save note
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setNote(item.correction?.note ?? ""); setEditingNote(false); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {isAdmin && (
        <details className="mt-1 text-[10px] text-muted-foreground" data-testid={`dca-inspector-${item.key}`}>
          <summary className="cursor-pointer">Source inspector</summary>
          <dl className="mt-0.5 grid grid-cols-[auto,1fr] gap-x-2 font-mono">
            <dt>sheet</dt><dd>{item.trace.sheet} (#{item.trace.sheetIndex})</dd>
            <dt>row</dt><dd>{item.trace.row + 1} (Excel)</dd>
            <dt>block</dt><dd>{item.trace.block ?? "—"}</dd>
            <dt>rule</dt><dd>{item.trace.rule} · v{item.trace.ruleVersion}</dd>
            <dt>confidence</dt><dd>{item.confidence} (automatic {item.automatic.state})</dd>
            <dt>override</dt><dd>{correction ? JSON.stringify({ status: correction.status, hidden: correction.hidden, sourceChanged: correction.sourceChanged }) : "none"}</dd>
            <dt>key</dt><dd>{item.key} / {item.trace.fingerprint}</dd>
          </dl>
        </details>
      )}
    </li>
  );
}

function automaticEffective(item: DegreeCompletionItem): Effective {
  return item.automatic.state === "CLEAR_REMAINING" ? "remaining" : item.automatic.state === "LIKELY_COMPLETE" ? "appears_complete" : "needs_review";
}
