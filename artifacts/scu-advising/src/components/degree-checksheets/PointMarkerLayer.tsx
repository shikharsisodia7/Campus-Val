import { useRef } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, CircleDashed, Clock, Move, PencilLine, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TYPING_DELAY_MS, type ChecksheetTracking, type TrackingEntry } from "@/hooks/use-degree-checksheets";
import { StatusSelect, TermSelect, TRACKING_HINT } from "./TrackingControls";
import { termLabel, termShortLabel, trackingStatusLabel } from "./checksheet-format";
import { fractionToStyle, nudge, pointToFraction } from "./tracking-geometry";

const STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  completed: Check,
  in_progress: Clock,
  planned: CircleDashed,
  not_started: CircleDashed,
};

export interface MarkerMode {
  /** Placing a new marker with the next click. */
  placing: boolean;
  /** Key of the marker being moved with the next click, if any. */
  moving: string | null;
  /** Key of the marker whose editor is open, if any. */
  open: string | null;
}

/**
 * The student's markers, drawn OVER one page or picture.
 *
 * The layer is a sibling of the page's canvas or image: it adds elements on
 * top and never touches the pixels beneath, so hiding it shows the source
 * exactly as uploaded. Each marker is positioned by percentages of the page,
 * which is why it keeps its place at every zoom and on every screen.
 *
 * Markers are made to look like what they are: a small bordered tag in the
 * app's own colour with a pencil, never text set in the document's typeface.
 */
export function PointMarkerLayer({
  page,
  pageLabel,
  entries,
  tracking,
  mode,
  onModeChange,
}: {
  /** Zero-based page this layer covers (0 for a picture). */
  page: number;
  /** "page 2" / "the picture" — for labels read aloud. */
  pageLabel: string;
  entries: TrackingEntry[];
  tracking: ChecksheetTracking;
  mode: MarkerMode;
  onModeChange: (mode: MarkerMode) => void;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const targeting = mode.placing || mode.moving !== null;
  const here = entries.filter((entry) => entry.anchor.page === page);

  const place = (clientX: number, clientY: number) => {
    const box = layerRef.current?.getBoundingClientRect();
    if (!box) return;
    const at = pointToFraction(clientX, clientY, box);
    if (!at) return;
    if (mode.moving) {
      tracking.movePoint(mode.moving, { page, ...at });
      onModeChange({ placing: false, moving: null, open: mode.moving });
      return;
    }
    const key = tracking.addPoint({ page, ...at }, {});
    onModeChange({ placing: false, moving: null, open: key });
  };

  return (
    <div
      ref={layerRef}
      className={cn("absolute inset-0", targeting ? "z-20 cursor-crosshair bg-primary/[0.06]" : "pointer-events-none z-10")}
      data-testid={`checksheet-marker-layer-${page}`}
      data-targeting={targeting ? "true" : "false"}
      onClick={(e) => {
        if (!targeting || e.target !== e.currentTarget) return;
        place(e.clientX, e.clientY);
      }}
    >
      {here.map((entry, i) => (
        <Marker
          key={entry.key}
          entry={entry}
          number={i + 1}
          pageLabel={pageLabel}
          tracking={tracking}
          open={mode.open === entry.key}
          moving={mode.moving === entry.key}
          onOpenChange={(open) => onModeChange({ ...mode, open: open ? entry.key : mode.open === entry.key ? null : mode.open })}
          onMove={() => onModeChange({ placing: false, moving: entry.key, open: null })}
        />
      ))}
    </div>
  );
}

function Marker({
  entry,
  number,
  pageLabel,
  tracking,
  open,
  moving,
  onOpenChange,
  onMove,
}: {
  entry: TrackingEntry;
  number: number;
  pageLabel: string;
  tracking: ChecksheetTracking;
  open: boolean;
  moving: boolean;
  onOpenChange: (open: boolean) => void;
  onMove: () => void;
}) {
  const position = { x: entry.anchor.x ?? 0, y: entry.anchor.y ?? 0 };
  const Icon = (entry.status && STATUS_ICON[entry.status]) || PencilLine;
  const summary =
    [trackingStatusLabel(entry.status), termLabel(entry.term, entry.termYear)].filter(Boolean).join(", ") || "no status yet";
  const name = `marker ${number} on ${pageLabel}`;
  const step = (dx: number, dy: number) =>
    tracking.movePoint(entry.key, { page: entry.anchor.page ?? 0, ...nudge(position, dx, dy) }, TYPING_DELAY_MS);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          style={fractionToStyle(position)}
          className={cn(
            "pointer-events-auto absolute flex min-h-7 -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border-2 border-primary bg-background/95 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary shadow-sm",
            "hover:bg-primary hover:text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            moving && "animate-pulse ring-2 ring-primary/50",
          )}
          aria-label={`My tracking, ${name}: ${summary}. Open to edit.`}
          title={`${TRACKING_HINT} (${summary})`}
          data-testid={`checksheet-marker-${entry.key}`}
          data-marker-x={position.x}
          data-marker-y={position.y}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {termShortLabel(entry.term, entry.termYear) ?? (entry.status ? "" : "Mine")}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(20rem,calc(100vw-2rem))] space-y-3"
        align="start"
        onClick={(e) => e.stopPropagation()}
        data-testid={`checksheet-marker-editor-${entry.key}`}
      >
        <div>
          <p className="text-sm font-semibold capitalize">{name}</p>
          <p className="text-xs text-muted-foreground">{TRACKING_HINT}</p>
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium">My status</span>
          <StatusSelect
            value={entry.status}
            label={`My status for ${name}`}
            onChange={(status) => tracking.change(entry.key, { status })}
            testId={`checksheet-marker-status-${entry.key}`}
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium">Quarter completed or planned</span>
          <TermSelect
            term={entry.term}
            year={entry.termYear}
            label={`My quarter for ${name}`}
            onChange={(term, termYear) => tracking.change(entry.key, { term, termYear })}
            testId={`checksheet-marker-term-${entry.key}`}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`note-${entry.key}`} className="text-xs">
            Note (optional)
          </Label>
          <Input
            id={`note-${entry.key}`}
            value={entry.note ?? ""}
            maxLength={500}
            className="h-9"
            onChange={(e) => tracking.change(entry.key, { note: e.target.value || null }, TYPING_DELAY_MS)}
            data-testid={`checksheet-marker-note-${entry.key}`}
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium">Position</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" size="sm" variant="outline" className="h-9 gap-1" onClick={onMove} data-testid={`checksheet-marker-move-${entry.key}`}>
              <Move className="h-3.5 w-3.5" aria-hidden="true" />
              Move: click a new spot
            </Button>
            <span className="flex gap-1" role="group" aria-label={`Nudge ${name}`}>
              {(
                [
                  ["left", ArrowLeft, -0.01, 0],
                  ["up", ArrowUp, 0, -0.01],
                  ["down", ArrowDown, 0, 0.01],
                  ["right", ArrowRight, 0.01, 0],
                ] as const
              ).map(([direction, Arrow, dx, dy]) => (
                <Button
                  key={direction}
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-9 w-9"
                  onClick={() => step(dx, dy)}
                  aria-label={`Move ${name} ${direction}`}
                  data-testid={`checksheet-marker-nudge-${direction}-${entry.key}`}
                >
                  <Arrow className="h-4 w-4" aria-hidden="true" />
                </Button>
              ))}
            </span>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 gap-1 text-destructive hover:text-destructive"
          onClick={() => {
            onOpenChange(false);
            tracking.remove(entry.key);
          }}
          data-testid={`checksheet-marker-delete-${entry.key}`}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Remove this marker
        </Button>
      </PopoverContent>
    </Popover>
  );
}
