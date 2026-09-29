import { useCallback, useState } from "react";
import {
  ApiError,
  createChecksheetHooks,
  createDegreeChecksheet,
  createDegreeChecksheetAnnotation,
  deleteDegreeChecksheetAnnotation,
  errorMessage,
  getGetDegreeChecksheetRenderQueryKey,
  getListDegreeChecksheetAnnotationsQueryKey,
  getListDegreeChecksheetsQueryKey,
  replaceDegreeChecksheetFile,
  requestDegreeChecksheetUploadUrl,
  updateDegreeChecksheetAnnotation,
  useGetDegreeChecksheetRender,
  useListDegreeChecksheetAnnotations,
  useListDegreeChecksheets,
  type DegreeChecksheetCategory,
  type DegreeChecksheetDocument,
  type DegreeChecksheetProgramRole,
  type DegreeChecksheetReplaceResult,
} from "@workspace/api-client-react";

/**
 * The documents and their tracking are read and saved by the shared API
 * client, the same code the mobile app runs. Only the upload below is the
 * browser's own: it sends a File.
 */
export const { useChecksheetDocuments, useChecksheetRender, useInvalidateChecksheets, useChecksheetTracking } = createChecksheetHooks({
  useListDegreeChecksheets,
  useGetDegreeChecksheetRender,
  useListDegreeChecksheetAnnotations,
  getListDegreeChecksheetsQueryKey,
  getGetDegreeChecksheetRenderQueryKey,
  getListDegreeChecksheetAnnotationsQueryKey,
  createDegreeChecksheetAnnotation,
  updateDegreeChecksheetAnnotation,
  deleteDegreeChecksheetAnnotation,
});

export {
  TYPING_DELAY_MS,
  cellKey,
  entriesByPlace,
  errorMessage,
  itemKey,
  placeKeyOf,
  type ChecksheetTracking,
  type TrackingAnchorType,
  type TrackingEntry,
  type TrackingField,
} from "@workspace/api-client-react";

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

