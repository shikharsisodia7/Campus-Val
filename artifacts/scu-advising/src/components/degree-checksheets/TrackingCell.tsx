import { MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChecksheetTracking, TrackingEntry, TrackingField } from "@/hooks/use-degree-checksheets";
import type { TrackingValues } from "./tracking-save-queue";
import { MyTrackingTag, StatusSelect, TermSelect } from "./TrackingControls";
import { canHold, entrySummary } from "@workspace/api-client-react";

export { canHold, entrySummary };

/**
 * The controls inside one cell the department left for the student. Which
 * controls appear follows the column: a status, a quarter, or both.
 */
export function TrackingCellControls({
  field,
  entry,
  name,
  onSet,
  statusTestId,
  termTestId,
}: {
  field: TrackingField;
  entry: TrackingEntry | undefined;
  /** What the row is about, for labels read aloud. */
  name: string;
  onSet: (values: Partial<TrackingValues>) => void;
  statusTestId: string;
  termTestId: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <MyTrackingTag compact />
      <span className="flex min-w-0 flex-1 flex-wrap gap-1">
        {field !== "term" && (
          <StatusSelect
            value={entry?.status ?? null}
            label={`My status for ${name}`}
            onChange={(status) => onSet({ status })}
            className="w-auto min-w-[7.25rem] flex-1"
            testId={statusTestId}
          />
        )}
        {field !== "status" && (
          <TermSelect
            term={entry?.term ?? null}
            year={entry?.termYear ?? null}
            label={`My quarter for ${name}`}
            onChange={(term, termYear) => onSet({ term, termYear })}
            className="min-w-[9.5rem] flex-1"
            testId={termTestId}
          />
        )}
      </span>
    </span>
  );
}

/** Shown in an eligible cell while the student is choosing where an entry goes. */
export function PlaceHere({ name, onPlace, testId }: { name: string; onPlace: () => void; testId: string }) {
  return (
    <Button
      type="button"
      size="sm"
      className="h-9 w-full gap-1 text-xs"
      onClick={onPlace}
      aria-label={`Place the entry here, for ${name}`}
      data-testid={testId}
    >
      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
      Place here
    </Button>
  );
}

/** Says which entry is being placed, and how to stop. */
export function RelinkBanner({ entry, item, onCancel }: { entry: TrackingEntry; item: boolean; onCancel: () => void }) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-primary/40 bg-primary/[0.06] px-3 py-2 text-sm"
      role="status"
      data-testid="checksheet-relink-banner"
    >
      <span className="min-w-0 flex-1 basis-64">
        Placing <strong>“{entry.itemLabel ?? "Tracking entry"}”</strong> ({entrySummary(entry)}).{" "}
        {item
          ? "Click or tap the cell in this document that it belongs to."
          : "Choose “Place here” in the row of this document that it belongs to."}{" "}
        The document's own text is not changed.
      </span>
      <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={onCancel} data-testid="checksheet-relink-cancel">
        <X className="h-3.5 w-3.5" aria-hidden="true" />
        Cancel
      </Button>
    </div>
  );
}

/** Tells the student that the spreadsheet's calculated cells are not in the preview. */
export function CalculatedCellsNote({ warnings }: { warnings: string[] }) {
  if (!warnings.includes("calculated_cells_not_shown")) return null;
  return (
    <p className="text-xs text-muted-foreground" data-testid="checksheet-calculated-note">
      Some cells of this spreadsheet hold an error value such as #N/A, which a formula shows when it has nothing to
      list. CampusVal does not run formulas, so those cells are left empty here. Every other formula shows the result
      saved in the file. Open the original to see the spreadsheet as it is.
    </p>
  );
}

export type SetCell = ChecksheetTracking["setCell"];
