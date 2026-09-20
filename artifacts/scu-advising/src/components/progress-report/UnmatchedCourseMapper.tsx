import { useState } from "react";
import { CatalogCoursePicker } from "./CatalogCoursePicker";
import { useEditProgressReportMappings } from "@/hooks/use-progress-report-mappings";

const slug = (raw: string) => raw.replace(/\s+/g, "-");

/**
 * The APR page's control for ONE item the parser could not match to the
 * catalog: match it to a catalog course, change that, or remove it.
 *
 * What a mapping is, and is not (stated on screen, not just here): it is the
 * student's own note. The uploaded report, Workday's record and what counts as
 * completed are all unchanged.
 */
export function UnmatchedCourseMapper({
  raw,
  mappedTo,
  showCurrent = true,
}: {
  raw: string;
  /** The student's current mapping for this code, if any. */
  mappedTo?: { courseCode: string; courseTitle: string | null };
  /** Print the current match as a sentence. Off where the caller already states it (the "Matched by you" list). */
  showCurrent?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const { save, remove, saving, removing, error, reset } = useEditProgressReportMappings();
  const busy = saving || removing;

  const finish = () => {
    setPicking(false);
    reset();
  };

  return (
    <div className="mt-1 font-sans" data-testid={`unmatched-mapper-${slug(raw)}`}>
      {mappedTo && !picking && showCurrent && (
        <p className="text-[11px] text-foreground/90">
          Matched by you to <span className="font-mono font-semibold">{mappedTo.courseCode}</span>
          {mappedTo.courseTitle ? ` ${mappedTo.courseTitle}` : ""}.
        </p>
      )}

      {!picking && (
        <div className="mt-1 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPicking(true)}
            disabled={busy}
            className="rounded border border-amber-400 bg-white px-2 py-1 text-[11px] font-medium text-amber-950 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
            aria-label={mappedTo ? `Change the catalog course matched to ${raw}` : `Match ${raw} to a catalog course`}
            data-testid={`mapper-open-${slug(raw)}`}
          >
            {mappedTo ? "Change" : "Match to a catalog course"}
          </button>
          {mappedTo && (
            <button
              type="button"
              onClick={() => void remove(raw).catch(() => undefined)}
              disabled={busy}
              className="rounded border border-border bg-white px-2 py-1 text-[11px] hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
              aria-label={`Remove the match for ${raw}`}
              data-testid={`mapper-remove-${slug(raw)}`}
            >
              Remove
            </button>
          )}
        </div>
      )}

      {picking && (
        <CatalogCoursePicker
          label={`Which catalog course is ${raw}?`}
          disabled={busy}
          onCancel={finish}
          onPick={(course) => {
            // A failure is shown below and the picker stays open so the student can retry.
            void save(raw, course.code)
              .then(finish)
              .catch(() => undefined);
          }}
        />
      )}

      {error && (
        <p role="alert" className="mt-1 text-[11px] text-red-700" data-testid="mapper-error">
          Couldn&rsquo;t save that. Please try again.
        </p>
      )}
    </div>
  );
}
