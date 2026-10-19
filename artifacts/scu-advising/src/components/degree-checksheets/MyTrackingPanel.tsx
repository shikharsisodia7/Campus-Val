import { useId, useState } from "react";
import { AlertTriangle, ListPlus, MapPin, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TYPING_DELAY_MS, type ChecksheetTracking, type TrackingEntry } from "@/hooks/use-degree-checksheets";
import { MyTrackingTag, StatusSelect, TermSelect } from "./TrackingControls";
import { termLabel, trackingStatusLabel } from "./checksheet-format";
import { useTransfer } from "./TransferContext";

/**
 * "My Tracking": the student's own list for one document.
 *
 * Every document has it, so a PDF, a flowchart or a file with no preview is
 * still usable as a checksheet. It also lists the markers placed on a page, so
 * each can be read and edited without a mouse, and the entries a replacement
 * could not keep in place.
 */
export function MyTrackingPanel({
  documentId,
  tracking,
  describePlace,
  onShowPlace,
  onPlace,
  onPlaceInCell,
  canPlaceInCell,
  inlineAvailable,
  pointsAvailable,
}: {
  documentId: number;
  tracking: ChecksheetTracking;
  /** Words for where a placed entry sits ("Page 2", "WIDG 101"). */
  describePlace: (entry: TrackingEntry) => string;
  /** Scrolls the preview to a placed entry. */
  onShowPlace?: (entry: TrackingEntry) => void;
  /** Lets the student put a detached marker onto the current document. */
  onPlace?: (entry: TrackingEntry) => void;
  /** Lets the student put a detached cell entry into a cell of the current document. */
  onPlaceInCell?: (entry: TrackingEntry) => void;
  /** Whether the current document has cells this entry could go into. */
  canPlaceInCell?: (entry: TrackingEntry) => boolean;
  inlineAvailable: boolean;
  pointsAvailable: boolean;
}) {
  const [label, setLabel] = useState("");
  const labelId = useId();
  const headingId = useId();

  const detached = tracking.entries.filter((entry) => entry.detached);
  const manual = tracking.entries.filter((entry) => !entry.detached && entry.anchorType === "manual");
  const points = tracking.entries.filter((entry) => !entry.detached && entry.anchorType === "point");
  const cells = tracking.entries.filter(
    (entry) =>
      !entry.detached &&
      (entry.anchorType === "sheet_cell" ||
        entry.anchorType === "doc_cell" ||
        entry.anchorType === "sheet_item" ||
        entry.anchorType === "doc_item"),
  );

  const add = () => {
    const text = label.trim();
    if (!text) return;
    tracking.addManual(text);
    setLabel("");
  };

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-3 rounded-md border border-primary/25 bg-primary/[0.03] p-3 xl:space-y-2 xl:p-2.5"
      data-testid={`checksheet-my-tracking-${documentId}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={headingId} className="text-base font-semibold">
          My Tracking
        </h3>
        <MyTrackingTag />
      </div>
      <p className="text-xs text-muted-foreground xl:text-[11px]" data-testid="checksheet-tracking-help">
        Your own planning notes for this document. They are saved in CampusVal, only you can see them, and they
        never change the original file.
        {inlineAvailable && " Where this document has a Status or Quarter column, you can also fill it in directly above."}
        {pointsAvailable && " Use “Add a marker” above to place an entry on the page."}
      </p>

      {detached.length > 0 && (
        <div
          className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950"
          role="group"
          aria-label="Entries from the previous file"
          data-testid="checksheet-detached"
        >
          <p className="flex items-start gap-2 text-sm font-semibold">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {detached.length} {detached.length === 1 ? "entry was" : "entries were"} made on the previous file
          </p>
          <p className="text-xs">
            The file was replaced, and CampusVal could not confirm that{" "}
            {detached.length === 1 ? "this entry still belongs" : "these entries still belong"} in the same place, so{" "}
            {detached.length === 1 ? "it is" : "they are"} not shown on the new document. Keep each one in your
            list{(onPlace && pointsAvailable) || detached.some((entry) => canPlaceInCell?.(entry))
              ? ", place it on the new document yourself,"
              : ""}{" "}
            or remove it.
          </p>
          <ul className="space-y-1.5">
            {detached.map((entry) => (
              <li
                key={entry.key}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-amber-200 bg-white/70 px-2 py-1.5 text-sm"
                data-testid={`checksheet-detached-${entry.key}`}
              >
                <span className="min-w-0 flex-1 break-words">
                  <span className="font-medium">{entry.itemLabel ?? "Tracking entry"}</span>
                  <span className="text-xs text-amber-900">
                    {[trackingStatusLabel(entry.status), termLabel(entry.term, entry.termYear), entry.note]
                      .filter(Boolean)
                      .map((part) => ` · ${part}`)
                      .join("")}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {onPlace && pointsAvailable && entry.anchorType === "point" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => onPlace(entry)}
                      data-testid={`checksheet-detached-place-${entry.key}`}
                    >
                      <MapPin className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Place on the document
                    </Button>
                  )}
                  {onPlaceInCell && canPlaceInCell?.(entry) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => onPlaceInCell(entry)}
                      data-testid={`checksheet-detached-place-cell-${entry.key}`}
                    >
                      <MapPin className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Place in a cell
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => tracking.keepAsListEntry(entry.key)}
                    data-testid={`checksheet-detached-keep-${entry.key}`}
                  >
                    <ListPlus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    Keep in my list
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs text-destructive hover:text-destructive"
                    onClick={() => tracking.remove(entry.key)}
                    aria-label={`Remove the entry for ${entry.itemLabel ?? "this item"}`}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    Remove
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {points.length > 0 && (
        <div className="space-y-1.5" data-testid="checksheet-marker-list">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Markers on the document ({points.length})
          </h4>
          <ul className="space-y-1.5">
            {points.map((entry) => (
              <EntryRow
                key={entry.key}
                entry={entry}
                tracking={tracking}
                heading={
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    {describePlace(entry)}
                    {onShowPlace && (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={() => onShowPlace(entry)}
                      >
                        Show
                      </Button>
                    )}
                  </span>
                }
                name={describePlace(entry)}
              />
            ))}
          </ul>
        </div>
      )}

      {cells.length > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="checksheet-cell-count">
          {cells.length} {cells.length === 1 ? "entry" : "entries"} filled in directly in the document above.
        </p>
      )}

      <div className="space-y-1.5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          My list{manual.length > 0 ? ` (${manual.length})` : ""}
        </h4>
        {manual.length === 0 && (
          <p className="text-xs text-muted-foreground" data-testid="checksheet-manual-empty">
            Nothing in your list yet. Add a requirement or course below to track it here.
          </p>
        )}
        {manual.length > 0 && (
          <ul className="space-y-1.5" data-testid="checksheet-manual-list">
            {manual.map((entry) => (
              <EntryRow key={entry.key} entry={entry} tracking={tracking} name={entry.itemLabel ?? "this item"} editableLabel />
            ))}
          </ul>
        )}
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        data-testid="checksheet-manual-add"
      >
        <div className="min-w-[12rem] flex-1 space-y-1">
          <Label htmlFor={labelId} className="text-xs">
            Requirement or item
          </Label>
          <Input
            id={labelId}
            value={label}
            maxLength={200}
            placeholder="e.g. Upper-division elective"
            onChange={(e) => setLabel(e.target.value)}
            className="h-9 xl:h-7 xl:text-xs"
            data-testid="checksheet-manual-label"
          />
        </div>
        <Button type="submit" size="sm" className="h-9 gap-1.5 xl:h-7 xl:text-xs" disabled={!label.trim()} data-testid="checksheet-manual-submit">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add to my list
        </Button>
      </form>
    </section>
  );
}

function EntryRow({
  entry,
  tracking,
  name,
  heading,
  editableLabel = false,
}: {
  entry: TrackingEntry;
  tracking: ChecksheetTracking;
  /** How the entry is named to a screen reader. */
  name: string;
  heading?: React.ReactNode;
  editableLabel?: boolean;
}) {
  const noteId = useId();
  const labelId = useId();
  const transfer = useTransfer();
  // Held locally so the field can be emptied while typing a new name.
  const [labelDraft, setLabelDraft] = useState(entry.itemLabel ?? "");
  return (
    <li
      className="grid gap-2 rounded-md border border-border bg-background p-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-end xl:grid-cols-[minmax(0,1fr)_7.5rem_9.5rem_auto] xl:items-center xl:gap-1.5 xl:p-1.5"
      data-testid={`checksheet-entry-${entry.key}`}
      data-entry-type={entry.anchorType}
    >
      <div className="min-w-0 space-y-1 xl:flex xl:flex-wrap xl:items-center xl:gap-1.5 xl:space-y-0">
        {heading}
        {editableLabel && (
          <>
            <Label htmlFor={labelId} className="sr-only">
              Requirement or item
            </Label>
            <Input
              id={labelId}
              value={labelDraft}
              maxLength={200}
              className="h-9 xl:h-7 xl:min-w-0 xl:flex-1 xl:text-xs"
              onChange={(e) => {
                setLabelDraft(e.target.value);
                // An empty name is not saved; the last saved name stays.
                if (e.target.value.trim()) tracking.change(entry.key, { itemLabel: e.target.value }, TYPING_DELAY_MS);
              }}
              onBlur={() => {
                if (!labelDraft.trim()) setLabelDraft(entry.itemLabel ?? "");
              }}
              data-testid={`checksheet-entry-label-${entry.key}`}
            />
          </>
        )}
        <Label htmlFor={noteId} className="sr-only">
          Note for {name}
        </Label>
        <Input
          id={noteId}
          value={entry.note ?? ""}
          maxLength={500}
          placeholder="Note (optional)"
          className="h-8 text-xs xl:h-7 xl:min-w-0 xl:flex-1"
          onChange={(e) => tracking.change(entry.key, { note: e.target.value || null }, TYPING_DELAY_MS)}
          data-testid={`checksheet-entry-note-${entry.key}`}
        />
      </div>
      <StatusSelect
        value={entry.status}
        label={`My status for ${name}`}
        onChange={(status) => tracking.change(entry.key, { status })}
        testId={`checksheet-entry-status-${entry.key}`}
      />
      <TermSelect
        term={entry.term}
        year={entry.termYear}
        label={`My quarter for ${name}`}
        onChange={(term, termYear) => tracking.change(entry.key, { term, termYear })}
        testId={`checksheet-entry-term-${entry.key}`}
      />
      <div className="flex items-center gap-1">
        {transfer && (entry.note || entry.itemLabel) && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 xl:h-7 xl:w-7"
            // The annotation's own id is the stable anchor (provenance only; nothing of the entry is copied but the words).
            onClick={() => transfer({ text: [entry.itemLabel, entry.note].filter(Boolean).join(": "), anchor: entry.id != null ? `annotation:${entry.id}` : null })}
            aria-label={`Add ${name} to my Planning Requirements`}
            title="Add to planning"
            data-testid={`checksheet-entry-transfer-${entry.key}`}
          >
            <ListPlus className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 text-destructive hover:text-destructive xl:h-7 xl:w-7"
          onClick={() => tracking.remove(entry.key)}
          aria-label={`Remove the entry for ${name}`}
          data-testid={`checksheet-entry-remove-${entry.key}`}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}
