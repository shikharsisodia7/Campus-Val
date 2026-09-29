/**
 * The words, options and file checks of Degree Checksheets come from the shared
 * API client, so the web app and the mobile app say the same things. Only what
 * needs a browser is defined here.
 */
export {
  SCU_CHECKSHEETS_URL,
  CHECKSHEET_CATEGORY_OPTIONS,
  checksheetCategoryLabel,
  PROGRAM_ROLE_OPTIONS,
  programRoleLabel,
  TRACKING_STATUS_OPTIONS,
  trackingStatusLabel,
  TRACKING_TERM_OPTIONS,
  termLabel,
  termShortLabel,
  currentAcademicYearAnchor,
  defaultYearForTerm,
  trackingYearOptions,
  formatUploadDate,
  formatBytes,
  FORMAT_LABEL,
  renderStatusLabel,
  CHECKSHEET_ACCEPT,
  SUPPORTED_FORMATS_TEXT,
  validateChecksheetFile,
  titleFromFileName,
  safeExternalUrl,
} from "@workspace/api-client-react";

export function originalFileUrl(id: number): string {
  return `${import.meta.env.BASE_URL}api/degree-checksheets/${id}/file`;
}

/** First 12 hex characters of a file's SHA-256, or null where the browser cannot compute it. */
export async function fileFingerprint(file: Blob): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 12);
  } catch {
    return null;
  }
}
