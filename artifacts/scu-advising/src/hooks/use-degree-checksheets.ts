import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  createDegreeChecksheet,
  createDegreeChecksheetAnnotation,
  deleteDegreeChecksheetAnnotation,
  getGetDegreeChecksheetRenderQueryKey,
  getListDegreeChecksheetAnnotationsQueryKey,
  getListDegreeChecksheetsQueryKey,
  replaceDegreeChecksheetFile,
  requestDegreeChecksheetUploadUrl,
  updateDegreeChecksheetAnnotation,
  useGetDegreeChecksheetRender,
  useListDegreeChecksheetAnnotations,
  useListDegreeChecksheets,
  type DegreeChecksheetAnnotation,
  type DegreeChecksheetCategory,
  type DegreeChecksheetDocument,
  type DegreeChecksheetProgramRole,
  type DegreeChecksheetReplaceResult,
} from "@workspace/api-client-react";
import {
  SaveConflict,
  TrackingSaveQueue,
  type AnchorInput,
  type SaveState,
  type TrackingValues,
} from "@/components/degree-checksheets/tracking-save-queue";

/**
 * The student's own Degree Checksheets. These queries never poll: a document
 * changes only when the student uploads, replaces, edits or deletes one, and
 * each of those invalidates the keys below.
 */
const QUIET = {
  retry: 1,
  refetchInterval: false,
  refetchOnWindowFocus: false,
} as const;

export function useChecksheetDocuments() {
  return useListDegreeChecksheets({ query: { queryKey: getListDegreeChecksheetsQueryKey(), ...QUIET } });
}

/** Loaded only while a document is open, so a collapsed one costs nothing. */
export function useChecksheetRender(id: number, enabled: boolean) {
  return useGetDegreeChecksheetRender(id, {
    query: { queryKey: getGetDegreeChecksheetRenderQueryKey(id), enabled, staleTime: Infinity, ...QUIET },
  });
}

export function useInvalidateChecksheets() {
  const qc = useQueryClient();
  return useCallback(
    (id?: number) => {
      void qc.invalidateQueries({ queryKey: getListDegreeChecksheetsQueryKey() });
      if (id !== undefined) {
        // A replaced file must never be shown from the previous file's cache.
        qc.removeQueries({ queryKey: getGetDegreeChecksheetRenderQueryKey(id) });
        qc.removeQueries({ queryKey: getListDegreeChecksheetAnnotationsQueryKey(id) });
      }
    },
    [qc],
  );
}

export type ChecksheetUploadPhase = "idle" | "requesting-url" | "uploading" | "processing";

export const CHECKSHEET_UPLOAD_PHASE_LABEL: Record<ChecksheetUploadPhase, string> = {
  idle: "",
  "requesting-url": "Preparing upload…",
  uploading: "Uploading file…",
  processing: "Checking the file and building its preview…",
};

export interface ChecksheetFileSelection {
  file: File;
  name: string;
  size: number;
  contentType: string;
}

export interface ChecksheetDetails {
  title: string;
  category: DegreeChecksheetCategory;
  programName: string | null;
  programRole: DegreeChecksheetProgramRole | null;
  school: string | null;
  academicYearLabel: string | null;
  sourceUrl: string | null;
}

export function errorMessage(err: unknown, fallback: string): string {
  const e = err as { data?: { error?: unknown }; body?: { error?: unknown } } | null;
  const fromBody = e?.data?.error ?? e?.body?.error;
  if (typeof fromBody === "string" && fromBody.trim()) return fromBody;
  return fallback;
}

/**
 * Upload flow shared by "Upload Checksheet" and "Replace":
 * signed link -> PUT the bytes straight to private storage -> register with
 * the API. The server checks the file and builds its preview before saving
 * anything, so a failure here leaves existing documents exactly as they were.
 */
export function useChecksheetUpload() {
  const [phase, setPhase] = useState<ChecksheetUploadPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidateChecksheets();

  const send = useCallback(async (selection: ChecksheetFileSelection) => {
    setPhase("requesting-url");
    const target = await requestDegreeChecksheetUploadUrl({
      name: selection.name,
      size: selection.size,
      contentType: selection.contentType,
    });
    setPhase("uploading");
    const put = await fetch(target.uploadURL, {
      method: "PUT",
      // The link accepts exactly the type the server named for this file.
      headers: { "Content-Type": target.contentType },
      body: selection.file,
    });
    if (!put.ok) throw new Error(`Upload failed (HTTP ${put.status}).`);
    setPhase("processing");
    return {
      objectPath: target.objectPath,
      fileName: selection.name,
      fileSize: selection.size,
      contentType: target.contentType,
    };
  }, []);

  const run = useCallback(
    async <T,>(work: () => Promise<T>, idOf: (result: T) => number): Promise<T | null> => {
      setError(null);
      try {
        const result = await work();
        invalidate(idOf(result));
        setPhase("idle");
        return result;
      } catch (err) {
        setPhase("idle");
        setError(errorMessage(err, err instanceof Error && !(err instanceof ApiError) ? err.message : "Upload failed. Please try again."));
        return null;
      }
    },
    [invalidate],
  );

  const upload = useCallback(
    (selection: ChecksheetFileSelection, details: ChecksheetDetails): Promise<DegreeChecksheetDocument | null> =>
      run(
        async () => createDegreeChecksheet({ ...(await send(selection)), ...details }),
        (doc) => doc.id,
      ),
    [run, send],
  );

  const replace = useCallback(
    (id: number, selection: ChecksheetFileSelection): Promise<DegreeChecksheetReplaceResult | null> =>
      run(
        async () => replaceDegreeChecksheetFile(id, await send(selection)),
        (result) => result.document.id,
      ),
    [run, send],
  );

  return { upload, replace, phase, busy: phase !== "idle", error, clearError: () => setError(null) };
}

// ─── tracking ────────────────────────────────────────────────────────────────

export type TrackingAnchorType = DegreeChecksheetAnnotation["anchorType"];

/** One tracking entry as the page holds it: the server's, plus anything not yet saved. */
export interface TrackingEntry extends TrackingValues {
  /** Stable for as long as the page is open, whether or not the entry is saved yet. */
  key: string;
  id: number | null;
  anchorType: TrackingAnchorType;
  anchor: AnchorInput;
  field: TrackingField | null;
  detached: boolean;
  sortOrder: number;
}

/** What a student column holds; "both" when it is the table's only student column. */
export type TrackingField = "status" | "term" | "both";

export function cellKey(anchorType: "sheet_cell" | "doc_cell", anchor: AnchorInput): string {
  return anchorType === "sheet_cell"
    ? `sheet:${anchor.sheet}:${anchor.row}:${anchor.col}`
    : `block:${anchor.block}:${anchor.row}:${anchor.col}`;
}

/** The key of a filled cell the student chose to track. */
export function itemKey(anchorType: "sheet_item" | "doc_item", anchor: AnchorInput): string {
  return anchorType === "sheet_item"
    ? `sheetitem:${anchor.sheet}:${anchor.row}:${anchor.col}`
    : `blockitem:${anchor.block}:${anchor.row}:${anchor.col}`;
}

/**
 * The cell an entry sits in, as a key; null when it sits in no cell (a marker,
 * a list entry, or an entry a replacement detached). Views find "the entry of
 * this cell" by it, whatever the entry's own key is.
 */
export function placeKeyOf(entry: Pick<TrackingEntry, "anchorType" | "anchor" | "detached">): string | null {
  if (entry.detached) return null;
  if (entry.anchorType === "sheet_cell" || entry.anchorType === "doc_cell") return cellKey(entry.anchorType, entry.anchor);
  if (entry.anchorType === "sheet_item" || entry.anchorType === "doc_item") return itemKey(entry.anchorType, entry.anchor);
  return null;
}

/** Entries by the cell they sit in. */
export function entriesByPlace(entries: TrackingEntry[]): Map<string, TrackingEntry> {
  const map = new Map<string, TrackingEntry>();
  for (const entry of entries) {
    const place = placeKeyOf(entry);
    if (place) map.set(place, entry);
  }
  return map;
}

function keyOf(entry: DegreeChecksheetAnnotation): string {
  if (!entry.detached && (entry.anchorType === "sheet_cell" || entry.anchorType === "doc_cell")) {
    return cellKey(entry.anchorType, entry.anchor);
  }
  if (!entry.detached && (entry.anchorType === "sheet_item" || entry.anchorType === "doc_item")) {
    return itemKey(entry.anchorType, entry.anchor);
  }
  return `id:${entry.id}`;
}

function fromServer(entry: DegreeChecksheetAnnotation, key = keyOf(entry)): TrackingEntry {
  return {
    key,
    id: entry.id,
    anchorType: entry.anchorType,
    anchor: entry.anchor,
    field: entry.field === "status" || entry.field === "term" || entry.field === "both" ? entry.field : null,
    detached: entry.detached,
    sortOrder: entry.sortOrder,
    itemLabel: entry.itemLabel,
    status: entry.status,
    term: entry.term,
    termYear: entry.termYear,
    note: entry.note,
  };
}

const EMPTY: TrackingValues = { itemLabel: null, status: null, term: null, termYear: null, note: null };
const hasContent = (v: TrackingValues) => !!(v.status || v.term || v.note);

/** Typing waits this long before it is saved; choosing from a list is saved at once. */
export const TYPING_DELAY_MS = 700;

/**
 * A document's tracking entries, with autosave.
 *
 * Lives at the level of the document card, which stays mounted while the
 * document is collapsed: collapsing never discards an edit.
 */
export function useChecksheetTracking(documentId: number, enabled: boolean) {
  const qc = useQueryClient();
  const query = useListDegreeChecksheetAnnotations(documentId, {
    query: { queryKey: getListDegreeChecksheetAnnotationsQueryKey(documentId), enabled, staleTime: Infinity, ...QUIET },
  });

  const [entries, setEntries] = useState<TrackingEntry[]>([]);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle", failedKeys: [] });
  const [notice, setNotice] = useState<string | null>(null);
  const nextLocal = useRef(1);
  const loadedFrom = useRef<unknown>(null);

  const queue = useMemo(
    () =>
      new TrackingSaveQueue<DegreeChecksheetAnnotation>(
        {
          create: (request) => createDegreeChecksheetAnnotation(documentId, request as Parameters<typeof createDegreeChecksheetAnnotation>[1]),
          update: async (id, request) => {
            try {
              return await updateDegreeChecksheetAnnotation(documentId, id, request as Parameters<typeof updateDegreeChecksheetAnnotation>[2]);
            } catch (err) {
              const current = (err as { data?: { current?: DegreeChecksheetAnnotation } } | null)?.data?.current;
              if (err instanceof ApiError && err.status === 409 && current) throw new SaveConflict(current);
              throw err;
            }
          },
          remove: async (id) => {
            try {
              await deleteDegreeChecksheetAnnotation(documentId, id);
            } catch (err) {
              // Already gone is what was asked for.
              if (!(err instanceof ApiError && err.status === 404)) throw err;
            }
          },
        },
        {
          onState: setSaveState,
          onSaved: (key, saved) => {
            // The server's values are adopted for fields the student is not
            // in the middle of changing; the local entry keeps its key.
            setEntries((list) =>
              list.map((entry) =>
                entry.key === key
                  ? { ...entry, id: saved.id, anchorType: saved.anchorType, anchor: saved.anchor, detached: saved.detached, field: fromServer(saved).field ?? entry.field }
                  : entry,
              ),
            );
          },
          onRemoved: () => undefined,
          onConflict: (key, current) => {
            setEntries((list) => list.map((entry) => (entry.key === key ? fromServer(current, key) : entry)));
            setNotice("An entry was changed somewhere else, so the latest version is shown here.");
          },
        },
      ),
    [documentId],
  );

  // Adopt the server's list when it (re)loads and nothing here is unsaved.
  useEffect(() => {
    if (!query.data || loadedFrom.current === query.data) return;
    if (queue.hasUnsaved()) return;
    loadedFrom.current = query.data;
    queue.reset();
    const loaded = query.data.annotations.map((entry) => fromServer(entry));
    for (const entry of loaded) if (entry.id !== null) queue.adopt(entry.key, { id: entry.id, revision: revisionOf(query.data.annotations, entry.id) });
    setEntries(loaded);
  }, [query.data, queue]);

  // Leaving the page with a change still on its way: ask first.
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!queue.hasUnsaved()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => {
      window.removeEventListener("beforeunload", guard);
      void queue.flush();
    };
  }, [queue]);

  const change = useCallback(
    (key: string, values: Partial<TrackingValues>, delayMs = 0) => {
      setNotice(null);
      setEntries((list) => list.map((entry) => (entry.key === key ? { ...entry, ...values } : entry)));
      queue.save(key, values, { delayMs });
    },
    [queue],
  );

  const remove = useCallback(
    (key: string) => {
      setNotice(null);
      setEntries((list) => list.filter((entry) => entry.key !== key));
      queue.remove(key);
    },
    [queue],
  );

  /** Sets a value in a cell the document offers; clearing the last value removes the entry. */
  const setCell = useCallback(
    (anchorType: "sheet_cell" | "doc_cell", anchor: AnchorInput, field: TrackingField, values: Partial<TrackingValues>) => {
      const key = cellKey(anchorType, anchor);
      // An entry placed here by hand keeps its own key; find it by where it sits.
      const existing = entriesRef.current.find((entry) => placeKeyOf(entry) === key);
      const next: TrackingValues = { ...EMPTY, ...(existing ?? {}), ...values };
      if (!hasContent(next)) {
        if (existing) remove(existing.key);
        return;
      }
      if (existing) {
        change(existing.key, values);
        return;
      }
      setNotice(null);
      queue.declare(key, { anchorType, anchor });
      setEntries((list) => [
        ...list,
        { key, id: null, anchorType, anchor, field, detached: false, sortOrder: list.length, ...EMPTY, ...values },
      ]);
      queue.save(key, values);
    },
    [change, queue, remove],
  );

  /**
   * Starts tracking a filled cell the student pointed at. The cell's own text
   * becomes the entry's name (the server reads it from the document too).
   */
  const addItem = useCallback(
    (anchorType: "sheet_item" | "doc_item", anchor: AnchorInput, label: string): string => {
      const key = itemKey(anchorType, anchor);
      const existing = entriesRef.current.find((entry) => placeKeyOf(entry) === key);
      if (existing) return existing.key;
      setNotice(null);
      queue.declare(key, { anchorType, anchor });
      setEntries((list) => [
        ...list,
        { key, id: null, anchorType, anchor, field: null, detached: false, sortOrder: list.length, ...EMPTY, itemLabel: label },
      ]);
      queue.save(key, {});
      return key;
    },
    [queue],
  );

  const addPoint = useCallback(
    (anchor: Required<Pick<AnchorInput, "page" | "x" | "y">>, values: Partial<TrackingValues>): string => {
      const key = `new:${nextLocal.current++}`;
      setNotice(null);
      queue.declare(key, { anchorType: "point", anchor });
      setEntries((list) => [
        ...list,
        { key, id: null, anchorType: "point", anchor, field: null, detached: false, sortOrder: list.length, ...EMPTY, ...values },
      ]);
      queue.save(key, values);
      return key;
    },
    [queue],
  );

  const addManual = useCallback(
    (itemLabel: string, values: Partial<TrackingValues> = {}): string => {
      const key = `new:${nextLocal.current++}`;
      setNotice(null);
      queue.declare(key, { anchorType: "manual", anchor: {} });
      setEntries((list) => [
        ...list,
        { key, id: null, anchorType: "manual", anchor: {}, field: null, detached: false, sortOrder: list.length, ...EMPTY, ...values, itemLabel },
      ]);
      queue.save(key, { ...values, itemLabel });
      return key;
    },
    [queue],
  );

  const movePoint = useCallback(
    (key: string, anchor: Required<Pick<AnchorInput, "page" | "x" | "y">>, delayMs = 0) => {
      setNotice(null);
      setEntries((list) => list.map((entry) => (entry.key === key ? { ...entry, anchor, detached: false } : entry)));
      queue.save(key, {}, { anchor, delayMs });
    },
    [queue],
  );

  /**
   * Puts a detached entry into a cell of the CURRENT file, where the student
   * says it belongs. The server checks that the document offers that cell and
   * that it can hold the entry's values.
   */
  const placeInCell = useCallback(
    (key: string, anchor: AnchorInput, field: TrackingField | null) => {
      setNotice(null);
      setEntries((list) => list.map((entry) => (entry.key === key ? { ...entry, anchor, field, detached: false } : entry)));
      queue.save(key, {}, { anchor });
    },
    [queue],
  );

  const keepAsListEntry = useCallback(
    (key: string) => {
      setNotice(null);
      setEntries((list) =>
        list.map((entry) =>
          entry.key === key ? { ...entry, anchorType: "manual", anchor: {}, field: null, detached: false } : entry,
        ),
      );
      queue.save(key, {}, { keepAsListEntry: true });
    },
    [queue],
  );

  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  /** Drops local state and reads the document's tracking again (after a replacement). */
  const reload = useCallback(async () => {
    await queue.flush();
    queue.reset();
    loadedFrom.current = null;
    setNotice(null);
    await qc.invalidateQueries({ queryKey: getListDegreeChecksheetAnnotationsQueryKey(documentId) });
  }, [documentId, qc, queue]);

  return {
    entries,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    saveState,
    notice,
    dismissNotice: () => setNotice(null),
    change,
    remove,
    setCell,
    addItem,
    addPoint,
    addManual,
    movePoint,
    placeInCell,
    keepAsListEntry,
    retry: () => queue.retry(),
    flush: () => queue.flush(),
    reload,
  };
}

function revisionOf(list: DegreeChecksheetAnnotation[], id: number): number {
  return list.find((entry) => entry.id === id)?.revision ?? 1;
}

export type ChecksheetTracking = ReturnType<typeof useChecksheetTracking>;
