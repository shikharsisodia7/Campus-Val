/**
 * Planning customization of the requirements sidebar ("Edit requirements").
 *
 * Everything here writes a PLAN-SCOPED overlay through the API. It never
 * changes an SCU requirement, the Workday APR or a Degree Checksheet, and it
 * never changes what counts as complete. Wording is chosen to say so: these are
 * "my edits", "my notes", "my requirements" — not changes to the degree.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateCustomRequirement,
  useDeleteCustomRequirement,
  useResetRequirementEdits,
  useResolveRequirementSourceChange,
  useSaveRequirementEdit,
  useUpdateCustomRequirement,
  type NoteSourceInput,
  type OrphanedCustomization,
  type RequirementCustomizationSummary,
  type RequirementGroup,
  type RequirementItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, ArrowDown, ArrowUp, EyeOff, Pencil, Plus, RotateCcw, Trash2, Undo2 } from "lucide-react";

export const TITLE_MAX = 160;
export const NOTE_MAX = 600;

export interface RequirementsMeta {
  sourceLabel: string;
  policyDecided: boolean;
  summary: RequirementCustomizationSummary;
  orphaned: OrphanedCustomization[];
}

/** The plan's customization calls, with one busy flag and one error message. */
export function useRequirementActions(planId: number) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const save = useSaveRequirementEdit();
  const reset = useResetRequirementEdits();
  const resolve = useResolveRequirementSourceChange();
  const create = useCreateCustomRequirement();
  const update = useUpdateCustomRequirement();
  const remove = useDeleteCustomRequirement();

  const busy = [save, reset, resolve, create, update, remove].some((m) => m.isPending);

  async function run<T>(call: () => Promise<T>): Promise<boolean> {
    setError(null);
    try {
      await call();
      // The plan's requirements are read from /api/plans/:id/requirements.
      await queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/plans") });
      return true;
    } catch (e) {
      const message = (e as { data?: { error?: string } })?.data?.error;
      setError(message ?? "That didn't save. Your plan is unchanged. Try again.");
      return false;
    }
  }

  return {
    busy,
    error,
    clearError: () => setError(null),
    saveEdit: (sourceKey: string, fields: { title?: string | null; note?: string | null; hidden?: boolean }, noteSource?: NoteSourceInput) =>
      run(() => save.mutateAsync({ id: planId, data: { sourceKey, ...fields, ...(noteSource ? { noteSource } : {}) } })),
    resetOne: (sourceKey: string) => run(() => reset.mutateAsync({ id: planId, params: { sourceKey } })),
    resetAll: () => run(() => reset.mutateAsync({ id: planId, params: { all: true } })),
    resolve: (sourceKey: string, action: "keep_mine" | "use_source") =>
      run(() => resolve.mutateAsync({ id: planId, data: { sourceKey, action } })),
    addCustom: (groupKey: string, title: string, note: string | null, courseCodes: string[] = [], noteSource?: NoteSourceInput) =>
      run(() => create.mutateAsync({ id: planId, data: { groupKey, title, note, courseCodes, ...(noteSource ? { noteSource } : {}) } })),
    updateCustom: (
      customId: string,
      patch: { title?: string; note?: string | null; done?: boolean; courseCodes?: string[]; move?: "up" | "down" },
    ) =>
      run(() => update.mutateAsync({ id: planId, customId, data: patch })),
    deleteCustom: (customId: string) => run(() => remove.mutateAsync({ id: planId, customId })),
  };
}
export type RequirementActions = ReturnType<typeof useRequirementActions>;

const parseCodes = (text: string): string[] =>
  text
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

export const customIdOf = (item: RequirementItem): string => item.id.replace(/^custom-/, "");

// ---------------------------------------------------------------------------
// Small, quiet markers. Shown in normal mode too: an edited requirement must
// never pass for the original.
// ---------------------------------------------------------------------------

export function CustomizationMarks({ item }: { item: RequirementItem }) {
  const c = item.customization;
  if (!c) return null;
  const chip = "rounded border px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide";
  return (
    <span className="ml-1.5 inline-flex flex-wrap items-center gap-1 align-middle">
      {c.kind === "custom" && (
        <span className={`${chip} border-violet-200 bg-violet-50 text-violet-700`} data-testid={`mark-custom-${item.id}`}>
          My requirement
        </span>
      )}
      {c.kind === "edit" && c.titleEdited && (
        <span
          className={`${chip} border-sky-200 bg-sky-50 text-sky-700`}
          title={`Source wording: ${c.originalLabel}`}
          data-testid={`mark-edited-${item.id}`}
        >
          My edit
        </span>
      )}
      {c.kind === "edit" && c.hidden && !c.sourceChanged && (
        <span className={`${chip} border-muted-foreground/30 bg-muted text-muted-foreground`} data-testid={`mark-hidden-${item.id}`}>
          Hidden from my plan
        </span>
      )}
    </span>
  );
}

/** "My Note" under a requirement. The student's words, labelled as theirs (never styled like a Department Note). */
export function CustomizationNote({ item }: { item: RequirementItem }) {
  const c = item.customization;
  if (!c || !c.note || c.sourceChanged) return null;
  return (
    <p
      className="mt-1 whitespace-pre-line rounded border border-sky-100 bg-sky-50/60 px-1.5 py-1 text-[10px] leading-relaxed text-sky-900"
      data-testid={`my-note-${item.id}`}
    >
      <span className="font-semibold">{c.kind === "custom" ? "Note: " : "My Note: "}</span>
      {c.note}
      {c.noteSource && (
        <span className="mt-0.5 block text-[9px] text-sky-800/80" data-testid={`my-note-source-${item.id}`}>
          From: {c.noteSource.label}
          {c.noteSource.documentAvailable ? "" : " (source document no longer available)"}
        </span>
      )}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Per-requirement controls (edit mode only)
// ---------------------------------------------------------------------------

export function EditControls({
  item,
  actions,
  onEdit,
}: {
  item: RequirementItem;
  actions: RequirementActions;
  onEdit: () => void;
}) {
  const c = item.customization;
  const key = item.stableKey;
  const btn = "h-8 gap-1 px-2 text-xs";
  if (c?.kind === "custom") {
    return (
      <div className="mt-2 flex flex-wrap gap-1.5" data-testid={`edit-controls-${item.id}`}>
        <Button type="button" size="sm" variant="outline" className={btn} onClick={onEdit} disabled={actions.busy}>
          <Pencil className="h-3 w-3" /> Edit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={btn}
          onClick={() => actions.updateCustom(customIdOf(item), { move: "up" })}
          disabled={actions.busy}
          data-testid={`move-up-${item.id}`}
        >
          <ArrowUp className="h-3 w-3" /> Move up
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={btn}
          onClick={() => actions.updateCustom(customIdOf(item), { move: "down" })}
          disabled={actions.busy}
          data-testid={`move-down-${item.id}`}
        >
          <ArrowDown className="h-3 w-3" /> Move down
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={btn}
          onClick={() => actions.deleteCustom(customIdOf(item))}
          disabled={actions.busy}
          data-testid={`delete-custom-${item.id}`}
        >
          <Trash2 className="h-3 w-3" /> Delete
        </Button>
      </div>
    );
  }
  if (!key) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" data-testid={`edit-controls-${item.id}`}>
      {!c?.sourceChanged && (
        <Button type="button" size="sm" variant="outline" className={btn} onClick={onEdit} disabled={actions.busy} data-testid={`edit-${item.id}`}>
          <Pencil className="h-3 w-3" /> Edit
        </Button>
      )}
      {c?.hidden && !c.sourceChanged ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={btn}
          onClick={() => actions.saveEdit(key, { hidden: false })}
          disabled={actions.busy}
          data-testid={`restore-${item.id}`}
        >
          <Undo2 className="h-3 w-3" /> Restore
        </Button>
      ) : (
        !c?.sourceChanged && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={btn}
            onClick={() => actions.saveEdit(key, { hidden: true })}
            disabled={actions.busy}
            data-testid={`hide-${item.id}`}
          >
            <EyeOff className="h-3 w-3" /> Hide from my plan
          </Button>
        )
      )}
      {c && !c.sourceChanged && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={btn}
          onClick={() => actions.resetOne(key)}
          disabled={actions.busy}
          data-testid={`reset-${item.id}`}
        >
          <RotateCcw className="h-3 w-3" /> Reset to source
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The source changed after the student edited a requirement
// ---------------------------------------------------------------------------

export function SourceChangedNotice({
  item,
  actions,
  onReview,
}: {
  item: RequirementItem;
  actions: RequirementActions;
  onReview: () => void;
}) {
  if (!item.customization?.sourceChanged) return null;
  return (
    <div
      className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-1.5 py-1 text-[10px] text-amber-900"
      data-testid={`source-changed-${item.id}`}
    >
      <AlertTriangle className="h-3 w-3 shrink-0" />
      <span className="flex-1">This source requirement changed since you customized it. Your edit is not applied.</span>
      <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={onReview} disabled={actions.busy}>
        Review
      </Button>
    </div>
  );
}

export function SourceChangeDialog({
  item,
  open,
  onClose,
  actions,
}: {
  item: RequirementItem | null;
  open: boolean;
  onClose: () => void;
  actions: RequirementActions;
}) {
  const c = item?.customization;
  if (!item || !c || !item.stableKey) return null;
  const key = item.stableKey;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="source-change-dialog">
        <DialogHeader>
          <DialogTitle>The source requirement changed</DialogTitle>
          <DialogDescription>
            You customized this requirement in your planning view. CampusVal has not applied that edit to the updated
            requirement.
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-2 text-xs">
          <div>
            <dt className="font-semibold text-muted-foreground">When you edited it{c.sourceVersionAtEdit ? ` (${c.sourceVersionAtEdit})` : ""}</dt>
            <dd>{c.labelAtEdit ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-muted-foreground">Now{c.sourceVersionNow ? ` (${c.sourceVersionNow})` : ""}</dt>
            <dd>{c.originalLabel}</dd>
            {c.originalDescription && <dd className="text-muted-foreground">{c.originalDescription}</dd>}
          </div>
          <div>
            <dt className="font-semibold text-muted-foreground">Your edit</dt>
            <dd>{c.title ? `Title: ${c.title}` : "No new title"}</dd>
            {c.note && <dd className="whitespace-pre-line">Note: {c.note}</dd>}
            {c.hidden && <dd>Hidden from your plan</dd>}
          </div>
        </dl>
        {actions.error && <p role="alert" className="text-xs text-destructive">{actions.error}</p>}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={actions.busy}
            onClick={async () => (await actions.resolve(key, "use_source")) && onClose()}
            data-testid="use-updated-source"
          >
            Use updated source
          </Button>
          <Button
            type="button"
            disabled={actions.busy}
            onClick={async () => (await actions.resolve(key, "keep_mine")) && onClose()}
            data-testid="keep-my-edit"
          >
            Keep my edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit / add dialog
// ---------------------------------------------------------------------------

export function RequirementEditDialog({
  mode,
  item,
  group,
  open,
  onClose,
  actions,
}: {
  mode: "edit" | "add";
  item: RequirementItem | null;
  group: RequirementGroup | null;
  open: boolean;
  onClose: () => void;
  actions: RequirementActions;
}) {
  const c = item?.customization;
  const isCustom = c?.kind === "custom";
  const [title, setTitle] = useState(() => (mode === "add" ? "" : isCustom ? (c?.title ?? "") : (c?.title ?? item?.label ?? "")));
  const [note, setNote] = useState(() => c?.note ?? "");
  const [done, setDone] = useState(() => c?.done ?? false);
  const [courses, setCourses] = useState(() => (item?.courses ?? []).join(", "));
  const [localError, setLocalError] = useState<string | null>(null);

  const original = mode === "edit" && !isCustom ? (c?.originalLabel ?? item?.label ?? "") : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const cleanTitle = title.trim();
    let ok = false;
    if (mode === "add") {
      if (!cleanTitle) return setLocalError("Give your requirement a title.");
      if (!group?.stableKey) return setLocalError("This group can't take your own requirements.");
      ok = await actions.addCustom(group.stableKey, cleanTitle, note.trim() || null, parseCodes(courses));
    } else if (isCustom && item) {
      if (!cleanTitle) return setLocalError("A requirement of your own needs a title.");
      ok = await actions.updateCustom(customIdOf(item), { title: cleanTitle, note: note.trim() || null, done, courseCodes: parseCodes(courses) });
    } else if (item?.stableKey) {
      ok = await actions.saveEdit(item.stableKey, { title: cleanTitle || null, note: note.trim() || null });
    }
    if (ok) onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="requirement-edit-dialog">
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader>
            <DialogTitle>{mode === "add" ? "Add my own requirement" : isCustom ? "Edit my requirement" : "Edit for my planning view"}</DialogTitle>
            <DialogDescription>
              {mode === "add"
                ? `Shown only in this plan${group ? `, under “${group.title}”` : ""}. It is your own note, not an SCU requirement, and it never counts toward your degree.`
                : isCustom
                  ? "Your own note for this plan. It is not an SCU requirement."
                  : "This changes how the requirement reads in this plan only. The SCU requirement, your APR and what counts as complete do not change."}
            </DialogDescription>
          </DialogHeader>
          {original && (
            <p className="rounded border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground" data-testid="edit-original">
              <span className="font-semibold">Source: </span>
              {original}
            </p>
          )}
          <div className="space-y-1">
            <Label htmlFor="req-edit-title" className="text-xs">
              {isCustom || mode === "add" ? "Title" : "My wording"}
            </Label>
            <Input
              id="req-edit-title"
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={original || "e.g. Honors thesis advisor meeting"}
              data-testid="req-edit-title"
            />
            {!isCustom && mode === "edit" && <p className="text-[10px] text-muted-foreground">Leave it as the source wording, or clear it, to keep the original.</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="req-edit-note" className="text-xs">
              My Note <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="req-edit-note"
              value={note}
              maxLength={NOTE_MAX}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              data-testid="req-edit-note"
            />
            <p className="text-right text-[10px] text-muted-foreground">{note.length}/{NOTE_MAX}</p>
          </div>
          {(isCustom || mode === "add") && (
            <div className="space-y-1">
              <Label htmlFor="req-edit-courses" className="text-xs">
                Courses <span className="text-muted-foreground">(optional, SCU catalog codes, comma-separated)</span>
              </Label>
              <Input
                id="req-edit-courses"
                value={courses}
                onChange={(e) => setCourses(e.target.value)}
                placeholder="e.g. HIST 11A, ENGL 1A"
                data-testid="req-edit-courses"
              />
              <p className="text-[10px] text-muted-foreground">Shortcuts to add to your plan. They never make this requirement complete.</p>
            </div>
          )}
          {isCustom && (
            <div className="flex items-center gap-2">
              <Checkbox id="req-edit-done" checked={done} onCheckedChange={(v) => setDone(v === true)} />
              <Label htmlFor="req-edit-done" className="text-xs">
                Mark as done <span className="text-muted-foreground">(my own tracking only)</span>
              </Label>
            </div>
          )}
          {(localError || actions.error) && (
            <p role="alert" className="text-xs text-destructive" data-testid="req-edit-error">
              {localError ?? actions.error}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={actions.busy} data-testid="req-edit-save">
              {actions.busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Group footer, orphan list and the sidebar-level header (edit mode)
// ---------------------------------------------------------------------------

export function AddRequirementButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" className="h-8 w-full justify-start text-xs" onClick={onClick} data-testid="add-custom-requirement">
      <Plus className="mr-1 h-3 w-3" /> Add my own requirement
    </Button>
  );
}

export function SourceLine({ group }: { group: RequirementGroup }) {
  const parts = [group.sourceLabel, group.academicYear, group.lastVerified ? `last verified ${group.lastVerified}` : null].filter(Boolean);
  return (
    <p className="text-[10px] leading-relaxed text-muted-foreground" data-testid={`source-line-${group.kind}`}>
      <span className="font-semibold">Source data: </span>
      {parts.length > 0 ? parts.join(" · ") : "not stated"}
      {group.sourceUrl && (
        <>
          {" · "}
          <a href={group.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            open source
          </a>
        </>
      )}
    </p>
  );
}

export function OrphanedList({ orphaned, actions }: { orphaned: OrphanedCustomization[]; actions: RequirementActions }) {
  if (orphaned.length === 0) return null;
  return (
    <div className="mx-1.5 mb-2 rounded-md border border-amber-200 bg-amber-50/60 p-2 text-[11px]" data-testid="orphaned-customizations">
      <p className="mb-1 font-semibold text-amber-900">Edits that no longer match anything in this plan</p>
      <ul className="space-y-1">
        {orphaned.map((o) => (
          <li key={`${o.entryType}:${o.targetKey}`} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">
              {o.title ?? o.note ?? "(untitled)"}
              <span className="text-muted-foreground">
                {" "}
                — {o.reason === "program_not_in_plan" ? "that program isn't in this plan" : "the source no longer lists it"}
              </span>
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0 px-2 text-xs"
              disabled={actions.busy}
              onClick={() => (o.entryType === "custom" ? actions.deleteCustom(o.targetKey) : actions.resetOne(o.targetKey))}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResetAllDialog({
  open,
  onClose,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  actions: RequirementActions;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset all my requirement edits?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes every rename, note, hidden requirement and requirement of your own from this plan and shows the
            source requirements as they are. Your courses and other plans are not touched.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={async (e) => {
              e.preventDefault();
              if (await actions.resetAll()) onClose();
            }}
            data-testid="confirm-reset-all"
          >
            Reset all
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
