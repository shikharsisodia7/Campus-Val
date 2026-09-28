import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ChecksheetTracking } from "@/hooks/use-degree-checksheets";
import { PointMarkerLayer, type MarkerMode } from "./PointMarkerLayer";
import { ViewerToolbar } from "./ViewerToolbar";
import { originalFileUrl } from "./checksheet-format";
import { nextFreePosition, pageDisplayWidth } from "./tracking-geometry";

/**
 * A flowchart or a photographed checksheet (PNG / JPEG), shown as uploaded.
 *
 * The picture is the original file, served from the owner-checked API route
 * with the student's session; it has no public address. It is not read by OCR
 * and nothing in it is treated as text. Zoom enlarges it inside a scrollable
 * frame, which also pans it. Markers sit on a layer above the picture.
 */
export function ChecksheetImageView({
  documentId,
  title,
  width,
  height,
  version,
  tracking,
  showTracking,
  focus,
  place,
}: {
  documentId: number;
  title: string;
  width: number;
  height: number;
  /** Changes when the file is replaced, so the new picture is fetched. */
  version: number;
  tracking: ChecksheetTracking;
  showTracking: boolean;
  focus: { key: string; at: number } | null;
  /** A detached marker the student wants to put onto this document. */
  place: { key: string; at: number } | null;
}) {
  const [zoom, setZoom] = useState(1);
  const [available, setAvailable] = useState(0);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<MarkerMode>({ placing: false, moving: null, open: null });
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setAvailable(Math.max(0, el.clientWidth - 24));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (focus) setMode({ placing: false, moving: null, open: focus.key });
  }, [focus]);

  const shown = pageDisplayWidth(width, available, zoom);
  useEffect(() => {
    if (!place) return;
    // The next click or tap on the document is where that marker goes.
    setMode({ placing: false, moving: place.key, open: null });
    scroller.current?.scrollIntoView({ block: "nearest" });
  }, [place]);

  const points = tracking.entries.filter((entry) => !entry.detached && entry.anchorType === "point");

  const addHere = () => {
    const taken = points.map((entry) => ({ x: entry.anchor.x ?? 0, y: entry.anchor.y ?? 0 }));
    const key = tracking.addPoint({ page: 0, ...nextFreePosition(taken) }, {});
    setMode({ placing: false, moving: null, open: key });
  };

  return (
    <div className="space-y-2" data-testid={`checksheet-image-${documentId}`}>
      <ViewerToolbar
        zoom={zoom}
        onZoom={setZoom}
        mode={mode}
        onModeChange={setMode}
        onAddHere={addHere}
        showTracking={showTracking}
        what="picture"
      />
      <div
        ref={scroller}
        tabIndex={0}
        role="region"
        aria-label={`${title} — picture, scrollable`}
        className="max-h-[75vh] overflow-auto rounded-md border border-border bg-muted/50 p-3"
        data-testid="checksheet-image-scroll"
      >
        {failed ? (
          <div className="rounded-md border border-border bg-background p-3 text-sm" role="alert" data-testid="checksheet-image-error">
            <p>This picture could not be displayed right now. The original file is still available above.</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-8 text-xs"
              onClick={() => {
                setFailed(false);
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex w-max min-w-full justify-center">
            <div
              className="relative shrink-0 bg-white shadow-sm ring-1 ring-border"
              style={{ width: shown, height: Math.round((shown * height) / width) }}
              data-testid="checksheet-image-page"
            >
              <img
                src={`${originalFileUrl(documentId)}?v=${version}-${attempt}`}
                alt={`${title} (uploaded picture)`}
                width={width}
                height={height}
                draggable={false}
                className="absolute inset-0 h-full w-full select-none"
                onError={() => setFailed(true)}
                data-testid="checksheet-image"
              />
              {showTracking && (
                <PointMarkerLayer
                  page={0}
                  pageLabel="the picture"
                  entries={points}
                  tracking={tracking}
                  mode={mode}
                  onModeChange={setMode}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
