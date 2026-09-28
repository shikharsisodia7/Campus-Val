/**
 * Size limits for Degree Checksheet uploads and for what CampusVal will hold
 * in order to preview one.
 *
 * The upload limit is configurable (`CHECKSHEET_MAX_UPLOAD_MB`) for the same
 * reason the APR's is: a self-hosted deployment sits behind a reverse proxy
 * with its own body limit and the two must agree (docs/SCU_DEPLOYMENT.md). It
 * is larger than the APR's because engineering flowcharts and scanned
 * four-year plans are routinely bigger than a Workday export.
 */

const DEFAULT_MAX_UPLOAD_MB = 20;
const HARD_MAX_UPLOAD_MB = 50;

export function checksheetMaxUploadBytes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env["CHECKSHEET_MAX_UPLOAD_MB"]);
  const mb = Number.isFinite(raw) && raw >= 1 && raw <= HARD_MAX_UPLOAD_MB ? raw : DEFAULT_MAX_UPLOAD_MB;
  return Math.floor(mb * 1024 * 1024);
}

export function checksheetMaxUploadLabel(env: NodeJS.ProcessEnv = process.env): string {
  return `${Math.round(checksheetMaxUploadBytes(env) / (1024 * 1024))} MB`;
}

export const CHECKSHEET_LIMITS = {
  /** Majors, minors, four-year plans, flowcharts, guides: generous, never unbounded. */
  maxDocumentsPerUser: 30,
  maxAnnotationsPerDocument: 500,
  maxPdfPages: 200,
  maxImagePixels: 80_000_000,
  maxDocxBlocks: 4_000,
  maxDocxTableRows: 2_000,
  maxDocxTextLength: 600_000,
  /** Pictures inside a DOCX are shown only while they fit in this budget. */
  maxDocxImageBytes: 3 * 1024 * 1024,
  titleMaxLength: 120,
  metadataMaxLength: 120,
  sourceUrlMaxLength: 2_000,
  itemLabelMaxLength: 200,
  noteMaxLength: 500,
} as const;
