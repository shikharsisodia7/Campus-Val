import { useState } from "react";
import { ChevronDown, ExternalLink, Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RequirementItem } from "@workspace/api-client-react";
import { CoreAreaCourseFinder } from "@/components/course-discovery/CoreAreaCourseFinder";

/**
 * What a student can do about a requirement that has no explicit course list.
 * A Core requirement maps to a canonical catalog Core area: clicking it lists
 * EVERY catalog course tagged with that area (paged, scrollable). A
 * requirement with no mapping (e.g. Pathways) says so and links to its
 * source, rather than showing nothing or inventing a list.
 */
export function RequirementCourseDiscovery({
  req,
  group,
  onAdd,
  disabled,
}: {
  req: RequirementItem;
  group: any;
  onAdd: (code: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const coreArea = (req as any).coreArea as
    | { tag: string; code?: string; courseCount: number; catalogStatedCount: number }
    | null
    | undefined;
  const panelId = `finder-${req.id}`;

  if (coreArea) {
    return (
      <div className="pt-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-full justify-between text-[11px]"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          disabled={coreArea.courseCount === 0}
          data-testid={`find-courses-${req.id}`}
        >
          <span className="flex items-center">
            <SearchIcon className="mr-1 h-3 w-3" aria-hidden="true" /> Find courses
            {coreArea.code ? ` (${coreArea.code})` : ""}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            {coreArea.courseCount}
            <ChevronDown
              className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </span>
        </Button>
        {coreArea.courseCount === 0 && (
          <p className="mt-1 text-[10px] text-muted-foreground" data-testid={`no-tagging-${req.id}`}>
            The CampusVal catalog has no courses tagged {coreArea.tag}. Check the SCU Bulletin or
            Workday for the approved list.
          </p>
        )}
        {open && coreArea.courseCount > 0 && (
          <div id={panelId} className="mt-1.5">
            <CoreAreaCourseFinder
              coreAreaTag={coreArea.tag}
              requirementLabel={req.label}
              onAdd={(c) => onAdd(c.code)}
              disabled={disabled}
            />
          </div>
        )}
      </div>
    );
  }

  // No catalog mapping. Only worth saying for the University Core, where a
  // student expects to be able to browse; major requirements that list no
  // courses already say "choose from an approved list".
  if (group?.kind === "university_core" && req.courses.length === 0) {
    return (
      <p
        className="pt-1 text-[10px] leading-relaxed text-muted-foreground"
        data-testid={`no-mapping-${req.id}`}
      >
        CampusVal doesn't have course tagging for this requirement yet, so it can't list the
        approved courses.{" "}
        {group.sourceUrl && (
          <a
            href={group.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 underline"
          >
            See {group.sourceLabel ?? "the SCU Bulletin"}
            <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
          </a>
        )}
      </p>
    );
  }
  return null;
}

