import { useId } from "react";
import type { TrackingStatus, TrackingTerm } from "@workspace/api-client-react";
import { AlertCircle, Check, Loader2, PencilLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { SaveState } from "./tracking-save-queue";
import {
  TRACKING_STATUS_OPTIONS,
  TRACKING_TERM_OPTIONS,
  defaultYearForTerm,
  trackingYearOptions,
} from "./checksheet-format";

/** Said wherever a tracking control appears, so its meaning is never in doubt. */
export const TRACKING_HINT = "Your own tracking, saved in CampusVal. It does not change the original document.";

const SELECT =
  "h-9 min-w-0 rounded-md border border-primary/40 bg-background px-1.5 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-60";

/**
 * The small mark that sets the student's entries apart from the department's
 * text: an icon AND words, never colour alone.
 */
export function MyTrackingTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary",
        className,
      )}
      title={TRACKING_HINT}
    >
      <PencilLine className="h-3 w-3" aria-hidden="true" />
      My tracking
    </span>
  );
}

export function StatusSelect({
  value,
  onChange,
  label,
  disabled,
  className,
  testId,
}: {
  value: string | null;
  onChange: (status: TrackingStatus | null) => void;
  /** What this status is for, e.g. "My status for WIDG 101". Read by screen readers. */
  label: string;
  disabled?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <select
      aria-label={label}
      title={TRACKING_HINT}
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange((e.target.value || null) as TrackingStatus | null)}
      className={cn(SELECT, "w-full", className)}
      data-testid={testId}
    >
      <option value="">No status</option>
      {TRACKING_STATUS_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * A quarter is a term AND a year. Choosing a term fills in the year of that
 * term in the academic year in progress, so one choice is enough for the
 * common case; "No quarter" clears both.
 */
export function TermSelect({
  term,
  year,
  onChange,
  label,
  disabled,
  className,
  testId,
}: {
  term: string | null;
  year: number | null;
  onChange: (term: TrackingTerm | null, year: number | null) => void;
  /** What this quarter is for, e.g. "My quarter for WIDG 101". */
  label: string;
  disabled?: boolean;
  className?: string;
  testId?: string;
}) {
  const current = (term || null) as TrackingTerm | null;
  return (
    <span className={cn("flex min-w-0 gap-1", className)} title={TRACKING_HINT}>
      <select
        aria-label={`${label}: quarter`}
        value={current ?? ""}
        disabled={disabled}
        onChange={(e) => {
          const next = (e.target.value || null) as TrackingTerm | null;
          if (!next) onChange(null, null);
          else onChange(next, year ?? defaultYearForTerm(next));
        }}
        className={cn(SELECT, "flex-1")}
        data-testid={testId ? `${testId}-term` : undefined}
      >
        <option value="">No quarter</option>
        {TRACKING_TERM_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        aria-label={`${label}: year`}
        value={year ?? ""}
        disabled={disabled || !current}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (current && Number.isInteger(next)) onChange(current, next);
        }}
        className={cn(SELECT, "w-[4.75rem] shrink-0")}
        data-testid={testId ? `${testId}-year` : undefined}
      >
        {!current && <option value="">Year</option>}
        {trackingYearOptions(new Date(), year).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </span>
  );
}

/** "Saving… / Saved / Could not save", announced politely to screen readers. */
export function SaveIndicator({
  state,
  onRetry,
  testId,
}: {
  state: SaveState;
  onRetry: () => void;
  testId?: string;
}) {
  const id = useId();
  return (
    <span
      id={id}
      role="status"
      aria-live="polite"
      className="inline-flex min-h-6 items-center gap-1.5 text-xs"
      data-testid={testId}
      data-save-status={state.status}
    >
      {state.status === "saving" && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Saving…
        </span>
      )}
      {state.status === "saved" && (
        <span className="inline-flex items-center gap-1 text-emerald-700">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Saved
        </span>
      )}
      {state.status === "conflict" && (
        <span className="inline-flex items-center gap-1 text-amber-800">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Updated from another window
        </span>
      )}
      {state.status === "error" && (
        <span className="inline-flex items-center gap-1.5 text-destructive">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Could not save
          <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={onRetry}>
            Try again
          </Button>
        </span>
      )}
    </span>
  );
}
