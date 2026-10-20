import { useId, useState } from "react";
import { Landmark } from "lucide-react";
import type { RequirementAnnotation, RequirementItem } from "@workspace/api-client-react";
import { safeExternalUrl } from "@/lib/safe-url";

/**
 * A school's statement about how its students fulfil a University Core area
 * (Leavey: "Social Science: ECON 1"), shown under the Core requirement it
 * describes. The requirement stays University Core: this explains which school
 * course satisfies it so the student does not plan a duplicate, and it never
 * claims the area is done (the requirement's own status says that, from
 * course evidence).
 *
 * Treatment follows the Department Note (quiet surface, solid left rule,
 * building icon) in the school category's tint, kept to two lines; the source
 * is behind a disclosure so the default row stays compact.
 */
const STATUS_TEXT: Record<RequirementAnnotation["status"], string | null> = {
  completed: "Completed on this route",
  planned: "Planned on this route",
  open: null,
};

function Annotation({ annotation, testId }: { annotation: RequirementAnnotation; testId: string }) {
  const [showSource, setShowSource] = useState(false);
  const sourceId = useId();
  const sourceUrl = safeExternalUrl(annotation.sourceUrl);
  const status = STATUS_TEXT[annotation.status];
  return (
    <div
      className="mt-1.5 rounded-md border border-border border-l-[3px] border-l-violet-400 bg-violet-50/40 px-2 py-1.5 text-[11px] leading-relaxed text-foreground dark:bg-violet-950/20"
      data-testid={testId}
      data-annotation-school={annotation.school}
      data-annotation-status={annotation.status}
    >
      <div className="flex flex-wrap items-center gap-1 font-semibold text-foreground/85">
        <Landmark className="h-3 w-3 shrink-0 text-violet-700 dark:text-violet-300" aria-hidden="true" />
        <span>{annotation.schoolName}</span>
        {annotation.programScope && <span className="font-normal text-muted-foreground">· {annotation.programScope}</span>}
      </div>
      <p className="mt-0.5 break-words">{annotation.text}</p>
      {(status || annotation.schoolRequirementIds.length > 0) && (
        <p className="mt-0.5 text-muted-foreground">
          {[status, annotation.schoolRequirementIds.length > 0 ? `Also a ${annotation.schoolName} requirement` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <button
        type="button"
        className="mt-0.5 text-[10px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
        aria-expanded={showSource}
        aria-controls={sourceId}
        onClick={() => setShowSource((v) => !v)}
      >
        {showSource ? "Hide source" : "Source"}
      </button>
      {showSource && (
        <p id={sourceId} className="mt-0.5 text-[10px] leading-snug text-muted-foreground" data-testid={`${testId}-source`}>
          {annotation.sourceLabel} · {annotation.academicYear} · source checked {annotation.lastVerified}
          {sourceUrl && (
            <>
              {" · "}
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                open source
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}

export function SchoolCoreAnnotations({ item }: { item: RequirementItem }) {
  const annotations = item.annotations;
  if (!annotations || annotations.length === 0) return null;
  return (
    <div data-testid={`core-annotations-${item.id}`}>
      {annotations.map((annotation) => (
        <Annotation key={annotation.id} annotation={annotation} testId={`core-annotation-${annotation.id}`} />
      ))}
    </div>
  );
}
