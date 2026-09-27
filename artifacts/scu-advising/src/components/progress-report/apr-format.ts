import type { ProgressReportCategory, ProgressReportDocument } from "@workspace/api-client-react";

/**
 * Labels for what the STUDENT says an APR is for. Any number of documents may
 * share a category; CampusVal never infers one from the file.
 */
export const APR_CATEGORY_OPTIONS: { value: ProgressReportCategory; label: string }[] = [
  { value: "primary_major", label: "Primary Major" },
  { value: "second_major", label: "Second Major" },
  { value: "additional_major", label: "Additional Major" },
  { value: "minor", label: "Minor" },
  { value: "additional_minor", label: "Additional Minor" },
  { value: "other", label: "Other" },
];

export function aprCategoryLabel(category: string): string {
  return APR_CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? "Other";
}

/**
 * "Uploaded Sep 26, 2026". This is when the file was added to CampusVal —
 * never worded as a Workday timestamp, because CampusVal cannot know when
 * Workday last evaluated the record.
 */
export function formatUploadDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Upload date unavailable";
  return `Uploaded ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export function formatUploadDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Upload date unavailable";
  return `Uploaded ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** The technical state of the FILE — never an academic statement. */
export function importStatusLabel(report: Pick<ProgressReportDocument, "importStatus">): string {
  switch (report.importStatus) {
    case "ready":
      return "Ready";
    case "processing":
      return "Processing workbook";
    case "unsupported":
      return "Unsupported file";
    case "failed":
      return "Import failed";
    default:
      return "Unknown";
  }
}

export function originalFileUrl(id: number): string {
  return `${import.meta.env.BASE_URL}api/progress-reports/${id}/file`;
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PDF_TYPE = "application/pdf";
