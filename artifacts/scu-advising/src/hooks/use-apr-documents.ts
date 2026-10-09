import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createProgressReport,
  replaceProgressReportFile,
  requestUploadUrl,
  getListProgressReportsQueryKey,
  getGetProgressReportSidebarQueryKey,
  getGetProgressReportWorkbookQueryKey,
  getGetDegreeCompletionAssessmentQueryKey,
  useListProgressReports,
  useGetProgressReportSidebar,
  type ProgressReportCategory,
  type ProgressReportDocument,
} from "@workspace/api-client-react";

/**
 * The student's own APR documents. These queries never poll: an APR changes
 * only when the student uploads, replaces, renames or deletes one, and each of
 * those invalidates the keys below.
 */
const QUIET = {
  retry: 1,
  refetchInterval: false,
  refetchOnWindowFocus: false,
} as const;

export function useAprDocuments() {
  return useListProgressReports({ query: { queryKey: getListProgressReportsQueryKey(), ...QUIET } });
}

/** The compact, grade-free reference for the planning pages. */
export function useAprSidebar() {
  return useGetProgressReportSidebar({ query: { queryKey: getGetProgressReportSidebarQueryKey(), ...QUIET } });
}

export function useInvalidateApr() {
  const qc = useQueryClient();
  return useCallback(
    (id?: number) => {
      void qc.invalidateQueries({ queryKey: getListProgressReportsQueryKey() });
      void qc.invalidateQueries({ queryKey: getGetProgressReportSidebarQueryKey() });
      // The Degree Completion Assessment is derived from the APRs: recompute it whenever one changes.
      void qc.invalidateQueries({ queryKey: getGetDegreeCompletionAssessmentQueryKey() });
      if (id !== undefined) {
        // A replaced file must never be shown from the previous file's cache.
        qc.removeQueries({ queryKey: getGetProgressReportWorkbookQueryKey(id) });
      }
    },
    [qc],
  );
}

export type AprUploadPhase = "idle" | "requesting-url" | "uploading" | "processing";

export const APR_UPLOAD_PHASE_LABEL: Record<AprUploadPhase, string> = {
  idle: "",
  "requesting-url": "Preparing upload…",
  uploading: "Uploading file…",
  processing: "Processing workbook…",
};

export interface AprFileSelection {
  file: File;
  name: string;
  size: number;
  contentType: string;
}

function messageOf(err: unknown, fallback: string): string {
  const e = err as { data?: { error?: unknown }; body?: { error?: unknown }; message?: unknown } | null;
  const fromBody = e?.data?.error ?? e?.body?.error;
  if (typeof fromBody === "string" && fromBody.trim()) return fromBody;
  return fallback;
}

/**
 * Upload flow shared by "Upload another APR" and "Replace this APR":
 * signed link -> PUT the bytes straight to storage -> register with the API.
 * The server validates and processes the file before saving anything, so a
 * failure here leaves existing documents exactly as they were.
 */
export function useAprUpload() {
  const [phase, setPhase] = useState<AprUploadPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidateApr();

  const send = useCallback(async (selection: AprFileSelection) => {
    setPhase("requesting-url");
    const target = await requestUploadUrl({
      name: selection.name,
      size: selection.size,
      contentType: selection.contentType,
    });
    setPhase("uploading");
    const put = await fetch(target.uploadURL, {
      method: "PUT",
      headers: { "Content-Type": selection.contentType },
      body: selection.file,
    });
    if (!put.ok) throw new Error(`Upload failed (HTTP ${put.status}).`);
    setPhase("processing");
    return {
      objectPath: target.objectPath,
      fileName: selection.name,
      fileSize: selection.size,
      contentType: selection.contentType,
    };
  }, []);

  const run = useCallback(
    async (work: () => Promise<ProgressReportDocument>): Promise<ProgressReportDocument | null> => {
      setError(null);
      try {
        const doc = await work();
        invalidate(doc.id);
        setPhase("idle");
        return doc;
      } catch (err) {
        setPhase("idle");
        setError(messageOf(err, err instanceof Error ? err.message : "Upload failed. Please try again."));
        return null;
      }
    },
    [invalidate],
  );

  const upload = useCallback(
    (selection: AprFileSelection, meta: { label: string; category: ProgressReportCategory }) =>
      run(async () => createProgressReport({ ...(await send(selection)), ...meta })),
    [run, send],
  );

  const replace = useCallback(
    (id: number, selection: AprFileSelection) =>
      run(async () => replaceProgressReportFile(id, await send(selection))),
    [run, send],
  );

  return {
    upload,
    replace,
    phase,
    busy: phase !== "idle",
    error,
    clearError: () => setError(null),
  };
}
