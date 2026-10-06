import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { RequirementItem } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useDegreePlanContext } from "@/components/degree-plan/DegreePlanContext";
import { NOTE_MAX, TITLE_MAX, useRequirementActions } from "@/components/degree-plan/RequirementCustomization";
import { focusRequirement } from "@/lib/planning-focus";
import { cn } from "@/lib/utils";

/**
 * Add something from a Degree Checksheet to the student's Planning Requirements.
 *
 * Always an explicit, previewed action. The student sees what is being taken, picks the
 * requirement it belongs to (it is preselected only when a course code in the text belongs
 * to exactly one requirement of the selected plan; nothing is matched by similarity), edits
 * the words, and saves. The result is the student's own **My Note** on that requirement,
 * or a **My Requirement** of their own: never a Department Note, and the uploaded
 * document is never touched. Saved into the SAME customization the sidebar's own Edit
 * Requirements writes, on the plan that is selected, so it appears there at once and on every
 * page that shows that plan.
 */

export interface TransferSource {
  /** What the student is taking. Plain text; shown, then editable before saving. */
  text: string;
  documentId: number;
  documentTitle: string;
  /** A safe pointer inside the document, e.g. "Biology!row 40". */
  anchor?: string | null;
}

const COURSE_CODE = /\b([A-Za-z]{2,5})\s?(\d{1,3}[A-Za-z]{0,2})\b/g;
const normalizeCode = (code: string) => code.toUpperCase().replace(/\s+/g, " ").trim();
/** Text as the server stores it (spaces collapsed), for comparing a draft with a saved note. */
const sameWords = (text: string) => text.replace(/[ \t]+/g, " ").trim().toLowerCase();

/** The course codes written in a piece of text (BIOL 1A, MATH 11). Deterministic: no similarity guessing. */
export function courseCodesIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(COURSE_CODE)) out.add(normalizeCode(`${m[1]} ${m[2]}`));
  return [...out];
}

interface Candidate {
  item: RequirementItem;
  groupId: string;
  groupTitle: string;
}

/**
 * The requirement a piece of text belongs to, when it can be known for certain: every course
 * code the text names is a course of ONE requirement, and no other requirement lists any of
 * them. Otherwise null, and the student chooses.
 */
export function reliableTarget(text: string, candidates: Candidate[]): { candidate: Candidate; code: string } | null {
  const codes = courseCodesIn(text);
  if (codes.length === 0) return null;
  const hits = new Map<string, { candidate: Candidate; code: string }>();
  for (const candidate of candidates) {
    const own = candidate.item.courses.map(normalizeCode);
    const code = codes.find((c) => own.includes(c));
    if (code) hits.set(candidate.item.stableKey ?? candidate.item.id, { candidate, code });
  }
  return hits.size === 1 ? [...hits.values()][0]! : null;
}

/**
 * Put focus back on the control that opened the dialog. Radix only does this for its own
 * Trigger, and "Add to planning" is opened from many places (a row, a My Tracking entry, the
 * toolbar). If that control was re-rendered meanwhile, the same control is found again by its test id.
 */
function returnFocus(to: HTMLElement | null | undefined) {
  if (!to) return;
  const target = to.isConnected ? to : to.dataset.testid ? document.querySelector<HTMLElement>(`[data-testid="${CSS.escape(to.dataset.testid)}"]`) : null;
  target?.focus();
}

export function AddToPlanningDialog({
  open,
  onOpenChange,
  source,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: TransferSource | null;
  /** The control that opened the dialog; focus goes back to it when the dialog closes. */
  returnFocusTo?: HTMLElement | null;
}) {
  const { activePlan, requirements } = useDegreePlanContext();
  const actions = useRequirementActions(activePlan?.id ?? 0);
  const { toast } = useToast();
  const ids = { note: useId(), title: useId(), group: useId(), search: useId(), options: useId() };

  const candidates = useMemo<Candidate[]>(
    () =>
      (requirements ?? []).flatMap((group) =>
        group.items
          // A source requirement can carry a note; a student's own requirement is edited in the sidebar.
          .filter((item) => !!item.stableKey && item.customization?.kind !== "custom")
          .map((item) => ({ item, groupId: group.id, groupTitle: group.title })),
      ),
    [requirements],
  );
  const groups = useMemo(() => (requirements ?? []).filter((g) => !!g.stableKey), [requirements]);

  const [mode, setMode] = useState<"note" | "custom">("note");
  const [query, setQuery] = useState("");
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const [matchedBy, setMatchedBy] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [existingChoice, setExistingChoice] = useState<"append" | "replace">("append");
  const [customGroup, setCustomGroup] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  // Choosing a requirement removes the list (and changing it removes the choice): move focus to what comes next.
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const focusSoon = (ref: { current: HTMLElement | null }) => window.requestAnimationFrame(() => ref.current?.focus());

  // Start fresh each time it opens.
  useEffect(() => {
    if (!open || !source) return;
    const text = source.text.trim().replace(/\s+/g, " ");
    const found = reliableTarget(text, candidates);
    setMode("note");
    setQuery("");
    setTargetKey(found?.candidate.item.stableKey ?? null);
    setMatchedBy(found?.code ?? null);
    setDraft(text.slice(0, NOTE_MAX));
    setExistingChoice("append");
    setCustomGroup(groups.find((g) => g.kind === "major")?.stableKey ?? groups[0]?.stableKey ?? "");
    setCustomTitle(text.slice(0, TITLE_MAX));
    actions.clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source]);

  const target = candidates.find((c) => c.item.stableKey === targetKey) ?? null;
  const existingNote = target?.item.customization?.kind === "edit" ? (target.item.customization.note ?? "") : "";
  const normalizedDraft = draft.trim();
  // An obvious exact duplicate: the words are already in that requirement's My Note.
  const isDuplicate = !!existingNote && !!normalizedDraft && sameWords(existingNote).includes(sameWords(normalizedDraft));
  const appending = !!existingNote && existingChoice === "append";
  const merged = appending ? `${existingNote}\n${normalizedDraft}` : normalizedDraft;
  const noteLength = mode === "note" ? merged.length : normalizedDraft.length;
  const tooLong = noteLength > NOTE_MAX;
  const cleanCustomTitle = customTitle.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);

  const filtered = candidates.filter((c) => {
    const q = query.trim().toLowerCase();
    return !q || `${c.item.label} ${c.groupTitle} ${c.item.courses.join(" ")}`.toLowerCase().includes(q);
  });

  if (!source) return null;
  const noteSource = { type: "DEGREE_CHECKSHEET" as const, documentId: source.documentId, anchor: source.anchor ?? null };
  const planName = activePlan?.name ?? "your plan";
  const canSave =
    !!activePlan &&
    !actions.busy &&
    !tooLong &&
    (mode === "note" ? !!target && normalizedDraft.length > 0 && !(isDuplicate && appending) : cleanCustomTitle.length > 0 && !!customGroup);

  async function save() {
    if (!canSave) return;
    const ok =
      mode === "note"
        ? await actions.saveEdit(target!.item.stableKey!, { note: merged }, noteSource)
        : await actions.addCustom(customGroup, cleanCustomTitle, normalizedDraft || null, [], normalizedDraft ? noteSource : undefined);
    if (!ok) return;
    toast({ title: mode === "note" ? "Added to My Note" : "Added to Planning Requirements", description: `Saved to ${planName}.` });
    onOpenChange(false);
    // The sidebar refreshes through the shared plan queries; then it shows where it went.
    if (mode === "note") focusRequirement(target!.item.stableKey!);
    else focusRequirement(customGroup, cleanCustomTitle);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-xl overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus(returnFocusTo);
        }}
        data-testid="add-to-planning-dialog"
      >
        <DialogHeader>
          <DialogTitle>Add to Planning Requirements</DialogTitle>
          <DialogDescription>
            Saved to <strong>{planName}</strong> as your own note. It does not change the checksheet, your Workday APR or what
            SCU requires.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <figure className="rounded-md border bg-muted/30 p-2" data-testid="transfer-source">
            <figcaption className="text-[11px] font-medium text-muted-foreground">From {source.documentTitle}</figcaption>
            <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap break-words text-xs">{source.text.trim() || "(nothing selected: write your note below)"}</p>
          </figure>

          <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <legend className="sr-only">How to add it</legend>
            <label className="flex min-h-6 items-center gap-1.5">
              <input type="radio" name="transfer-mode" checked={mode === "note"} onChange={() => setMode("note")} data-testid="transfer-mode-note" />
              Add as My Note to a requirement
            </label>
            <label className="flex min-h-6 items-center gap-1.5">
              <input type="radio" name="transfer-mode" checked={mode === "custom"} onChange={() => setMode("custom")} data-testid="transfer-mode-custom" />
              Create a Custom Requirement
            </label>
          </fieldset>

          {mode === "note" ? (
            <div className="space-y-1.5">
              <div className="text-xs font-medium" id={`${ids.options}-label`}>
                Planning Requirement
              </div>
              {target ? (
                <div className="rounded border border-primary/40 bg-primary/5 p-1.5 text-xs" data-testid="transfer-target" aria-labelledby={`${ids.options}-label`} role="group">
                  <span className="font-medium">{target.item.label}</span>
                  <span className="text-muted-foreground"> · {target.groupTitle}</span>
                  {matchedBy && (
                    <span className="block text-[11px] text-muted-foreground">Preselected because {matchedBy} is listed under it. Change it if that is wrong.</span>
                  )}
                  <button
                    type="button"
                    className="mt-0.5 block min-h-6 text-[11px] underline"
                    onClick={() => {
                      setTargetKey(null);
                      setMatchedBy(null);
                      focusSoon(searchRef);
                    }}
                    data-testid="transfer-change-target"
                  >
                    Choose a different requirement
                  </button>
                </div>
              ) : (
                <>
                  <Label htmlFor={ids.search} className="sr-only">
                    Search your Planning Requirements
                  </Label>
                  <Input
                    ref={searchRef}
                    id={ids.search}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search your Planning Requirements"
                    className="h-8 text-xs"
                    aria-controls={ids.options}
                    data-testid="transfer-search"
                  />
                  <ul
                    id={ids.options}
                    aria-labelledby={`${ids.options}-label`}
                    className="max-h-44 space-y-0.5 overflow-y-auto rounded border p-1"
                    data-testid="transfer-options"
                  >
                    {filtered.length === 0 && <li className="p-1.5 text-xs text-muted-foreground">No requirement matches.</li>}
                    {filtered.map((c) => (
                      <li key={c.item.stableKey}>
                        <button
                          type="button"
                          className="w-full rounded px-1.5 py-1 text-left text-xs hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                          onClick={() => {
                            setTargetKey(c.item.stableKey!);
                            focusSoon(noteRef);
                          }}
                          data-testid={`transfer-option-${c.item.stableKey}`}
                        >
                          <span className="font-medium">{c.item.label}</span>
                          <span className="block text-[11px] text-muted-foreground">{c.groupTitle}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {existingNote && (
                <fieldset className="rounded border border-amber-200 bg-amber-50 p-1.5 text-xs" data-testid="transfer-existing">
                  <legend className="px-1 text-[11px] font-medium">This requirement already has a My Note</legend>
                  <p className="whitespace-pre-wrap break-words text-amber-950">{existingNote}</p>
                  <div className="mt-1 flex gap-3">
                    <label className="flex min-h-6 items-center gap-1">
                      <input type="radio" name="transfer-existing" checked={existingChoice === "append"} onChange={() => setExistingChoice("append")} data-testid="transfer-append" /> Add to it
                    </label>
                    <label className="flex min-h-6 items-center gap-1">
                      <input type="radio" name="transfer-existing" checked={existingChoice === "replace"} onChange={() => setExistingChoice("replace")} data-testid="transfer-replace" /> Replace it
                    </label>
                  </div>
                  {isDuplicate && appending && (
                    <p className="mt-1 font-medium text-amber-950" role="status" data-testid="transfer-duplicate">
                      This text is already in that note. Replace the note, change the text, or cancel.
                    </p>
                  )}
                </fieldset>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor={ids.title} className="text-xs">
                Title of your requirement
              </Label>
              <Input id={ids.title} value={customTitle} maxLength={TITLE_MAX} onChange={(e) => setCustomTitle(e.target.value)} className="h-8 text-xs" data-testid="transfer-custom-title" />
              <Label htmlFor={ids.group} className="text-xs">
                Under
              </Label>
              <select
                id={ids.group}
                value={customGroup}
                onChange={(e) => setCustomGroup(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                data-testid="transfer-custom-group"
              >
                {groups.map((g) => (
                  <option key={g.stableKey} value={g.stableKey}>
                    {g.title}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">It is marked “My requirement”. It is yours, not from the Bulletin, and never counts toward your degree.</p>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor={ids.note} className="text-xs">
              My Note <span className="text-muted-foreground">(edit it as you like)</span>
            </Label>
            <Textarea ref={noteRef} id={ids.note} value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} data-testid="transfer-note" />
            <p className={cn("text-right text-[11px]", tooLong ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
              {noteLength}/{NOTE_MAX}
              {tooLong && " · too long to save"}
            </p>
          </div>

          {actions.error && (
            <p role="alert" className="text-destructive" data-testid="transfer-error">
              {actions.error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="transfer-cancel">
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!canSave} data-testid="transfer-save">
            {mode === "note" ? "Save to My Note" : "Create requirement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
