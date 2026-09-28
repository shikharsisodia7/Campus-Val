import { useEffect, useId, useState } from "react";
import { ChevronDown, ChevronUp, MapPinPlus, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ZOOM_STEPS, zoomIn, zoomOut } from "./tracking-geometry";
import type { MarkerMode } from "./PointMarkerLayer";

/**
 * Controls shared by the PDF and picture viewers: zoom, page navigation, and
 * placing a marker. Every control is a real button or field, reachable and
 * usable from the keyboard, with a touch-sized target.
 */
export function ViewerToolbar({
  zoom,
  onZoom,
  page,
  pageCount,
  onPage,
  mode,
  onModeChange,
  onAddHere,
  showTracking,
  what,
}: {
  zoom: number;
  onZoom: (zoom: number) => void;
  /** One-based. Omitted for a picture. */
  page?: number;
  pageCount?: number;
  onPage?: (page: number) => void;
  mode: MarkerMode;
  onModeChange: (mode: MarkerMode) => void;
  /** Adds a marker without a click, for keyboard and screen-reader use. */
  onAddHere: () => void;
  showTracking: boolean;
  /** "page" or "picture" — used in the instructions. */
  what: string;
}) {
  const pageId = useId();
  const [draft, setDraft] = useState(String(page ?? 1));
  useEffect(() => setDraft(String(page ?? 1)), [page]);
  const targeting = mode.placing || mode.moving !== null;
  const multi = pageCount !== undefined && pageCount > 1 && page !== undefined && onPage;

  const go = (value: number) => {
    if (!onPage || !pageCount) return;
    onPage(Math.min(pageCount, Math.max(1, value)));
  };

  return (
    <div className="space-y-2" data-testid="checksheet-viewer-toolbar">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-muted/40 p-1.5">
        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => onZoom(zoomOut(zoom))}
            disabled={zoom <= ZOOM_STEPS[0]}
            aria-label="Zoom out"
            data-testid="checksheet-zoom-out"
          >
            <ZoomOut className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 min-w-[4rem] tabular-nums"
            onClick={() => onZoom(1)}
            aria-label={`Zoom is ${Math.round(zoom * 100)} percent. Reset to fit.`}
            data-testid="checksheet-zoom-level"
          >
            {Math.round(zoom * 100)}%
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => onZoom(zoomIn(zoom))}
            disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]!}
            aria-label="Zoom in"
            data-testid="checksheet-zoom-in"
          >
            <ZoomIn className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {multi && (
          <div className="flex items-center gap-1" role="group" aria-label="Page navigation">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => go(page - 1)}
              disabled={page <= 1}
              aria-label="Previous page"
              data-testid="checksheet-page-prev"
            >
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            </Button>
            <label htmlFor={pageId} className="text-xs text-muted-foreground">
              Page
            </label>
            <input
              id={pageId}
              inputMode="numeric"
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
              onBlur={() => (draft ? go(Number(draft)) : setDraft(String(page)))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft) go(Number(draft));
              }}
              className="h-9 w-12 rounded-md border border-input bg-background px-1 text-center text-sm tabular-nums"
              data-testid="checksheet-page-input"
            />
            <span className="text-xs text-muted-foreground" data-testid="checksheet-page-count">
              of {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => go(page + 1)}
              disabled={page >= pageCount}
              aria-label="Next page"
              data-testid="checksheet-page-next"
            >
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}

        {showTracking && (
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={targeting ? "default" : "outline"}
              className={cn("h-9 gap-1.5", targeting && "ring-2 ring-primary/40")}
              aria-pressed={targeting}
              onClick={() =>
                onModeChange(targeting ? { placing: false, moving: null, open: null } : { placing: true, moving: null, open: null })
              }
              data-testid="checksheet-add-marker"
            >
              {targeting ? <X className="h-4 w-4" aria-hidden="true" /> : <MapPinPlus className="h-4 w-4" aria-hidden="true" />}
              {targeting ? "Cancel" : "Add a marker"}
            </Button>
          </div>
        )}
      </div>

      {showTracking && targeting && (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-primary/40 bg-primary/[0.06] px-3 py-2 text-sm"
          role="status"
          data-testid="checksheet-marker-instructions"
        >
          <span>
            {mode.moving
              ? `Click or tap the new spot for this marker on the ${what}.`
              : `Click or tap the ${what} next to the requirement you want to track.`}{" "}
            Zoom in first if the text is small.
          </span>
          {!mode.moving && (
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={onAddHere} data-testid="checksheet-add-marker-here">
              {multi ? `Add one to page ${page} instead` : "Add one without clicking"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
