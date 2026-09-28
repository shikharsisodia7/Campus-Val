import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { ChecksheetPdfPage } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChecksheetTracking } from "@/hooks/use-degree-checksheets";
import { PointMarkerLayer, type MarkerMode } from "./PointMarkerLayer";
import { ViewerToolbar } from "./ViewerToolbar";
import { originalFileUrl } from "./checksheet-format";
import { nextFreePosition, pageDisplayWidth } from "./tracking-geometry";
import "./checksheet-pdf.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Fonts, character maps and image decoders the PDF library loads on demand (see vite.config.ts). */
const ASSETS = `${import.meta.env.BASE_URL}pdfjs/`;
/** A canvas larger than this is drawn at a lower density rather than refused by the browser. */
const MAX_CANVAS_PIXELS = 16_000_000;

type Load = { state: "loading" } | { state: "ready"; pdf: PDFDocumentProxy } | { state: "error" };

/**
 * A department PDF, drawn in the app from the original file.
 *
 * - Pages are drawn by PDF.js onto canvases, with the document's own text laid
 *   over them invisibly, so the text stays sharp at any zoom and can be
 *   selected and read aloud. Nothing is converted to a screenshot.
 * - The file is fetched with the student's session from the owner-checked API
 *   route. It has no public address.
 * - Scripts inside a PDF are never run: the library's scripting engine is not
 *   loaded, and form/XFA features are off.
 * - Only pages near the visible area are drawn, so a long document opens
 *   quickly and a collapsed one costs nothing.
 *
 * Loaded on demand (see ChecksheetDocumentCard), so the PDF library is only
 * downloaded by a student who opens a PDF.
 */
export default function ChecksheetPdfView({
  documentId,
  title,
  pages,
  version,
  tracking,
  showTracking,
  focus,
  place,
}: {
  documentId: number;
  title: string;
  pages: ChecksheetPdfPage[];
  /** Changes when the file is replaced, so the new file is fetched. */
  version: number;
  tracking: ChecksheetTracking;
  showTracking: boolean;
  /** A marker to bring into view (from the My Tracking list). */
  focus: { key: string; at: number } | null;
  /** A detached marker the student wants to put onto this document. */
  place: { key: string; at: number } | null;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [available, setAvailable] = useState(0);
  const [current, setCurrent] = useState(1);
  const [mode, setMode] = useState<MarkerMode>({ placing: false, moving: null, open: null });
  const scroller = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof pdfjs.getDocument> | null = null;
    setLoad({ state: "loading" });
    (async () => {
      try {
        const res = await fetch(originalFileUrl(documentId), { credentials: "same-origin", cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = new Uint8Array(await res.arrayBuffer());
        if (cancelled) return;
        task = pdfjs.getDocument({
          data,
          enableXfa: false,
          cMapUrl: `${ASSETS}cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${ASSETS}standard_fonts/`,
          wasmUrl: `${ASSETS}wasm/`,
        });
        const pdf = await task.promise;
        if (cancelled) {
          void pdf.destroy();
          return;
        }
        setLoad({ state: "ready", pdf });
      } catch {
        if (!cancelled) setLoad({ state: "error" });
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [documentId, version, attempt]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setAvailable(Math.max(0, el.clientWidth - 24));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scrollToPage = useCallback((page: number) => {
    const el = pageRefs.current.get(page - 1);
    const box = scroller.current;
    if (!el || !box) return;
    box.scrollTo({ top: el.offsetTop - 8, behavior: "auto" });
    setCurrent(page);
  }, []);

  // The page holding most of the top of the visible area is the current one.
  const onScroll = useCallback(() => {
    const box = scroller.current;
    if (!box) return;
    const line = box.scrollTop + box.clientHeight * 0.3;
    let found = 1;
    for (const [index, el] of pageRefs.current) {
      if (el.offsetTop <= line) found = Math.max(found, index + 1);
    }
    setCurrent(found);
  }, []);

  useEffect(() => {
    if (!focus) return;
    const entry = tracking.entries.find((candidate) => candidate.key === focus.key);
    if (entry?.anchor.page === undefined) return;
    scrollToPage(entry.anchor.page + 1);
    setMode({ placing: false, moving: null, open: entry.key });
    // Only a new request moves the view, not every change to the entries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  useEffect(() => {
    if (!place) return;
    // The next click or tap on the document is where that marker goes.
    setMode({ placing: false, moving: place.key, open: null });
    scroller.current?.scrollIntoView({ block: "nearest" });
  }, [place]);

  const points = tracking.entries.filter((entry) => !entry.detached && entry.anchorType === "point");

  const addHere = () => {
    const page = current - 1;
    const taken = points
      .filter((entry) => entry.anchor.page === page)
      .map((entry) => ({ x: entry.anchor.x ?? 0, y: entry.anchor.y ?? 0 }));
    const key = tracking.addPoint({ page, ...nextFreePosition(taken) }, {});
    setMode({ placing: false, moving: null, open: key });
  };

  return (
    <div className="space-y-2" data-testid={`checksheet-pdf-${documentId}`}>
      <ViewerToolbar
        zoom={zoom}
        onZoom={setZoom}
        page={current}
        pageCount={pages.length}
        onPage={scrollToPage}
        mode={mode}
        onModeChange={setMode}
        onAddHere={addHere}
        showTracking={showTracking}
        what="page"
      />
      <div
        ref={scroller}
        onScroll={onScroll}
        tabIndex={0}
        role="region"
        aria-label={`${title} — PDF, ${pages.length} page${pages.length === 1 ? "" : "s"}, scrollable`}
        // Positioned, so each page's offsetTop is measured from this scroller.
        className="relative max-h-[75vh] overflow-auto rounded-md border border-border bg-muted/50 p-3"
        data-testid="checksheet-pdf-scroll"
      >
        {load.state === "error" && (
          <div className="rounded-md border border-border bg-background p-3 text-sm" role="alert" data-testid="checksheet-pdf-error">
            <p>This PDF could not be displayed right now. The original file is still available above.</p>
            <Button size="sm" variant="outline" className="mt-2 h-8 text-xs" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </div>
        )}
        {load.state === "loading" && (
          <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground" role="status" data-testid="checksheet-pdf-loading">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading PDF…
          </p>
        )}
        {load.state !== "error" && (
          <div className="flex w-max min-w-full flex-col items-center gap-3">
            {pages.map((page, index) => (
              <PdfPage
                key={index}
                index={index}
                natural={page}
                width={pageDisplayWidth(page.width, available, zoom)}
                pdf={load.state === "ready" ? load.pdf : null}
                root={scroller}
                register={(el) => {
                  if (el) pageRefs.current.set(index, el);
                  else pageRefs.current.delete(index);
                }}
              >
                {showTracking && (
                  <PointMarkerLayer
                    page={index}
                    pageLabel={`page ${index + 1}`}
                    entries={points}
                    tracking={tracking}
                    mode={mode}
                    onModeChange={setMode}
                  />
                )}
              </PdfPage>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PdfPage({
  index,
  natural,
  width,
  pdf,
  root,
  register,
  children,
}: {
  index: number;
  natural: ChecksheetPdfPage;
  width: number;
  pdf: PDFDocumentProxy | null;
  root: React.RefObject<HTMLDivElement | null>;
  register: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(index === 0);
  const [drawn, setDrawn] = useState(false);
  const [failed, setFailed] = useState(false);
  const height = Math.round((width * natural.height) / natural.width);
  const scale = width / natural.width;

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { root: root.current, rootMargin: "800px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!pdf || !near) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    // A short pause, so stepping through zoom levels draws once, not four times.
    const timer = setTimeout(async () => {
      try {
        const page = await pdf.getPage(index + 1);
        const target = canvas.current;
        const layer = text.current;
        if (cancelled || !target || !layer) return;

        let density = Math.min(window.devicePixelRatio || 1, 3);
        const pixels = width * height * density * density;
        if (pixels > MAX_CANVAS_PIXELS) density *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);

        const viewport = page.getViewport({ scale: scale * density });
        target.width = Math.floor(viewport.width);
        target.height = Math.floor(viewport.height);
        const context = target.getContext("2d");
        if (!context) throw new Error("no canvas");
        task = page.render({ canvas: target, canvasContext: context, viewport });
        await task.promise;
        if (cancelled) return;
        setDrawn(true);
        setFailed(false);

        layer.replaceChildren();
        const textLayer = new pdfjs.TextLayer({
          textContentSource: await page.getTextContent(),
          container: layer,
          viewport: page.getViewport({ scale }),
        });
        await textLayer.render();
      } catch (err) {
        // A cancelled draw (zoom changed, page closed) is not a failure.
        if (!cancelled && (err as { name?: string } | null)?.name !== "RenderingCancelledException") setFailed(true);
      }
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      task?.cancel();
    };
  }, [pdf, near, index, width, height, scale]);

  return (
    <div
      ref={(el) => {
        holder.current = el;
        register(el);
      }}
      className="relative shrink-0 bg-white shadow-sm ring-1 ring-border"
      style={
        {
          width,
          height,
          "--scale-factor": scale,
          "--total-scale-factor": scale,
          "--user-unit": 1,
        } as React.CSSProperties
      }
      data-testid={`checksheet-pdf-page-${index + 1}`}
      data-page-drawn={drawn ? "true" : "false"}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      <div ref={text} className="cv-pdf-text" aria-label={`Text of page ${index + 1}`} />
      {failed && (
        <p className="absolute inset-x-0 top-0 bg-amber-50 p-2 text-xs text-amber-900" role="alert">
          Page {index + 1} could not be drawn. Open the original file to see it.
        </p>
      )}
      {children}
    </div>
  );
}
