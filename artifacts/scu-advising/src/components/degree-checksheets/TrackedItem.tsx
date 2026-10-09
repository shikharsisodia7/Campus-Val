import { MousePointerClick, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChecksheetTracking, TrackingEntry } from "@/hooks/use-degree-checksheets";
import { MyTrackingTag, StatusSelect, TermSelect, TRACKING_HINT } from "./TrackingControls";

/**
 * The student's tracking for a FILLED cell they chose, drawn beneath the
 * department's text. The text above it is the source and is not editable; this
 * block is the student's, and says so.
 */
export function TrackedItem({
  entry,
  name,
  tracking,
  testId,
}: {
  entry: TrackingEntry;
  /** What the cell says, for labels read aloud. */
  name: string;
  tracking: ChecksheetTracking;
  testId: string;
}) {
  return (
    <div
      className="mt-1.5 min-w-[13rem] space-y-1 rounded border border-primary/30 bg-primary/[0.04] p-1.5 text-left font-normal"
      title={TRACKING_HINT}
      data-tracked-item="true"
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-2">
        <MyTrackingTag />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={() => tracking.remove(entry.key)}
          aria-label={`Stop tracking ${name}`}
          data-testid={`${testId}-remove`}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
      <StatusSelect
        value={entry.status}
        label={`My status for ${name}`}
        onChange={(status) => tracking.change(entry.key, { status })}
        testId={`${testId}-status`}
      />
      <TermSelect
        term={entry.term}
        year={entry.termYear}
        label={`My quarter for ${name}`}
        onChange={(term, termYear) => tracking.change(entry.key, { term, termYear })}
        testId={`${testId}-term`}
      />
    </div>
  );
}

/**
 * Turns "choose a cell to track" on and off. While it is on, every cell that
 * says something can be chosen; the student decides which ones are worth
 * tracking. CampusVal does not choose for them.
 */
export function PickItemToolbar({
  picking,
  onChange,
  count,
}: {
  picking: boolean;
  onChange: (picking: boolean) => void;
  /** How many cells the student is tracking this way. */
  count: number;
}) {
  return (
    <div className="space-y-2" data-testid="checksheet-pick-toolbar">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 p-1.5 xl:p-1">
        <span className="px-1 text-xs text-muted-foreground xl:text-[11px]" data-testid="checksheet-pick-count">
          {count === 0
            ? "Track any course or requirement in a table: choose its cell."
            : `You are tracking ${count} ${count === 1 ? "cell" : "cells"} you chose.`}
        </span>
        <Button
          type="button"
          size="sm"
          variant={picking ? "default" : "outline"}
          className="h-9 gap-1.5 xl:h-7 xl:px-2 xl:text-[11px]"
          aria-pressed={picking}
          onClick={() => onChange(!picking)}
          data-testid="checksheet-pick-item"
        >
          {picking ? <X className="h-4 w-4" aria-hidden="true" /> : <MousePointerClick className="h-4 w-4" aria-hidden="true" />}
          {picking ? "Done choosing" : "Track a cell"}
        </Button>
      </div>
      {picking && (
        <p
          className="rounded-md border border-primary/40 bg-primary/[0.06] px-3 py-2 text-sm"
          role="status"
          data-testid="checksheet-pick-instructions"
        >
          Click or tap the cell of the course or requirement you want to track. Your status and quarter will
          appear under it. The document's own text is not changed.
        </p>
      )}
    </div>
  );
}

/** The class that marks a cell as choosable while picking. */
export const PICKABLE =
  "cursor-pointer outline outline-1 -outline-offset-1 outline-primary/40 hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary";
